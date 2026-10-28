"""Tests for local prompt, group, character, and setting preset persistence."""
from __future__ import annotations

import copy
import json
import os
import tempfile
import unittest

from src.library import load_library
from src.job_randomizer import ALL_GROUP_CATEGORIES
from src.saved_presets import DEFAULT_GROUP_PRESETS, DEFAULT_PERFORMANCE_PRESETS, PERFORMANCE_CATEGORIES, apply_performance_preset, load_saved_presets, save_saved_presets
from src.compiler import compile_state
from src.wizard import prepare_state, coerce_state


class SavedPresetTests(unittest.TestCase):
    def test_named_performances_have_portable_coordinated_concepts(self):
        library = load_library()
        concepts = library.index_by_id()
        expected = {"Shock", "Confusion", "Anger", "Joy", "Fear", "Curiosity", "Suspicion", "Embarrassment", "Excitement", "Sadness"}
        named = [p for p in DEFAULT_PERFORMANCE_PRESETS if p["label"] in expected]
        self.assertEqual({p["label"] for p in named}, expected)
        self.assertEqual(len(named), 10)
        for preset in named:
            self.assertEqual(preset["scope"], "performance")
            self.assertTrue(preset["builtin"])
            self.assertTrue({"emotion", "face", "body"}.issubset({r["category"] for r in preset["rows"]}))
            for row in preset["rows"]:
                self.assertIn(row["category"], PERFORMANCE_CATEGORIES)
                if row["preset_id"].startswith("custom."):
                    self.assertEqual(row["source"], "custom")
                    self.assertNotIn(row["preset_id"], concepts)
                else:
                    self.assertEqual(row["phrase"], concepts[row["preset_id"]]["phrase"])
                    self.assertEqual(row["category"], concepts[row["preset_id"]]["category"])
        shock = next(p for p in named if p["label"] == "Shock")
        self.assertEqual(next(r for r in shock["rows"] if r["category"] == "emotion")["strength"], 3)
        confusion = next(p for p in named if p["label"] == "Confusion")
        self.assertTrue({"face", "gaze", "mouth", "body"}.issubset({r["category"] for r in confusion["rows"]}))

    def test_named_performance_replace_and_combine_preserve_cast_identity(self):
        library = load_library()
        shock = next(p for p in DEFAULT_PERFORMANCE_PRESETS if p["label"] == "Shock")
        original_preset = copy.deepcopy(shock)
        old_emotion = dict(shock["rows"][0], id="old_shock", strength=.5)
        old_sadness = {"id": "old_sadness", "category": "emotion", "preset_id": "emotion.sadness", "phrase": "sadness", "strength": 1, "enabled": True}
        placement = {"id": "placement", "category": "position", "preset_id": "custom.placement", "phrase": "on the left", "strength": 1, "enabled": True}
        raw = {"characters": [{"id": "target", "name": "Ada", "identity": "detective", "hair_color": "black", "position": "left", "rows": [old_emotion, old_sadness, placement]},
                              {"id": "neighbor", "name": "Ben", "identity": "witness", "position": "right", "rows": [dict(old_sadness, id="neighbor_sadness")]}]}
        before = coerce_state(raw)
        for combine in (False, True):
            with self.subTest(combine=combine):
                result = apply_performance_preset(raw, shock, "target", combine=combine)
                self.assertEqual(result["characters"][1], before["characters"][1])
                target = result["characters"][0]
                self.assertEqual({k:v for k,v in target.items() if k != "rows"}, {k:v for k,v in before["characters"][0].items() if k != "rows"})
                self.assertTrue(any(r["id"] == "placement" for r in target["rows"]))
                shocks = [r for r in target["rows"] if r["preset_id"] == "emotion.shock"]
                self.assertEqual(len(shocks), 1)
                self.assertEqual(shocks[0]["strength"], 3)
                self.assertEqual(any(r["id"] == "old_sadness" for r in target["rows"]), combine)
                compiled = compile_state(prepare_state(result, library), library)
                self.assertIn("(shocked expression:3)", compiled.final_prompt)
                self.assertIn("hands covering face", compiled.final_prompt)
        self.assertEqual(shock, original_preset)

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
