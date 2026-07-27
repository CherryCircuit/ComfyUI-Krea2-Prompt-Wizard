"""Tests for the library module."""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest

from src.library import (
    Library,
    load_library,
    merge_user_presets,
    parse_user_text,
    format_user_text,
    save_user_library,
    reset_user_library,
)
from src.user_paths import user_library_path, atomic_write


class UserTextFormatTests(unittest.TestCase):
    def test_roundtrip(self):
        presets = [
            {
                "id": "custom.shot",
                "category": "custom",
                "label": "Shot",
                "phrase": "shot phrase",
                "default_strength": 50,
                "control_mode": "scalar",
                "aliases": ["shoot"],
                "verification": "general visual vocabulary",
            },
            {
                "id": "custom.bipolar",
                "category": "custom",
                "label": "Bipolar",
                "phrase": "neutral",
                "default_strength": 0,
                "control_mode": "bipolar",
                "positive_phrase": "happy",
                "negative_phrase": "sad",
                "neutral_phrase": "neutral",
                "aliases": [],
                "verification": "community reported",
                "notes": "pos:happy;neg:sad",
            },
        ]
        text = format_user_text(presets)
        parsed = parse_user_text(text)
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0]["label"], "Shot")
        self.assertEqual(parsed[1]["control_mode"], "bipolar")
        self.assertEqual(parsed[1]["positive_phrase"], "happy")
        self.assertEqual(parsed[1]["negative_phrase"], "sad")

    def test_blank_line_ignored(self):
        text = "Shot | shot phrase | 50 | scalar |  | "
        parsed = parse_user_text(text)
        self.assertEqual(len(parsed), 1)

    def test_short_line_errors(self):
        text = "Single | field"
        with self.assertRaises(ValueError):
            parse_user_text(text)

    def test_bipolar_requires_pos_neg(self):
        text = "Bipolar | neutral | 0 | bipolar |  | "
        with self.assertRaises(ValueError):
            parse_user_text(text)


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="krea2_library_")
        self.bundled = os.path.join(self.tmp, "default_library.json")
        self.user = os.path.join(self.tmp, "user_library.json")
        shutil.copy(
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "presets", "default_library.json"),
            self.bundled,
        )

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_load_with_no_user(self):
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        self.assertGreater(len(lib.presets), 0)

    def test_load_with_user_override(self):
        with open(self.user, "w", encoding="utf-8") as f:
            json.dump({"schema_version": 1, "presets": [
                {"id": "emotion.shock", "category": "emotion", "label": "Shock (user)", "phrase": "shocked expression", "default_strength": 50, "control_mode": "scalar"}
            ]}, f)
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        preset = next(p for p in lib.presets if p["id"] == "emotion.shock")
        self.assertEqual(preset["label"], "Shock (user)")
        self.assertEqual(preset.get("origin"), "user")

    def test_search_finds_aliases(self):
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        results = lib.search("shocked")
        self.assertGreater(len(results), 0)

    def test_search_finds_semantic_tags(self):
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        results = lib.search("smile")
        labels = {preset.get("label") for preset in results}
        self.assertIn("Joy", labels)
        self.assertIn("Happiness", labels)

    def test_search_includes_label(self):
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        first = lib.presets[0]
        results = lib.search(first.get("label", ""))
        self.assertGreater(len(results), 0)

    def test_upsert_and_remove(self):
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        original_len = len(lib.presets)
        lib.upsert({"id": "custom.test", "category": "custom", "label": "Test", "phrase": "x", "default_strength": 0, "control_mode": "scalar"})
        self.assertEqual(len(lib.presets), original_len + 1)
        self.assertTrue(lib.remove("custom.test"))
        self.assertEqual(len(lib.presets), original_len)

    def test_atomic_write(self):
        path = os.path.join(self.tmp, "atomic.json")
        atomic_write(path, b"hello")
        with open(path, "rb") as f:
            self.assertEqual(f.read(), b"hello")

    def test_save_user_library(self):
        from src.user_paths import user_library_path
        lib = load_library(bundled_path=self.bundled, user_path=self.user)
        # Promote one bundled preset to user.
        bundled = lib.presets[0]
        bundled_copy = dict(bundled)
        bundled_copy["origin"] = "user"
        bundled_copy["label"] = "Saved by user"
        lib2 = Library(presets=[bundled_copy], bundled_path=self.bundled, user_path=self.user)
        save_user_library(lib2)
        user_path = user_library_path(create=False)
        with open(user_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(len(data["presets"]), 1)

    def test_reset_user_library(self):
        save_user_library(Library(presets=[], bundled_path=self.bundled, user_path=self.user))
        out = reset_user_library()
        with open(out, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["presets"], [])


class MergeUserPresetsTests(unittest.TestCase):
    def test_drops_invalid(self):
        out = merge_user_presets([
            {
                "id": "custom.x",
                "category": "custom",
                "label": "X",
                "phrase": "x",
                "default_strength": 0,
                "control_mode": "scalar",
                "verification": "general visual vocabulary",
            },
            "not a dict",
            {"id": "no_phrase", "category": "custom", "label": "no phrase"},
        ])
        # The first entry passes; "not a dict" is dropped; the entry with
        # no phrase is dropped because _coerce_preset rejects it.
        self.assertEqual(len(out), 1)


if __name__ == "__main__":
    unittest.main()
