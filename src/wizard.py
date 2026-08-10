"""The wizard state builder.

This is the public helper API used both by the backend nodes and by the
frontend ``state.js`` round-trip. The builder is the single source of
truth for:

* Building a fresh wizard state.
* Adding / removing / duplicating rows.
* Loading rows from a master preset.
* Resolving preset data between bundled, user, and snapshot layers.
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Dict, List, Optional, Sequence

from .schemas import (
    CATEGORIES,
    SCHEMA_VERSION,
    SLIDER_DEFAULT,
    SLIDER_MAX,
    SLIDER_MIN,
)
from .validation import raise_if_errors, validate_state


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------


def new_row_id() -> str:
    return uuid.uuid4().hex[:12]


def new_preset_id(category: str, label: str) -> str:
    slug = "".join(
        ch for ch in label.lower().replace(" ", "_").replace("-", "_") if ch.isalnum() or ch == "_"
    )
    if not slug:
        slug = uuid.uuid4().hex[:6]
    return f"{category}.{slug}"


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def empty_state() -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "base_prompt": "",
        "model_profile": "generic",
        "interface_mode": "simple",
        "show_work": False,
        "rows": [],
        "master_preset_id": None,
        "selected_category": "emotion",
        "randomize_on_job": {},
        "random_strength_min": 0.0,
        "random_strength_max": 3.0,
        "embed_prompt_metadata": True,
        "creative_mode": "photo",
        "collapsed": {},
        "prompt_metadata_override": False,
        "characters": [],
        "selected_character_id": None,
        "character_presets": [],
        "setting": {"enabled": False, "name": "", "description": ""},
        "setting_presets": [],
        "setting_random_pool": [],
        "motion_prompt": "",
        "motion_prompt_enabled": False,
        "active_tab": "cast",
        "footer_open": False,
        "show_face_guidance": False,
        "show_concepts_tab": False,
    }


def coerce_state(raw: Any) -> Dict[str, Any]:
    """Normalise any incoming state-shaped dict into a valid state.

    Missing fields are filled with defaults; corrupt fields are reset.
    Raises if the input is not a JSON object.
    """
    if not isinstance(raw, dict):
        raw = {}
    state = empty_state()
    for key in (
        "schema_version",
        "base_prompt",
        "model_profile",
        "interface_mode",
        "show_work",
        "master_preset_id",
        "selected_category",
        "randomize_on_job",
        "random_strength_min",
        "random_strength_max",
        "embed_prompt_metadata",
        "creative_mode",
        "collapsed",
        "prompt_metadata_override",
        "concept_colors",
        "loaded_preset_id",
        "loaded_preset_label",
        "loaded_group_presets",
        "characters",
        "selected_character_id",
        "character_presets",
        "setting",
        "setting_presets",
        "setting_random_pool",
        "motion_prompt",
        "motion_prompt_enabled",
        "active_tab",
        "footer_open",
        "show_face_guidance",
        "show_concepts_tab",
        "show_motion_prompt",
    ):
        if key in raw:
            state[key] = raw[key]
    if isinstance(raw.get("rows"), list):
        state["rows"] = [row for row in raw["rows"] if isinstance(row, dict)]
        for row in state["rows"]:
            if "strength" not in row:
                try:
                    legacy = max(
                        -3.0,
                        min(3.0, float(row.get("intensity", 0)) / 20.0),
                    )
                    row["strength"] = round(legacy * 4) / 4
                except (TypeError, ValueError):
                    row["strength"] = 0.0
    if not isinstance(state.get("characters"), list):
        state["characters"] = []
    else:
        state["characters"] = [item for item in state["characters"] if isinstance(item, dict)]
    # Cast members gain their direction scaffolding when missing (additive
    # migration: old workflows simply have empty direction blocks).
    for character in state["characters"]:
        character.setdefault("rows", [])
        if not isinstance(character["rows"], list):
            character["rows"] = []
        character["rows"] = [r for r in character["rows"] if isinstance(r, dict)]
        character.setdefault("position", "")
        character.setdefault("face_guidance", "")
        character.setdefault("interaction", "")
        character.setdefault("character_ref", "")
        character.setdefault("lora_triggers", "")
        character.setdefault("lora_name", "")
        character.setdefault("additional_info", "")
        character.setdefault("ethnicity", "")
        if not isinstance(character.get("randomize_direction_groups"), dict):
            character["randomize_direction_groups"] = {}
        for group_key, enabled in list(character["randomize_direction_groups"].items()):
            if not isinstance(enabled, bool):
                character["randomize_direction_groups"][group_key] = bool(enabled)
        try:
            strength = float(character.get("lora_strength", 0.8))
        except (TypeError, ValueError):
            strength = 0.8
        character["lora_strength"] = max(0.0, min(2.0, round(strength * 20) / 20))
        character.setdefault("sex", "")
        character.setdefault("age", "")
        character.setdefault("ensemble", "")
        character.setdefault("clothing_top", "")
        character.setdefault("clothing_bottom", "")
        if not isinstance(character.get("randomize_fields"), dict):
            character["randomize_fields"] = {}
        for field, options in list(character["randomize_fields"].items()):
            if not isinstance(options, list):
                del character["randomize_fields"][field]
            else:
                character["randomize_fields"][field] = [str(o) for o in options if str(o).strip()]
    if not isinstance(state.get("character_presets"), list):
        state["character_presets"] = []
    if not isinstance(state.get("setting"), dict):
        state["setting"] = {"enabled": False, "name": "", "description": ""}
    if not isinstance(state.get("setting_presets"), list):
        state["setting_presets"] = []
    if not isinstance(state.get("setting_random_pool"), list):
        state["setting_random_pool"] = []
    try:
        minimum = max(-3.0, min(3.0, round(float(state.get("random_strength_min", 0)) * 4) / 4))
    except (TypeError, ValueError):
        minimum = 0.0
    try:
        maximum = max(-3.0, min(3.0, round(float(state.get("random_strength_max", 3)) * 4) / 4))
    except (TypeError, ValueError):
        maximum = 3.0
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    state["random_strength_min"] = minimum
    state["random_strength_max"] = maximum
    state["embed_prompt_metadata"] = state.get("embed_prompt_metadata") is not False
    return state


def add_row(
    state: Dict[str, Any],
    preset: Dict[str, Any],
    *,
    category: Optional[str] = None,
    intensity: Optional[int] = None,
) -> Dict[str, Any]:
    """Append a new row to the wizard state based on a preset."""
    preset = dict(preset)
    cat = category or preset.get("category") or "custom"
    if cat not in CATEGORIES:
        cat = "custom"

    try:
        slider = int(intensity if intensity is not None else preset.get("default_strength", 0))
    except (TypeError, ValueError):
        slider = SLIDER_DEFAULT
    slider = max(SLIDER_MIN, min(SLIDER_MAX, slider))

    row = {
        "id": new_row_id(),
        "category": cat,
        "preset_id": preset.get("id", ""),
        "label": preset.get("label", ""),
        "phrase": preset.get("phrase", ""),
        "control_mode": preset.get("control_mode", "scalar"),
        "intensity": slider,
        "enabled": True,
        "aliases": list(preset.get("aliases") or []),
        "verification": preset.get("verification", "general visual vocabulary"),
        "source": preset.get("source", "library"),
        "favourite": bool(preset.get("favourite", False)),
    }
    for key in ("positive_phrase", "negative_phrase", "neutral_phrase"):
        if key in preset:
            row[key] = preset[key]
    for key in ("safe_weight_min", "safe_weight_max"):
        if key in preset:
            row[key] = preset[key]
    state.setdefault("rows", []).append(row)
    return state


def add_row_phrase(
    state: Dict[str, Any],
    *,
    category: str,
    label: str,
    phrase: str,
    intensity: int = SLIDER_DEFAULT,
    control_mode: str = "scalar",
    verification: str = "general visual vocabulary",
    source: str = "user",
) -> Dict[str, Any]:
    """Append a row from a raw phrase (no preset)."""
    if category not in CATEGORIES:
        category = "custom"
    preset = {
        "id": new_preset_id(category, label or "custom"),
        "category": category,
        "label": label,
        "phrase": phrase,
        "default_strength": intensity,
        "control_mode": control_mode,
        "verification": verification,
        "source": source,
    }
    return add_row(state, preset, intensity=intensity)


def duplicate_row(state: Dict[str, Any], row_id: str) -> bool:
    """Duplicate the row with the given id. Returns True if duplicated."""
    rows = state.get("rows", [])
    for i, row in enumerate(rows):
        if row.get("id") == row_id:
            clone = copy.deepcopy(row)
            clone["id"] = new_row_id()
            rows.insert(i + 1, clone)
            return True
    return False


def remove_row(state: Dict[str, Any], row_id: str) -> bool:
    rows = state.get("rows", [])
    for i, row in enumerate(rows):
        if row.get("id") == row_id:
            del rows[i]
            return True
    return False


def reorder_rows(state: Dict[str, Any], order: Sequence[str]) -> None:
    """Reorder rows to match the supplied list of ids."""
    rows = state.get("rows", [])
    by_id = {r.get("id"): r for r in rows}
    new_rows: List[Dict[str, Any]] = []
    for rid in order:
        if rid in by_id:
            new_rows.append(by_id[rid])
    # Append any rows that weren't in the order list (defensive).
    for r in rows:
        if r.get("id") not in order:
            new_rows.append(r)
    state["rows"] = new_rows


def set_row_field(state: Dict[str, Any], row_id: str, field: str, value: Any) -> bool:
    for row in state.get("rows", []):
        if row.get("id") == row_id:
            row[field] = value
            return True
    return False


def toggle_row(state: Dict[str, Any], row_id: str, enabled: bool) -> bool:
    return set_row_field(state, row_id, "enabled", bool(enabled))


def reset_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Reset the state in place to an empty baseline."""
    state.clear()
    state.update(empty_state())
    return state


# ---------------------------------------------------------------------------
# Resolution against the library
# ---------------------------------------------------------------------------


def resolve_row_against_library(
    row: Dict[str, Any],
    library: Any,
) -> Dict[str, Any]:
    """Return a copy of ``row`` with library metadata filled in.

    The returned dict is safe to JSON-serialise. The original ``row`` is
    not mutated.
    """
    new_row = copy.deepcopy(row)
    preset_id = row.get("preset_id", "")
    if library is None:
        return new_row
    try:
        preset = library.find(preset_id) if hasattr(library, "find") else None
    except Exception:
        preset = None
    if preset:
        if not new_row.get("label"):
            new_row["label"] = preset.get("label", "")
        if not new_row.get("phrase"):
            new_row["phrase"] = preset.get("phrase", "")
        if not new_row.get("category"):
            new_row["category"] = preset.get("category", "custom")
        if not new_row.get("control_mode"):
            new_row["control_mode"] = preset.get("control_mode", "scalar")
        for key in ("positive_phrase", "negative_phrase", "neutral_phrase"):
            if key in preset and key not in new_row:
                new_row[key] = preset[key]
        if "aliases" not in new_row or not new_row["aliases"]:
            new_row["aliases"] = list(preset.get("aliases") or [])
        new_row.setdefault("verification", preset.get("verification", "general visual vocabulary"))
        new_row.setdefault("source", preset.get("source", "library"))
    return new_row


# ---------------------------------------------------------------------------
# Workflow snapshot helpers
# ---------------------------------------------------------------------------


def rows_to_snapshot(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a minimal, portable snapshot of the supplied rows."""
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        snap = {
            "id": row.get("id", ""),
            "category": row.get("category", "custom"),
            "preset_id": row.get("preset_id", ""),
            "label": row.get("label", ""),
            "phrase": row.get("phrase", ""),
            "control_mode": row.get("control_mode", "scalar"),
            "intensity": int(row.get("intensity", SLIDER_DEFAULT)),
            "enabled": bool(row.get("enabled", True)),
            "verification": row.get("verification", "general visual vocabulary"),
            "source": row.get("source", "library"),
        }
        for key in ("aliases", "positive_phrase", "negative_phrase", "neutral_phrase"):
            if key in row and row[key]:
                snap[key] = row[key]
        out.append(snap)
    return out


def rows_from_snapshot(snapshot: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Inverse of :func:`rows_to_snapshot`."""
    return [dict(s) for s in snapshot if isinstance(s, dict)]


def apply_master_preset(state: Dict[str, Any], master_preset: Dict[str, Any], library: Any) -> Dict[str, Any]:
    """Replace the state's rows with the rows from a master preset."""
    state = coerce_state(state)
    state["rows"] = []
    state["master_preset_id"] = master_preset.get("id") if isinstance(master_preset, dict) else None
    if not isinstance(master_preset, dict):
        return state
    for row in master_preset.get("rows", []):
        if not isinstance(row, dict):
            continue
        preset_id = row.get("preset_id", "")
        preset = library.find(preset_id) if library is not None and hasattr(library, "find") else None
        if not preset:
            continue
        state = add_row(state, preset, intensity=row.get("intensity"))
    return state


def validate_or_raise(state: Dict[str, Any]) -> None:
    """Validate a state object and raise :class:`SchemaError` if errors exist."""
    from .validation import validate_state

    result = validate_state(state)
    raise_if_errors(result)
