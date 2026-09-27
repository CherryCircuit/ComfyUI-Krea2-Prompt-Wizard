"""Tests for the Prompt Studio (v2): tokenizer, compiler, presets, node."""
from __future__ import annotations

import json
import os
import random
import tempfile
import unittest
from unittest import mock

from src.studio import compiler as studio_compiler
from src.studio import prefs as studio_prefs
from src.studio import presets as studio_presets
from src.studio import tokens as studio_tokens
from src.studio.nodes import Krea2PromptWizardV2
from src.studio.presets import Preset, PresetStore


def _make_store(presets):
    return PresetStore([Preset(**p) if isinstance(p, dict) else p for p in presets])


def _preset(pid, name="X", category="other", prompt="P", negative="", exclusive_group=""):
    return Preset(
        id=pid, name=name, category=category, prompt=prompt, negative=negative,
        exclusive_group=exclusive_group,
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
        prompt, negative, raw, last_prompt, last_negative = node.build(
            "{{krea2:camera_locked_medium_shot|LOCKED MEDIUM SHOT|~}}"
        )
        camera_names = {
            "LOCKED MEDIUM SHOT", "MEDIUM CLOSE-UP", "CLOSE-UP",
            "WIDE ESTABLISHING SHOT", "OVER THE SHOULDER",
        }
        self.assertIn(raw.strip("[]"), camera_names - {"LOCKED MEDIUM SHOT"})
        self.assertNotEqual(prompt, locked)
        # The randomized negative set still comes from the chosen preset's group.
        self.assertIsInstance(negative, str)


class BundleTests(unittest.TestCase):
    """Looks / Performances: presets composed of other presets."""

    def setUp(self):
        self.store = PresetStore(
            [
                _preset("outfit_a", "OUTFIT A", "wardrobe", "Green dress.", "modern fabric"),
                _preset("hair_a", "HAIR A", "hair", "Blonde waves."),
                _preset("look_pilot", "PILOT", "look", "", exclusive_group="look"),
                _preset("look_nested", "NESTED", "look", "", exclusive_group="look"),
                _preset("emotion_tense", "TENSE", "emotion", "Tense face."),
            ]
        )
        self.store.get("look_pilot").included_presets = ["outfit_a", "hair_a"]
        self.store.get("look_nested").included_presets = ["look_pilot", "emotion_tense"]

    def test_expand_simple_bundle(self):
        text, used = studio_compiler.expand_preset(self.store.get("look_pilot"), self.store)
        self.assertEqual(text, "Green dress. Blonde waves.")
        self.assertEqual(used, ["look_pilot", "outfit_a", "hair_a"])

    def test_expand_nested_bundle(self):
        text, used = studio_compiler.expand_preset(self.store.get("look_nested"), self.store)
        self.assertEqual(text, "Green dress. Blonde waves. Tense face.")
        self.assertEqual(used[0], "look_nested")
        self.assertIn("look_pilot", used)

    def test_expand_cycle_is_cut(self):
        self.store.get("look_pilot").included_presets = ["look_nested"]
        self.store.get("look_nested").included_presets = ["look_pilot"]
        text, _ = studio_compiler.expand_preset(self.store.get("look_pilot"), self.store)
        self.assertIn("[CYCLIC BUNDLE:", text)

    def test_expand_missing_member(self):
        self.store.get("look_pilot").included_presets = ["ghost_preset"]
        text, used = studio_compiler.expand_preset(self.store.get("look_pilot"), self.store)
        self.assertEqual(text, "[MISSING: ghost_preset]")

    def test_bundle_negatives_union(self):
        doc = "{{krea2:look_pilot|PILOT|@character_serena}}"
        result = studio_compiler.compile_document(doc, self.store)
        self.assertEqual(result.prompt, "Green dress. Blonde waves.")
        self.assertEqual(result.negative, "modern fabric")
        self.assertIn("hair_a", result.used_preset_ids)

    def test_bundle_missing_member_marks_missing(self):
        self.store.get("look_pilot").included_presets = ["ghost_preset"]
        result = studio_compiler.compile_document("{{krea2:look_pilot|PILOT}}", self.store)
        self.assertIn("[MISSING: ghost_preset]", result.prompt)
        self.assertIn("ghost_preset", result.missing_preset_ids)

    def test_new_bundled_categories_load(self):
        store = studio_presets.load_store()
        self.assertEqual(len(store.by_category("look")), 6)
        self.assertEqual(len(store.by_category("performance")), 6)
        self.assertEqual(len(store.by_category("state")), 6)
        pilot = store.get("look_pilot")
        self.assertEqual(pilot.exclusive_group, "look")
        self.assertIn("wardrobe_futuristic_flight_suit", pilot.included_presets)
        self.assertEqual(store.get("performance_on_edge").exclusive_group, "performance")
        # States stack freely.
        self.assertEqual(store.get("state_sweaty").exclusive_group, "")


class FrameTests(unittest.TestCase):
    """First / Last frame sections."""

    def setUp(self):
        self.store = PresetStore(
            [
                _preset("char_a", "CHARA", "character", "Character block."),
                _preset("scene_x", "SCENE", "scene", "Scene block.", negative="modern"),
                _preset("emotion_x", "SHOCKED", "emotion", "Shocked face.", negative="calm face"),
                _preset("emotion_y", "CALM", "emotion", "Calm face."),
            ]
        )

    def test_has_frames(self):
        self.assertFalse(studio_tokens.has_frames("plain doc"))
        self.assertTrue(studio_tokens.has_frames("a {{frame:first}} b"))
        self.assertTrue(studio_tokens.has_frames("{{frame:last}}"))

    def test_parse_frame_segments(self):
        segments = studio_tokens.parse_document("A {{frame:first}} B")
        self.assertEqual([s.type for s in segments], ["text", "frame", "text"])
        self.assertEqual(segments[1].value, "first")
        self.assertEqual(segments[1].raw, "{{frame:first}}")

    def test_split_sections(self):
        doc = "shared text {{frame:first}} she stands {{frame:last}} she recoils"
        sections = studio_tokens.split_sections(doc)
        self.assertEqual(sections["shared"], "shared text ")
        self.assertEqual(sections["first"], " she stands ")
        self.assertEqual(sections["last"], " she recoils")

    def test_split_sections_shared_only(self):
        self.assertEqual(studio_tokens.split_sections("no markers")["last"], "")

    def test_split_multiple_markers_accumulate(self):
        doc = "A {{frame:first}} B {{frame:last}} C {{frame:first}} D"
        sections = studio_tokens.split_sections(doc)
        self.assertEqual(sections["shared"], "A ")
        self.assertEqual(sections["first"], " B  D")
        self.assertEqual(sections["last"], " C ")

    def test_compile_frames_outputs(self):
        doc = (
            "{{krea2:char_a|CHARA}} in {{krea2:scene_x|SCENE}}. "
            "{{frame:first}}"
            "{{krea2:emotion_y|CALM}}. "
            "{{frame:last}}"
            "{{krea2:emotion_x|SHOCKED}}."
        )
        result = studio_compiler.compile_document(doc, self.store)
        self.assertTrue(result.has_frames)
        # prompt = shared + first
        self.assertEqual(result.prompt, "Character block. in Scene block. Calm face.")
        # last_prompt = shared + last
        self.assertEqual(result.last_prompt, "Character block. in Scene block. Shocked face.")
        # negatives are per-frame
        self.assertEqual(result.negative, "modern")
        self.assertEqual(result.last_negative, "modern, calm face")
        # raw shows both frames
        self.assertIn("[LAST FRAME]", result.raw_prompt)
        self.assertIn("[CALM]", result.raw_prompt.split("[LAST FRAME]")[0])
        self.assertIn("[SHOCKED]", result.raw_prompt.split("[LAST FRAME]")[1])

    def test_compile_no_frames_last_empty(self):
        result = studio_compiler.compile_document("{{krea2:char_a|CHARA}}", self.store)
        self.assertFalse(result.has_frames)
        self.assertEqual(result.last_prompt, "")
        self.assertEqual(result.last_negative, "")

    def test_randomize_shared_across_frames(self):
        store = PresetStore(
            [
                _preset("cam_a", "CAM A", "camera", "A.", exclusive_group="camera"),
                _preset("cam_b", "CAM B", "camera", "B.", exclusive_group="camera"),
            ]
        )
        doc = (
            "{{krea2:cam_a|CAM A|~}} {{frame:first}} calm {{frame:last}} shocked"
        )
        rng = random.Random(11)
        result = studio_compiler.compile_document(doc, store, rng=rng)
        self.assertEqual(len(result.random_choices), 1)
        # Both frames contain the SAME pick (sections differ by design).
        pick = result.prompt.split(".")[0]
        self.assertIn(pick, ("A", "B"))
        self.assertTrue(result.last_prompt.startswith(pick + "."))

    def test_node_build_frames(self):
        node = Krea2PromptWizardV2()
        doc = (
            "{{krea2:character_serena|SERENA}} {{frame:first}} stands tall "
            "{{frame:last}} recoils in shock."
        )
        prompt, negative, raw, last_prompt, last_negative = node.build(doc)
        self.assertIn("young adult woman", prompt)
        self.assertIn("stands tall", prompt)
        self.assertNotIn("stands tall", last_prompt)
        self.assertIn("recoils in shock", last_prompt)
        self.assertIn("young adult woman", last_prompt)


class PrefsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.prefs_path = os.path.join(self.tmp.name, "studio_prefs.json")
        patcher = mock.patch(
            "src.studio.prefs.studio_user_prefs_path", return_value=self.prefs_path
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_defaults_when_missing(self):
        prefs = studio_prefs.load_prefs()
        self.assertEqual(prefs, {"favorites": [], "recent": []})

    def test_save_and_load_roundtrip(self):
        issues = studio_prefs.save_prefs(
            {"favorites": ["camera_close_up"], "recent": ["look_pilot", "look_pilot", "camera_close_up"]}
        )
        self.assertEqual(issues, [])
        prefs = studio_prefs.load_prefs()
        self.assertEqual(prefs["favorites"], ["camera_close_up"])
        # Recent dedupes, most recent first.
        self.assertEqual(prefs["recent"], ["look_pilot", "camera_close_up"])

    def test_junk_file_resets(self):
        with open(self.prefs_path, "w", encoding="utf-8") as handle:
            handle.write("{broken")
        self.assertEqual(studio_prefs.load_prefs()["recent"], [])

    def test_caps_and_type_coercion(self):
        issues = studio_prefs.save_prefs(
            {"favorites": [1, "a", None, "b"], "recent": ["x"] * 50}
        )
        self.assertEqual(issues, [])
        prefs = studio_prefs.load_prefs()
        self.assertEqual(prefs["favorites"], ["a", "b"])
        self.assertLessEqual(len(prefs["recent"]), 30)


class NodeTests(unittest.TestCase):
    def test_input_types(self):
        spec = Krea2PromptWizardV2.INPUT_TYPES()
        self.assertIn("prompt_doc", spec["required"])
        self.assertEqual(spec["required"]["prompt_doc"][0], "STRING")

    def test_return_signature(self):
        self.assertEqual(
            Krea2PromptWizardV2.RETURN_TYPES, ("STRING",) * 5
        )
        self.assertEqual(
            Krea2PromptWizardV2.RETURN_NAMES,
            ("prompt", "negative", "raw_prompt", "last_prompt", "last_negative"),
        )

    def test_build_outputs_five_strings(self):
        node = Krea2PromptWizardV2()
        prompt, negative, raw, last_prompt, last_negative = node.build(
            "{{krea2:character_serena|SERENA}} plain"
        )
        for value in (prompt, negative, raw, last_prompt, last_negative):
            self.assertIsInstance(value, str)
        self.assertIn("young adult woman", prompt)
        self.assertIn("short hair", negative)
        self.assertEqual(raw, "[SERENA] plain")
        self.assertEqual((last_prompt, last_negative), ("", ""))

    def test_build_empty(self):
        node = Krea2PromptWizardV2()
        outputs = node.build("")
        self.assertEqual(outputs, ("", "", "", "", ""))


if __name__ == "__main__":
    unittest.main()
