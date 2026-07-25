"""Tests for the validation module."""
from __future__ import annotations

import unittest

from src.validation import (
    validate_preset,
    validate_presets,
    validate_row,
    validate_rows,
    validate_state,
    validate_user_library,
)
from src.schemas import CATEGORIES, SCHEMA_VERSION


def _preset(**kwargs):
    base = {
        "id": "emotion.shocked",
        "category": "emotion",
        "label": "Shocked",
        "phrase": "shocked expression",
        "default_strength": 65,
        "control_mode": "scalar",
        "verification": "general visual vocabulary",
    }
    base.update(kwargs)
    return base


def _preset_without(*keys):
    """Return a valid preset dictionary with the given keys removed."""
    base = _preset()
    for k in keys:
        base.pop(k, None)
    return base


def _row(**kwargs):
    base = {
        "id": "row_1",
        "category": "emotion",
        "preset_id": "emotion.shocked",
        "phrase": "shocked expression",
        "intensity": 50,
        "control_mode": "scalar",
        "enabled": True,
    }
    base.update(kwargs)
    return base


def _row_without(*keys):
    base = _row()
    for k in keys:
        base.pop(k, None)
    return base


class PresetValidationTests(unittest.TestCase):
    def test_valid_preset(self):
        result = validate_preset(_preset())
        self.assertFalse(result.has_errors)

    def test_missing_required_field(self):
        result = validate_preset(_preset_without("id"))
        self.assertTrue(result.has_errors)

    def test_unknown_category(self):
        result = validate_preset(_preset(category="not-a-category"))
        self.assertTrue(result.has_errors)

    def test_unbalanced_parens(self):
        result = validate_preset(_preset(phrase="(shocked expression"))
        self.assertTrue(any(i.code == "preset.unbalanced_parentheses" for i in result.issues))

    def test_invalid_default_strength(self):
        result = validate_preset(_preset(default_strength=200))
        self.assertTrue(result.has_errors)

    def test_invalid_mode(self):
        result = validate_preset(_preset(control_mode="fancy"))
        self.assertTrue(result.has_errors)

    def test_bipolar_requires_negative_and_positive(self):
        result = validate_preset(
            _preset(
                control_mode="bipolar",
                positive_phrase="",
                negative_phrase="",
            )
        )
        self.assertTrue(any(i.code == "preset.bipolar_missing_positive" for i in result.issues))
        self.assertTrue(any(i.code == "preset.bipolar_missing_negative" for i in result.issues))

    def test_id_must_be_alphanumeric(self):
        result = validate_preset(_preset(id="emotion/shocked!"))
        self.assertTrue(result.has_errors)

    def test_id_with_dots_underscores_dashes(self):
        result = validate_preset(_preset(id="emotion.shocked_thing-1"))
        self.assertFalse(result.has_errors)

    def test_compatible_profiles_warns_on_unknown(self):
        result = validate_preset(_preset(compatible_profiles=["mystery"]))
        self.assertTrue(any(i.code == "preset.unknown_profile" for i in result.issues))

    def test_safe_weight_range_invalid(self):
        result = validate_preset(_preset(safe_weight_min=3.0, safe_weight_max=2.0))
        self.assertTrue(result.has_errors)

    def test_valid_id_with_dots(self):
        result = validate_preset(_preset(id="emotion.shocked_expression"))
        self.assertFalse(result.has_errors)

    def test_duplicate_id_in_presets(self):
        result = validate_presets(
            [
                _preset(id="emotion.shocked"),
                _preset(id="emotion.shocked"),
            ]
        )
        self.assertTrue(any(i.code == "presets.duplicate_id" for i in result.issues))


class RowValidationTests(unittest.TestCase):
    def test_valid_row(self):
        result = validate_row(_row())
        self.assertFalse(result.has_errors)

    def test_missing_required_field(self):
        result = validate_row(_row_without("phrase"))
        self.assertTrue(result.has_errors)

    def test_invalid_intensity(self):
        result = validate_row(_row(intensity=300))
        self.assertTrue(result.has_errors)

    def test_bipolar_row_missing_phrase(self):
        result = validate_row(
            _row(
                control_mode="bipolar",
                positive_phrase="",
                negative_phrase="",
            )
        )
        self.assertTrue(result.has_errors)

    def test_duplicate_row_id(self):
        result = validate_rows(
            [
                _row(id="row_1"),
                _row(id="row_1"),
            ]
        )
        self.assertTrue(any(i.code == "rows.duplicate_id" for i in result.issues))


class StateValidationTests(unittest.TestCase):
    def test_valid_state(self):
        state = {
            "schema_version": SCHEMA_VERSION,
            "base_prompt": "a woman",
            "rows": [_row()],
            "model_profile": "generic",
            "interface_mode": "simple",
        }
        result = validate_state(state)
        self.assertFalse(result.has_errors)

    def test_invalid_profile(self):
        result = validate_state({"model_profile": "mystery", "rows": []})
        self.assertTrue(result.has_errors)

    def test_invalid_interface_mode(self):
        result = validate_state({"interface_mode": "weird", "rows": []})
        self.assertTrue(any(i.code == "state.invalid_interface_mode" for i in result.issues))


class UserLibraryValidationTests(unittest.TestCase):
    def test_valid_user_library(self):
        result = validate_user_library({"presets": [_preset()]})
        self.assertFalse(result.has_errors)

    def test_invalid_user_library(self):
        result = validate_user_library("not a dict")
        self.assertTrue(result.has_errors)


if __name__ == "__main__":
    unittest.main()
