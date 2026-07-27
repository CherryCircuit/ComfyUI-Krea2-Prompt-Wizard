"""Tests for local full-prompt and group preset persistence."""
from __future__ import annotations

import json
import os
import tempfile
import unittest

from src.saved_presets import load_saved_presets, save_saved_presets


class SavedPresetTests(unittest.TestCase):
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

    def test_invalid_json_is_safe(self):
        with tempfile.TemporaryDirectory(prefix="krea2_saved_") as directory:
            path = os.path.join(directory, "saved_presets.json")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{not json")
            self.assertEqual(load_saved_presets(path), [])


if __name__ == "__main__":
    unittest.main()
