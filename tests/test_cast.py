"""Tests for per-character direction, face guidance, and motion prompts."""
from __future__ import annotations

import os
import unittest

from src.compiler import compile_state
from src.library import load_library
from src.wizard import add_row, empty_state


def _lib():
    return load_library(
        bundled_path=os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "presets",
            "default_library.json",
        ),
        user_path=None,
    )


def _row(category, preset_id, phrase, strength, *, label=None, verbatim=False):
    row = {
        "id": f"row_{preset_id}",
        "category": category,
        "preset_id": preset_id,
        "label": label or phrase,
        "phrase": phrase,
        "intensity": 0,
        "strength": strength,
        "control_mode": "scalar",
        "enabled": True,
    }
    if verbatim:
        row["verbatim"] = True
    return row


class CastCompilationTests(unittest.TestCase):
    def test_two_characters_keep_separate_emotions(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "position": "standing on the left side of the frame",
                "rows": [_row("emotion", "emotion.joy", "joy", 1.5)],
            },
            {
                "id": "c2",
                "name": "Alex",
                "enabled": True,
                "position": "standing on the right side of the frame",
                "rows": [_row("emotion", "emotion.sadness", "sadness", 1.5)],
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("Character Mara (standing on the left side of the frame)", result.final_prompt)
        self.assertIn("(joy:1.5)", result.final_prompt)
        self.assertIn("Character Alex (standing on the right side of the frame)", result.final_prompt)
        self.assertIn("(sadness:1.5)", result.final_prompt)
        # Mara's block must not contain sadness, Alex's block must not contain joy.
        mara_idx = result.final_prompt.index("Mara")
        alex_idx = result.final_prompt.index("Alex")
        self.assertLess(mara_idx, alex_idx)
        mara_block = result.final_prompt[mara_idx:alex_idx]
        self.assertIn("joy", mara_block)
        self.assertNotIn("sadness", mara_block)

    def test_face_guidance_is_emitted_verbatim(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "face_guidance": "(sparkling bright eyes:1.4)\n(genuine warm smile:1.2)",
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("(sparkling bright eyes:1.4)", result.final_prompt)
        self.assertIn("(genuine warm smile:1.2)", result.final_prompt)

    def test_verbatim_row_is_not_reweighted(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "rows": [_row("face_trigger", "face_trigger.custom", "(my exact trigger:2.0)", 0, verbatim=True)],
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("(my exact trigger:2.0)", result.final_prompt)
        self.assertNotIn("(my exact trigger:2.0:2.0)", result.final_prompt)

    def test_directed_character_drops_static_expression_field(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "expression": "calm confidence",
                "rows": [_row("emotion", "emotion.shock", "shocked expression", 1.5)],
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("(shocked expression:1.5)", result.final_prompt)
        self.assertNotIn("calm confidence", result.final_prompt)

    def test_legacy_characters_keep_static_expression(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "expression": "calm confidence",
                "clothing": "sci-fi flight suit",
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("Character Mara: expression: calm confidence; clothing and armour: sci-fi flight suit", result.final_prompt)

    def test_position_uses_preset_phrase(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "position": "in the foreground",
                "rows": [_row("body", "body.arms_crossed", "arms crossed", 1.0)],
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("Character Mara (in the foreground), arms crossed", result.final_prompt)

    def test_interaction_compiles_after_direction(self):
        state = empty_state()
        state["characters"] = [
            {
                "id": "c1",
                "name": "Mara",
                "enabled": True,
                "rows": [_row("emotion", "emotion.joy", "joy", 1.5)],
                "interaction": "looking at Alex",
            },
        ]
        result = compile_state(state, _lib())
        self.assertIn("(joy:1.5), looking at Alex", result.final_prompt)

    def test_disabled_character_is_skipped(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": False, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
            {"id": "c2", "name": "Alex", "enabled": True, "rows": [_row("emotion", "emotion.sadness", "sadness", 1.5)]},
        ]
        result = compile_state(state, _lib())
        self.assertNotIn("Mara", result.final_prompt)
        self.assertIn("Alex", result.final_prompt)

    def test_character_rows_do_not_leak_into_global_category_prompts(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
        ]
        state["rows"] = [_row("emotion", "emotion.sadness", "sadness", 1.5)]
        result = compile_state(state, _lib())
        self.assertIn("(joy:1.5)", result.final_prompt)
        self.assertIn("(sadness:1.5)", result.final_prompt)
        self.assertNotIn("joy", result.category_prompts["emotion"])
        self.assertIn("sadness", result.category_prompts["emotion"])

    def test_sex_and_age_compile_into_the_clause(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "sex": "female", "age": "young adult"},
        ]
        result = compile_state(state, _lib())
        self.assertIn("Character Mara: sex: female; age: young adult", result.final_prompt)

    def test_ensemble_disables_separates(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True,
             "ensemble": "western cowboy outfit",
             "clothing_top": "flannel shirt", "clothing_bottom": "jeans"},
        ]
        result = compile_state(state, _lib())
        self.assertIn("costume: western cowboy outfit", result.final_prompt)
        self.assertNotIn("top: flannel shirt", result.final_prompt)
        self.assertNotIn("bottom: jeans", result.final_prompt)

    def test_separates_compile_when_no_ensemble(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True,
             "clothing_top": "flannel shirt", "clothing_bottom": "jeans"},
        ]
        result = compile_state(state, _lib())
        self.assertIn("top: flannel shirt; bottom: jeans", result.final_prompt)

    def test_lora_triggers_are_emitted_verbatim_per_character(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True,
             "lora_triggers": "young woman\nsemi-realistic art style"},
            {"id": "c2", "name": "Alex", "enabled": True,
             "lora_triggers": "older man"},
        ]
        result = compile_state(state, _lib())
        mara_idx = result.final_prompt.index("Mara")
        alex_idx = result.final_prompt.index("Alex")
        mara_block = result.final_prompt[mara_idx:alex_idx]
        self.assertIn("young woman", mara_block)
        self.assertIn("semi-realistic art style", mara_block)
        self.assertNotIn("older man", mara_block)
        self.assertIn("older man", result.final_prompt)
        self.assertEqual(result.trace["cast"][0]["lora_triggers"], "young woman\nsemi-realistic art style")

    def test_legacy_appearance_fields_still_compile(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True,
             "subject": "adult woman", "clothing": "leather jacket", "expression": "calm confidence"},
        ]
        result = compile_state(state, _lib())
        self.assertIn("subject: adult woman", result.final_prompt)
        self.assertIn("clothing and armour: leather jacket", result.final_prompt)
        self.assertIn("expression: calm confidence", result.final_prompt)

    def test_trace_contains_cast_blocks(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
        ]
        result = compile_state(state, _lib())
        self.assertEqual(len(result.trace["cast"]), 1)
        self.assertEqual(result.trace["cast"][0]["name"], "Mara")
        self.assertEqual(result.trace["cast"][0]["rows"][0]["scope"], "character")


class MotionPromptTests(unittest.TestCase):
    def test_draft_disabled_by_default(self):
        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
        ]
        result = compile_state(state, _lib())
        self.assertEqual(result.motion_prompt, "")
        self.assertIn("beams with joy", result.motion_prompt_draft)

    def test_draft_when_enabled(self):
        state = empty_state()
        state["motion_prompt_enabled"] = True
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "position": "left of frame",
             "rows": [_row("emotion", "emotion.joy", "joy", 1.5),
                      _row("body", "body.arms_crossed", "arms crossed", 1.0)],
             "interaction": "looking at Alex"},
        ]
        result = compile_state(state, _lib())
        self.assertEqual(result.motion_prompt, "Mara (left of frame) beams with joy, arms crossed, looking at Alex")

    def test_override_wins(self):
        state = empty_state()
        state["motion_prompt"] = "Mara turns to the camera and smiles slowly"
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
        ]
        result = compile_state(state, _lib())
        self.assertEqual(result.motion_prompt, "Mara turns to the camera and smiles slowly")

    def test_emotion_verb_map_covers_common_emotions(self):
        cases = {
            "happiness": "beams with joy",
            "sadness": "looks sad",
            "terror": "flinches in fear",
            "rage": "glowers in anger",
            "boredom": "looks bored",
            "determination": "stands resolute",
        }
        for phrase, verb in cases.items():
            state = empty_state()
            state["motion_prompt_enabled"] = True
            state["characters"] = [
                {"id": "c1", "name": "Test", "enabled": True,
                 "rows": [_row("emotion", f"emotion.{phrase}", phrase, 1.5)]},
            ]
            result = compile_state(state, _lib())
            self.assertIn(verb, result.motion_prompt, phrase)

    def test_character_without_rows_has_no_motion(self):
        state = empty_state()
        state["motion_prompt_enabled"] = True
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "clothing": "sci-fi flight suit"},
        ]
        result = compile_state(state, _lib())
        self.assertEqual(result.motion_prompt, "")
        self.assertEqual(result.motion_prompt_draft, "")


class CastSchemaTests(unittest.TestCase):
    def test_coerce_state_adds_direction_defaults(self):
        from src.wizard import coerce_state

        state = coerce_state(
            {"characters": [{"id": "c1", "name": "Mara"}]}
        )
        character = state["characters"][0]
        self.assertEqual(character["rows"], [])
        self.assertEqual(character["position"], "")
        self.assertEqual(character["face_guidance"], "")
        self.assertEqual(character["interaction"], "")
        self.assertEqual(character["character_ref"], "")
        self.assertIn("motion_prompt", state)
        self.assertIn("motion_prompt_enabled", state)
        self.assertIn("active_tab", state)

    def test_validate_state_accepts_directed_characters(self):
        from src.validation import validate_state

        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True, "rows": [_row("emotion", "emotion.joy", "joy", 1.5)]},
        ]
        result = validate_state(state)
        self.assertFalse(result.has_errors)

    def test_validate_state_rejects_bad_character_row(self):
        from src.validation import validate_state

        state = empty_state()
        state["characters"] = [
            {"id": "c1", "name": "Mara", "enabled": True,
             "rows": [{"id": "bad", "category": "emotion", "intensity": 0, "enabled": True}]},
        ]
        result = validate_state(state)
        self.assertTrue(result.has_errors)


if __name__ == "__main__":
    unittest.main()
