"""Preset migrations.

Bundled presets are immutable. When a preset id is renamed or removed, a
migration record is added here. The wizard loads the matching migration
record on every library load and applies it to user libraries and
workflow snapshots.

This module exposes a single source of truth (``MIGRATIONS``) plus
helpers to apply migrations to a list of presets or rows.
"""
from __future__ import annotations

import copy
import math
import re

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


STATE_VERSION = 2


def migrate_state(raw: Any) -> Dict[str, Any]:
    """Lossless, idempotent migration of the V1 document (not library schema)."""
    from .schemas import CATEGORIES, SCHEMA_VERSION
    from .weight_mapping import weight_for_row
    state = copy.deepcopy(raw) if isinstance(raw, dict) else {}
    try:
        incoming_version = int(state.get("state_version", 0))
    except (TypeError, ValueError, OverflowError):
        incoming_version = 0
    first = incoming_version < STATE_VERSION
    report = state.setdefault("migration_report", [])
    if not isinstance(report, list):
        report = state["migration_report"] = []
    recovery = state.setdefault("recovery_rows", [])
    if not isinstance(recovery, list):
        recovery = state["recovery_rows"] = []
    if not isinstance(raw, dict):
        report.append({"code": "migration.malformed_document", "path": "document", "severity": "warning", "message": "Malformed document retained in migration backup."})
    if incoming_version > STATE_VERSION:
        issue = {"code": "migration.future_version", "path": "state_version", "severity": "warning", "message": "Newer document version preserved; some controls may be unsupported."}
        if issue not in report:
            report.append(issue)
    if first or incoming_version > STATE_VERSION:
        backup = copy.deepcopy(raw) if isinstance(raw, dict) else {"raw": raw}
        for key in ("migration_backup", "resolved_snapshot"):
            backup.pop(key, None)
        state.setdefault("migration_backup", backup)
    lights = state.get("scene_sections", {}).get("lights", []) if isinstance(state.get("scene_sections"), dict) else []
    light_ids = {str(light.get("id")) for light in lights if isinstance(light, dict)} if isinstance(lights, list) else set()

    def note(code, path, message):
        issue = {"code": code, "path": path, "severity": "warning", "message": message}
        if issue not in report:
            report.append(issue)

    def rows(raw_rows, path, global_rows=False):
        out = []
        if not isinstance(raw_rows, list):
            if raw_rows is not None:
                recovery.append({"path": path, "value": copy.deepcopy(raw_rows)})
                note("migration.malformed_rows", path, "Malformed rows retained in recovery.")
            return out
        seen = set()
        mirrored = set()
        for i, original in enumerate(raw_rows):
            owner = f"{path}[{i}]"
            if not isinstance(original, dict) or not str(original.get("phrase") or "").strip():
                recovery.append({"path": owner, "value": copy.deepcopy(original)})
                note("migration.malformed_row", owner, "Non-emitting row retained in recovery.")
                continue
            row = copy.deepcopy(original)
            row["phrase"] = str(row["phrase"])
            row["id"] = str(row.get("id") or f"recovered_{path.replace('.', '_')}_{i}")
            if not row.get("id") or row["id"] in seen:
                row["id"] = f"recovered_{path.replace('.', '_')}_{i}"
            seen.add(row["id"])
            row["preset_id"] = str(row.get("preset_id") or "custom.recovered_" + str(row["id"]))
            if not row["preset_id"]:
                row["preset_id"] = "custom.recovered_" + str(row["id"])
            row.setdefault("category", "custom")
            if not isinstance(row["category"], str) or row["category"] not in CATEGORIES:
                row["legacy_category"] = row["category"]
                row["category"] = "custom"
                if global_rows:
                    row["enabled"] = False
                    row["recovered"] = True
                note("migration.unknown_category", owner, "Unknown concept remains editable as a custom phrase.")
            row.setdefault("control_mode", "scalar")
            if row["control_mode"] not in ("scalar", "bipolar", "raw"):
                row["legacy_control_mode"] = row["control_mode"]
                row["control_mode"] = "scalar"
            row.setdefault("enabled", True)
            row.setdefault("label", row["phrase"])
            if "strength" in row:
                try:
                    value = float(row["strength"])
                    if not math.isfinite(value):
                        raise ValueError
                    row["strength"] = max(-3, min(3, value))
                except (TypeError, ValueError, OverflowError):
                    recovery.append({"path": owner + ".strength", "value": row["strength"]})
                    row["strength"] = 1
                    note("migration.invalid_strength", owner + ".strength", "Invalid weight retained in recovery; neutral weight used.")
            if "strength" not in row and global_rows:
                try:
                    row["strength"] = round(max(-3, min(3, float(row.get("intensity", 0)) / 20)) * 4) / 4
                except (TypeError, ValueError):
                    row["strength"] = 0
                row.setdefault("legacy_weight", row["strength"])
            elif "strength" not in row:
                row.setdefault("legacy_weight", weight_for_row(row))
            try:
                row["intensity"] = max(-100, min(100, int(row.get("intensity", 0))))
            except (ValueError, TypeError, OverflowError):
                row["intensity"] = 0
            if first:
                row.setdefault("origin", "legacy_imported")
                row.setdefault("origin_action", "unknown")
            pid = str(row.get("preset_id") or "")
            orphan = global_rows and pid.startswith("custom.light_") and pid[len("custom.light_"):] not in light_ids
            formerly_pruned = global_rows and row.get("category") == "lighting_direction" and bool(re.match(r"^light from the ", row["phrase"], re.I)) and not pid.startswith("custom.light_")
            duplicate_mirror = global_rows and pid.startswith("custom.light_") and pid in mirrored
            if pid.startswith("custom.light_"):
                mirrored.add(pid)
            if first and (orphan or formerly_pruned or duplicate_mirror):
                row["enabled"] = False
                row["recovered"] = True
                note("migration.recovered_mirror", owner, "Previously hidden light phrase recovered; enable it to include it.")
            out.append(row)
        return out

    state["rows"] = rows(state.get("rows", []), "rows", True)
    characters = state.get("characters", [])
    state["characters"] = []
    if isinstance(characters, list):
        for i, character in enumerate(characters):
            if not isinstance(character, dict):
                recovery.append({"path": f"characters[{i}]", "value": character})
                continue
            character["rows"] = rows(character.get("rows", []), f"characters[{i}].rows")
            state["characters"].append(character)
    elif characters is not None:
        recovery.append({"path": "characters", "value": characters})
        note("migration.malformed_characters", "characters", "Malformed cast retained in recovery.")
    state["state_version"] = max(STATE_VERSION, incoming_version)
    state["schema_version"] = SCHEMA_VERSION
    state.setdefault("document_revision", 0)
    state.setdefault("ui_preferences", {"text_size": 14, "measurement_unit": "m"})
    state.setdefault("randomization", {"seed_mode": "new_per_job", "seed": 0, "locks": {}})
    state.setdefault("native_weighting_enabled", False)
    state.setdefault("native_weighting_strength", 1)
    state.setdefault("derived_sources", {})
    if not isinstance(state.get("randomization"), dict):
        recovery.append({"path": "randomization", "value": state.get("randomization")})
        state["randomization"] = {"seed_mode": "new_per_job", "seed": 0, "locks": {}}
    if not isinstance(state.get("derived_sources"), dict):
        state["derived_sources"] = {}
    scene = state.get("scene_sections")
    if first and isinstance(scene, dict):
        for key in ("lights", "shot_distance"):
            if key in scene:
                state["derived_sources"].setdefault(key, copy.deepcopy(scene[key]))
    def json_safe(value):
        if isinstance(value, float) and not math.isfinite(value):
            return str(value)
        if isinstance(value, dict):
            return {str(k): json_safe(v) for k,v in value.items()}
        if isinstance(value, list):
            return [json_safe(v) for v in value]
        return value
    state["recovery_rows"] = json_safe(state["recovery_rows"])
    if "migration_backup" in state:
        state["migration_backup"] = json_safe(state["migration_backup"])
    return state


def reconcile_derived_rows(state: Dict[str, Any]) -> Dict[str, Any]:
    """Source geometry owns new/edit-derived rows; imported mirrors survive until edit."""
    from .wizard import add_row_phrase
    scene = state.get("scene_sections", {})
    def finite(value, default):
        try:
            value = float(value)
            return value if math.isfinite(value) else default
        except (TypeError, ValueError, OverflowError):
            return default
    sources = state.setdefault("derived_sources", {})
    for key in ("lights", "shot_distance"):
        if key not in scene:
            continue
        current = scene[key]
        def semantic(value):
            if key != "lights" or not isinstance(value, list):
                return value
            return [{k:v for k,v in light.items() if k not in ({"groundDistanceM", "horizontalDistanceM", "heightM", "coordinatesEdited"} if not light.get("coordinatesEdited") else set()) and k not in {"expanded", "selected"}} if isinstance(light, dict) else light for light in value]
        changed = key not in sources or semantic(current) != semantic(sources[key])
        if not changed:
            continue
        if key == "lights" and isinstance(current, list):
            ids = {str(light.get("id")) for light in current if isinstance(light, dict)}
            state["rows"] = [r for r in state["rows"] if not (str(r.get("preset_id", "")).startswith("custom.light_") and not r.get("recovered"))]
            sides = ["front", "front right", "right", "back right", "back", "back left", "left", "front left"]
            for i, light in enumerate(current):
                if not isinstance(light, dict) or light.get("enabled", True) is False:
                    continue
                phrase = light_phrase(light)
                add_row_phrase(state, category="lighting_direction", label=str(light.get("label") or f"Light {i+1}"), phrase=phrase)
                row = state["rows"][-1]
                row.update(id="derived_light_" + str(light.get("id", i)), preset_id="custom.light_" + str(light.get("id", i)), strength=max(0, min(3, finite(light.get("strength", 1.5), 1.5))), origin="derived", owner_path=f"scene_sections.lights[{i}]")
        elif key == "shot_distance":
            state["rows"] = [r for r in state["rows"] if r.get("preset_id") != "custom.shot_distance"]
            value = max(-100, min(100, finite(current, 0)))
            if value:
                phrase = "face close to the lens" if value > 0 else "distant subject framed deep within the environment"
                add_row_phrase(state, category="perspective", label="Shot distance", phrase=phrase)
                state["rows"][-1].update(id="derived_shot_distance",preset_id="custom.shot_distance", strength=round(value / 100 * 12) / 4, origin="derived", owner_path="scene_sections.shot_distance")
        sources[key] = copy.deepcopy(current)
    return state


def light_phrase(light: Dict[str, Any]) -> str:
    """Match the stage's physical light controls while preserving old wording."""
    def number(key, default):
        try:
            value = float(light.get(key, default))
            return value if math.isfinite(value) else default
        except (TypeError, ValueError, OverflowError):
            return default
    angle = number("angleDeg", number("azimuthDeg", 0)) % 360
    index = int(math.floor(angle / 45 + .5)) % 8
    color = str(light.get("color") or "").strip()
    if light.get("coordinatesEdited"):
        sides = ["front", "front left", "left", "back left", "back", "back right", "right", "front right"]
        distance = number("groundDistanceM", number("horizontalDistanceM", 1.5))
        height = number("heightM", 2)
        elevation = math.degrees(math.atan2(height - 1.12, max(0, distance)))
        level = "from above" if elevation > 45 else "slightly above" if elevation > 15 else "from below" if elevation < -15 else "at subject level"
        label = str(light.get("label") or "").lower()
        role = next((role + " light" for role in ("key", "fill", "rim") if role in label), "light")
        phrase = f"{role} coming from the subject’s {sides[index]}, {level}"
        if distance <= 1:
            phrase += ", close to the subject"
        elif distance >= 3:
            phrase += ", distant from the subject"
    else:
        sides = ["front", "front right", "right", "back right", "back", "back left", "left", "front left"]
        distance = number("distanceM", 1.5)
        phrase = f"light from the {sides[index]} at {distance:g}m"
        height = number("heightDeg", 0)
        if height > 0:
            phrase += f", elevated at {height:g} degrees"
    if color and color != "white":
        phrase += ", in " + color
    return phrase
