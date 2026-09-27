"""ComfyUI node registration for Krea2 Prompt Wizard v2.

The backend is intentionally tiny: the frontend editor owns the document
and stores it (with inline ``{{krea2:...}}`` token markers) in the
``prompt_doc`` STRING widget. At execution time this node expands every
token into its preset expansion and returns the positive prompt, the
combined negative prompt, and the human-readable raw document.

Compatible with the modern ComfyUI node API; falls back to plain class
attributes when V3 bases are unavailable (same strategy as the v1 pack).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

from .compiler import compile_document
from .presets import get_store

logger = logging.getLogger("krea2.studio.nodes")

NODE_NAME = "Krea2PromptWizardV2"
NODE_DISPLAY_NAME = "Krea2 Prompt Wizard v2"


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
            },
            "hidden": {},
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative", "raw_prompt")
    FUNCTION = "build"
    CATEGORY = "_Krea2 Prompt Wizard"
    DESCRIPTION = (
        "Write naturally and insert preset tokens; each token expands into its "
        "stored prompt at run time. Outputs the expanded positive prompt, the "
        "combined negative prompt from used presets, and the unexpanded raw view."
    )
    SEARCH_ALIASES = [
        "krea2 prompt studio",
        "prompt wizard v2",
        "token prompt editor",
        "krea2 prompt builder",
    ]

    def build(self, prompt_doc: str = "") -> Tuple[str, str, str]:
        store = get_store()
        result = compile_document(prompt_doc or "", store)
        if result.missing_preset_ids:
            logger.warning(
                "Krea2 Prompt Wizard v2: unresolved preset token(s): %s",
                ", ".join(result.missing_preset_ids),
            )
        return (result.prompt, result.negative, result.raw_prompt)


NODE_CLASS_MAPPINGS: Dict[str, Any] = {NODE_NAME: Krea2PromptWizardV2}
NODE_DISPLAY_NAME_MAPPINGS: Dict[str, str] = {NODE_NAME: NODE_DISPLAY_NAME}
