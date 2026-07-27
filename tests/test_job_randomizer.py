"""Tests for opt-in per-job group randomization."""
from __future__ import annotations

import json
import math
import unittest

from src.job_randomizer import has_job_randomization, randomize_enabled_groups
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
        self.assertIn("body.one", ids)
        self.assertIn("subject_movement.one", ids)
        self.assertIn("emotion.keep", ids)
        self.assertEqual(state["rows"][0]["preset_id"], "body.old")

    def test_cache_is_busted_only_when_job_randomization_is_enabled(self):
        enabled = json.dumps({"randomize_on_job": {"camera": True}})
        disabled = json.dumps({"randomize_on_job": {"camera": False}})
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(enabled)))
        self.assertEqual(Krea2PromptWizard.IS_CHANGED(disabled), disabled)
        self.assertTrue(has_job_randomization(json.loads(enabled)))

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


if __name__ == "__main__":
    unittest.main()
