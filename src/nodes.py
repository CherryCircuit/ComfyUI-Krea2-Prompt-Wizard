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

    RETURN_TYPES = ("STRING", "STRING", "MODEL")
    # A wizard with Each job enabled must run for every queue item.  Marking it
    # as an output node prevents ComfyUI from reusing a previous prompt.
    OUTPUT_NODE = True
    RETURN_NAMES = ("Prompt Output", "Video Motion Prompt", "Model")
    FUNCTION = "build"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = "Visual prompt builder for Krea 2. The frontend owns the editor; the backend compiles the state to one prompt and emits a video motion prompt for image-to-video models like LTX-2.3. The Model output passes the connected model through unchanged."
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

        # The Model input passes through unchanged; LoRA application was
        # removed from the wizard (per-character LoRAs were not compatible
        # with quantized Krea2 backends).
        model_out = model
        warnings = list(result.warnings)

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
            ),
        }


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
NODE_CLASS_MAPPINGS = {
    "Krea2WeightedPhrase": Krea2WeightedPhrase,
    "Krea2PromptAssembler": Krea2PromptAssembler,
    "Krea2PromptWizard": Krea2PromptWizard,
    "Krea2SaveImage": Krea2SaveImage,
    "Krea2PromptSaver": Krea2PromptSaver,
    "Krea2PromptInspector": Krea2PromptInspector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Krea2WeightedPhrase": "Krea2 Weighted Phrase",
    "Krea2PromptAssembler": "Krea2 Prompt Assembler",
    "Krea2PromptWizard": "Krea2 Prompt Wizard",
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
