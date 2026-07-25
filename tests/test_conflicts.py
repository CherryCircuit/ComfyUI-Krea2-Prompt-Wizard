"""Tests for the conflict detector."""
from __future__ import annotations

import unittest

from src.conflicts import (
    collect_all_warnings,
    detect_conflicts,
    detect_duplicates,
    detect_prompt_length_warnings,
    detect_raw_negative_warnings,
    detect_weight_threshold_warnings,
)


def _row(**kwargs):
    base = {
        "id": "row",
        "category": "emotion",
        "preset_id": "emotion.shock",
        "phrase": "shocked expression",
        "intensity": 50,
        "control_mode": "scalar",
        "enabled": True,
    }
    base.update(kwargs)
    return base


class ConflictTests(unittest.TestCase):
    def test_extreme_close_up_vs_establishing(self):
        rows = [
            _row(id="r1", phrase="extreme close-up"),
            _row(id="r2", phrase="wide establishing shot"),
        ]
        warnings = detect_conflicts(rows)
        self.assertTrue(any(w["code"] == "shot_size.extreme_close_up_vs_establishing" for w in warnings))

    def test_macro_vs_distant(self):
        rows = [
            _row(id="r1", phrase="macro close-up"),
            _row(id="r2", phrase="distant environmental framing"),
        ]
        warnings = detect_conflicts(rows)
        self.assertTrue(any(w["code"] == "perspective.macro_vs_distant" for w in warnings))

    def test_lighting_soft_vs_chiaroscuro(self):
        rows = [
            _row(id="r1", phrase="soft diffused lighting"),
            _row(id="r2", phrase="chiaroscuro"),
        ]
        warnings = detect_conflicts(rows)
        self.assertTrue(any(w["code"] == "lighting.soft_vs_chiaroscuro" for w in warnings))

    def test_multiple_focal_lengths(self):
        rows = [
            _row(id="r1", phrase="24mm wide"),
            _row(id="r2", phrase="85mm portrait"),
        ]
        warnings = detect_conflicts(rows)
        self.assertTrue(any(w["code"] == "lens.multiple_focal_lengths" for w in warnings))

    def test_contradictory_apertures(self):
        rows = [
            _row(id="r1", phrase="f/1.4"),
            _row(id="r2", phrase="f/16"),
        ]
        warnings = detect_conflicts(rows)
        self.assertTrue(any(w["code"] == "aperture.contradictory" for w in warnings))

    def test_disabled_rows_excluded(self):
        rows = [
            _row(id="r1", phrase="extreme close-up", enabled=True),
            _row(id="r2", phrase="wide establishing shot", enabled=False),
        ]
        warnings = detect_conflicts(rows)
        self.assertFalse(any(w["code"] == "shot_size.extreme_close_up_vs_establishing" for w in warnings))


class WeightThresholdTests(unittest.TestCase):
    def test_too_many_high(self):
        rows = [_row(id="r%d" % i, intensity=80) for i in range(7)]
        weights = {r["id"]: 2.5 for r in rows}
        warnings = detect_weight_threshold_warnings(rows, weights)
        self.assertTrue(any(w["code"] == "weights.too_many_high" for w in warnings))

    def test_too_many_hard(self):
        rows = [_row(id="r%d" % i, intensity=95) for i in range(4)]
        weights = {r["id"]: 2.9 for r in rows}
        warnings = detect_weight_threshold_warnings(rows, weights)
        self.assertTrue(any(w["code"] == "weights.too_many_hard" for w in warnings))

    def test_absolute_max_warning(self):
        rows = [_row(id="r1", intensity=100)]
        weights = {"r1": 3.5}
        warnings = detect_weight_threshold_warnings(rows, weights)
        self.assertTrue(any(w["code"] == "weights.absolute_max_exceeded" for w in warnings))


class DuplicateTests(unittest.TestCase):
    def test_duplicate_phrase(self):
        rows = [
            _row(id="r1", phrase="shocked expression"),
            _row(id="r2", phrase="shocked expression"),
        ]
        warnings = detect_duplicates(rows)
        self.assertTrue(any(w["code"] == "rows.duplicate_phrase" for w in warnings))


class LengthTests(unittest.TestCase):
    def test_excessive_length(self):
        warnings = detect_prompt_length_warnings("a" * 25000)
        self.assertTrue(any(w["code"] == "prompt.excessive_length" for w in warnings))

    def test_long_warning(self):
        warnings = detect_prompt_length_warnings("a" * 6000)
        self.assertTrue(any(w["code"] == "prompt.long" for w in warnings))


class RawNegativeTests(unittest.TestCase):
    def test_raw_negative_warns(self):
        rows = [_row(id="r1", control_mode="raw", intensity=-20)]
        warnings = detect_raw_negative_warnings(rows)
        self.assertTrue(any(w["code"] == "raw.negative_used" for w in warnings))


class AggregatedTests(unittest.TestCase):
    def test_collect_all(self):
        rows = [
            _row(id="r1", phrase="shocked expression"),
            _row(id="r2", phrase="shocked expression"),
        ]
        warnings = collect_all_warnings(rows, prompt="short")
        self.assertTrue(any(w["code"] == "rows.duplicate_phrase" for w in warnings))


if __name__ == "__main__":
    unittest.main()
