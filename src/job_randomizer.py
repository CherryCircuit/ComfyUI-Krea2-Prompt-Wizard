"""Per-execution concept-group randomization."""
from __future__ import annotations

import copy
import secrets
from typing import Any, Dict

from .library import Library
from .wizard import add_row


GROUP_CATEGORIES = {
    "subject_expression": (
        "body", "subject_movement", "emotion", "emotion_trigger",
        "face", "face_trigger", "gaze", "mouth", "position",
    ),
    "camera_film": (
        "framing", "angle", "perspective", "lens", "aperture",
        "camera_body", "composition", "camera_movement", "lens_family",
        "film_color",
    ),
    "lighting": ("lighting_setup", "lighting_direction", "lighting_effect"),
    "environment": ("atmosphere", "environment_movement"),
    "style_finish": ("style", "texture", "detail", "custom"),
}

ALL_GROUP_CATEGORIES = {
    "subject_expression": {
        "body", "subject_movement", "emotion", "emotion_trigger",
        "face", "face_trigger", "gaze", "mouth", "position",
    },
    "camera_film": {
        "framing", "angle", "perspective", "lens", "aperture",
        "camera_body", "composition", "camera_movement", "lens_family",
        "film_color",
    },
    "lighting": {"lighting_setup", "lighting_direction", "lighting_effect"},
    "environment": {"environment_movement", "atmosphere"},
    "style_finish": {"style", "texture", "detail", "custom"},
}

# Per-character direction groups, mirroring the frontend's DIRECTION_GROUPS.
DIRECTION_GROUP_CATEGORIES = {
    "emotion": ("emotion", "emotion_trigger"),
    "face": ("face", "face_trigger", "gaze", "mouth"),
    "body": ("body",),
    "placement": ("position",),
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
    if isinstance(flags, dict) and (
        bool(flags.get("setting"))
        or any(
            bool(flags.get(group) or (group == "subject_expression" and (flags.get("subject") or flags.get("expression"))) or (group == "camera_film" and flags.get("camera"))) for group in GROUP_CATEGORIES
        )
    ):
        return True
    # Per-character appearance fields can carry their own each-job flags.
    characters = state.get("characters")
    if isinstance(characters, list):
        for character in characters:
            if not isinstance(character, dict):
                continue
            pools = character.get("randomize_fields")
            if isinstance(pools, dict) and any(
                isinstance(options, list) and options for options in pools.values()
            ):
                return True
            direction_flags = character.get("randomize_direction_groups")
            if isinstance(direction_flags, dict) and any(
                bool(value) for value in direction_flags.values()
            ):
                return True
    return False


def randomize_character_direction(state: Dict[str, Any], library: Library) -> Dict[str, Any]:
    """Replace a character's direction rows for every direction group that
    is flagged "each run" with fresh random concepts from the library."""
    characters = state.get("characters")
    if not isinstance(characters, list):
        return state
    randomizer = secrets.SystemRandom()
    for character in characters:
        if not isinstance(character, dict) or character.get("enabled", True) is False:
            continue
        direction_flags = character.get("randomize_direction_groups")
        if not isinstance(direction_flags, dict):
            continue
        rows = character.get("rows")
        if not isinstance(rows, list):
            rows = []
        for group_key, enabled in direction_flags.items():
            if not enabled:
                continue
            categories = DIRECTION_GROUP_CATEGORIES.get(group_key)
            if not categories:
                continue
            category_set = set(categories)
            rows = [
                row
                for row in rows
                if not isinstance(row, dict) or row.get("category") not in category_set
            ]
            candidates = [
                preset
                for category in categories
                for preset in library.by_category(category)
                if not preset.get("disabled")
            ]
            randomizer.shuffle(candidates)
            minimum = min(2, len(candidates))
            maximum = min(6, len(candidates))
            count = secrets.randbelow(maximum - minimum + 1) + minimum if maximum else 0
            added: list = []
            for preset in candidates[:count]:
                add_row(character, preset, category=preset.get("category"))
                character["rows"][-1]["strength"] = _random_strength(state, randomizer)
                added.append(character["rows"][-1])
            rows = rows + added
        character["rows"] = rows
    return state


def randomize_character_fields(state: Dict[str, Any]) -> Dict[str, Any]:
    """Pick a fresh value for every per-character field flagged "each run".

    The candidate pool is snapshotted into ``character.randomize_fields``
    when the user enables the flag, so the backend never depends on
    frontend-only option lists.

    ``lora_triggers`` is a special multi-line field: each job replaces the
    trigger-word block with a random non-empty subset of the snapshot pool,
    keeping LoRA steering phrases fresh between jobs.
    """
    characters = state.get("characters")
    if not isinstance(characters, list):
        return state
    randomizer = secrets.SystemRandom()
    for character in characters:
        if not isinstance(character, dict):
            continue
        pools = character.get("randomize_fields")
        if not isinstance(pools, dict):
            continue
        for field, options in pools.items():
            if not isinstance(options, list) or not options:
                continue
            values = [str(option) for option in options if str(option).strip()]
            if not values:
                continue
            if field == "lora_triggers":
                maximum = min(3, len(values))
                count = randomizer.randrange(1, maximum + 1)
                chosen = randomizer.sample(values, count)
                randomizer.shuffle(chosen)
                character["lora_triggers"] = "\n".join(chosen)
            else:
                character[field] = randomizer.choice(values)
    return state


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
        flags = {}
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

    result = randomize_character_fields(result)
    result = randomize_character_direction(result, library)
    return result
