"""Tests for the wizard state builder module."""
from __future__ import annotations

import unittest

from src.wizard import (
    add_row,
    add_row_phrase,
    coerce_state,
    duplicate_row,
    empty_state,
    new_row_id,
    remove_row,
    reorder_rows,
    reset_state,
    resolve_row_against_library,
    rows_from_snapshot,
    rows_to_snapshot,
    set_row_field,
    toggle_row,
    validate_or_raise,
)


class StateBuildersTests(unittest.TestCase):
    def test_empty_state(self):
        state = empty_state()
        self.assertEqual(state["rows"], [])
        self.assertIsNone(state["master_preset_id"])

    def test_coerce_state(self):
        s = coerce_state({"rows": ["invalid"]})
        self.assertEqual(s["rows"], [])

    def test_coerce_state_fills_defaults(self):
        s = coerce_state(None)
        self.assertEqual(s["schema_version"], 1)

    def test_add_row(self):
        state = empty_state()
        preset = {"id": "emotion.shock", "category": "emotion", "label": "Shock", "phrase": "shocked expression", "default_strength": 50, "control_mode": "scalar"}
        add_row(state, preset)
        self.assertEqual(len(state["rows"]), 1)
        self.assertEqual(state["rows"][0]["label"], "Shock")

    def test_add_row_phrase(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="My", phrase="my phrase", intensity=20)
        self.assertEqual(len(state["rows"]), 1)
        self.assertEqual(state["rows"][0]["category"], "custom")

    def test_duplicate_row(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x")
        rid = state["rows"][0]["id"]
        self.assertTrue(duplicate_row(state, rid))
        self.assertEqual(len(state["rows"]), 2)

    def test_duplicate_row_missing(self):
        state = empty_state()
        self.assertFalse(duplicate_row(state, "missing"))

    def test_remove_row(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x")
        rid = state["rows"][0]["id"]
        self.assertTrue(remove_row(state, rid))
        self.assertEqual(len(state["rows"]), 0)

    def test_reorder_rows(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="a", phrase="a")
        add_row_phrase(state, category="custom", label="b", phrase="b")
        a, b = state["rows"][0]["id"], state["rows"][1]["id"]
        reorder_rows(state, [b, a])
        self.assertEqual(state["rows"][0]["id"], b)
        self.assertEqual(state["rows"][1]["id"], a)

    def test_set_row_field(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x")
        rid = state["rows"][0]["id"]
        self.assertTrue(set_row_field(state, rid, "intensity", 80))
        self.assertEqual(state["rows"][0]["intensity"], 80)

    def test_toggle_row(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x")
        rid = state["rows"][0]["id"]
        self.assertTrue(toggle_row(state, rid, False))
        self.assertFalse(state["rows"][0]["enabled"])

    def test_reset_state(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x")
        reset_state(state)
        self.assertEqual(state["rows"], [])

    def test_snapshot_roundtrip(self):
        state = empty_state()
        add_row_phrase(state, category="custom", label="x", phrase="x", intensity=80)
        snapshot = rows_to_snapshot(state["rows"])
        restored = rows_from_snapshot(snapshot)
        self.assertEqual(len(restored), 1)
        self.assertEqual(restored[0]["intensity"], 80)

    def test_new_row_id(self):
        self.assertTrue(new_row_id())


class ResolveTests(unittest.TestCase):
    def test_resolve_against_library(self):
        class FakeLib:
            def find(self, pid):
                return {
                    "id": pid,
                    "label": "Library Label",
                    "phrase": "library phrase",
                    "category": "emotion",
                    "control_mode": "scalar",
                    "verification": "general visual vocabulary",
                }

        row = {"id": "x", "preset_id": "emotion.shock"}
        resolved = resolve_row_against_library(row, FakeLib())
        # Library fills in fields the user left empty.
        self.assertEqual(resolved["label"], "Library Label")
        self.assertEqual(resolved["phrase"], "library phrase")
        # A user-supplied phrase takes priority.
        row = {"id": "x", "preset_id": "emotion.shock", "phrase": "user phrase"}
        resolved = resolve_row_against_library(row, FakeLib())
        self.assertEqual(resolved["phrase"], "user phrase")


class ValidateTests(unittest.TestCase):
    def test_validate_or_raise(self):
        state = empty_state()
        try:
            validate_or_raise(state)
        except Exception as e:
            self.fail("validate_or_raise raised: " + str(e))


if __name__ == "__main__":
    unittest.main()
