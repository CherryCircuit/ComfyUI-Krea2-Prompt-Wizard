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
                        "strength": 4,
                    }
                ],
            }
        )
        with self.assertRaises(Exception):
            Krea2PromptWizard().build(state)

    def test_actual_prompt_is_added_to_image_metadata(self):
        metadata = {"workflow": {"nodes": []}}
        result = Krea2PromptWizard().build(
            json.dumps({"base_prompt": "portrait of Mara", "rows": []}),
            extra_pnginfo=metadata,
        )
        self.assertEqual(metadata["krea2_prompt"], result["result"][0])

    def test_random_group_uses_between_two_and_six_concepts(self):
        library = Library(
            presets=[preset(f"body.{index}", "body") for index in range(10)]
        )
        for _ in range(20):
            result = randomize_enabled_groups(
                {"rows": [], "randomize_on_job": {"subject": True}},
                library,
            )
            self.assertGreaterEqual(len(result["rows"]), 2)
            self.assertLessEqual(len(result["rows"]), 6)

    def test_art_mode_excludes_photography_style(self):
        library = Library(
            presets=[
                preset("style.documentary_photography", "style"),
                preset("style.oil_painting", "style"),
            ]
        )
        result = randomize_enabled_groups(
            {
                "rows": [],
                "creative_mode": "art",
                "randomize_on_job": {"style_finish": True},
            },
            library,
        )
        self.assertEqual(
            [row["preset_id"] for row in result["rows"]],
            ["style.oil_painting"],
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


if __name__ == "__main__":
    unittest.main()
