"""Tests for local prompt, group, character, and setting preset persistence."""
from __future__ import annotations

import json
import os
import tempfile
import unittest

from src.library import load_library
from src.job_randomizer import ALL_GROUP_CATEGORIES
from src.saved_presets import DEFAULT_GROUP_PRESETS, load_saved_presets, save_saved_presets


class SavedPresetTests(unittest.TestCase):
    def test_built_in_group_presets_use_real_concepts_in_their_own_groups(self):
        library = {preset["id"]: preset for preset in load_library().presets}
        groups = {
            "subject_expression": ALL_GROUP_CATEGORIES["subject_expression"],
            "camera_film": ALL_GROUP_CATEGORIES["camera_film"],
            "lighting": ALL_GROUP_CATEGORIES["lighting"],
            "environment": ALL_GROUP_CATEGORIES["environment"],
            "style_finish": ALL_GROUP_CATEGORIES["style_finish"],
        }
        for preset in DEFAULT_GROUP_PRESETS:
            allowed = groups[preset["group"]]
            for row in preset["rows"]:
                concept = library[row["preset_id"]]
                self.assertEqual(concept["category"], row["category"])
                self.assertIn(row["category"], allowed)

    def test_roundtrip_preserves_concept_values(self):
        with tempfile.TemporaryDirectory(prefix="krea2_saved_") as directory:
            path = os.path.join(directory, "saved_presets.json")
            save_saved_presets(
                [
                    {
                        "id": "saved_group_camera",
                        "label": "My camera",
                        "scope": "group",
                        "group": "camera",
                        "base_prompt": "",
                        "rows": [
                            {
                                "id": "row_1",
                                "preset_id": "lens.24mm_wide",
                                "category": "lens",
                                "intensity": 73,
                                "enabled": True,
                            }
                        ],
                    }
                ],
                path=path,
            )
            loaded = load_saved_presets(path=path)
            self.assertEqual(loaded[0]["rows"][0]["intensity"], 73)
            self.assertTrue(loaded[0]["rows"][0]["enabled"])

    def test_malformed_records_are_dropped(self):
        with tempfile.TemporaryDirectory(prefix="krea2_saved_") as directory:
            path = os.path.join(directory, "saved_presets.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "presets": [
                            {"id": "", "label": "Broken", "scope": "full", "rows": []},
                            {
                                "id": "valid",
                                "label": "Valid",
                                "scope": "full",
                                "rows": [],
                            },
                        ]
                    },
                    handle,
                )
            self.assertEqual([item["id"] for item in load_saved_presets(path)], ["valid"])

    def test_character_and_setting_presets_roundtrip(self):
        with tempfile.TemporaryDirectory(prefix="krea2_saved_") as directory:
            path = os.path.join(directory, "saved_presets.json")
            save_saved_presets(
                [
                    {
                        "id": "character_mara",
                        "label": "Mara",
                        "scope": "character",
                        "character": {"name": "Mara", "hair_color": "auburn"},
                    },
                    {
                        "id": "setting_bridge",
                        "label": "Bridge",
                        "scope": "setting",
                        "setting": {"enabled": True, "name": "Spaceship bridge"},
                    },
                ],
                path=path,
            )
            loaded = load_saved_presets(path=path)
            self.assertEqual(loaded[0]["character"]["hair_color"], "auburn")
            self.assertEqual(loaded[1]["setting"]["name"], "Spaceship bridge")

    def test_invalid_json_is_safe(self):
        with tempfile.TemporaryDirectory(prefix="krea2_saved_") as directory:
            path = os.path.join(directory, "saved_presets.json")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{not json")
            self.assertEqual(load_saved_presets(path), [])


if __name__ == "__main__":
    unittest.main()
