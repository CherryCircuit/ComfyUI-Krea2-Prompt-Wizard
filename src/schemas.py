"""Schemas and constants for the Krea2 Prompt Wizard.

This module is the single source of truth for:

* Category identifiers and canonical compile order.
* Preset structure validation constants.
* Wizard state structure validation constants.
* Weight mapping constants (slider range, clamps, curve coefficients).

Nothing here is allowed to import from :mod:`comfy` or other ComfyUI
internals so that the same module can be exercised from the unit tests
without any ComfyUI runtime.
"""
from __future__ import annotations

from typing import Any, Dict, FrozenSet, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Public version
# ---------------------------------------------------------------------------
SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Slider range & weighting
# ---------------------------------------------------------------------------
SLIDER_MIN = -100
SLIDER_MAX = 100
SLIDER_DEFAULT = 0

# Standard scalar clamps per spec. These are the *visible* safe limits and
# the default clamps for the Wizard backend. Expert users can override in
# each row's advanced controls.
SAFE_WEIGHT_MIN = 0.1
SAFE_WEIGHT_MAX = 3.0

# Bipolar range (slider for bipolar rows is the same -100..+100 but the
# meaning is "emphatically negative phrase" vs "emphatically positive phrase").
BIPOLAR_DEFAULT_RANGE = (0.5, 2.5)

# Experimental raw weighting defaults.
RAW_WEIGHT_MIN = -3.0
RAW_WEIGHT_MAX = 3.0
RAW_WEIGHT_EXPERT_MIN = -4.0
RAW_WEIGHT_EXPERT_MAX = 4.0

# Curve coefficients from the spec.
# Positive side: weight = 1 + 2 * (s/100) ** 1.35
POS_EXPONENT = 1.35
POS_GAIN = 2.0
# Negative side: weight = 1 - 0.9 * (|s|/100) ** 1.1
NEG_EXPONENT = 1.1
NEG_GAIN = 0.9

# Number of safe-decimal digits to retain when printing weights.
WEIGHT_DECIMALS = 2

# ---------------------------------------------------------------------------
# Wizard compression / limits
# ---------------------------------------------------------------------------
MAX_ROWS_DEFAULT = 100  # documented requirement: at least 100 selected rows
MAX_PRESETS_BUNDLED_DEFAULT = 2000  # documented requirement: at least 2000

# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
# Canonical display order matches the spec's compile order. Identifiers are
# stable; renaming a category requires a migration.
CATEGORIES: List[str] = [
    "body",  # body language, pose, subject action
    "emotion",
    "emotion_trigger",  # parenthetical emotion guidance triggers
    "face",  # facial action
    "face_trigger",  # parenthetical face guidance triggers
    "gaze",
    "mouth",  # mouth and vocal action
    "position",  # character placement inside the frame
    "framing",  # camera framing / shot size
    "angle",  # camera angle
    "perspective",  # camera position and perspective
    "lens",  # focal length and lens
    "aperture",  # aperture and depth of field
    "camera_body",  # camera body and format
    "composition",
    "lighting_setup",  # lighting setup
    "lighting_direction",  # lighting direction
    "lighting_effect",  # lighting effects
    "subject_movement",  # subject movement
    "camera_movement",  # camera movement
    "environment_movement",  # environmental movement
    "atmosphere",  # weather and atmosphere
    "style",  # style and medium
    "film_color",  # film and colour character
    "texture",  # texture
    "detail",  # detail and complexity
    "lens_family",  # lens family (optical character)
    "custom",  # custom modifiers
]

CATEGORY_LABELS: Dict[str, str] = {
    "body": "Body Language and Pose",
    "emotion": "Emotion",
    "emotion_trigger": "Emotion Trigger",
    "face": "Facial Action",
    "face_trigger": "Face Trigger",
    "gaze": "Gaze",
    "mouth": "Mouth and Vocal Action",
    "position": "Position and Placement",
    "framing": "Camera Framing",
    "angle": "Camera Angle",
    "perspective": "Camera Position and Perspective",
    "lens": "Focal Length and Lens",
    "aperture": "Aperture and Depth of Field",
    "camera_body": "Camera Body and Format",
    "composition": "Composition",
    "lighting_setup": "Lighting Setup",
    "lighting_direction": "Lighting Direction",
    "lighting_effect": "Lighting Effect",
    "subject_movement": "Subject Movement",
    "camera_movement": "Camera Movement",
    "environment_movement": "Environmental Movement",
    "atmosphere": "Weather and Atmosphere",
    "style": "Style and Medium",
    "film_color": "Film and Colour Character",
    "texture": "Texture",
    "detail": "Detail and Complexity",
    "lens_family": "Lens Family",
    "custom": "Custom",
}


def category_label(slug: str) -> str:
    """Return the display label for a category slug, or the slug if unknown."""
    return CATEGORY_LABELS.get(slug, slug)


# ---------------------------------------------------------------------------
# Output channel names
# ---------------------------------------------------------------------------
# These are the STRING outputs the main Wizard node exposes. They are part
# of the public contract and may be referenced by other nodes / workflows.
OUTPUT_CHANNELS: List[str] = [
    "final_prompt",
    "plain_prompt",
    "body_prompt",
    "emotion_prompt",
    "face_prompt",
    "camera_prompt",
    "composition_prompt",
    "lighting_prompt",
    "movement_prompt",
    "atmosphere_prompt",
    "style_prompt",
    "detail_prompt",
    "custom_prompt",
    "motion_prompt",
    "trace_json",
    "state_json",
    "warnings",
]

# ---------------------------------------------------------------------------
# Weighting modes
# ---------------------------------------------------------------------------
MODE_SCALAR = "scalar"
MODE_BIPOLAR = "bipolar"
MODE_RAW = "raw"
ALLOWED_MODES: FrozenSet[str] = frozenset({MODE_SCALAR, MODE_BIPOLAR, MODE_RAW})

# ---------------------------------------------------------------------------
# Verification statuses
# ---------------------------------------------------------------------------
VERIFICATION_GENERAL = "general visual vocabulary"
VERIFICATION_COMMUNITY = "community reported"
VERIFICATION_LOCAL = "locally tested"
VERIFICATION_KREA_TURBO = "krea2_turbo verified"
VERIFICATION_KREA_RAW = "krea2_raw verified"
VERIFICATION_UNRELIABLE = "unreliable"
VERIFICATION_DEPRECATED = "deprecated"
ALLOWED_VERIFICATIONS: FrozenSet[str] = frozenset(
    {
        VERIFICATION_GENERAL,
        VERIFICATION_COMMUNITY,
        VERIFICATION_LOCAL,
        VERIFICATION_KREA_TURBO,
        VERIFICATION_KREA_RAW,
        VERIFICATION_UNRELIABLE,
        VERIFICATION_DEPRECATED,
    }
)

# ---------------------------------------------------------------------------
# Model profiles
# ---------------------------------------------------------------------------
PROFILE_GENERIC = "generic"
PROFILE_KREA_TURBO = "krea2_turbo"
PROFILE_KREA_RAW = "krea2_raw"
ALLOWED_PROFILES: FrozenSet[str] = frozenset(
    {PROFILE_GENERIC, PROFILE_KREA_TURBO, PROFILE_KREA_RAW}
)

# ---------------------------------------------------------------------------
# Library / state keys
# ---------------------------------------------------------------------------
PRESET_KEYS_REQUIRED: Tuple[str, ...] = (
    "id",
    "category",
    "label",
    "phrase",
    "default_strength",
    "control_mode",
    "verification",
)
PRESET_KEYS_OPTIONAL: Tuple[str, ...] = (
    "aliases",
    "negative_phrase",
    "neutral_phrase",
    "positive_phrase",
    "safe_weight_min",
    "safe_weight_max",
    "tags",
    "conflicts",
    "compatible_profiles",
    "source",
    "notes",
    "schema_version",
    "deprecated_replacement",
    "verbatim",
)
ROW_KEYS_REQUIRED: Tuple[str, ...] = (
    "id",
    "category",
    "preset_id",
    "phrase",
    "intensity",
    "control_mode",
    "enabled",
)
ROW_KEYS_OPTIONAL: Tuple[str, ...] = (
    "label",
    "strength",
    "aliases",
    "negative_phrase",
    "neutral_phrase",
    "positive_phrase",
    "safe_weight_min",
    "safe_weight_max",
    "verification",
    "source",
    "i18n_aliases",
    "favourite",
    "verbatim",
)


# ---------------------------------------------------------------------------
# User-facing limits
# ---------------------------------------------------------------------------
MAX_PROMPT_LENGTH = 20_000  # before triggering a warning
WEIGHT_WARN_THRESHOLD = 2.0  # warn if more than 5 rows exceed
WEIGHT_HARD_WARNING_THRESHOLD = 2.7  # warn if more than 2 rows exceed
WEIGHT_MAX_PROMINENT = 3.0  # any absolute weight above this warns loudly
ROW_COUNT_HARD_WARNING = 5  # any item with weight > 3.0 warns
ROW_COUNT_CRITICAL = 2  # any item with weight > 2.7 warns


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class SchemaError(ValueError):
    """Raised when a preset or state object fails validation."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clamp_slider(value: Any) -> int:
    """Clamp a slider value to the documented range."""
    try:
        value = int(value)
    except (TypeError, ValueError):
        return SLIDER_DEFAULT
    if value < SLIDER_MIN:
        return SLIDER_MIN
    if value > SLIDER_MAX:
        return SLIDER_MAX
    return value


def safe_min_max(preset: Dict[str, Any]) -> Tuple[float, float]:
    """Return the (min, max) weight range for a preset, falling back to
    the documented defaults when the preset does not specify its own.
    """
    mn = preset.get("safe_weight_min", SAFE_WEIGHT_MIN)
    mx = preset.get("safe_weight_max", SAFE_WEIGHT_MAX)
    try:
        mn = float(mn)
    except (TypeError, ValueError):
        mn = SAFE_WEIGHT_MIN
    try:
        mx = float(mx)
    except (TypeError, ValueError):
        mx = SAFE_WEIGHT_MAX
    if mn < RAW_WEIGHT_EXPERT_MIN:
        mn = RAW_WEIGHT_EXPERT_MIN
    if mx > RAW_WEIGHT_EXPERT_MAX:
        mx = RAW_WEIGHT_EXPERT_MAX
    if mn >= mx:
        mn, mx = SAFE_WEIGHT_MIN, SAFE_WEIGHT_MAX
    return mn, mx


def empty_wizard_state() -> Dict[str, Any]:
    """Return a fresh, baseline wizard state.

    The returned object is safe to JSON-serialise.
    """
    return {
        "schema_version": SCHEMA_VERSION,
        "base_prompt": "",
        "model_profile": PROFILE_GENERIC,
        "interface_mode": "simple",
        "show_work": False,
        "rows": [],
        "master_preset_id": None,
        "selected_category": "emotion",
    }
