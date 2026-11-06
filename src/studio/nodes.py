"""ComfyUI node registration for Krea2 Prompt Wizard v2.

The backend is intentionally tiny: the frontend editor owns the document
and stores it (with inline ``{{krea2:...}}`` token markers) in the
``prompt_doc`` STRING widget. At execution time this node expands every
token into its preset expansion and returns the positive prompt, the
combined negative prompt, and the human-readable raw document.

A second hidden widget, ``refined_doc``, holds the LLM refiner's drafts:
one per section (``prompt`` / ``last_prompt``), each carrying the body,
the expanded text it was written from, the model that wrote it, and an
enabled flag. An enabled draft replaces that section's compiled text at
output time — the token document itself is never touched, so flipping the
draft off queues exactly what the user wrote.

Compatible with the modern ComfyUI node API; falls back to plain class
attributes when V3 bases are unavailable (same strategy as the v1 pack).
"""
from __future__ import annotations

import json
import logging
import random
from typing import Any, Dict, Tuple

from .compiler import compile_document, parse_pools
from .presets import get_store
from .tokens import has_randomize

logger = logging.getLogger("krea2.studio.nodes")

NODE_NAME = "Krea2PromptWizardV2"
# The class name stays for workflow compatibility; the display name is the
# product surface, and the product is now model-agnostic.
NODE_DISPLAY_NAME = "Prompt Wizard v2 — Universal"


def parse_refined(raw: str) -> Dict[str, Dict[str, Any]]:
    """The ``refined_doc`` JSON -> ``{section: draft}``, junk mapped away.

    A draft is kept only when it carries a non-empty body; ``enabled`` and
    ``model`` are passed through for the executor and the logs.
    """
    try:
        data = json.loads(raw or "")
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for section in ("prompt", "last_prompt"):
        entry = data.get(section)
        if not isinstance(entry, dict):
            continue
        body = entry.get("body")
        if not isinstance(body, str) or not body.strip():
            continue
        out[section] = {
            "body": body,
            "enabled": entry.get("enabled") is not False,
            "model": str(entry.get("model") or ""),
            "source": str(entry.get("source") or ""),
        }
    return out


class Krea2PromptWizardV2:
    """Token-based prompt editor node (v2)."""

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "prompt_doc": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "advanced": True,
                        "tooltip": (
                            "Editor document with inline preset token markers. "
                            "Written and read by the node's visual editor."
                        ),
                    },
                ),
                "refined_doc": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "advanced": True,
                        "tooltip": (
                            "LLM refiner drafts as JSON, one per section. "
                            "Written and read by the node's visual editor."
                        ),
                    },
                ),
                "randomizer_doc": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "advanced": True,
                        "tooltip": (
                            "Randomizer pool selections as JSON (one checked "
                            "set of preset ids per slot). Written and read by "
                            "the node's randomizer board."
                        ),
                    },
                ),
            },
            "hidden": {},
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative", "raw_prompt", "last_prompt", "last_negative")
    FUNCTION = "build_ui"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = (
        "A universal prompt builder: write naturally and insert preset tokens; "
        "each token expands into its stored prompt at run time. Randomizer "
        "pools narrow every dice roll to the options you checked. Outputs the "
        "expanded positive prompt, the combined negative prompt from used "
        "presets, and the unexpanded raw view. With frame sections, "
        "prompt/negative/raw cover the FIRST frame and last_prompt/"
        "last_negative carry the shared+last-frame text for first/last-frame "
        "image pairs."
    )
    SEARCH_ALIASES = [
        "prompt wizard v2",
        "prompt studio",
        "universal prompt builder",
        "token prompt editor",
        "random prompt builder",
        "krea2 prompt builder",
    ]

    @classmethod
    def IS_CHANGED(
        cls,
        prompt_doc: str = "",
        refined_doc: str = "",
        randomizer_doc: str = "",
    ) -> object:
        # Randomized documents must run fresh for every queue item so a
        # 10-15 image batch yields different picks each time (NaN is never
        # equal to itself, defeating the execution cache).
        if has_randomize(prompt_doc or ""):
            return float("nan")
        return prompt_doc

    def _execute(
        self,
        prompt_doc: str = "",
        refined_doc: str = "",
        randomizer_doc: str = "",
    ) -> Tuple[Tuple[str, str, str, str, str], Dict[str, Any]]:
        """Compile one run and collect both socket values and UI feedback."""
        store = get_store()
        doc = prompt_doc or ""
        # Randomized tokens (flag ~) draw a fresh same-slot preset per
        # execution; IS_CHANGED returns NaN so ComfyUI never caches a run.
        rng = random.Random() if has_randomize(doc) else None
        pools = parse_pools(randomizer_doc)
        result = compile_document(doc, store, rng=rng, pools=pools)
        if result.missing_preset_ids:
            logger.warning(
                "Krea2 Prompt Wizard v2: unresolved preset token(s): %s",
                ", ".join(result.missing_preset_ids),
            )
        if result.random_choices:
            logger.info(
                "Krea2 Prompt Wizard v2 randomized: %s",
                ", ".join(
                    f"{choice['token_id']} -> {choice['chosen_id']}"
                    for choice in result.random_choices
                ),
            )

        # Enabled refiner drafts replace their section's compiled text —
        # the rewrite stands in for the prompt rather than joining it.
        # Negatives always stay the presets' own: a draft is positive prose.
        refined = parse_refined(refined_doc)
        prompt_draft = refined.get("prompt")
        if prompt_draft and prompt_draft["enabled"]:
            result.prompt = prompt_draft["body"]
            logger.info(
                "Krea2 Prompt Wizard v2: prompt output uses the refiner draft%s",
                f" by {prompt_draft['model']}" if prompt_draft["model"] else "",
            )
        last_draft = refined.get("last_prompt")
        if last_draft and last_draft["enabled"] and result.has_frames:
            result.last_prompt = last_draft["body"]
            logger.info(
                "Krea2 Prompt Wizard v2: last_prompt output uses the refiner draft%s",
                f" by {last_draft['model']}" if last_draft["model"] else "",
            )

        outputs = (
            result.prompt,
            result.negative,
            result.raw_prompt,
            result.last_prompt,
            result.last_negative,
        )
        # Only randomized runs send the resolved document back. The
        # frontend uses it to show the presets that actually ran, while the
        # stored document keeps its dice for the next queue item.
        ui: Dict[str, Any] = {}
        if result.random_choices:
            ui = {
                "krea2_studio_doc": [result.randomized_doc],
                "krea2_studio_picks": [json.dumps(result.random_choices)],
                "krea2_studio_prompt": [result.prompt],
            }
        return outputs, ui

    def build(
        self,
        prompt_doc: str = "",
        refined_doc: str = "",
        randomizer_doc: str = "",
    ) -> Tuple[str, str, str, str, str]:
        """The five STRING outputs (also the direct unit-test entry point)."""
        outputs, _ui = self._execute(prompt_doc, refined_doc, randomizer_doc)
        return outputs

    def build_ui(
        self,
        prompt_doc: str = "",
        refined_doc: str = "",
        randomizer_doc: str = "",
    ) -> Dict[str, Any]:
        """ComfyUI entry point: values plus the last-run UI payload."""
        outputs, ui = self._execute(prompt_doc, refined_doc, randomizer_doc)
        return {"ui": ui, "result": outputs}


NODE_CLASS_MAPPINGS: Dict[str, Any] = {NODE_NAME: Krea2PromptWizardV2}
NODE_DISPLAY_NAME_MAPPINGS: Dict[str, str] = {NODE_NAME: NODE_DISPLAY_NAME}
