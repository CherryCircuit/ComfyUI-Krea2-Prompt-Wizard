"""Tests for opt-in per-job group randomization."""
from __future__ import annotations

import json
import math
import unittest

from src.job_randomizer import (
    has_job_randomization,
    randomize_character_fields,
    randomize_enabled_groups,
)
from src.library import Library
from src.nodes import Krea2PromptWizard


def preset(preset_id: str, category: str) -> dict:
    return {
        "id": preset_id,
        "category": category,
        "label": preset_id,
        "phrase": preset_id,
        "default_strength": 40,
        "control_mode": "scalar",
    }


class JobRandomizerTests(unittest.TestCase):
    def setUp(self):
        self.library = Library(
            presets=[
                preset("body.one", "body"),
                preset("subject_movement.one", "subject_movement"),
                preset("emotion.one", "emotion"),
            ]
        )

    def test_enabled_group_is_replaced_without_touching_other_groups(self):
        state = {
            "rows": [
                {
                    "id": "old_subject",
                    "category": "body",
                    "preset_id": "body.old",
                    "phrase": "old",
                },
                {
                    "id": "keep_expression",
                    "category": "emotion",
                    "preset_id": "emotion.keep",
                    "phrase": "keep",
                },
            ],
            "randomize_on_job": {"subject": True},
        }
        result = randomize_enabled_groups(state, self.library)
        ids = {row.get("preset_id") for row in result["rows"]}
        self.assertNotIn("body.old", ids)
        self.assertGreaterEqual(len(ids), 2)
        self.assertNotIn("emotion.keep", ids)
        self.assertEqual(state["rows"][0]["preset_id"], "body.old")

    def test_cache_is_busted_only_when_job_randomization_is_enabled(self):
        enabled = json.dumps({"randomize_on_job": {"camera": True}})
        disabled = json.dumps({"randomize_on_job": {"camera": False}})
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(enabled)))
        self.assertEqual(Krea2PromptWizard.IS_CHANGED(disabled), disabled)
        self.assertTrue(has_job_randomization(json.loads(enabled)))

    def test_randomized_strengths_stay_inside_the_compiler_range(self):
        library = Library(
            presets=[preset(f"body.{index}", "body") | {"default_strength": 100} for index in range(6)]
        )
        result = randomize_enabled_groups(
            {"rows": [], "randomize_on_job": {"subject_expression": True}},
            library,
        )
        self.assertTrue(result["rows"])
        self.assertTrue(all(-3 <= row["strength"] <= 3 for row in result["rows"]))

    def test_randomized_strengths_respect_the_selected_range(self):
        library = Library(
            presets=[preset(f"body.{index}", "body") for index in range(10)]
        )
        for _ in range(20):
            result = randomize_enabled_groups(
                {
                    "rows": [],
                    "randomize_on_job": {"subject_expression": True},
                    "random_strength_min": -3,
                    "random_strength_max": -1,
                },
                library,
            )
            self.assertTrue(all(-3 <= row["strength"] <= -1 for row in result["rows"]))

    def test_setting_can_randomize_on_each_job(self):
        state = {
            "rows": [],
            "randomize_on_job": {"setting": True},
            "setting": {"enabled": True, "name": "Old setting"},
            "setting_random_pool": [
                {"name": "Bridge", "description": "command deck"},
            ],
        }
        result = randomize_enabled_groups(state, self.library)
        self.assertEqual(result["setting"]["name"], "Bridge")
        self.assertTrue(result["setting"]["enabled"])
        self.assertTrue(has_job_randomization(state))

    def test_backend_compile_errors_are_not_replaced_with_the_base_prompt(self):
        state = json.dumps(
            {
                "base_prompt": "base prompt",
                "rows": [
                    {
                        "id": "bad",
                        "category": "body",
                        "preset_id": "body.one",
                        "phrase": "body.one",
                        "strength": 1.0,
                        "control_mode": "scalar",
                        "enabled": True,
                        "intensity": 0,
                    }
                ],
            }
        )
        result = Krea2PromptWizard().build(state)
        self.assertEqual(json.loads(result["ui"]["krea2_resolved_state"][0])["base_prompt"], "base prompt")

    def test_actual_prompt_is_added_to_image_metadata(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "embed_prompt_metadata": True,
            }
        )
        extra_pnginfo: dict = {}
        result = Krea2PromptWizard().build(state, extra_pnginfo=extra_pnginfo)
        self.assertEqual(extra_pnginfo["krea2_prompt"], "scene")
        self.assertEqual(result["ui"]["krea2_prompt_output"], ["scene"])

    def test_random_group_uses_between_two_and_six_concepts(self):
        library = Library(
            presets=[preset(f"body.{index}", "body") for index in range(20)]
        )
        for _ in range(20):
            result = randomize_enabled_groups(
                {"rows": [], "randomize_on_job": {"subject_expression": True}},
                library,
            )
            self.assertGreaterEqual(len(result["rows"]), 2)
            self.assertLessEqual(len(result["rows"]), 6)

    def test_art_mode_excludes_photography_style(self):
        library = Library(
            presets=[
                preset("style.photo", "style")
                | {"id": "style.photo", "phrase": "a photograph of a city street"},
                preset("style.painterly", "style")
                | {"id": "style.painterly", "phrase": "painterly illustration"},
            ]
        )
        for _ in range(10):
            result = randomize_enabled_groups(
                {
                    "rows": [],
                    "randomize_on_job": {"style_finish": True},
                    "creative_mode": "art",
                },
                library,
            )
            self.assertTrue(result["rows"])
            self.assertNotIn(
                "style.photo",
                {row["preset_id"] for row in result["rows"]},
            )

    def test_character_field_randomization_picks_from_the_snapshot_pool(self):
        state = {
            "characters": [
                {
                    "id": "c1",
                    "name": "Mara",
                    "hair_color": "red",
                    "age": "young adult",
                    "randomize_fields": {
                        "hair_color": ["red", "blonde", "black"],
                        "age": ["young adult", "middle aged"],
                    },
                },
                {
                    "id": "c2",
                    "name": "Alex",
                    "hair_color": "brown",
                    "randomize_fields": {},
                },
            ]
        }
        for _ in range(30):
            result = randomize_character_fields(state)
            mara = result["characters"][0]
            self.assertIn(mara["hair_color"], {"red", "blonde", "black"})
            self.assertIn(mara["age"], {"young adult", "middle aged"})
            self.assertEqual(result["characters"][1]["hair_color"], "brown")

    def test_character_field_randomization_marks_the_node_as_changed(self):
        state = json.dumps(
            {
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "randomize_fields": {"hair_color": ["red", "black"]},
                    }
                ]
            }
        )
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(state)))
        self.assertTrue(has_job_randomization(json.loads(state)))

    def test_character_field_randomization_runs_within_execution(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "enabled": True,
                        "sex": "female",
                        "hair_color": "red",
                        "randomize_fields": {"hair_color": ["red", "blonde"]},
                    }
                ],
            }
        )
        result = Krea2PromptWizard().build(state)
        resolved = json.loads(result["ui"]["krea2_resolved_state"][0])
        self.assertIn(resolved["characters"][0]["hair_color"], {"red", "blonde"})

    def test_character_direction_group_randomization(self):
        library = Library(
            presets=[
                preset(f"emotion.{index}", "emotion") for index in range(6)
            ]
            + [preset(f"face.{index}", "face") for index in range(6)]
            + [preset("body.one", "body")]
        )
        state = {
            "characters": [
                {
                    "id": "c1",
                    "name": "Mara",
                    "enabled": True,
                    "rows": [
                        {
                            "id": "keep_body",
                            "category": "body",
                            "preset_id": "body.one",
                            "phrase": "body.one",
                            "strength": 1.0,
                            "control_mode": "scalar",
                            "enabled": True,
                            "intensity": 0,
                        },
                        {
                            "id": "old_emotion",
                            "category": "emotion",
                            "preset_id": "emotion.old",
                            "phrase": "old",
                            "strength": 1.0,
                            "control_mode": "scalar",
                            "enabled": True,
                            "intensity": 0,
                        },
                    ],
                    "randomize_direction_groups": {"emotion": True},
                }
            ]
        }
        result = randomize_enabled_groups(state, library)
        mara = result["characters"][0]
        categories = {row["category"] for row in mara["rows"]}
        self.assertNotIn("emotion.old", {row["preset_id"] for row in mara["rows"]})
        self.assertIn("body", categories)
        self.assertGreaterEqual(
            sum(1 for row in mara["rows"] if row["category"] == "emotion"),
            2,
        )
        self.assertTrue(has_job_randomization(state))

    def test_character_direction_flags_mark_the_node_as_changed(self):
        state = json.dumps(
            {
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "randomize_direction_groups": {"face": True},
                    }
                ]
            }
        )
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(state)))
        self.assertTrue(has_job_randomization(json.loads(state)))

    def test_camera_group_can_sample_all_addable_categories(self):
        library = Library(
            presets=[
                preset(f"framing.{index}", "framing") for index in range(3)
            ]
            + [preset(f"perspective.{index}", "perspective") for index in range(3)]
            + [preset(f"aperture.{index}", "aperture") for index in range(3)]
            + [preset(f"camera_body.{index}", "camera_body") for index in range(3)]
            + [preset(f"camera_movement.{index}", "camera_movement") for index in range(3)]
            + [preset(f"lens_family.{index}", "lens_family") for index in range(3)]
        )
        seen = set()
        for _ in range(40):
            result = randomize_enabled_groups(
                {"rows": [], "randomize_on_job": {"camera_film": True}},
                library,
            )
            seen.update(row["category"] for row in result["rows"])
        self.assertIn("perspective", seen)
        self.assertIn("aperture", seen)
        self.assertIn("camera_body", seen)
        self.assertIn("camera_movement", seen)
        self.assertIn("lens_family", seen)

    def test_style_group_can_sample_custom_concepts(self):
        library = Library(
            presets=[preset(f"style.{index}", "style") for index in range(3)]
            + [preset(f"custom.{index}", "custom") for index in range(3)]
        )
        seen = set()
        for _ in range(40):
            result = randomize_enabled_groups(
                {"rows": [], "randomize_on_job": {"style_finish": True}},
                library,
            )
            seen.update(row["category"] for row in result["rows"])
        self.assertIn("custom", seen)

    def test_subject_group_can_sample_new_addable_categories(self):
        library = Library(
            presets=[preset(f"body.{index}", "body") for index in range(3)]
            + [preset(f"mouth.{index}", "mouth") for index in range(3)]
            + [preset(f"position.{index}", "position") for index in range(3)]
            + [preset(f"emotion_trigger.{index}", "emotion_trigger") for index in range(3)]
            + [preset(f"face_trigger.{index}", "face_trigger") for index in range(3)]
        )
        seen = set()
        for _ in range(40):
            result = randomize_enabled_groups(
                {"rows": [], "randomize_on_job": {"subject_expression": True}},
                library,
            )
            seen.update(row["category"] for row in result["rows"])
        self.assertIn("mouth", seen)
        self.assertIn("position", seen)
        self.assertIn("emotion_trigger", seen)
        self.assertIn("face_trigger", seen)

    def test_cleanup_still_removes_stale_rows_from_full_group_categories(self):
        library = Library(
            presets=[preset(f"custom.{index}", "custom") for index in range(3)]
        )
        state = {
            "rows": [
                {
                    "id": "stale_custom",
                    "category": "custom",
                    "preset_id": "custom.stale",
                    "phrase": "stale",
                    "strength": 1.0,
                }
            ],
            "randomize_on_job": {"style_finish": True},
        }
        result = randomize_enabled_groups(state, library)
        self.assertNotIn("custom.stale", {row["preset_id"] for row in result["rows"]})
        self.assertTrue(result["rows"])

    def test_lora_trigger_each_job_picks_from_snapshot_pool(self):
        state = {
            "characters": [
                {
                    "id": "c1",
                    "name": "Mara",
                    "enabled": True,
                    "lora_triggers": "old trigger",
                    "randomize_fields": {
                        "lora_triggers": ["trigger alpha", "trigger beta", "trigger gamma"],
                    },
                }
            ]
        }
        seen = set()
        for _ in range(40):
            result = randomize_character_fields(state)
            triggers = result["characters"][0]["lora_triggers"]
            lines = [line for line in triggers.splitlines() if line.strip()]
            self.assertTrue(lines)
            self.assertLessEqual(len(lines), 3)
            for line in lines:
                self.assertIn(line, {"trigger alpha", "trigger beta", "trigger gamma"})
            seen.add(tuple(sorted(lines)))
        self.assertGreaterEqual(len(seen), 2)

    def test_lora_trigger_each_job_marks_the_node_as_changed(self):
        state = json.dumps(
            {
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "randomize_fields": {
                            "lora_triggers": ["trigger alpha", "trigger beta"],
                        },
                    }
                ]
            }
        )
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(state)))
        self.assertTrue(has_job_randomization(json.loads(state)))

    def test_lora_trigger_each_job_runs_within_execution(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "enabled": True,
                        "lora_triggers": "old trigger",
                        "randomize_fields": {
                            "lora_triggers": ["trigger alpha", "trigger beta"],
                        },
                    }
                ],
            }
        )
        result = Krea2PromptWizard().build(state)
        resolved = json.loads(result["ui"]["krea2_resolved_state"][0])
        triggers = resolved["characters"][0]["lora_triggers"]
        lines = [line for line in triggers.splitlines() if line.strip()]
        self.assertTrue(lines)
        for line in lines:
            self.assertIn(line, {"trigger alpha", "trigger beta"})
        self.assertNotEqual(triggers, "old trigger")


if __name__ == "__main__":
    unittest.main()
