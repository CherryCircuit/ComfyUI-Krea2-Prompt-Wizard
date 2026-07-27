"""Local persistence for user-created full-prompt and concept-group presets."""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Iterable, List

from .schemas import SCHEMA_VERSION
from .user_paths import atomic_write, timestamp_backup, user_saved_presets_path


def _clean_preset(item: Any) -> Dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    preset_id = str(item.get("id") or "").strip()
    label = str(item.get("label") or "").strip()
    scope = str(item.get("scope") or "").strip()
    rows = item.get("rows")
    if not preset_id or not label or scope not in {"full", "group"}:
        return None
    if not isinstance(rows, list):
        return None
    return {
        "id": preset_id,
        "label": label,
        "scope": scope,
        "group": str(item.get("group") or ""),
        "base_prompt": str(item.get("base_prompt") or ""),
        "randomize_on_job": dict(item.get("randomize_on_job") or {})
        if isinstance(item.get("randomize_on_job"), dict)
        else {},
        "creative_mode": str(item.get("creative_mode") or "photo"),
        "rows": [dict(row) for row in rows if isinstance(row, dict)],
    }


def load_saved_presets(path: str | None = None) -> List[Dict[str, Any]]:
    """Load saved presets, dropping malformed entries without affecting ComfyUI."""
    target = path or user_saved_presets_path(create=False)
    if not os.path.exists(target):
        return []
    try:
        with open(target, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return []
    raw = payload.get("presets", []) if isinstance(payload, dict) else []
    return [cleaned for item in raw if (cleaned := _clean_preset(item)) is not None]


def save_saved_presets(
    presets: Iterable[Dict[str, Any]],
    path: str | None = None,
) -> str:
    """Validate and atomically save user-created presets with a backup."""
    target = path or user_saved_presets_path(create=True)
    cleaned = [
        preset
        for item in presets
        if (preset := _clean_preset(item)) is not None
    ]
    if os.path.exists(target):
        timestamp_backup(target)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "presets": cleaned,
    }
    atomic_write(
        target,
        json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
    )
    return target
