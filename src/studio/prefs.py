"""User prefs for the Prompt Studio: favorites and recently used presets.

A tiny, tolerant JSON store at ``<user>/Krea2PromptWizard/studio_prefs.json``.
The frontend drives updates (it knows when presets are inserted); the
backend only validates and persists. Prefs are convenience metadata — a
malformed file simply resets to empty, never blocking ComfyUI.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

from .package_paths import studio_user_prefs_path

logger = logging.getLogger("krea2.studio.prefs")

MAX_RECENT = 30
MAX_FAVORITES = 200

DEFAULT_PREFS: Dict[str, List[str]] = {"favorites": [], "recent": []}


def _coerce_id_list(value: Any, cap: int) -> List[str]:
    if not isinstance(value, list):
        return []
    seen = set()
    out: List[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        preset_id = item.strip()
        if not preset_id or preset_id in seen:
            continue
        seen.add(preset_id)
        out.append(preset_id)
        if len(out) >= cap:
            break
    return out


def load_prefs() -> Dict[str, List[str]]:
    """Load prefs, falling back to defaults on any problem."""
    path = studio_user_prefs_path(create=False)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict):
            return {
                "favorites": _coerce_id_list(payload.get("favorites"), MAX_FAVORITES),
                "recent": _coerce_id_list(payload.get("recent"), MAX_RECENT),
            }
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio prefs unreadable (%s): %s", path, exc)
    return {"favorites": [], "recent": []}


def save_prefs(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Validate and persist prefs. Returns an issue list (empty = ok)."""
    from ..user_paths import atomic_write

    if not isinstance(payload, dict):
        return [{"code": "prefs.invalid_payload", "severity": "error",
                 "message": "Payload must be an object."}]
    body = {
        "favorites": _coerce_id_list(payload.get("favorites"), MAX_FAVORITES),
        "recent": _coerce_id_list(payload.get("recent"), MAX_RECENT),
    }
    path = studio_user_prefs_path()
    try:
        atomic_write(path, json.dumps(body, indent=2).encode("utf-8"))
    except OSError as exc:
        return [{"code": "prefs.save_failed", "severity": "error",
                 "message": f"Could not write prefs: {exc}"}]
    return []
