"""ComfyUI HTTP routes used by the frontend wizard."""
from __future__ import annotations

import json
from typing import Any

from .library import load_library
from .package_paths import MASTER_PRESETS_PATH

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

    @routes.get("/krea2_prompt_wizard/master_presets")
    async def get_master_presets(_request: Any) -> web.Response:
        with open(MASTER_PRESETS_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return web.json_response(payload)

    _ROUTES_REGISTERED = True
