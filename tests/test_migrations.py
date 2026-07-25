"""Tests for preset migrations."""
from __future__ import annotations

import unittest

from src.migrations import (
    MIGRATIONS,
    apply_preset_migrations,
    apply_row_preset_migrations,
)


class MigrationTests(unittest.TestCase):
    def test_empty_migration_table(self):
        # By default the migration table is empty (no renames/removals).
        self.assertEqual(len(MIGRATIONS), 0)

    def test_presets_pass_through(self):
        presets = [{"id": "x", "category": "y", "label": "x", "phrase": "p", "default_strength": 0, "control_mode": "scalar"}]
        applied, dropped = apply_preset_migrations(presets)
        self.assertEqual(len(applied), 1)
        self.assertEqual(dropped, [])

    def test_rows_pass_through(self):
        rows = [{"preset_id": "x", "phrase": "p"}]
        out = apply_row_preset_migrations(rows)
        self.assertEqual(len(out), 1)


if __name__ == "__main__":
    unittest.main()
