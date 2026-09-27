"""Tests for the Prompt Studio (v2): tokenizer, compiler, presets, node."""
from __future__ import annotations

import json
import os
import random
import tempfile
import unittest
from unittest import mock

from src.studio import compiler as studio_compiler
from src.studio import presets as studio_presets
from src.studio import tokens as studio_tokens
from src.studio.nodes import Krea2PromptWizardV2
from src.studio.presets import Preset, PresetStore


def _make_store(presets):
    return PresetStore([Preset(**p) if isinstance(p, dict) else p for p in presets])


def _preset(pid, name="X", category="other", prompt="P", negative=""):
    return Preset(
        id=pid, name=name, category=category, prompt=prompt, negative=negative
    )


class TokenizerTests(unittest.TestCase):
    def test_parse_plain_text(self):
        segments = studio_tokens.parse_document("just some text")
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0].type, "text")
        self.assertEqual(segments[0].value, "just some text")

    def test_parse_single_token(self):
        segments = studio_tokens.parse_document("{{krea2:character_serena|SERENA}}")
        self.assertEqual(len(segments), 1)
        token = segments[0]
        self.assertEqual(token.type, "token")
        self.assertEqual(token.preset_id, "character_serena")
        self.assertEqual(token.label, "SERENA")
        self.assertEqual(token.raw, "{{krea2:character_serena|SERENA}}")

    def test_parse_mixed_document(self):
        doc = (
            "Hello {{krea2:character_serena|SERENA}} walks into "
            "{{krea2:scene_medieval_tavern_a|MEDIEVAL TAVERN A}}."
        )
        segments = studio_tokens.parse_document(doc)
        self.assertEqual([s.type for s in segments], ["text", "token", "text", "token", "text"])
        self.assertEqual(segments[1].preset_id, "character_serena")
        self.assertEqual(segments[3].preset_id, "scene_medieval_tavern_a")
        self.assertEqual(segments[4].value, ".")

    def test_parse_token_without_label(self):
        segments = studio_tokens.parse_document("{{krea2:scene_castle_corridor_a}}")
        self.assertEqual(segments[0].preset_id, "scene_castle_corridor_a")
        self.assertEqual(segments[0].label, "")

    def test_roundtrip_serialization(self):
        doc = "A {{krea2:character_serena|SERENA}} and {{krea2:props_old_leather_journal}} end."
        self.assertEqual(studio_tokens.serialize_segments(studio_tokens.parse_document(doc)), doc)

    def test_token_markup_sanitizes_id(self):
        markup = studio_tokens.token_markup("bad id! spaces", "Label")
        parsed = studio_tokens.parse_document(markup)
        self.assertEqual(parsed[0].type, "token")
        self.assertEqual(parsed[0].preset_id, "bad_id__spaces")

    def test_raw_display_uses_labels(self):
        doc = "{{krea2:character_serena|SERENA}} sits in {{krea2:scene_medieval_tavern_a|MEDIEVAL TAVERN A}}."
        raw = studio_tokens.raw_display(doc)
        self.assertEqual(raw, "[SERENA] sits in [MEDIEVAL TAVERN A].")

    def test_raw_display_missing(self):
        # Without a resolver the stored fallback label is shown as typed.
        self.assertEqual(studio_tokens.raw_display("{{krea2:gone_preset|OLD LABEL}}"), "[OLD LABEL]")
        # With a resolver returning None the preset is treated as missing.
        raw = studio_tokens.raw_display("{{krea2:gone_preset|OLD LABEL}}", lambda pid: None)
        self.assertEqual(raw, "[MISSING: gone_preset]")

    def test_raw_display_resolves_current_labels(self):
        doc = "{{krea2:character_serena|SERENA}}"
        raw = studio_tokens.raw_display(doc, lambda pid: "Serena Prime" if pid == "character_serena" else None)
        self.assertEqual(raw, "[Serena Prime]")

    def test_clean_spacing_collapses_double_spaces(self):
        self.assertEqual(studio_tokens.clean_spacing("a  b"), "a b")
        self.assertEqual(studio_tokens.clean_spacing("a \n b"), "a\nb")
        self.assertEqual(studio_tokens.clean_spacing("  x  "), "x")

    def test_clean_spacing_collapses_doubled_punctuation(self):
        # A preset ending with a period followed directly by sentence text.
        self.assertEqual(studio_tokens.clean_spacing("A tavern.. Next"), "A tavern. Next")
        self.assertEqual(studio_tokens.clean_spacing("word,, more"), "word, more")
        # Ellipses survive.
        self.assertEqual(studio_tokens.clean_spacing("and then..."), "and then...")


class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.store = _make_store(
            [
                _preset("character_serena", "SERENA", "character", "Blonde woman.", "dark hair, blue eyes"),
                _preset("scene_tavern", "TAVERN", "scene", "A tavern.", "modern furniture"),
                _preset("light_candle", "CANDLE", "lighting", "Candlelit.", "dark hair, electric lights"),
            ]
        )

    def test_compile_expands_tokens(self):
        doc = "{{krea2:character_serena|SERENA}} enters {{krea2:scene_tavern|TAVERN}}."
        result = studio_compiler.compile_document(doc, self.store)
        self.assertEqual(result.prompt, "Blonde woman. enters A tavern.")
        self.assertEqual(result.used_preset_ids, ["character_serena", "scene_tavern"])
        self.assertEqual(result.missing_preset_ids, [])
        self.assertEqual(result.raw_prompt, "[SERENA] enters [TAVERN].")

    def test_compile_missing_preset(self):
        doc = "{{krea2:ghost|GHOST}} here."
        result = studio_compiler.compile_document(doc, self.store)
        self.assertIn("[MISSING: ghost]", result.prompt)
        self.assertEqual(result.missing_preset_ids, ["ghost"])

    def test_compile_disabled_preset_is_missing(self):
        self.store.get("character_serena").enabled = False
        result = studio_compiler.compile_document("{{krea2:character_serena|SERENA}}", self.store)
        self.assertIn("[MISSING: character_serena]", result.prompt)

    def test_negative_combines_and_dedupes(self):
        doc = (
            "{{krea2:character_serena|SERENA}} {{krea2:scene_tavern|TAVERN}} "
            "{{krea2:light_candle|CANDLE}}"
        )
        result = studio_compiler.compile_document(doc, self.store)
        self.assertEqual(
            result.negative, "dark hair, blue eyes, modern furniture, electric lights"
        )

    def test_negative_empty_when_no_presets(self):
        result = studio_compiler.compile_document("plain text", self.store)
        self.assertEqual(result.negative, "")

    def test_duplicate_token_counts_once(self):
        doc = "{{krea2:character_serena|SERENA}} and {{krea2:character_serena|SERENA}} again"
        result = studio_compiler.compile_document(doc, self.store)
        self.assertEqual(result.used_preset_ids, ["character_serena"])
        self.assertIn("Blonde woman. and Blonde woman. again", result.prompt)

    def test_spacing_artifacts_cleaned(self):
        doc = "word {{krea2:character_serena|SERENA}} word"
        result = studio_compiler.compile_document(doc, self.store)
        self.assertEqual(result.prompt, "word Blonde woman. word")


class PresetParsingTests(unittest.TestCase):
    def test_from_dict_full(self):
        preset = studio_presets.preset_from_dict(
            {
                "id": "x",
                "name": "Name",
                "category": "scene",
                "prompt": "P",
                "negative": "N",
                "description": "D",
                "tags": "a, b",
                "notes": "n",
                "enabled": False,
            },
            "user",
        )
        self.assertIsNotNone(preset)
        self.assertEqual(preset.tags, ["a", "b"])
        self.assertFalse(preset.enabled)
        self.assertEqual(preset.origin, "user")

    def test_from_dict_defaults(self):
        preset = studio_presets.preset_from_dict({"id": "x"}, "bundled")
        self.assertEqual(preset.category, "other")
        self.assertEqual(preset.name, "x")
        self.assertTrue(preset.enabled)

    def test_from_dict_unknown_category_maps_to_other(self):
        preset = studio_presets.preset_from_dict({"id": "x", "category": "weird"}, "bundled")
        self.assertEqual(preset.category, "other")

    def test_from_dict_rejects_missing_id_or_prompt(self):
        self.assertIsNone(studio_presets.preset_from_dict({"prompt": "p"}, "bundled"))
        self.assertIsNone(studio_presets.preset_from_dict({"id": "x", "prompt": 5}, "bundled"))
        self.assertIsNone(studio_presets.preset_from_dict("nope", "bundled"))


class PresetStoreTests(unittest.TestCase):
    def test_user_overrides_bundled(self):
        store = PresetStore(
            [
                _preset("a", "Bundled A", prompt="bundled"),
                _preset("a", "User A", prompt="user"),
                _preset("b", "B"),
            ]
        )
        self.assertEqual(store.get("a").prompt, "user")
        self.assertEqual([p.id for p in store.all()], ["a", "b"])

    def test_label_of_disabled_is_none(self):
        store = PresetStore([_preset("a", "A")])
        store.get("a").enabled = False
        self.assertIsNone(store.label_of("a"))


class BundledPresetsTests(unittest.TestCase):
    """The shipped starter library must parse cleanly and completely."""

    def test_bundled_library_loads(self):
        store = studio_presets.load_store()
        presets = store.all()
        self.assertGreaterEqual(len(presets), 25)
        ids = [p.id for p in presets]
        self.assertEqual(len(ids), len(set(ids)))
        categories = {p.category for p in presets}
        self.assertIn("character", categories)
        self.assertIn("scene", categories)
        self.assertIn("lighting", categories)
        self.assertIn("camera", categories)
        self.assertIn("style", categories)
        self.assertIn("continuity", categories)
        self.assertIn("wardrobe", categories)
        self.assertIn("props", categories)

    def test_expected_key_presets(self):
        store = studio_presets.load_store()
        for pid in (
            "character_serena",
            "character_marcus",
            "scene_medieval_tavern_a",
            "lighting_candlelight",
            "camera_locked_medium_shot",
            "style_cinematic_fantasy",
            "continuity_strict_character_consistency",
            "wardrobe_serena_travelling",
            "props_ancient_sword_a",
        ):
            self.assertIsNotNone(store.get(pid), pid)
            self.assertTrue(store.get(pid).prompt.strip(), pid)


class UserPresetFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.user_path = os.path.join(self.tmp.name, "studio_presets.json")
        patcher = mock.patch(
            "src.studio.presets.studio_user_presets_path", return_value=self.user_path
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def tearDown(self):
        studio_presets.reload_store()

    def _write_user(self, presets):
        with open(self.user_path, "w", encoding="utf-8") as handle:
            json.dump({"schema_version": 1, "presets": presets}, handle)

    def test_user_override_and_tombstone(self):
        self._write_user(
            [
                {"id": "character_serena", "name": "SERENA EDITED", "prompt": "Edited."},
                {"id": "scene_medieval_tavern_a", "deleted": True},
            ]
        )
        store = studio_presets.load_store()
        self.assertEqual(store.get("character_serena").name, "SERENA EDITED")
        self.assertIsNone(store.get("scene_medieval_tavern_a"))
        # Tombstones do not remove user-visible categories' other presets.
        self.assertIsNotNone(store.get("character_marcus"))

    def test_malformed_user_file_is_skipped(self):
        with open(self.user_path, "w", encoding="utf-8") as handle:
            handle.write("{not json")
        store = studio_presets.load_store()
        self.assertIsNotNone(store.get("character_serena"))

    def test_save_user_payload_roundtrip(self):
        issues = studio_presets.save_user_payload(
            {
                "schema_version": 1,
                "presets": [
                    {"id": "user_custom", "name": "MINE", "category": "props", "prompt": "Stuff"},
                    {"id": "character_serena", "name": "SERENA", "prompt": "Overridden."},
                    {"id": "scene_castle_corridor_a", "deleted": True},
                ],
            }
        )
        self.assertEqual(issues, [])
        store = studio_presets.reload_store()
        self.assertIsNotNone(store.get("user_custom"))
        self.assertEqual(store.get("character_serena").prompt, "Overridden.")
        self.assertIsNone(store.get("scene_castle_corridor_a"))
        with open(self.user_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertEqual(len(data["presets"]), 3)

    def test_save_rejects_duplicates_and_missing_prompt(self):
        issues = studio_presets.save_user_payload(
            {
                "presets": [
                    {"id": "x", "prompt": "one"},
                    {"id": "x", "prompt": "two"},
                    {"id": "y"},
                ]
            }
        )
        codes = {issue["code"] for issue in issues}
        self.assertIn("presets.duplicate_id", codes)
        self.assertIn("presets.missing_prompt", codes)
        self.assertFalse(os.path.exists(self.user_path))

    def test_cache_respects_reload(self):
        store = studio_presets.get_store()
        self.assertIsNotNone(store.get("character_serena"))
        self._write_user([{"id": "brand_new", "prompt": "New."}])
        # Cached store does not know the new id yet.
        self.assertIsNone(studio_presets.get_store().get("brand_new"))
        fresh = studio_presets.reload_store()
        self.assertIsNotNone(fresh.get("brand_new"))


class MarkerFlagsTests(unittest.TestCase):
    """Grammar v2: labels, @host attachments and ~ randomize flags."""

    def test_parse_label_host_randomize(self):
        segments = studio_tokens.parse_document(
            "{{krea2:wardrobe_serena_travelling|SERENA - TRAVELLING|@character_serena|~}}"
        )
        token = segments[0]
        self.assertEqual(token.preset_id, "wardrobe_serena_travelling")
        self.assertEqual(token.label, "SERENA - TRAVELLING")
        self.assertEqual(token.host, "character_serena")
        self.assertTrue(token.randomize)

    def test_parse_flag_order_free(self):
        segments = studio_tokens.parse_document("{{krea2:x|~|@host1}}")
        token = segments[0]
        self.assertEqual(token.label, "")
        self.assertEqual(token.host, "host1")
        self.assertTrue(token.randomize)

    def test_parse_v1_markers_still_work(self):
        segments = studio_tokens.parse_document("{{krea2:plain|Old Label}} and {{krea2:bare}}")
        self.assertEqual([s.type for s in segments], ["token", "text", "token"])
        self.assertEqual(segments[0].label, "Old Label")
        self.assertEqual(segments[0].host, "")
        self.assertFalse(segments[0].randomize)
        self.assertEqual(segments[2].preset_id, "bare")

    def test_token_markup_options(self):
        self.assertEqual(
            studio_tokens.token_markup("w", "OUTFIT", host="character_serena", randomize=True),
            "{{krea2:w|OUTFIT|@character_serena|~}}",
        )
        self.assertEqual(
            studio_tokens.token_markup("w", "OUTFIT", host="character_serena"),
            "{{krea2:w|OUTFIT|@character_serena}}",
        )

    def test_roundtrip_with_flags(self):
        doc = "A {{krea2:emotion_happy|HAPPY|@character_serena|~}} day."
        self.assertEqual(
            studio_tokens.serialize_segments(studio_tokens.parse_document(doc)), doc
        )

    def test_has_randomize(self):
        self.assertFalse(studio_tokens.has_randomize("{{krea2:a|A}}"))
        self.assertTrue(studio_tokens.has_randomize("{{krea2:a|A|~}}"))
        self.assertTrue(studio_tokens.has_randomize("{{krea2:a|@h|~}}"))
        self.assertFalse(studio_tokens.has_randomize("no tokens"))

    def test_host_ids(self):
        doc = (
            "{{krea2:character_serena|SERENA}}{{krea2:emotion_happy|HAPPY|@character_serena}} "
            "{{krea2:character_marcus|MARCUS}}"
        )
        self.assertEqual(studio_tokens.host_ids(doc), ["character_serena"])

    def test_replace_token_fields(self):
        doc = "{{krea2:emotion_happy|HAPPY|@character_serena}}"
        out = studio_tokens.replace_token_fields(doc, 0, len(doc), randomize=True)
        self.assertEqual(out, "{{krea2:emotion_happy|HAPPY|@character_serena|~}}")
        out2 = studio_tokens.replace_token_fields(out, 0, len(out), host="character_marcus")
        self.assertEqual(
            out2, "{{krea2:emotion_happy|HAPPY|@character_marcus|~}}"
        )

    def test_attach_token_after_host(self):
        doc = "{{krea2:character_serena|SERENA}} sits."
        host_end = len("{{krea2:character_serena|SERENA}}")
        out = studio_tokens.attach_token(
            doc, 0, host_end,
            "wardrobe_serena_travelling", "SERENA - TRAVELLING",
        )
        self.assertTrue(out.startswith(
            "{{krea2:character_serena|SERENA}}"
            "{{krea2:wardrobe_serena_travelling|SERENA - TRAVELLING|@character_serena}}"
        ))
        self.assertTrue(out.endswith(" sits."))

    def test_raw_display_attachment_nesting(self):
        doc = (
            "{{krea2:character_serena|SERENA}}"
            "{{krea2:wardrobe_serena_travelling|OUTFIT|@character_serena}}"
            "{{krea2:emotion_happy|HAPPY|@character_serena}} sits."
        )
        raw = studio_tokens.raw_display(doc)
        self.assertEqual(raw, "[SERENA (OUTFIT) (HAPPY)] sits.")

    def test_raw_display_orphan_attachment(self):
        doc = "{{krea2:emotion_happy|HAPPY|@character_ghost}} alone."
        self.assertEqual(
            studio_tokens.raw_display(doc), "[MISSING: character_ghost] (HAPPY) alone."
        )

    def test_raw_display_orphan_with_resolver(self):
        doc = "{{krea2:emotion_happy|HAPPY|@character_ghost}} alone."
        raw = studio_tokens.raw_display(doc, lambda pid: None)
        self.assertEqual(raw, "[MISSING: character_ghost] (MISSING: emotion_happy) alone.")


class RandomizeTests(unittest.TestCase):
    def setUp(self):
        self.store = PresetStore(
            [
                Preset(id="camera_a", name="CAM A", category="camera",
                       prompt="A.", exclusive_group="camera"),
                Preset(id="camera_b", name="CAM B", category="camera",
                       prompt="B.", exclusive_group="camera"),
                Preset(id="camera_c", name="CAM C", category="camera",
                       prompt="C.", exclusive_group="camera"),
                Preset(id="light_x", name="LIGHT", category="lighting",
                       prompt="X.", exclusive_group="lighting"),
                Preset(id="top_a", name="TOP A", category="wardrobe",
                       prompt="TA.", exclusive_group="wardrobe_top"),
                Preset(id="top_b", name="TOP B", category="wardrobe",
                       prompt="TB.", exclusive_group="wardrobe_top"),
            ]
        )

    def test_candidates_same_slot_only(self):
        preset = self.store.get("camera_a")
        ids = {p.id for p in studio_compiler.random_candidates(self.store, preset, exclude_id="camera_a")}
        self.assertEqual(ids, {"camera_b", "camera_c"})

    def test_candidates_exclude_other_groups(self):
        top = self.store.get("top_a")
        ids = {p.id for p in studio_compiler.random_candidates(self.store, top, exclude_id="top_a")}
        self.assertEqual(ids, {"top_b"})

    def test_randomize_document_swaps_flagged_tokens(self):
        doc = "{{krea2:camera_a|CAM A|~}} stable {{krea2:light_x|LIGHT}}"
        rng = random.Random(42)
        new_doc, choices = studio_compiler.randomize_document(doc, self.store, rng=rng)
        self.assertEqual(len(choices), 1)
        self.assertEqual(choices[0]["token_id"], "camera_a")
        self.assertIn(choices[0]["chosen_id"], ("camera_b", "camera_c"))
        self.assertIn("|~", new_doc, "randomize flag must survive the swap")
        self.assertIn("stable", new_doc)
        # The label refreshes to the chosen preset.
        parsed = studio_tokens.parse_document(new_doc)
        camera = [s for s in parsed if s.type == "token" and not s.host][0]
        self.assertEqual(camera.label, choices[0]["chosen_name"])

    def test_randomize_keeps_attachment_host(self):
        doc = "{{krea2:character_serena|SERENA}}{{krea2:top_a|TOP A|@character_serena|~}}"
        rng = random.Random(7)
        new_doc, choices = studio_compiler.randomize_document(doc, self.store, rng=rng)
        token = [s for s in studio_tokens.parse_document(new_doc) if s.host][0]
        self.assertEqual(token.host, "character_serena")
        self.assertEqual(token.preset_id, choices[0]["chosen_id"])

    def test_randomize_skips_missing_and_slotless(self):
        doc = "{{krea2:ghost|G|~}} {{krea2:light_x|LIGHT|~}}"
        new_doc, choices = studio_compiler.randomize_document(doc, self.store)
        self.assertEqual(choices, [])
        self.assertEqual(new_doc, doc, "no alternatives -> untouched")

    def test_compile_with_rng_uses_randomized_doc(self):
        doc = "{{krea2:camera_a|CAM A|~}}"
        rng = random.Random(3)
        result = studio_compiler.compile_document(doc, self.store, rng=rng)
        self.assertEqual(len(result.random_choices), 1)
        self.assertIn(result.prompt, ("B.", "C."))
        self.assertNotEqual(result.raw_prompt, "[CAM A]")

    def test_compile_without_rng_is_deterministic(self):
        result = studio_compiler.compile_document("{{krea2:camera_a|CAM A|~}}", self.store)
        self.assertEqual(result.prompt, "A.")
        self.assertEqual(result.random_choices, [])


class ExclusiveGroupSchemaTests(unittest.TestCase):
    def test_exclusive_group_roundtrip(self):
        preset = studio_presets.preset_from_dict(
            {"id": "x", "prompt": "p", "exclusive_group": "Wardrobe Full"}, "user"
        )
        self.assertEqual(preset.exclusive_group, "wardrobe_full")
        self.assertIn("exclusive_group", preset.to_dict())

    def test_exclusive_group_defaults_empty(self):
        preset = studio_presets.preset_from_dict({"id": "x", "prompt": "p"}, "user")
        self.assertEqual(preset.exclusive_group, "")

    def test_exclusive_group_normalizes_junk(self):
        preset = studio_presets.preset_from_dict(
            {"id": "x", "prompt": "p", "exclusive_group": "My Group!!"}, "user"
        )
        self.assertEqual(preset.exclusive_group, "my_group")

    def test_bundled_groups_present(self):
        store = studio_presets.load_store()
        self.assertEqual(store.get("camera_close_up").exclusive_group, "camera")
        self.assertEqual(store.get("lighting_candlelight").exclusive_group, "lighting")
        self.assertEqual(store.get("scene_medieval_tavern_a").exclusive_group, "scene")
        self.assertEqual(store.get("style_cinematic_fantasy").exclusive_group, "style")
        self.assertEqual(store.get("emotion_happy").exclusive_group, "emotion")
        self.assertEqual(store.get("wardrobe_serena_travelling").exclusive_group, "wardrobe_full")
        self.assertEqual(store.get("wardrobe_top_silk_blouse").exclusive_group, "wardrobe_top")
        self.assertEqual(store.get("wardrobe_bottom_skinny_jeans").exclusive_group, "wardrobe_bottom")
        # Characters and continuity stay stackable.
        self.assertEqual(store.get("character_serena").exclusive_group, "")
        self.assertEqual(store.get("continuity_strict_scene_continuity").exclusive_group, "")

    def test_bundled_new_categories_load(self):
        store = studio_presets.load_store()
        self.assertEqual(len(store.by_category("emotion")), 17)
        self.assertEqual(len(store.by_category("wardrobe")), 34)


class RandomizeNodeTests(unittest.TestCase):
    """End-to-end randomization through the node (bundled preset store)."""

    LOCKED = "camera_locked_medium_shot"

    def test_is_changed_nan_for_random_docs(self):
        self.assertNotEqual(
            Krea2PromptWizardV2.IS_CHANGED("{{krea2:camera_locked_medium_shot|A|~}}"),
            Krea2PromptWizardV2.IS_CHANGED("{{krea2:camera_locked_medium_shot|A|~}}"),
        )
        self.assertEqual(
            Krea2PromptWizardV2.IS_CHANGED("plain"),
            Krea2PromptWizardV2.IS_CHANGED("plain"),
        )

    def test_build_randomizes_within_camera_slot(self):
        node = Krea2PromptWizardV2()
        locked = node.build("{{krea2:camera_locked_medium_shot|LOCKED MEDIUM SHOT}}")[0]
        prompt, negative, raw = node.build("{{krea2:camera_locked_medium_shot|LOCKED MEDIUM SHOT|~}}")
        camera_names = {
            "LOCKED MEDIUM SHOT", "MEDIUM CLOSE-UP", "CLOSE-UP",
            "WIDE ESTABLISHING SHOT", "OVER THE SHOULDER",
        }
        self.assertIn(raw.strip("[]"), camera_names - {"LOCKED MEDIUM SHOT"})
        self.assertNotEqual(prompt, locked)
        # The randomized negative set still comes from the chosen preset's group.
        self.assertIsInstance(negative, str)


class NodeTests(unittest.TestCase):
    def test_input_types(self):
        spec = Krea2PromptWizardV2.INPUT_TYPES()
        self.assertIn("prompt_doc", spec["required"])
        self.assertEqual(spec["required"]["prompt_doc"][0], "STRING")

    def test_return_signature(self):
        self.assertEqual(Krea2PromptWizardV2.RETURN_TYPES, ("STRING", "STRING", "STRING"))
        self.assertEqual(
            Krea2PromptWizardV2.RETURN_NAMES, ("prompt", "negative", "raw_prompt")
        )

    def test_build_outputs_three_strings(self):
        node = Krea2PromptWizardV2()
        prompt, negative, raw = node.build(
            "{{krea2:character_serena|SERENA}} plain"
        )
        for value in (prompt, negative, raw):
            self.assertIsInstance(value, str)
        self.assertIn("young adult woman", prompt)
        self.assertIn("short hair", negative)
        self.assertEqual(raw, "[SERENA] plain")

    def test_build_empty(self):
        node = Krea2PromptWizardV2()
        prompt, negative, raw = node.build("")
        self.assertEqual((prompt, negative, raw), ("", "", ""))


if __name__ == "__main__":
    unittest.main()
