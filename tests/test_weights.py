"""Tests for the weight mapping module."""
from __future__ import annotations

import math
import unittest

from src.weight_mapping import (
    bipolar_extension,
    format_phrase,
    is_already_weighted,
    mode_for_row,
    phrase_for_row,
    resolve_bipolar_range,
    slider_to_weight_bipolar,
    slider_to_weight_raw,
    slider_to_weight_scalar,
    strip_weighting,
    weight_for_row,
)
from src.schemas import (
    MODE_BIPOLAR,
    MODE_RAW,
    MODE_SCALAR,
    SAFE_WEIGHT_MAX,
    SAFE_WEIGHT_MIN,
)


class SliderMappingTests(unittest.TestCase):
    def test_zero_returns_one(self):
        self.assertEqual(slider_to_weight_scalar(0), 1.0)

    def test_negative_decreases(self):
        w = slider_to_weight_scalar(-100)
        self.assertAlmostEqual(w, SAFE_WEIGHT_MIN, places=2)

    def test_positive_increases(self):
        w = slider_to_weight_scalar(100)
        self.assertAlmostEqual(w, SAFE_WEIGHT_MAX, places=2)

    def test_monotonic_positive(self):
        prev = 0
        for i in range(0, 101):
            w = slider_to_weight_scalar(i)
            self.assertGreaterEqual(w, prev)
            prev = w

    def test_monotonic_negative(self):
        prev = 1.0
        for i in range(0, -101, -1):
            w = slider_to_weight_scalar(i)
            self.assertLessEqual(w, prev)
            prev = w

    def test_spec_examples(self):
        for slider, expected in [
            (-100, 0.1),
            (-75, 0.34),
            (-50, 0.58),
            (-25, 0.80),
            (0, 1.0),
            (25, 1.31),
            (50, 1.78),
            (75, 2.36),
            (100, 3.0),
        ]:
            w = slider_to_weight_scalar(slider)
            self.assertAlmostEqual(w, expected, places=1, msg=f"failed for {slider}: {w}")

    def test_raw_mode_spans_negative(self):
        w = slider_to_weight_raw(0)
        self.assertAlmostEqual(w, 0.0, places=2)
        w_neg = slider_to_weight_raw(-100)
        self.assertAlmostEqual(w_neg, -3.0, places=2)
        w_pos = slider_to_weight_raw(100)
        self.assertAlmostEqual(w_pos, 3.0, places=2)

    def test_raw_mode_expert_extends(self):
        w = slider_to_weight_raw(-100, expert=True)
        self.assertAlmostEqual(w, -4.0, places=2)

    def test_bipolar_positive(self):
        self.assertAlmostEqual(slider_to_weight_bipolar(0), 1.0)
        self.assertAlmostEqual(slider_to_weight_bipolar(100), 3.0, places=2)
        self.assertAlmostEqual(slider_to_weight_bipolar(50), 1.78, places=1)


class FormatPhraseTests(unittest.TestCase):
    def test_emits_weighted_when_above_one(self):
        self.assertEqual(format_phrase("shocked expression", 2.4), "(shocked expression:2.4)")

    def test_emits_plain_when_one(self):
        self.assertEqual(format_phrase("happy expression", 1.0), "happy expression")

    def test_strips_trailing_zeros(self):
        self.assertEqual(format_phrase("x", 2.0), "(x:2)")
        self.assertEqual(format_phrase("x", 2.5), "(x:2.5)")

    def test_no_decimal_emission(self):
        self.assertEqual(format_phrase("x", 2.40), "(x:2.4)")

    def test_empty_phrase_returns_empty(self):
        self.assertEqual(format_phrase("", 2.0), "")
        self.assertEqual(format_phrase(None, 2.0), "")

    def test_negative_weight_emits_with_minus(self):
        result = format_phrase("happy", -1.5)
        self.assertTrue(result.startswith("("))
        self.assertTrue("-1.5" in result or "-1.50" in result or "-1.5" in result)


class IsAlreadyWeightedTests(unittest.TestCase):
    def test_parens_with_colon_number(self):
        self.assertTrue(is_already_weighted("(shocked expression:2.4)"))
        self.assertTrue(is_already_weighted("(x:1.5)"))
        # The trailing paren is what the helper looks at, so a wrapped
        # weighted phrase is detected via the same suffix check.
        self.assertTrue(is_already_weighted("prefix (alpha:1.0)"))

    def test_parens_with_time(self):
        # "(12:30)" is treated as a weighted phrase by the heuristic
        # because the suffix ends with ":NN". This is a documented
        # limitation; callers can still override via strip_weighting.
        self.assertTrue(is_already_weighted("(12:30)"))

    def test_no_parens(self):
        self.assertFalse(is_already_weighted("shocked expression"))

    def test_only_opening_paren(self):
        self.assertFalse(is_already_weighted("(shocked expression"))

    def test_inner_no_colon(self):
        self.assertFalse(is_already_weighted("(shocked expression)"))


class StripWeightingTests(unittest.TestCase):
    def test_strips_weighted(self):
        self.assertEqual(strip_weighting("(shocked expression:2.4)"), "shocked expression")

    def test_keeps_plain(self):
        self.assertEqual(strip_weighting("shocked expression"), "shocked expression")


class ModeResolutionTests(unittest.TestCase):
    def test_default_mode_is_scalar(self):
        self.assertEqual(mode_for_row({}), MODE_SCALAR)
        self.assertEqual(mode_for_row({"control_mode": "bipolar"}), MODE_BIPOLAR)
        self.assertEqual(mode_for_row({"control_mode": "raw"}), MODE_RAW)

    def test_unknown_mode_falls_back(self):
        self.assertEqual(mode_for_row({"control_mode": "silly"}), MODE_SCALAR)


class WeightForRowTests(unittest.TestCase):
    def test_direct_quarter_step_strength_is_exact(self):
        self.assertEqual(
            weight_for_row({"strength": -1.25, "intensity": 75, "control_mode": "scalar"}),
            -1.25,
        )

    def test_scalar_row(self):
        self.assertAlmostEqual(weight_for_row({"intensity": 75, "control_mode": "scalar"}), 2.36, places=1)

    def test_bipolar_row(self):
        self.assertAlmostEqual(weight_for_row({"intensity": 100, "control_mode": "bipolar"}), 3.0, places=2)

    def test_raw_row(self):
        self.assertAlmostEqual(weight_for_row({"intensity": 100, "control_mode": "raw"}), 3.0, places=2)

    def test_clamps_oversized_intensity(self):
        self.assertAlmostEqual(weight_for_row({"intensity": 1000, "control_mode": "scalar"}), 3.0, places=2)


class PhraseForRowTests(unittest.TestCase):
    def test_scalar(self):
        self.assertEqual(phrase_for_row({"phrase": "x", "control_mode": "scalar"}), "x")

    def test_bipolar_positive(self):
        row = {
            "control_mode": "bipolar",
            "intensity": 50,
            "phrase": "neutral",
            "positive_phrase": "happy",
            "negative_phrase": "sad",
            "neutral_phrase": "neutral",
        }
        self.assertEqual(phrase_for_row(row), "happy")

    def test_bipolar_negative(self):
        row = {
            "control_mode": "bipolar",
            "intensity": -50,
            "phrase": "neutral",
            "positive_phrase": "happy",
            "negative_phrase": "sad",
            "neutral_phrase": "neutral",
        }
        self.assertEqual(phrase_for_row(row), "sad")

    def test_bipolar_zero(self):
        row = {
            "control_mode": "bipolar",
            "intensity": 0,
            "phrase": "neutral",
            "positive_phrase": "happy",
            "negative_phrase": "sad",
            "neutral_phrase": "neutral",
        }
        self.assertEqual(phrase_for_row(row), "neutral")

    def test_bipolar_strips_weighting(self):
        row = {
            "control_mode": "bipolar",
            "intensity": 30,
            "phrase": "(neutral:1.0)",
            "positive_phrase": "(happy:1.0)",
            "negative_phrase": "(sad:1.0)",
            "neutral_phrase": "(neutral:1.0)",
        }
        # The implementation strips weighting before assembly.
        self.assertEqual(phrase_for_row(row), "happy")


class BipolarExtensionTests(unittest.TestCase):
    def test_zero(self):
        self.assertEqual(bipolar_extension(0), (0.0, 0.0))

    def test_positive(self):
        mag, sign = bipolar_extension(50)
        self.assertAlmostEqual(mag, 0.5, places=2)
        self.assertEqual(sign, 1.0)

    def test_negative(self):
        mag, sign = bipolar_extension(-25)
        self.assertAlmostEqual(mag, 0.25, places=2)
        self.assertEqual(sign, -1.0)


class ResolveBipolarRangeTests(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(resolve_bipolar_range({}), (0.5, 2.5))

    def test_custom(self):
        self.assertEqual(resolve_bipolar_range({"safe_weight_min": 0.3, "safe_weight_max": 2.0}), (0.3, 2.0))

    def test_invalid_reverts_to_default(self):
        self.assertEqual(resolve_bipolar_range({"safe_weight_min": 2.0, "safe_weight_max": 1.0}), (0.5, 2.5))


if __name__ == "__main__":
    unittest.main()
