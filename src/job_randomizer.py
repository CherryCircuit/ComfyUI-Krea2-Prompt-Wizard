"""Per-execution concept-group randomization."""
from __future__ import annotations

import copy
import secrets
from typing import Any, Dict

from .library import Library
from .wizard import add_row


GROUP_CATEGORIES = {
    "subject_expression": ("body", "subject_movement", "emotion", "face", "gaze", "mouth"),
    "camera_film": ("framing", "angle", "lens", "composition", "film_color"),
    "lighting": ("lighting_setup", "lighting_direction", "lighting_effect"),
    "environment": ("atmosphere", "environment_movement"),
    "style_finish": ("style", "texture", "detail"),
}

ALL_GROUP_CATEGORIES = {
    "subject_expression": {"body", "subject_movement", "emotion", "face", "gaze", "mouth"},
    "camera_film": {
        "framing", "angle", "perspective", "lens", "aperture",
        "camera_body", "composition", "camera_movement", "lens_family",
        "film_color",
    },
    "lighting": {"lighting_setup", "lighting_direction", "lighting_effect"},
    "environment": {"environment_movement", "atmosphere"},
    "style_finish": {"style", "texture", "detail", "custom"},
}


def _preset_media(preset: Dict[str, Any]) -> str:
    category = str(preset.get("category") or "")
    text = " ".join(
        [
            str(preset.get("id") or ""),
            str(preset.get("label") or ""),
            str(preset.get("phrase") or ""),
            " ".join(str(tag) for tag in preset.get("tags") or []),
        ]
    ).lower()
    if category in {"camera_body", "lens_family"}:
        return "photo"
    if category != "style":
        return "common"
    photo_terms = (
        "photograph",
        "photographic",
        "film still",
        "fashion editorial",
        "direct-flash",
        "cinematic",
    )
    return "photo" if any(term in text for term in photo_terms) else "art"


def _matches_creative_mode(preset: Dict[str, Any], mode: str) -> bool:
    media = _preset_media(preset)
    return media == "common" or media == mode


def has_job_randomization(state: Dict[str, Any]) -> bool:
    flags = state.get("randomize_on_job")
    return isinstance(flags, dict) and (
        bool(flags.get("setting"))
        or any(
            bool(flags.get(group) or (group == "subject_expression" and (flags.get("subject") or flags.get("expression"))) or (group == "camera_film" and flags.get("camera"))) for group in GROUP_CATEGORIES
        )
    )


def _random_strength(state: Dict[str, Any], randomizer: secrets.SystemRandom) -> float:
    try:
        minimum = float(state.get("random_strength_min", 0))
    except (TypeError, ValueError):
        minimum = 0.0
    try:
        maximum = float(state.get("random_strength_max", 3))
    except (TypeError, ValueError):
        maximum = 3.0
    minimum = max(-3.0, min(3.0, round(minimum * 4) / 4))
    maximum = max(-3.0, min(3.0, round(maximum * 4) / 4))
    if minimum > maximum:
        minimum, maximum = maximum, minimum
    steps = int(round((maximum - minimum) * 4))
    return round((minimum + randomizer.randrange(steps + 1) / 4) * 4) / 4


def randomize_enabled_groups(
    state: Dict[str, Any],
    library: Library,
) -> Dict[str, Any]:
    """Return a copy with enabled groups replaced by fresh random concepts."""
    result = copy.deepcopy(state)
    flags = result.get("randomize_on_job")
    if not isinstance(flags, dict):
        return result
    randomizer = secrets.SystemRandom()

    rows = result.get("rows")
    if not isinstance(rows, list):
        rows = []
    for group, random_categories in GROUP_CATEGORIES.items():
        enabled = flags.get(group) or (group == "subject_expression" and (flags.get("subject") or flags.get("expression"))) or (group == "camera_film" and flags.get("camera"))
        if not enabled:
            continue
        group_categories = ALL_GROUP_CATEGORIES[group]
        rows = [
            row
            for row in rows
            if not isinstance(row, dict)
            or row.get("category") not in group_categories
        ]
        result["rows"] = rows
        mode = str(result.get("creative_mode") or "photo")
        candidates = [
            preset
            for category in random_categories
            for preset in library.by_category(category)
            if not preset.get("disabled") and _matches_creative_mode(preset, mode)
        ]
        randomizer.shuffle(candidates)
        minimum = min(2, len(candidates))
        maximum = min(6, len(candidates))
        count = secrets.randbelow(maximum - minimum + 1) + minimum if maximum else 0
        for preset in candidates[:count]:
            add_row(result, preset, category=preset.get("category"))
            result["rows"][-1]["strength"] = _random_strength(result, randomizer)
            rows = result["rows"]
    result["rows"] = rows

    if flags.get("setting"):
        raw_pool = result.get("setting_random_pool")
        pool = [item for item in raw_pool if isinstance(item, dict)] if isinstance(raw_pool, list) else []
        if not pool and isinstance(result.get("setting_presets"), list):
            pool = [
                item.get("setting")
                for item in result["setting_presets"]
                if isinstance(item, dict) and isinstance(item.get("setting"), dict)
            ]
        if pool:
            selected = copy.deepcopy(randomizer.choice(pool))
            selected["enabled"] = True
            result["setting"] = selected
    return result
