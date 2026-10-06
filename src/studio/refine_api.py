"""HTTP routes for the Prompt Studio's refiner.

Mirrors the shape of the preset routes in `api.py`: the frontend holds the
document, the server does only what only the server can — see the preset
store, open a text-encoder file, and reach an LLM server the browser cannot
talk to cross-origin.

Routes (all under ``/krea2_prompt_studio/refine``):

* ``GET  models``         — the text encoders on disk (unfiltered; judged
                            on load, where the answer is real)
* ``GET  settings``       — the machine-level settings + remote status
                            (URL, and *whether* a key is set — never the key)
* ``POST settings``       — save settings; may carry ``url``/``key`` for the
                            remote endpoint in the same gesture
* ``GET  remote/models``  — the stored server's model listing, proxied
* ``GET  remote/probe``   — which of the two loopback defaults is answering
* ``POST run``            — one rewrite: compile the section server-side so
                            the model sees exactly what the node will queue,
                            ask the chosen backend, and hand the draft back
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from .compiler import compile_document
from .presets import get_store
from .refine_prompts import RefineError, check, parse_reply, user_message

logger = logging.getLogger("krea2.studio.refine_api")

_ROUTES_REGISTERED = False

_SECTION_LABELS = {
    "prompt": "first-frame prompt (or the whole prompt when no frame sections exist)",
    "last_prompt": "last-frame prompt (includes the shared text)",
}


def section_text(doc: str, section: str) -> str:
    """The expanded text one refine call is about, or an error string."""
    if section not in _SECTION_LABELS:
        return f"unknown section {section!r}"
    result = compile_document(doc or "", get_store())
    if section == "last_prompt":
        if not result.has_frames:
            return "frame sections are not active — there is no last-frame prompt"
        return result.last_prompt
    return result.prompt


def _same_origin(request) -> bool:
    """Origin, when the browser sends one, must be this server.

    ComfyUI's own routes are similarly permissive; the refine POST loads
    multi-gigabyte weights, so the cheap check is worth having.
    """
    origin = request.headers.get("Origin")
    if not origin:
        return True
    host = request.headers.get("Host", "")
    from urllib.parse import urlparse

    return urlparse(origin).netloc in ("", host)


def run_refine(body: dict) -> dict:
    """The blocking half of one rewrite: compile, ask, parse. Runs on a thread."""
    from . import refine_local, refine_remote, refine_settings

    settings = refine_settings.load_settings()
    backend = body.get("backend") or settings["backend"]
    if backend not in ("local", "remote"):
        raise RefineError(f"unknown backend {backend!r}")

    doc = body.get("doc") if isinstance(body.get("doc"), str) else ""
    section = body.get("section") or "prompt"
    request_text = section_text(doc, section)
    if not request_text.strip():
        raise RefineError(
            f"the {section.replace('_', '-')} text is empty — there is nothing "
            f"to refine"
        )

    model = (body.get("model") or "").strip()
    if backend == "local":
        if not model:
            model = settings["model"]
        if not model:
            raise RefineError(
                "No text encoder chosen. Put a Qwen3-VL or Qwen3.5 text encoder "
                "in models/text_encoders and pick it in the refiner's settings."
            )
        chat = refine_local.chat
    else:
        if not model:
            model = settings["remote_model"]
        if not model:
            raise RefineError(
                "No model chosen. Pick one of the server's models in the "
                "refiner's settings."
            )
        chat = refine_remote.chat

    system = body.get("system") if isinstance(body.get("system"), str) else ""
    content = chat(
        model,
        system or _system_prompt(),
        user_message(_SECTION_LABELS.get(section, section), request_text),
        images=(),
        temperature=body.get("temperature", settings["temperature"]),
        seed=body.get("seed", settings["seed"]),
        max_tokens=body.get("max_tokens", settings["max_tokens"]),
    )
    written = parse_reply(content)

    problems = check(request_text, written)

    return {
        "section": section,
        "body": written,
        "source": request_text,
        "model": model,
        "backend": backend,
        "problems": problems,
    }


def _system_prompt() -> str:
    from .refine_prompts import SYSTEM_PROMPT

    return SYSTEM_PROMPT


def register_refine_routes() -> None:
    """Register the refiner routes when running inside ComfyUI."""
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return

    from aiohttp import web
    from server import PromptServer

    from . import refine_remote, refine_settings

    routes = PromptServer.instance.routes

    @routes.get("/krea2_prompt_studio/refine/models")
    async def refine_models(_request: Any) -> web.Response:
        """The text encoders on disk, as `folder_paths` knows them."""
        from .refine_local import list_models

        loop = asyncio.get_running_loop()
        names = await loop.run_in_executor(None, list_models)
        return web.json_response({"models": names})

    @routes.get("/krea2_prompt_studio/refine/settings")
    async def get_refine_settings(_request: Any) -> web.Response:
        """Settings + remote status. The key itself never leaves the server."""
        return web.json_response({
            "settings": refine_settings.load_settings(),
            "remote": refine_remote.status(),
        })

    @routes.post("/krea2_prompt_studio/refine/settings")
    async def put_refine_settings(request: Any) -> web.Response:
        """Save settings; may carry ``url``/``key`` for the remote endpoint.

        ``key`` absent means "keep what is stored, if the URL stands still";
        an empty string clears it. The reply is the same shape as the GET.
        """
        try:
            payload = await request.json()
        except Exception:
            return web.json_response(
                {"error": "the request body was not JSON"}, status=400)
        if not isinstance(payload, dict):
            return web.json_response(
                {"error": "the request body must be an object"}, status=400)
        try:
            if "url" in payload or "key" in payload:
                refine_remote.configure(payload.get("url", ""), payload.get("key"))
            stored = refine_settings.save_settings(payload)
        except refine_remote.ConfigError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response({
            "settings": stored,
            "remote": refine_remote.status(),
        })

    @routes.get("/krea2_prompt_studio/refine/remote/models")
    async def refine_remote_models(_request: Any) -> web.Response:
        """The stored server's model listing, proxied.

        Proxied because the browser cannot ask a server on another origin
        itself, and *stored* because a proxy that fetched a URL off the
        query string would be an open relay with the key attached.
        """
        loop = asyncio.get_running_loop()
        try:
            names = await loop.run_in_executor(None, refine_remote.list_models)
        except RefineError as exc:
            return web.json_response({"error": str(exc), "models": []}, status=502)
        return web.json_response({"models": names})

    @routes.get("/krea2_prompt_studio/refine/remote/probe")
    async def refine_remote_probe(_request: Any) -> web.Response:
        """Which of the two loopback defaults is answering right now."""
        loop = asyncio.get_running_loop()
        found = await loop.run_in_executor(None, refine_remote.probe_local)
        return web.json_response({"servers": found})

    @routes.post("/krea2_prompt_studio/refine/run")
    async def refine_run(request: Any) -> web.Response:
        """One rewrite: blob in, draft out.

        Off the event loop in every case — the local backend blocks on
        token generation and the remote one on the wire, and this loop is
        also the prompt queue and the websocket.
        """
        if not _same_origin(request):
            return web.json_response({"error": "cross-origin request refused"},
                                     status=403)
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "the request body was not JSON"},
                                     status=400)
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, run_refine,
                                                body if isinstance(body, dict) else {})
        except RefineError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            logger.exception("refine failed")
            return web.json_response(
                {"error": f"{type(exc).__name__}: {exc}"}, status=500)
        return web.json_response({"result": result})

    _ROUTES_REGISTERED = True
    logger.debug("Krea2 Prompt Studio refiner routes registered")
