"""ComfyUI node registration for the Krea2 Prompt Wizard.

This module exposes the four node classes that ship with the project:

* :class:`Krea2WeightedPhrase` — a small, transparent primitive.
* :class:`Krea2PromptAssembler` — a pure assembler for fragment lists.
* :class:`Krea2PromptWizard` — the main all-in-one visual node.
* :class:`Krea2PromptInspector` — a read-only inspector.

The wizard's backend is intentionally minimal: it accepts the wizard
state JSON as a STRING input (and optionally as a hidden widget) and
returns the compiled prompt plus the trace JSON. The frontend JavaScript
takes care of the visual builder.

The code here is compatible with the modern Comfy-Org/ComfyUI V3 node
API (commit ``f966a2b``) and falls back to plain dict schemas when the
V3 base class is not available.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .package_paths import CONFLICTS_PATH, DEFAULT_LIBRARY_PATH, MASTER_PRESETS_PATH
from .schemas import (
    CATEGORIES,
    CATEGORY_LABELS,
    MAX_PROMPT_LENGTH,
    MODE_BIPOLAR,
    MODE_RAW,
    MODE_SCALAR,
    PROFILE_GENERIC,
    PROFILE_KREA_RAW,
    PROFILE_KREA_TURBO,
    SCHEMA_VERSION,
    SLIDER_DEFAULT,
    SLIDER_MAX,
    SLIDER_MIN,
    SAFE_WEIGHT_MIN,
    SAFE_WEIGHT_MAX,
    SAFE_WEIGHT_MAX,
    RAW_WEIGHT_EXPERT_MAX,
    RAW_WEIGHT_EXPERT_MIN,
    RAW_WEIGHT_MAX,
    RAW_WEIGHT_MIN,
)
from .library import Library, load_library
from . import wizard as wizard_helpers
from . import compiler as compiler_module
from . import assembler as assembler_module
from . import inspector as inspector_module
from . import user_paths
from . import migrations as migration_module
from .job_randomizer import has_job_randomization, randomize_enabled_groups


# ---------------------------------------------------------------------------
# Cached library singleton
# ---------------------------------------------------------------------------

_LIBRARY_CACHE: Dict[str, Any] = {"library": None}
_MASTER_PRESETS_CACHE: Dict[str, Any] = {"data": None}


def get_library() -> Library:
    """Return the cached library, loading it on first call."""
    if _LIBRARY_CACHE["library"] is None:
        _LIBRARY_CACHE["library"] = load_library()
    return _LIBRARY_CACHE["library"]


def reload_library() -> Library:
    """Force a reload of the bundled and user library and update the cache."""
    _LIBRARY_CACHE["library"] = load_library()
    return _LIBRARY_CACHE["library"]


def get_master_presets() -> List[Dict[str, Any]]:
    """Return the bundled master presets."""
    if _MASTER_PRESETS_CACHE["data"] is None:
        try:
            with open(MASTER_PRESETS_PATH, "r", encoding="utf-8") as f:
                payload = json.load(f)
            presets = payload.get("master_presets", []) if isinstance(payload, dict) else []
            _MASTER_PRESETS_CACHE["data"] = [p for p in presets if isinstance(p, dict)]
        except Exception:
            _MASTER_PRESETS_CACHE["data"] = []
    return list(_MASTER_PRESETS_CACHE["data"])


def _choice_label(preset: Dict[str, Any]) -> str:
    return f"{preset.get('label', preset.get('id', ''))} [{preset.get('id', '')}]"


def _extract_preset_id(selection: str) -> str:
    if not selection or selection == "None":
        return ""
    match = re.search(r"\[([^\]]+)\]\s*$", selection)
    if match:
        return match.group(1)
    return selection


def _choice_list_for_categories(categories: Sequence[str], *, prefix: str = "") -> List[str]:
    library = get_library()
    choices = ["None"]
    for category in categories:
        for preset in library.by_category(category):
            label = _choice_label(preset)
            if prefix:
                choices.append(f"{prefix}{label}")
            else:
                choices.append(label)
    return choices


def _find_preset(selection: str) -> Optional[Dict[str, Any]]:
    preset_id = _extract_preset_id(selection)
    if not preset_id:
        return None
    return get_library().find(preset_id)


# ---------------------------------------------------------------------------
# Krea2 Weighted Phrase
# ---------------------------------------------------------------------------


class Krea2WeightedPhrase:
    """A small, transparent primitive that turns a phrase and an intensity
    into a (phrase:weight) string.

    The node is intentionally simple. It exists so users can read, edit
    and learn from the wizard's components by looking at them.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "phrase": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "shocked expression",
                        "tooltip": "The phrase to render. If it already contains weighting syntax, the wizard will strip it before re-weighting.",
                    },
                ),
                "enabled": (
                    "BOOLEAN",
                    {"default": True, "tooltip": "When false, the concept is omitted from the assembled prompt."},
                ),
                "control_mode": (
                    [MODE_SCALAR, MODE_BIPOLAR, MODE_RAW],
                    {"default": MODE_SCALAR, "tooltip": "Scalar emphasises/de-emphasises the phrase. Bipolar uses two opposite phrases. Raw emits a literal numerical weight."},
                ),
                "intensity": (
                    "INT",
                    {
                        "default": SLIDER_DEFAULT,
                        "min": SLIDER_MIN,
                        "max": SLIDER_MAX,
                        "step": 1,
                        "tooltip": "Slider value from -100 to +100.",
                    },
                ),
            },
            "optional": {
                "positive_phrase": ("STRING", {"default": "", "multiline": False, "tooltip": "Bipolar mode: positive side phrase."}),
                "negative_phrase": ("STRING", {"default": "", "multiline": False, "tooltip": "Bipolar mode: negative side phrase."}),
                "neutral_phrase": ("STRING", {"default": "", "multiline": False, "tooltip": "Bipolar mode: neutral phrase emitted when the slider is at zero."}),
                "custom_min": ("FLOAT", {"default": SAFE_WEIGHT_MIN, "min": RAW_WEIGHT_EXPERT_MIN, "max": 0.0, "step": 0.05, "tooltip": "Optional lower bound for the weight, expert mode only."}),
                "custom_max": ("FLOAT", {"default": SAFE_WEIGHT_MAX, "min": 0.0, "max": RAW_WEIGHT_EXPERT_MAX, "step": 0.05, "tooltip": "Optional upper bound for the weight, expert mode only."}),
                "raw_mode": ("BOOLEAN", {"default": False, "tooltip": "Permit raw negative numerical weights. Off by default."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "FLOAT", "STRING", "STRING")
    RETURN_NAMES = ("weighted_phrase", "plain_phrase", "mapped_weight", "trace_json", "warnings")
    FUNCTION = "build"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Transparent primitive that renders a single weighted phrase from a slider value."
    SEARCH_ALIASES = ["weighted phrase", "krea2 phrase", "prompt weighting"]

    def build(
        self,
        phrase: str,
        enabled: bool,
        control_mode: str,
        intensity: int,
        positive_phrase: str = "",
        negative_phrase: str = "",
        neutral_phrase: str = "",
        custom_min: float = SAFE_WEIGHT_MIN,
        custom_max: float = SAFE_WEIGHT_MAX,
        raw_mode: bool = False,
    ) -> Tuple[str, str, float, str, str]:
        from .weight_mapping import (
            format_phrase,
            phrase_for_row,
            slider_to_weight_bipolar,
            slider_to_weight_raw,
            slider_to_weight_scalar,
            strip_weighting,
        )

        warnings: List[str] = []
        try:
            intensity_int = int(intensity)
        except (TypeError, ValueError):
            intensity_int = SLIDER_DEFAULT
        if intensity_int < SLIDER_MIN:
            intensity_int = SLIDER_MIN
        if intensity_int > SLIDER_MAX:
            intensity_int = SLIDER_MAX

        mode = control_mode if control_mode in (MODE_SCALAR, MODE_BIPOLAR, MODE_RAW) else MODE_SCALAR
        row = {
            "phrase": phrase or "",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "neutral_phrase": neutral_phrase,
            "intensity": intensity_int,
            "control_mode": mode,
            "enabled": bool(enabled),
        }

        if mode == MODE_RAW and not raw_mode:
            warnings.append("Raw mode is disabled; falling back to scalar weighting.")
            row["control_mode"] = MODE_SCALAR
            mode = MODE_SCALAR

        if not enabled:
            plain = ""
            weighted = ""
            mapped_weight = 1.0
        else:
            if mode == MODE_RAW:
                mapped_weight = slider_to_weight_raw(intensity_int, expert=raw_mode)
            elif mode == MODE_BIPOLAR:
                mapped_weight = slider_to_weight_bipolar(intensity_int)
            else:
                mapped_weight = slider_to_weight_scalar(intensity_int)
            try:
                if custom_min is not None and custom_max is not None:
                    if float(custom_min) < float(custom_max):
                        if mapped_weight < float(custom_min):
                            mapped_weight = float(custom_min)
                        if mapped_weight > float(custom_max):
                            mapped_weight = float(custom_max)
            except (TypeError, ValueError):
                warnings.append("Custom min/max ignored: must be numeric.")
            plain_phrase = strip_weighting(phrase_for_row(row))
            plain = plain_phrase
            if plain == "":
                weighted = ""
            else:
                weighted = format_phrase(plain_phrase, mapped_weight)

        if mode == MODE_RAW and mapped_weight < 0:
            warnings.append(
                "Raw negative numerical weights are community-reported for Krea 2 and may be unstable."
            )
        if abs(mapped_weight) > SAFE_WEIGHT_MAX:
            warnings.append(
                f"Mapped weight {mapped_weight:.2f} exceeds the documented 3.0 ceiling."
            )

        trace = {
            "schema_version": SCHEMA_VERSION,
            "phrase": phrase,
            "enabled": bool(enabled),
            "mode": mode,
            "intensity": intensity_int,
            "mapped_weight": mapped_weight,
            "plain_phrase": plain,
            "weighted_phrase": weighted,
            "warnings": warnings,
        }
        return (
            weighted,
            plain,
            float(mapped_weight),
            json.dumps(trace, ensure_ascii=False),
            "\n".join(warnings),
        )


# ---------------------------------------------------------------------------
# Krea2 Prompt Assembler
# ---------------------------------------------------------------------------


class Krea2PromptAssembler:
    """Reusable assembler that joins a base prompt with a list of dynamic
    fragments and returns the final, plain, category, and trace outputs.

    Use this node when you want a transparent pipeline without the
    visual wizard.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "base_prompt": ("STRING", {"default": "", "multiline": True, "tooltip": "Base scene description."}),
                "separator": ("STRING", {"default": ", ", "multiline": False, "tooltip": "Separator used between fragments."}),
            },
            "optional": {
                "fragment_count": (
                    "INT",
                    {"default": 1, "min": 1, "max": 16, "step": 1, "tooltip": "Number of dynamic fragment inputs to expose. Press Update to apply."},
                ),
                "fragment_1": ("STRING", {"default": "", "multiline": False, "forceInput": True, "tooltip": "Fragment 1."}),
                "fragment_1_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05, "tooltip": "Weight for fragment 1."}),
                "fragment_1_category": ("STRING", {"default": "custom", "multiline": False, "tooltip": "Category for fragment 1."}),
                "fragment_2": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_2_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_2_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_3": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_3_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_3_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_4": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_4_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_4_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_5": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_5_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_5_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_6": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_6_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_6_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_7": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_7_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_7_category": ("STRING", {"default": "custom", "multiline": False}),
                "fragment_8": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
                "fragment_8_weight": ("FLOAT", {"default": 1.0, "min": RAW_WEIGHT_MIN, "max": RAW_WEIGHT_MAX, "step": 0.05}),
                "fragment_8_category": ("STRING", {"default": "custom", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
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
        "trace_json",
        "warnings",
    )
    FUNCTION = "assemble"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Joins a base prompt with a list of dynamic fragments and returns category-grouped outputs."
    SEARCH_ALIASES = ["prompt assembler", "prompt joiner", "krea2 assembler"]

    def assemble(
        self,
        base_prompt: str,
        separator: str,
        fragment_count: int = 1,
        **kwargs,
    ) -> Tuple[str, ...]:
        fragments: List[Dict[str, Any]] = []
        if fragment_count < 0:
            fragment_count = 0
        if fragment_count > 16:
            fragment_count = 16
        for i in range(1, fragment_count + 1):
            text = kwargs.get(f"fragment_{i}", "") or ""
            weight_raw = kwargs.get(f"fragment_{i}_weight", 1.0) or 1.0
            category = kwargs.get(f"fragment_{i}_category", "custom") or "custom"
            try:
                weight = float(weight_raw)
            except (TypeError, ValueError):
                weight = 1.0
            if not text:
                continue
            fragments.append(
                {
                    "id": f"fragment_{i}",
                    "label": f"Fragment {i}",
                    "text": str(text),
                    "weight": weight,
                    "category": str(category),
                    "mode": "scalar",
                    "enabled": True,
                }
            )

        result = assembler_module.assemble(
            base_prompt or "",
            fragments,
            separator=separator or ", ",
        )

        category_prompts = result.category_prompts
        warnings: List[str] = []
        if len(result.final_prompt) > MAX_PROMPT_LENGTH:
            warnings.append(
                f"Final prompt is {len(result.final_prompt)} characters long (>20,000)."
            )

        return (
            result.final_prompt,
            result.plain_prompt,
            category_prompts.get("body", ""),
            category_prompts.get("emotion", ""),
            category_prompts.get("face", ""),
            category_prompts.get("camera_prompt", "") or " ".join(
                v for k, v in category_prompts.items() if k in CATEGORIES and k in ("framing", "angle", "perspective", "lens", "aperture", "camera_body")
            ),
            category_prompts.get("composition", ""),
            category_prompts.get("lighting_prompt", "") or " ".join(
                v for k, v in category_prompts.items() if k in ("lighting_setup", "lighting_direction", "lighting_effect")
            ),
            category_prompts.get("movement_prompt", "") or " ".join(
                v for k, v in category_prompts.items() if k in ("subject_movement", "camera_movement", "environment_movement")
            ),
            category_prompts.get("atmosphere", ""),
            category_prompts.get("style", ""),
            category_prompts.get("detail", ""),
            category_prompts.get("custom", ""),
            json.dumps(result.trace, ensure_ascii=False),
            "\n".join(warnings),
        )


# ---------------------------------------------------------------------------
# Krea2 Prompt Wizard
# ---------------------------------------------------------------------------


class Krea2PromptWizard:
    """The main all-in-one visual prompt-building node."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "wizard_state_json": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "advanced": True,
                        "tooltip": "Advanced state payload written by the frontend wizard.",
                    },
                ),
            },
            "optional": {
                "expert_mode": ("BOOLEAN", {"default": False, "tooltip": "Permit raw negative numerical weights."}),
                "model": (
                    "MODEL",
                    {
                        "tooltip": "Optional. Connect the model here to apply per-character LoRAs configured in the Cast tab. Without this, the Model output stays unconnected and LoRA settings only affect the prompt text.",
                    },
                ),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "MODEL", "STRING")
    # A wizard with Each job enabled must run for every queue item.  Marking it
    # as an output node prevents ComfyUI from reusing a previous prompt.
    OUTPUT_NODE = True
    RETURN_NAMES = ("Prompt Output", "Video Motion Prompt", "Model", "Character LoRA")
    FUNCTION = "build"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Visual prompt builder for Krea 2. The frontend owns the editor; the backend compiles the state to one prompt, optionally applies per-character LoRAs to a connected model, and emits a video motion prompt for image-to-video models like LTX-2.3. The Character LoRA output feeds Krea2CharacterLoras for per-character (regional) LoRA application."
    SEARCH_ALIASES = ["krea2 wizard", "prompt wizard", "visual prompt builder", "krea2 prompt builder"]

    @classmethod
    def IS_CHANGED(cls, wizard_state_json: str = "", expert_mode: bool = False, model=None):
        try:
            parsed = json.loads(wizard_state_json) if wizard_state_json else {}
        except json.JSONDecodeError:
            parsed = {}
        if isinstance(parsed, dict) and has_job_randomization(parsed):
            # ComfyUI's execution cache treats NaN as changed on every queue
            # item; integer time values may be normalized by its cache layer.
            return float("nan")
        return wizard_state_json

    def build(
        self,
        wizard_state_json: str = "",
        expert_mode: bool = False,
        model=None,
        extra_pnginfo: dict | None = None,
    ):
        parsed = json.loads(wizard_state_json) if wizard_state_json else {}
        if not isinstance(parsed, dict):
            raise ValueError("Wizard state must be a JSON object.")
        state = parsed

        state = wizard_helpers.coerce_state(state)
        if isinstance(state.get("rows"), list):
            state["rows"] = migration_module.apply_row_preset_migrations(state["rows"])
        # Always hand a state with job flags to the randomizer.  The helper
        # itself decides which groups are enabled; a separate gate here was
        # intermittently skipping otherwise valid flags during execution.
        if isinstance(state.get("randomize_on_job"), dict):
            state = randomize_enabled_groups(state, get_library())

        result = compiler_module.compile_state(state, get_library(), expert=expert_mode)
        if state.get("embed_prompt_metadata", True) and isinstance(extra_pnginfo, dict):
            extra_pnginfo["krea2_prompt"] = result.final_prompt
            if result.motion_prompt:
                extra_pnginfo["krea2_motion_prompt"] = result.motion_prompt
            if state.get("prompt_metadata_override"):
                # Timesaver / A1111-style readers treat the "prompt" chunk as
                # the positive prompt when it is plain text rather than the
                # graph JSON. SaveImage writes the graph first and then every
                # extra_pnginfo key, so this plain-text value is written last
                # and wins when readers load the chunk (PIL: last chunk wins).
                extra_pnginfo["prompt"] = result.final_prompt

        model_out, lora_warnings = self._apply_character_loras(model, state)
        warnings = list(result.warnings)
        for warning in lora_warnings:
            warnings.append(
                {
                    "code": "lora.apply_warning",
                    "severity": "warning",
                    "message": warning,
                }
            )

        # Return the resolved random choices to the frontend as well as the
        # prompt.  This keeps the visible cards honest after Each job runs.
        return {
            "ui": {
                "krea2_resolved_state": [json.dumps(state, ensure_ascii=False)],
                "krea2_prompt_output": [result.final_prompt],
                "krea2_motion_prompt": [result.motion_prompt],
            },
            "result": (
                result.final_prompt,
                result.motion_prompt,
                model_out,
                _character_lora_json(state),
            ),
        }

    @staticmethod
    def _apply_character_loras(model, state):
        """Apply per-character LoRAs to the connected model.

        LoRAs are applied in cast order with the strength chosen in the
        Cast tab. A LoRA always affects the whole diffusion model — that is
        how ComfyUI works — so the wizard also keeps the LoRA's trigger
        words inside the owning character's prompt block to steer its
        influence toward that character.

        Returns ``(model_out, warnings)``.
        """
        characters = state.get("characters")
        if not isinstance(characters, list):
            return model, []
        assignments = [
            character
            for character in characters
            if isinstance(character, dict)
            and character.get("enabled", True) is not False
            and (
                str(character.get("lora_name") or "").strip()
                or (
                    isinstance(character.get("loras"), list)
                    and any(
                        isinstance(lora, dict)
                        and str(lora.get("filename") or "").strip()
                        for lora in character.get("loras")
                    )
                )
            )
        ]
        if not assignments:
            return model, []
        if model is None:
            return None, [
                "Characters have LoRAs assigned, but the Model input is not "
                "connected. Connect a model to apply them."
            ]
        try:
            from comfy.sd import load_lora_for_models
            from comfy.utils import get_filename_list, get_full_path
        except Exception as exc:  # pragma: no cover - comfy runtime only
            return model, [f"LoRA support requires ComfyUI runtime: {exc}"]
        available = set(get_filename_list("loras"))
        warnings = []
        current = model
        for character in assignments:
            assignments_for_character = [
                (str(lora.get("filename") or "").strip(), lora.get("strength", 0.8))
                for lora in character.get("loras")
                if isinstance(lora, dict) and str(lora.get("filename") or "").strip()
            ]
            if not assignments_for_character:
                assignments_for_character = [
                    (str(character["lora_name"]).strip(), character.get("lora_strength", 0.8))
                ]
            for lora_name, raw_strength in assignments_for_character:
                if lora_name not in available:
                    warnings.append(
                        f"LoRA '{lora_name}' was not found in the loras folder."
                    )
                    continue
                try:
                    strength = float(raw_strength)
                except (TypeError, ValueError):
                    strength = 0.8
                strength = max(0.0, min(2.0, strength))
                if strength == 0:
                    continue
                path = get_full_path("loras", lora_name)
                try:
                    current, _clip = load_lora_for_models(
                        current,
                        None,
                        path,
                        strength,
                        0,
                    )
                except Exception as exc:  # pragma: no cover - comfy runtime only
                    warnings.append(f"Could not apply LoRA '{lora_name}': {exc}")
        return current, warnings


# ---------------------------------------------------------------------------
# Krea2 Save Image
# ---------------------------------------------------------------------------


class Krea2SaveImage:
    """Saves an image with the exact generated prompt embedded as PNG metadata.

    Unlike the plain Save Image node, this always writes the resolved
    prompt text into the PNG as its own text chunk (``krea2_prompt``,
    plus ``krea2_motion_prompt`` when provided) in addition to the
    standard ``prompt`` / ``workflow`` chunks. The prompt survives even
    when the graph JSON changes, so the image carries the exact text
    that generated it.

    Connect the wizard's ``Prompt Output`` to ``prompt_text`` (and
    optionally ``Video Motion Prompt`` to ``motion_text``).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": (
                    "STRING",
                    {
                        "default": "Krea2",
                        "tooltip": "Prefix for the saved file names.",
                    },
                ),
            },
            "optional": {
                "prompt_text": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "forceInput": True,
                        "tooltip": "The exact generated prompt to embed as PNG metadata (connect Prompt Output).",
                    },
                ),
                "motion_text": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "forceInput": True,
                        "tooltip": "Optional motion prompt embedded as PNG metadata.",
                    },
                ),
                "plain_prompt_metadata": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Write the prompt text as the standard 'prompt' metadata chunk instead of the graph JSON. Readers such as the Timesaver Artius Browser and A1111-style viewers then show it as the Positive Prompt.",
                    },
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename",)
    OUTPUT_NODE = True
    FUNCTION = "save"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Saves images with the exact generated prompt embedded as PNG metadata (krea2_prompt chunk)."
    SEARCH_ALIASES = ["save image", "image saver", "png metadata", "prompt metadata"]

    def save(
        self,
        images,
        filename_prefix: str = "Krea2",
        prompt_text: str = "",
        motion_text: str = "",
        plain_prompt_metadata: bool = False,
        prompt=None,
        extra_pnginfo=None,
    ):
        import json as _json
        import os as _os

        import numpy as np
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo

        import folder_paths  # type: ignore

        output_dir = folder_paths.get_output_directory()
        full_output_folder, filename, counter, subfolder, _prefix = (
            folder_paths.get_save_image_path(
                filename_prefix,
                output_dir,
                images.shape[0],
                images.shape[1],
            )
        )
        results = []
        for image in images:
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            metadata = PngInfo()
            if plain_prompt_metadata and prompt_text:
                # Timesaver / A1111-style readers treat a plain-text "prompt"
                # chunk as the positive prompt. The graph JSON is still
                # available in the "workflow" chunk.
                metadata.add_text("prompt", str(prompt_text))
            elif prompt is not None:
                metadata.add_text("prompt", _json.dumps(prompt))
            workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
            if workflow is not None:
                metadata.add_text("workflow", _json.dumps(workflow))
            if prompt_text:
                metadata.add_text("krea2_prompt", str(prompt_text))
            if motion_text:
                metadata.add_text("krea2_motion_prompt", str(motion_text))
            file = f"{filename}_{counter:05}_.png"
            img.save(
                _os.path.join(full_output_folder, file),
                pnginfo=metadata,
                compress_level=4,
            )
            results.append({"filename": file, "subfolder": subfolder, "type": "output"})
            counter += 1
        return {
            "ui": {"images": results},
            "result": (file,),
        }


# ---------------------------------------------------------------------------
# Krea2 Prompt Saver
# ---------------------------------------------------------------------------


class Krea2PromptSaver:
    """Records the exact generated prompt for every execution.

    The built-in Save Image node only writes the standard ``prompt`` and
    ``workflow`` PNG chunks; custom keys such as ``krea2_prompt`` are only
    embedded when the metadata feature of your Save Image node writes
    ``extra_pnginfo``. This node is the workflow-independent fallback: it
    appends every execution's prompt to a session log under
    ``ComfyUI/output/krea2_prompt_history.jsonl`` and re-asserts the
    metadata key at its own execution time.

    Connect the wizard's Prompt Output here (and optionally Video Motion
    Prompt). The prompt string is passed through unchanged.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "forceInput": True,
                        "tooltip": "The exact generated prompt to record.",
                    },
                ),
            },
            "optional": {
                "motion_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "forceInput": True,
                        "tooltip": "Optional video motion prompt recorded alongside the still prompt.",
                    },
                ),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    OUTPUT_NODE = True
    FUNCTION = "record"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Records the exact generated prompt to a JSONL history file and re-asserts image metadata."
    SEARCH_ALIASES = ["prompt saver", "prompt history", "prompt log", "metadata"]

    def record(
        self,
        prompt: str,
        motion_prompt: str = "",
        extra_pnginfo: dict | None = None,
    ):
        import datetime as _dt

        from .user_paths import output_history_path

        payload = {
            "timestamp": _dt.datetime.now().isoformat(timespec="seconds"),
            "prompt": str(prompt or ""),
            "motion_prompt": str(motion_prompt or ""),
        }
        # Re-assert the metadata key at this node's own execution, which is
        # useful when the wizard was cached but this node still ran.
        if isinstance(extra_pnginfo, dict):
            if payload["prompt"]:
                extra_pnginfo["krea2_prompt"] = payload["prompt"]
            if payload["motion_prompt"]:
                extra_pnginfo["krea2_motion_prompt"] = payload["motion_prompt"]
        try:
            path = output_history_path(create=True)
            if not path:
                return (payload["prompt"],)
            line = json.dumps(payload, ensure_ascii=False) + "\n"
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(line)
        except Exception:
            # Recording must never fail the workflow.
            pass
        return (payload["prompt"],)


# ---------------------------------------------------------------------------
# Krea2 Prompt Inspector
# ---------------------------------------------------------------------------


class Krea2PromptInspector:
    """Read-only inspector that formats a trace/state JSON into a table."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "trace_json": ("STRING", {"default": "", "multiline": True, "forceInput": True, "tooltip": "Trace JSON produced by the wizard."}),
                "state_json": ("STRING", {"default": "", "multiline": True, "forceInput": True, "tooltip": "Wizard state JSON. Used when no trace is available."}),
                "final_prompt": ("STRING", {"default": "", "multiline": True, "forceInput": True, "tooltip": "Final prompt to display at the bottom of the report."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("report", "warnings", "normalized_trace_json")
    FUNCTION = "inspect"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Inspects a trace/state JSON and produces a formatted report."
    SEARCH_ALIASES = ["prompt inspector", "show work", "krea2 inspector"]

    def inspect(
        self,
        trace_json: str = "",
        state_json: str = "",
        final_prompt: str = "",
    ) -> Tuple[str, str, str]:
        report = inspector_module.inspect(
            trace_json=trace_json if trace_json else None,
            state_json=state_json if state_json else None,
            final_prompt=final_prompt if final_prompt else None,
        )
        return (
            report.text,
            "\n".join(report.warnings),
            json.dumps(report.normalized_trace, ensure_ascii=False),
        )


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Krea2 Character LoRAs — per-character LoRA application via ComfyUI's Hook
# System. Standard model patching makes a LoRA affect the whole image; this
# node attaches each character's LoRAs as conditioning hooks and masks the
# character's text segment to its side of the frame, so the sampler applies
# the LoRA only where that character is drawn.
# ---------------------------------------------------------------------------


def _character_lora_json(state: dict) -> str:
    """Compact per-character LoRA manifest for Krea2CharacterLoras."""
    characters = state.get("characters")
    if not isinstance(characters, list):
        return json.dumps({"characters": []})
    out = []
    for character in characters:
        if not isinstance(character, dict) or character.get("enabled", True) is False:
            continue
        loras = [
            {
                "filename": str(lora.get("filename") or "").strip(),
                "strength": lora.get("strength", 0.8),
            }
            for lora in (character.get("loras") or [])
            if isinstance(lora, dict) and str(lora.get("filename") or "").strip()
        ]
        if not loras:
            name = str(character.get("lora_name") or "").strip()
            if name:
                loras = [{"filename": name, "strength": character.get("lora_strength", 0.8)}]
        if loras:
            out.append(
                {
                    "name": str(character.get("name") or "").strip(),
                    "position": str(character.get("position") or "").strip(),
                    "loras": loras,
                }
            )
    return json.dumps({"characters": out}, ensure_ascii=False)


class Krea2CharacterLoras:
    """Regional, per-character LoRA application.

    Parses the wizard's Prompt Output into per-character segments, strips
    any ``<lora:...>`` tags and ``(phrase:weight)`` weighting syntax from
    the text, encodes each segment with the CLIP, attaches the character's
    LoRAs as conditioning hooks, and masks the segment to the character's
    region of the frame (from the position field when present, otherwise
    split by cast order). Feed the BASE model (Load Diffusion Model
    output), the wizard's Prompt Output and its Character LoRA JSON, and a
    CLIP. Connect the Krea2 Prompt Weight node's conditioning output to the
    optional ``conditioning`` input to append these regional segments to it
    — the sampler then receives one combined conditioning.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "tooltip": "The wizard's Prompt Output. <lora:...> tags and (phrase:weight) syntax are stripped before encoding.",
                    },
                ),
                "lora_state": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "{}",
                        "tooltip": "The wizard's Character LoRA JSON output.",
                    },
                ),
            },
            "optional": {
                "conditioning": (
                    "CONDITIONING",
                    {
                        "tooltip": "Base conditioning to append to — e.g. the Krea2 Prompt Weight node's conditioning output. Kept at the front so its token-weight positions stay valid.",
                    },
                ),
                "mask_size": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "MODEL", "STRING")
    RETURN_NAMES = ("conditioning", "model", "applied_lora_log")
    FUNCTION = "encode"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Applies each character's LoRAs only to that character's region via conditioning hooks and masks. Connect the base model, the wizard's Prompt Output, its Character LoRA JSON, and a CLIP. The applied_lora_log output shows exactly which LoRA loads for which character."
    SEARCH_ALIASES = ["regional lora", "per character lora", "character lora", "hook lora"]

    @staticmethod
    def parse_manifest(lora_state: Any) -> Dict[str, list]:
        """Extract {character_name_lower: [lora dicts]} from the manifest."""
        payload = lora_state
        if isinstance(lora_state, str):
            try:
                payload = json.loads(lora_state or "{}")
            except json.JSONDecodeError:
                payload = {}
        by_name: Dict[str, list] = {}
        if not isinstance(payload, dict):
            return by_name
        for character in payload.get("characters", []) if isinstance(payload.get("characters"), list) else []:
            if not isinstance(character, dict):
                continue
            loras = [
                lora
                for lora in character.get("loras", [])
                if isinstance(lora, dict) and str(lora.get("filename") or "").strip()
            ]
            name = str(character.get("name") or "").strip().lower()
            position = str(character.get("position") or "").strip()
            if loras and name:
                by_name[name] = {"loras": loras, "position": position}
        return by_name

    @staticmethod
    def split_segments(text: str):
        """Split the prompt into (text, character_name_or_None) segments.

        Strips <lora:...> tags and (phrase:weight) weighting syntax (the
        phrase text is kept) so neither leaks into the encoded text.
        """
        cleaned = re.sub(r"<lora:[^>]+>", "", text or "")
        cleaned = re.sub(r"\(([^():]+):-?\d*\.?\d+\)", r"\1", cleaned)
        parts = re.split(r"(?=Character )", cleaned)
        segments = []
        for part in parts:
            stripped = part.strip()
            if not stripped:
                continue
            match = re.match(r"Character\s+([^:：(]+)", stripped)
            segments.append((stripped, match.group(1).strip().lower() if match else None))
        return segments

    @staticmethod
    def region_for(position: str, cast_index: int, cast_total: int) -> str:
        """Left / right / center region for a character."""
        text = position.lower()
        if "left" in text:
            return "left"
        if "right" in text:
            return "right"
        if "centre" in text or "center" in text or "middle" in text or "center of" in text:
            return "center"
        if cast_total > 2:
            thirds = ["left", "center", "right"]
            return thirds[min(cast_index, 2)]
        return "left" if cast_index % 2 == 0 else "right"

    def encode(self, model, clip, text, lora_state, conditioning=None, mask_size=1024):
        import copy
        import os

        import torch

        import comfy.hooks
        import comfy.utils
        import folder_paths

        manifest = self.parse_manifest(lora_state)
        segments = self.split_segments(text)
        cast_total = len([1 for seg in segments if seg[1] is not None])
        cast_index = 0
        log_lines = []
        # Any base conditioning (e.g. the Krea2 Prompt Weight node's output)
        # stays at the front so its token-weight positions remain valid.
        conditioning = list(conditioning) if isinstance(conditioning, list) else []
        for seg_text, char_key in segments:
            tokens = clip.tokenize(seg_text)
            cond = clip.encode_from_tokens_scheduled(tokens)
            entry = manifest.get(char_key) if char_key else None
            if entry:
                hooks = comfy.hooks.HookGroup()
                applied = []
                for lora in entry["loras"]:
                    filename = str(lora.get("filename") or "").strip()
                    path = folder_paths.get_full_path("loras", filename)
                    if not path or not os.path.exists(path):
                        log_lines.append(
                            f"Character '{char_key}': LoRA '{filename}' NOT FOUND in the loras folder \u2014 skipped"
                        )
                        continue
                    try:
                        strength = float(lora.get("strength", 1.0))
                    except (TypeError, ValueError):
                        strength = 1.0
                    tensors = comfy.utils.load_torch_file(path, safe_load=True)
                    hooks = hooks.clone_and_combine(
                        comfy.hooks.create_hook_lora(lora=tensors, strength_model=strength, strength_clip=0.0)
                    )
                    applied.append(f"{filename}@{strength:g}")
                if hooks.hooks:
                    cond = comfy.hooks.set_hooks_for_conditioning(cond, hooks)
                if applied:
                    log_lines.append(f"Character '{char_key}': {', '.join(applied)}")
                else:
                    log_lines.append(f"Character '{char_key}': no LoRAs were loaded")
            elif char_key is not None:
                log_lines.append(f"Character '{char_key}': NO MATCH in the Character LoRA manifest (name mismatch or no LoRAs assigned)")
            region = self.region_for(entry["position"] if entry else "", cast_index, cast_total)
            mask = self._build_mask(region, int(mask_size)) if entry else None
            if mask is not None:
                out = copy.deepcopy(cond[0][1])
                out["mask"] = mask
                out["set_area_to_bounds"] = False
                out["mask_strength"] = 1.0
                cond = [[cond[0][0], out]]
            conditioning.extend(cond)
            if char_key:
                cast_index += 1
        return (conditioning, model, "\n".join(log_lines))

    @staticmethod
    def _build_mask(region: str, size: int):
        """A 1x1xHxW float mask: 1 where the character lives, 0 elsewhere."""
        import torch

        mask = torch.zeros((1, 1, size, size), dtype=torch.float32)
        if region == "left":
            mask[:, :, :, : size // 2] = 1.0
        elif region == "right":
            mask[:, :, :, size // 2 :] = 1.0
        else:  # center band
            band = size // 2
            start = (size - band) // 2
            mask[:, :, :, start : start + band] = 1.0
        return mask


NODE_CLASS_MAPPINGS = {
    "Krea2WeightedPhrase": Krea2WeightedPhrase,
    "Krea2PromptAssembler": Krea2PromptAssembler,
    "Krea2PromptWizard": Krea2PromptWizard,
    "Krea2CharacterLoras": Krea2CharacterLoras,
    "Krea2SaveImage": Krea2SaveImage,
    "Krea2PromptSaver": Krea2PromptSaver,
    "Krea2PromptInspector": Krea2PromptInspector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2WeightedPhrase": "Krea2 Weighted Phrase",
    "Krea2PromptAssembler": "Krea2 Prompt Assembler",
    "Krea2PromptWizard": "Krea2 Prompt Wizard",
    "Krea2CharacterLoras": "Krea2 Character LoRAs",
    "Krea2SaveImage": "Krea2 Save Image",
    "Krea2PromptSaver": "Krea2 Prompt Saver",
    "Krea2PromptInspector": "Krea2 Prompt Inspector",
}


# ---------------------------------------------------------------------------
# Initial seed at import time
# ---------------------------------------------------------------------------


def _initialise() -> None:
    """Warm the library cache so the first wizard run is fast."""
    try:
        get_library()
    except Exception:
        # If the library fails to load, the wizard will still operate
        # by returning the base prompt and an error warning.
        pass


_initialise()
