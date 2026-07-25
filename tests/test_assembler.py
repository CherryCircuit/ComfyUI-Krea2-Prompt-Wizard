"""Tests for the assembler module."""
from __future__ import annotations

import unittest

from src.assembler import (
    assemble,
    _format_weighted,
    _strip_weight,
    trace_to_json,
)


def _fragment(**kwargs):
    base = {
        "id": "f",
        "text": "x",
        "weight": 1.0,
        "category": "custom",
        "enabled": True,
    }
    base.update(kwargs)
    return base


class AssemblerTests(unittest.TestCase):
    def test_empty(self):
        result = assemble("base", [])
        self.assertEqual(result.final_prompt, "base")
        self.assertEqual(result.plain_prompt, "base")

    def test_emits_weighted(self):
        result = assemble("base", [_fragment(text="happy", weight=1.5)])
        self.assertIn("(happy:1.5)", result.final_prompt)

    def test_emits_plain_when_one(self):
        result = assemble("base", [_fragment(text="happy", weight=1.0)])
        self.assertIn("happy", result.final_prompt)
        self.assertNotIn(":", result.final_prompt)

    def test_disabled_skipped(self):
        result = assemble("base", [_fragment(text="happy", enabled=False)])
        self.assertEqual(result.final_prompt, "base")

    def test_category_outputs(self):
        result = assemble("base", [
            _fragment(id="1", text="happy", weight=1.0, category="emotion"),
            _fragment(id="2", text="sad", weight=1.0, category="emotion"),
            _fragment(id="3", text="35mm", weight=1.0, category="lens"),
        ])
        self.assertIn("happy sad", result.category_prompts["emotion"])
        self.assertIn("35mm", result.category_prompts["lens"])

    def test_trace_json(self):
        result = assemble("base", [_fragment(text="x", weight=1.0)])
        json = trace_to_json(result)
        self.assertIn("schema_version", json)


class FormatHelpersTests(unittest.TestCase):
    def test_format_weighted(self):
        self.assertEqual(_format_weighted("x", 2.0), "(x:2)")
        self.assertEqual(_format_weighted("x", 2.5), "(x:2.5)")
        self.assertEqual(_format_weighted("x", 1.0), "x")

    def test_strip_weight(self):
        self.assertEqual(_strip_weight("x"), "x")
        self.assertEqual(_strip_weight("(x:1.5)"), "x")
        self.assertEqual(_strip_weight("(y:2)"), "y")
        # The stripper uses simple suffix matching; "12:30" is treated as
        # a weight and stripped. Callers should not feed time strings.
        self.assertEqual(_strip_weight("(12:30)"), "12")


if __name__ == "__main__":
    unittest.main()
