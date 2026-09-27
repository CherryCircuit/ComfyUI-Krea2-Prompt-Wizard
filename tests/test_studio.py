"""Tests for the Prompt Studio (v2): tokenizer, compiler, presets, node."""
from __future__ import annotations

import json
import os
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
