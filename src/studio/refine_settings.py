"""Machine-level refiner settings for the Prompt Studio.

Which text encoder is on this disk, or which server answers on this LAN, is
a fact about this computer — not about the workflow — so the choices live in
their own file under the pack's user directory and never travel inside a
saved workflow. The remote endpoint and its key are stored by
`refine_remote` in a separate file the browser can never read back.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

from .package_paths import studio_user_prefs_path
from .refine_prompts import DEFAULT_MAX_TOKENS, reply_tokens

logger = logging.getLogger("krea2.studio.refine_settings")

SETTINGS_FILENAME = "studio_refiner.json"

DEFAULTS: Dict[str, Any] = {
    # "local" (a text encoder in ComfyUI's process) or "remote" (an
    # OpenAI-compatible server the user runs).
    "backend": "local",
    "model": "",
    "remote_model": "",
    "temperature": 0.3,
    "seed": -1,
    "max_tokens": DEFAULT_MAX_TOKENS,
    "language": "English",
}

_BACKENDS = ("local", "remote")


def _path(create: bool) -> str:
    directory = os.path.dirname(studio_user_prefs_path(create=create))
    return os.path.join(directory, SETTINGS_FILENAME)


def coerce(raw: Any) -> Dict[str, Any]:
    """Any payload -> a full settings dict, junk mapped to defaults."""
    out = dict(DEFAULTS)
    if not isinstance(raw, dict):
        return out
    if raw.get("backend") in _BACKENDS:
        out["backend"] = raw["backend"]
    for key in ("model", "remote_model"):
        if isinstance(raw.get(key), str):
            out[key] = raw[key].strip()
    try:
        temperature = float(raw.get("temperature", DEFAULTS["temperature"]))
    except (TypeError, ValueError):
        temperature = DEFAULTS["temperature"]
    out["temperature"] = max(0.0, min(2.0, temperature))
    try:
        seed = int(raw.get("seed", DEFAULTS["seed"]))
    except (TypeError, ValueError):
        seed = DEFAULTS["seed"]
    out["seed"] = max(-1, min(2 ** 31 - 1, seed))
    out["max_tokens"] = reply_tokens(raw.get("max_tokens", DEFAULTS["max_tokens"]))
    return out


def load_settings() -> Dict[str, Any]:
    path = _path(create=False)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return coerce(json.load(handle))
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio refiner settings unreadable (%s): %s", path, exc)
    return coerce(None)


def save_settings(payload: Any) -> Dict[str, Any]:
    """Validate and persist settings; returns the stored dict."""
    settings = coerce(payload)
    path = _path(create=True)
    from ..user_paths import atomic_write

    atomic_write(path, json.dumps(settings, indent=2).encode("utf-8"))
    return settings
