"""HTTP routes for the Prompt Studio frontend.

Namespaced under ``/krea2_prompt_studio`` and registered separately from
the v1 wizard routes so the two stay independent.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from typing import Any

from .package_paths import studio_previews_dir
from .prefs import load_prefs, save_prefs
from .presets import load_user_payload, save_user_payload

logger = logging.getLogger("krea2.studio.api")

_ROUTES_REGISTERED = False


def register_studio_routes() -> None:
    """Register studio preset routes when running inside ComfyUI."""
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return

    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.get("/krea2_prompt_studio/presets")
    async def get_presets(_request: Any) -> web.Response:
        """Merged preset list (bundled + user) for the editor."""
        # Import here so module import stays test-safe without ComfyUI.
        from .presets import get_store

        store = get_store()
        return web.json_response(
            {"presets": [preset.to_dict() for preset in store.all()]}
        )

    @routes.post("/krea2_prompt_studio/presets")
    async def put_presets(request: Any) -> web.Response:
        """Replace the user preset payload (user presets + bundled edits)."""
        try:
            payload = await request.json()
        except Exception:
            return web.json_response(
                {"issues": [{"code": "presets.invalid_json", "severity": "error",
                             "message": "Request body must be JSON."}]},
                status=400,
            )
        issues = save_user_payload(payload if isinstance(payload, dict) else {})
        if any(issue["severity"] == "error" for issue in issues):
            return web.json_response({"issues": issues}, status=400)
        from .presets import reload_store

        store = reload_store()
        return web.json_response(
            {
                "issues": issues,
                "presets": [preset.to_dict() for preset in store.all()],
            }
        )

    @routes.get("/krea2_prompt_studio/user_payload")
    async def get_user_payload(_request: Any) -> web.Response:
        """Raw user-side payload, used by the preset manager to round-trip edits."""
        return web.json_response(load_user_payload())

    @routes.get("/krea2_prompt_studio/prefs")
    async def get_prefs(_request: Any) -> web.Response:
        """Favorites and recently used preset ids."""
        return web.json_response(load_prefs())

    @routes.post("/krea2_prompt_studio/prefs")
    async def put_prefs(request: Any) -> web.Response:
        """Persist favorites/recents (frontend-driven)."""
        try:
            payload = await request.json()
        except Exception:
            return web.json_response(
                {"issues": [{"code": "prefs.invalid_json", "severity": "error",
                             "message": "Request body must be JSON."}]},
                status=400,
            )
        issues = save_prefs(payload if isinstance(payload, dict) else {})
        if issues:
            return web.json_response({"issues": issues}, status=400)
        return web.json_response(load_prefs())

    @routes.get(r"/krea2_prompt_studio/previews/{name}")
    async def get_preview(request: Any) -> web.Response:
        """Serve a manual preview image from the user's previews folder.

        Only plain filenames inside that folder are served (no traversal).
        """
        name = request.match_info.get("name", "")
        safe = os.path.basename(name)
        if not safe or safe != name or safe.startswith("."):
            return web.json_response({"error": "invalid name"}, status=400)
        path = os.path.join(studio_previews_dir(create=False), safe)
        if not os.path.isfile(path):
            return web.json_response({"error": "not found"}, status=404)
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as handle:
            body = handle.read()
        return web.Response(body=body, content_type=content_type)

    _ROUTES_REGISTERED = True
    logger.debug("Krea2 Prompt Studio routes registered")
