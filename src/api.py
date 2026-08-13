"""ComfyUI HTTP routes used by the frontend wizard."""
from __future__ import annotations

import json
import os
from typing import Any

from .compiler import compile_state
from .library import Library, load_library, save_user_library
from .nodes import reload_library
from .package_paths import MASTER_PRESETS_PATH
from .saved_presets import load_saved_presets, save_saved_presets
from .user_paths import atomic_write, user_concept_colors_path
from .validation import validate_user_library

_ROUTES_REGISTERED = False


def register_routes() -> None:
    """Register preset-library routes when running inside ComfyUI."""
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return

    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.get("/krea2_prompt_wizard/library")
    async def get_library(_request: Any) -> web.Response:
        library = load_library()
        return web.json_response({"presets": library.presets})

    @routes.post("/krea2_prompt_wizard/library")
    async def save_library(request: Any) -> web.Response:
        """Validate, save, and reload the user-owned preset library."""
        try:
            payload = await request.json()
            presets = payload.get("presets", []) if isinstance(payload, dict) else []
            user_presets = [
                {**preset, "origin": "user"}
                for preset in presets
                if isinstance(preset, dict)
            ]
            validation = validate_user_library(
                {"schema_version": 1, "presets": user_presets}
            )
            if validation.has_errors:
                return web.json_response(
                    {"issues": validation.to_dict_list()}, status=400
                )
            save_user_library(Library(presets=user_presets))
            library = reload_library()
            return web.json_response(
                {"presets": library.presets, "issues": validation.to_dict_list()}
            )
        except Exception as exc:
            return web.json_response(
                {
                    "issues": [
                        {
                            "code": "library.save_failed",
                            "severity": "error",
                            "message": f"Could not save the library: {exc}",
                        }
                    ]
                },
                status=400,
            )

    @routes.get("/krea2_prompt_wizard/loras")
    async def get_loras(_request: Any) -> web.Response:
        """List the LoRA files available to the user (for the Cast tab)."""
        try:
            from comfy.utils import get_filename_list

            names = get_filename_list("loras")
        except Exception:
            names = []
        return web.json_response({"loras": sorted(names)})

    @routes.post("/krea2_prompt_wizard/loras/upload")
    async def upload_lora(request: Any) -> web.Response:
        """Copy a LoRA file picked from disk into the ComfyUI loras folder.

        The Cast tab's file picker can choose a .safetensors from anywhere;
        ComfyUI can only load LoRAs that live in ``models/loras``, so the
        frontend uploads the picked file here and the model-side application
        (``_apply_character_loras``) then finds it by name.
        """
        try:
            import folder_paths  # lazy: ComfyUI runtime only

            reader = await request.multipart()
            field = await reader.next()
            if field is None or getattr(field, "name", None) != "file":
                raise ValueError("Missing file field.")
            filename = os.path.basename(str(getattr(field, "filename", "") or "lora.safetensors"))
            if not filename:
                raise ValueError("Missing file name.")
            chunks = []
            while True:
                chunk = await field.read_chunk(1 << 20)
                if not chunk:
                    break
                chunks.append(chunk)
            payload = b"".join(chunks)
            if not payload:
                raise ValueError("Empty file.")
            target_dir = folder_paths.get_folder_paths("loras")[0]
            os.makedirs(target_dir, exist_ok=True)
            target = os.path.join(target_dir, filename)
            with open(target, "wb") as handle:
                handle.write(payload)
            return web.json_response({"name": filename})
        except Exception as exc:
            return web.json_response(
                {
                    "error": {
                        "code": "lora.upload_failed",
                        "message": f"Could not install the LoRA: {exc}",
                    }
                },
                status=400,
            )

    @routes.get("/krea2_prompt_wizard/master_presets")
    async def get_master_presets(_request: Any) -> web.Response:
        with open(MASTER_PRESETS_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return web.json_response(payload)

    @routes.get("/krea2_prompt_wizard/saved_presets")
    async def get_saved_presets(_request: Any) -> web.Response:
        return web.json_response({"presets": load_saved_presets()})

    @routes.post("/krea2_prompt_wizard/saved_presets")
    async def update_saved_presets(request: Any) -> web.Response:
        try:
            payload = await request.json()
            presets = payload.get("presets", []) if isinstance(payload, dict) else []
            if not isinstance(presets, list):
                raise ValueError("Saved presets must be a list.")
            save_saved_presets(presets)
            return web.json_response({"presets": load_saved_presets()})
        except Exception as exc:
            return web.json_response(
                {
                    "error": {
                        "code": "saved_presets.save_failed",
                        "message": f"Could not save presets: {exc}",
                    }
                },
                status=400,
            )

    @routes.get("/krea2_prompt_wizard/concept_colors")
    async def get_concept_colors(_request: Any) -> web.Response:
        try:
            with open(user_concept_colors_path(create=False), "r", encoding="utf-8") as handle:
                colors = json.load(handle)
        except (OSError, json.JSONDecodeError):
            colors = {}
        return web.json_response({"colors": colors if isinstance(colors, dict) else {}})

    @routes.post("/krea2_prompt_wizard/concept_colors")
    async def save_concept_colors(request: Any) -> web.Response:
        try:
            payload = await request.json()
            colors = payload.get("colors", {}) if isinstance(payload, dict) else {}
            if not isinstance(colors, dict):
                raise ValueError("Concept colors must be an object.")
            clean = {str(key): str(value) for key, value in colors.items() if str(value) in {"red", "orange", "yellow", "green", "blue", "pink"}}
            atomic_write(user_concept_colors_path(), json.dumps(clean, ensure_ascii=False, indent=2).encode("utf-8"))
            return web.json_response({"colors": clean})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.post("/krea2_prompt_wizard/preview")
    async def compile_preview(request: Any) -> web.Response:
        """Compile a state for the live editor using the backend source of truth."""
        try:
            payload = await request.json()
            state = payload.get("state", {}) if isinstance(payload, dict) else {}
            expert = bool(payload.get("expert", False)) if isinstance(payload, dict) else False
            result = compile_state(state, load_library(), expert=expert)
            return web.json_response(result.to_dict())
        except Exception as exc:
            base_prompt = ""
            if isinstance(locals().get("state"), dict):
                base_prompt = str(state.get("base_prompt") or "").strip()
            return web.json_response(
                {
                    "final_prompt": base_prompt,
                    "plain_prompt": base_prompt,
                    "category_prompts": {},
                    "fragments": [],
                    "warnings": [
                        {
                            "code": "preview.compile_failed",
                            "severity": "error",
                            "message": f"Could not compile this prompt: {exc}",
                        }
                    ],
                },
                status=400,
            )

    _ROUTES_REGISTERED = True
