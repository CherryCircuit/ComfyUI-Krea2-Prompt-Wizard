"""Preset migrations.

Bundled presets are immutable. When a preset id is renamed or removed, a
migration record is added here. The wizard loads the matching migration
record on every library load and applies it to user libraries and
workflow snapshots.

This module exposes a single source of truth (``MIGRATIONS``) plus
helpers to apply migrations to a list of presets or rows.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Migration table
# ---------------------------------------------------------------------------
# Each entry is ``(old_id, new_id_or_None, alias)``. When ``new_id`` is None
# the preset is removed. When ``alias`` is set, the preset is preserved but
# the ``deprecated_replacement`` field is populated so the user can compare
# the two presets.
MIGRATIONS: Dict[str, Dict[str, Any]] = {
    # Example: rename a renamed preset.
    # "emotion.shocked_v1": {
    #     "action": "replace",
    #     "new_id": "emotion.shocked",
    # },
    # "emotion.legacy_curiosity": {
    #     "action": "deprecate",
    #     "new_id": "emotion.curiosity",
    # },
}


def all_migrations() -> Dict[str, Dict[str, Any]]:
    return {k: dict(v) for k, v in MIGRATIONS.items()}


def apply_preset_migrations(
    presets: Iterable[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Apply preset migrations to a list of preset dicts.

    Returns ``(applied, dropped)``. ``dropped`` presets are those whose
    migration replaced them with a different id (the original is dropped
    to avoid duplications).
    """
    applied: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []
    for p in presets:
        if not isinstance(p, dict):
            continue
        pid = p.get("id", "")
        migration = MIGRATIONS.get(pid)
        if not migration:
            applied.append(p)
            continue
        action = migration.get("action")
        new_id = migration.get("new_id")
        if action == "replace" and new_id:
            new_p = dict(p)
            new_p["id"] = new_id
            new_p["deprecated_replacement"] = new_id
            applied.append(new_p)
        elif action == "deprecate" and new_id:
            new_p = dict(p)
            new_p["deprecated_replacement"] = new_id
            applied.append(new_p)
        elif action == "remove":
            dropped.append(p)
        else:
            applied.append(p)
    return applied, dropped


def apply_row_preset_migrations(
    rows: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Apply preset migrations to a list of wizard rows.

    Preserves workflow portability: a row whose ``preset_id`` was renamed
    is updated to the new id, and the original id is left in
    ``legacy_preset_id`` for traceability.
    """
    out: List[Dict[str, Any]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        pid = r.get("preset_id", "")
        migration = MIGRATIONS.get(pid)
        if not migration:
            out.append(r)
            continue
        new_pid = migration.get("new_id")
        if new_pid:
            new_r = dict(r)
            new_r["legacy_preset_id"] = pid
            new_r["preset_id"] = new_pid
            out.append(new_r)
        else:
            out.append(r)
    return out


__all__ = [
    "MIGRATIONS",
    "all_migrations",
    "apply_preset_migrations",
    "apply_row_preset_migrations",
]
