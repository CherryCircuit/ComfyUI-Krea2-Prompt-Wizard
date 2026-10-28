"""Regression coverage for lossless V1 documents and exact job resolution."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest

from src.compiler import compile_state
from src.library import load_library
from src.migrations import migrate_state
from src.saved_presets import apply_performance_preset, load_saved_presets, save_saved_presets
from src.wizard import coerce_state, prepare_state


def row(category, phrase, ident=None):
    return {"id": ident or category, "category": category, "preset_id": "custom." + category,
            "phrase": phrase, "intensity": 20, "strength": 1, "control_mode": "scalar", "enabled": True}


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        self.library = load_library()

    def test_eleven_invisible_phrases_are_preserved_and_owned(self):
        categories = ["subject_movement", "emotion_trigger", "face_trigger", "position", "camera_movement", "lens_family", "film_color", "lighting_effect", "environment_movement", "texture", "detail"]
        state = prepare_state({"rows": [row(cat, "phrase " + str(i)) for i,cat in enumerate(categories)]}, self.library)
        result = compile_state(state, self.library)
        for i,cat in enumerate(categories):
            self.assertIn("phrase " + str(i), result.final_prompt)
            self.assertTrue(any(s["owner_path"] == f"rows[{i}]" for s in result.trace["emitted_spans"]))
        self.assertEqual("".join(s["text"] for s in result.trace["emitted_spans"]), result.final_prompt)

    def test_migration_is_idempotent_nonmutating_and_recovers_malformed(self):
        raw = {"rows": [row("future_concept", "my phrase"), "broken", {"phrase": ""}]}
        original = copy.deepcopy(raw)
        migrated = coerce_state(raw)
        self.assertEqual(raw, original)
        self.assertEqual(coerce_state(migrated), migrated)
        self.assertEqual(migrated["rows"][0]["legacy_category"], "future_concept")
        self.assertEqual(len(migrated["recovery_rows"]), 2)
        self.assertEqual(migrated["migration_backup"], raw)

    def test_exact_seeded_replay_keeps_pools_and_ranges(self):
        state = {"randomize_on_job": {"subject_expression": True}, "random_strength_min": .5,
                 "random_strength_max": 1.5, "characters": [{"id": "a", "rows": [],
                 "randomize_fields": {"hair_color": ["brown", "red"]}, "randomize_direction_groups": {"face": True}}],
                 "randomization": {"seed_mode": "fixed", "seed": 435, "locks": {}}}
        a = prepare_state(state, self.library, randomize=True)
        b = prepare_state(state, self.library, randomize=True)
        self.assertEqual(a, b)
        self.assertEqual(a["randomization"]["resolved_seed"], 435)
        self.assertEqual(a["characters"][0]["randomize_fields"], state["characters"][0]["randomize_fields"])
        replay = prepare_state(a["resolved_snapshot"]["state"], self.library)
        self.assertEqual(compile_state(replay, self.library).final_prompt, compile_state(a, self.library).final_prompt)
        self.assertNotIn("resolved_snapshot", a["resolved_snapshot"]["state"])
        self.assertNotIn("migration_backup", a["resolved_snapshot"]["state"])

    def test_category_scope_does_not_replace_neighbor_categories(self):
        state = {"rows": [row("emotion", "old feeling"), row("body", "standing"), row("style", "painting")]}
        result = prepare_state(state, self.library, randomize=True, seed=1, scope={"kind": "category", "category": "emotion"})
        self.assertEqual([r["phrase"] for r in result["rows"] if r["category"] in {"body", "style"}], ["standing", "painting"])

    def test_character_and_field_and_section_locks(self):
        state = {"rows": [row("emotion", "old feeling")], "randomize_on_job": {"subject_expression": True},
                 "characters": [{"id": "a", "rows": [row("gaze", "down")], "hair_color": "black", "age": "adult",
                 "randomize_fields": {"hair_color": ["red"], "age": ["elderly"]}, "randomize_direction_groups": {"face": True}}],
                 "randomization": {"seed_mode": "fixed", "seed": 1, "locks": {"characters": ["a"], "sections": ["subject_expression"]}}}
        result = prepare_state(state, self.library, randomize=True)
        self.assertEqual(result["rows"][0]["phrase"], "old feeling")
        self.assertEqual(result["characters"][0]["hair_color"], "black")
        state["randomization"]["locks"] = {"fields": {"a": ["hair_color"]}}
        result = prepare_state(state, self.library, randomize=True)
        self.assertEqual(result["characters"][0]["hair_color"], "black")
        self.assertEqual(result["characters"][0]["age"], "elderly")

    def test_derived_source_edit_preserves_legacy_until_edit_and_accepts_zero(self):
        state = {"rows": [row("lighting_direction", "legacy custom light", "mirror")],
                 "scene_sections": {"lights": [{"id": "key", "strength": 0, "angleDeg": 0, "distanceM": 1.5}]}}
        state["rows"][0]["preset_id"] = "custom.light_key"
        migrated = prepare_state(state, self.library)
        self.assertEqual(migrated["rows"][0]["phrase"], "legacy custom light")
        migrated["scene_sections"]["lights"][0]["angleDeg"] = 90
        edited = prepare_state(migrated, self.library)
        self.assertIn("right", edited["rows"][0]["phrase"])
        self.assertEqual(edited["rows"][0]["strength"], 0)
        edited["scene_sections"]["lights"] = []
        empty = prepare_state(edited, self.library)
        self.assertEqual(empty["rows"], [])

    def test_full_shot_and_performance_preset_roundtrip(self):
        state = {"rows": [row("style", "painting")], "characters": [{"id": "a", "identity": "Ada", "position": "left", "rows": [row("emotion", "happy")]}],
                 "setting": {"enabled": True, "name": "Forest", "description": "trees"}, "scene_sections": {"lights": []}}
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "presets.json")
            save_saved_presets([{"id": "full.mine", "label": "Mine", "scope": "full", "state": state},
                                {"id": "performance.mine", "label": "Quiet", "scope": "performance", "rows": [row("emotion", "sad")]}], path)
            presets = load_saved_presets(path)
            self.assertEqual(presets[0]["state"]["setting"], state["setting"])
            result = apply_performance_preset(state, presets[1], "a")
            self.assertEqual(result["characters"][0]["identity"], "Ada")
            self.assertEqual(result["characters"][0]["position"], "left")
            self.assertEqual([r["phrase"] for r in result["characters"][0]["rows"]], ["sad"])
            combine = apply_performance_preset(state, presets[1], "a", combine=True)
            self.assertEqual([r["phrase"] for r in combine["characters"][0]["rows"]], ["sad"])
            before = Path(path).read_bytes()
            with self.assertRaises(ValueError):
                save_saved_presets([{"id": "broken"}], path)
            self.assertEqual(Path(path).read_bytes(), before)

    def test_character_traits_and_automatic_appearance_are_owned(self):
        state = prepare_state({"base_prompt": "portrait", "characters": [{"id": "a", "name": "Ada", "sex": "female", "skin_color": "blue", "ethnicity": "elf", "rows": []}],
                               "setting": {"enabled": True, "name": "Studio", "description": "white walls"}}, self.library)
        result = compile_state(state, self.library)
        spans = result.trace["emitted_spans"]
        self.assertEqual("".join(s["text"] for s in spans), result.final_prompt)
        self.assertTrue(any(s["owner_path"] == "characters[0].skin_color" and s["origin"] == "automatic_appearance" for s in spans))
        self.assertTrue(any(s["owner_path"] == "setting.description" for s in spans))

    def test_malformed_version_future_version_and_nonfinite_recovery(self):
        state = coerce_state({"state_version": "bad", "characters": "broken", "rows": [dict(row("custom", "phrase"), strength=float("nan"))]})
        self.assertEqual(state["state_version"], 2)
        self.assertTrue(any(item["path"] == "characters" for item in state["recovery_rows"]))
        self.assertEqual(state["rows"][0]["strength"], 1)
        json.dumps(state, allow_nan=False)
        future = coerce_state({"state_version": 20, "future_field": "preserve me"})
        self.assertEqual(future["state_version"], 20)
        self.assertEqual(future["migration_backup"]["future_field"], "preserve me")
        self.assertTrue(any(issue["code"] == "migration.future_version" for issue in future["migration_report"]))

    def test_repeated_trace_rows_and_setting_name_are_owned_in_order(self):
        state = prepare_state({"base_prompt": "Studio", "rows": [row("custom", "repeat", "a"), row("custom", "repeat", "b")],
                               "setting": {"enabled": True, "name": "Studio", "description": "Studio scene"}}, self.library)
        result = compile_state(state, self.library)
        repeats = [s for s in result.trace["emitted_spans"] if s["text"] == "repeat"]
        self.assertEqual([s["owner_path"] for s in repeats], ["rows[0]", "rows[1]"])
        self.assertEqual(result.trace["emitted_spans"][0]["owner_path"], "base_prompt")

    def test_appearance_and_field_scopes_do_not_change_performance(self):
        raw = {"characters": [{"id": "a", "hair_color": "black", "rows": [row("emotion", "happy")], "randomize_fields": {"hair_color": ["red"]}}]}
        appearance = prepare_state(raw, self.library, randomize=True, seed=3, scope={"kind": "appearance", "character_id": "a"})
        self.assertEqual(appearance["characters"][0]["hair_color"], "red")
        self.assertEqual(appearance["characters"][0]["rows"][0]["phrase"], "happy")
        raw["characters"][0]["randomize_fields"] = {}
        field = prepare_state(raw, self.library, randomize=True, seed=3, scope={"kind": "field", "character_id": "a", "field": "hair_color", "pool": ["green"]})
        self.assertEqual(field["characters"][0]["hair_color"], "green")
        self.assertEqual(field["characters"][0]["randomize_fields"], {})

    def test_new_physical_lights_use_subject_relative_natural_language(self):
        from src.migrations import light_phrase
        phrase = light_phrase({"label": "Key", "coordinatesEdited": True, "angleDeg": 90, "groundDistanceM": .5, "heightM": 3, "color": "blue"})
        self.assertIn("left", phrase)
        self.assertIn("from above", phrase)
        self.assertIn("close to the subject", phrase)
        self.assertIn("in blue", phrase)
        self.assertNotIn("degrees", phrase)
        self.assertNotIn("0.5m", phrase)

    def test_row_locks_and_performance_section_locks(self):
        raw = {"rows": [dict(row("emotion", "keep", "locked"), locked=True)], "randomize_on_job": {"subject_expression": True},
               "characters": [{"id": "a", "rows": [row("emotion", "happy")], "randomize_direction_groups": {"emotion": True}}],
               "randomization": {"seed_mode": "fixed", "seed": 3, "locks": {"sections": ["performance"]}}}
        state = prepare_state(raw, self.library, randomize=True)
        self.assertTrue(any(r["id"] == "locked" for r in state["rows"]))
        self.assertEqual(state["characters"][0]["rows"][0]["phrase"], "happy")

    def test_explicit_snapshot_replay_preserves_job_pools_but_does_not_reroll(self):
        raw = {"randomize_on_job": {"subject_expression": True}, "randomization": {"seed_mode": "new_per_job", "seed": 7}}
        first = prepare_state(raw, self.library, randomize=True, seed=101)
        first["randomization"]["replay"] = True
        replay = prepare_state(first, self.library, randomize=True)
        self.assertEqual(replay["rows"], first["rows"])
        self.assertEqual(replay["randomization"]["resolved_seed"], 101)
        reroll = prepare_state(replay, self.library, randomize=True, seed=202, scope={"kind": "all"})
        self.assertFalse(reroll["randomization"]["replay"])
        self.assertEqual(reroll["randomization"]["resolved_seed"], 202)
        self.assertEqual(reroll["randomize_on_job"], first["randomize_on_job"])

    def test_identical_text_keeps_each_emitting_owner(self):
        raw = {"base_prompt": "repeat", "rows": [row("custom", "repeat", "global")],
               "characters": [{"id": "a", "name": "repeat", "rows": [row("custom", "repeat", "first"), row("custom", "repeat", "duplicate")],
                               "face_guidance": "repeat", "interaction": "repeat"},
                              {"id": "b", "name": "repeat", "rows": [row("custom", "repeat", "other")]}],
               "setting": {"enabled": True, "name": "repeat", "description": "repeat"}}
        result = compile_state(prepare_state(raw, self.library), self.library)
        owners = [s["owner_path"] for s in result.trace["emitted_spans"] if s["text"] == "repeat"]
        self.assertEqual(owners, ["base_prompt", "characters[0].name", "characters[0].rows[0]", "characters[0].face_guidance",
                                  "characters[0].interaction", "characters[1].name", "characters[1].rows[0]", "setting.name", "setting.description", "rows[0]"])
        self.assertEqual("".join(s["text"] for s in result.trace["emitted_spans"]), result.final_prompt)

    def test_one_shot_actions_respect_character_and_section_locks(self):
        for locks, character_locked in [({"sections": ["appearance"]}, False), ({}, True), ({"characters": ["a"]}, False)]:
            with self.subTest(locks=locks, character_locked=character_locked):
                raw = {"characters": [{"id": "a", "locked": character_locked, "hair_color": "black", "rows": [row("emotion", "keep")]}],
                       "randomization": {"locks": locks}}
                result = prepare_state(raw, self.library, randomize=True, seed=1,
                                       scope={"kind": "field", "character_id": "a", "field": "hair_color", "pool": ["red"]})
                self.assertEqual(result["characters"][0]["hair_color"], "black")
        for locks, character_locked in [({"sections": ["performance"]}, False), ({"sections": ["emotion"]}, False), ({}, True)]:
            raw = {"characters": [{"id": "a", "locked": character_locked, "rows": [row("emotion", "keep")]}], "randomization": {"locks": locks}}
            result = prepare_state(raw, self.library, randomize=True, seed=1, scope={"kind": "category", "character_id": "a", "category": "emotion"})
            self.assertEqual(result["characters"][0]["rows"][0]["phrase"], "keep")

    def test_performance_lock_blocks_global_legacy_alias_and_category_scope(self):
        for scope in (None, {"kind": "category", "category": "emotion"}):
            raw = {"rows": [row("emotion", "keep")], "randomize_on_job": {"subject": True}, "randomization": {"locks": {"sections": ["performance"]}}}
            result = prepare_state(raw, self.library, randomize=True, seed=1, scope=scope)
            self.assertEqual([r["phrase"] for r in result["rows"]], ["keep"])

    def test_new_shock_preset_keeps_action_provenance_and_legacy_stays_unknown(self):
        from src.saved_presets import DEFAULT_PERFORMANCE_PRESETS
        shock = next(p for p in DEFAULT_PERFORMANCE_PRESETS if p["id"] == "performance.shock")
        annotated = copy.deepcopy(shock["rows"])
        for concept in annotated:
            concept.update(origin="preset", origin_action=shock["id"])
        # Match frontend copying a fresh performance onto one cast member.
        raw = {"state_version": 2, "characters": [{"id": "a", "rows": annotated}]}
        state = prepare_state(raw, self.library)
        result = compile_state(state, self.library)
        spans = [span for span in result.trace["emitted_spans"] if span["owner_path"].startswith("characters[0].rows[")]
        self.assertTrue(spans)
        self.assertTrue(all(span["origin"] == "preset" and span["origin_action"] == "performance.shock" for span in spans))
        for before, after in zip(annotated, state["characters"][0]["rows"]):
            self.assertEqual((after["phrase"], after["strength"]), (before["phrase"], before["strength"]))
        # Global presets pass through the same canonicalization unchanged.
        global_result = compile_state(prepare_state({"state_version": 2, "rows": annotated}, self.library), self.library)
        self.assertTrue(all(span["origin_action"] == "performance.shock" for span in global_result.trace["emitted_spans"] if span["owner_path"].startswith("rows[")))
        # Library source alone cannot prove when an old workflow chose a preset.
        legacy = copy.deepcopy(shock["rows"])
        legacy_result = compile_state(prepare_state({"characters": [{"id": "a", "rows": legacy}]}, self.library), self.library)
        legacy_spans = [span for span in legacy_result.trace["emitted_spans"] if span["owner_path"].startswith("characters[0].rows[")]
        self.assertTrue(all(span["origin"] == "legacy_imported" and span["origin_action"] == "unknown" for span in legacy_spans))
        self.assertEqual(legacy_result.final_prompt, result.final_prompt)
        # The backend performance helper follows the frontend's same action ID.
        applied = apply_performance_preset({"characters": [{"id": "a", "rows": []}]}, shock, "a")
        self.assertTrue(all(concept["origin_action"] == "performance.shock" for concept in applied["characters"][0]["rows"]))


if __name__ == "__main__":
    unittest.main()
