"""Tests for the inspector module."""
from __future__ import annotations

import json
import unittest

from src.inspector import inspect, report_to_json, report_to_text
from src.wizard import add_row, empty_state
from src.library import load_library

from tests import load_default_library


def _lib():
    import os
    return load_library(
        bundled_path=os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "presets",
            "default_library.json",
        ),
        user_path=None,
    )


class InspectorTests(unittest.TestCase):
    def test_empty(self):
        report = inspect()
        self.assertIn("Krea2 Prompt Wizard Inspector", report.text)
        self.assertEqual(report.normalized_trace["rows"], [])

    def test_with_state(self):
        state = empty_state()
        lib = _lib()
        presets = {p["id"]: p for p in lib.presets if isinstance(p, dict)}
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
        report = inspect(
            state_json=json.dumps(state),
            final_prompt="hello",
        )
        # The label is "Shock" (not "Shocked"); verify the row is rendered.
        self.assertIn("Shock", report.text)
        self.assertIn("hello", report.text)

    def test_with_trace(self):
        trace = {
            "schema_version": 1,
            "rows": [
                {
                    "category": "emotion",
                    "label": "Shocked",
                    "mode": "scalar",
                    "weight": 2.4,
                    "fragment": "(shocked expression:2.4)",
                    "verification": "community reported",
                }
            ],
        }
        report = inspect(trace_json=json.dumps(trace))
        self.assertIn("Shocked", report.text)
        self.assertIn("community reported", report.text)

    def test_malformed_json_warns(self):
        report = inspect(trace_json="{ not valid")
        self.assertTrue(any("trace_json" in w for w in report.warnings))

    def test_report_serialization(self):
        report = inspect()
        report_to_text(report)
        report_to_json(report)


if __name__ == "__main__":
    unittest.main()
