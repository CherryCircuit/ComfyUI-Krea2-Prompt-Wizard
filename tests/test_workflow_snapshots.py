"""Tests for the workflow snapshot behaviour."""
from __future__ import annotations

import json
import os
import unittest

from src.library import load_library
from src.compiler import compile_state
from src.wizard import add_row, empty_state, rows_from_snapshot, rows_to_snapshot
from src.migrations import apply_row_preset_migrations

from tests import load_default_library


def _lib():
    return load_library(
        bundled_path=os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "presets",
            "default_library.json",
        ),
        user_path=None,
    )


class SnapshotTests(unittest.TestCase):
    def test_snapshot_preserves_intensity(self):
        state = empty_state()
        lib = _lib()
        presets = {p["id"]: p for p in lib.presets if isinstance(p, dict)}
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=42)
        snap = rows_to_snapshot(state["rows"])
        self.assertEqual(snap[0]["intensity"], 42)

    def test_snapshot_roundtrip_in_compiler(self):
        state = empty_state()
        lib = _lib()
        presets = {p["id"]: p for p in lib.presets if isinstance(p, dict)}
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=42)
        snap = rows_to_snapshot(state["rows"])
        new_state = empty_state()
        new_state["rows"] = rows_from_snapshot(snap)
        a = compile_state(state, lib)
        b = compile_state(new_state, lib)
        self.assertEqual(a.final_prompt, b.final_prompt)

    def test_migration_preserves_legacy_preset_id(self):
        rows = [{"preset_id": "x", "phrase": "p", "intensity": 0, "control_mode": "scalar", "enabled": True, "category": "custom", "id": "r1"}]
        out = apply_row_preset_migrations(rows)
        # With an empty migration table, the row passes through.
        self.assertEqual(out[0]["preset_id"], "x")


if __name__ == "__main__":
    unittest.main()
