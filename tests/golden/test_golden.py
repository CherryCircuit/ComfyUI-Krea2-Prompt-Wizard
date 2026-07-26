"""Golden prompt tests.

These tests run the wizard against fixed inputs and verify the
deterministic compiled output. They form a regression guard against
unintended changes to the weighting or category ordering.
"""
from __future__ import annotations

import json
import os
import sys
import unittest

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = os.path.dirname(THIS_DIR)
ROOT = os.path.dirname(TESTS_DIR)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if TESTS_DIR not in sys.path:
    sys.path.insert(0, TESTS_DIR)

from src.compiler import compile_state
from src.wizard import add_row, empty_state
from src.library import load_library

GOLDEN_DIR = os.path.join(THIS_DIR, "golden")


def _lib():
    return load_library(
        bundled_path=os.path.join(ROOT, "presets", "default_library.json"),
        user_path=None,
    )


def _by_id(lib):
    return {p["id"]: p for p in lib.presets if isinstance(p, dict)}


def _state_from_spec(spec):
    """Build a wizard state from a list of {preset_id, intensity} rows."""
    state = empty_state()
    state["base_prompt"] = spec.get("base_prompt", "")
    lib = _lib()
    presets = _by_id(lib)
    for row in spec.get("rows", []):
        pid = row.get("preset_id")
        if pid in presets:
            add_row(state, presets[pid], intensity=row.get("intensity", 50))
    return state, lib


def _normalize(prompt):
    return " ".join(prompt.split())


def _assert_golden(test_case, name, result):
    with open(os.path.join(GOLDEN_DIR, name), "r", encoding="utf-8") as f:
        expected = json.load(f)
    test_case.assertEqual(result.final_prompt, expected["final_prompt"])
    test_case.assertEqual(result.plain_prompt, expected["plain_prompt"])


class HappyAndShockedTest(unittest.TestCase):
    """The first golden test from the spec.

    Happy +60, Shocked +85, Outer Brow Raiser +70, Wide Open Eyes +80,
    Open-Mouth Shout +45.
    """

    def test_happy_and_shocked(self):
        spec = {
            "base_prompt": "",
            "rows": [
                {"preset_id": "emotion.happiness", "intensity": 60},
                {"preset_id": "emotion.shock", "intensity": 85},
                {"preset_id": "face.outer_brow_raiser", "intensity": 70},
                {"preset_id": "face.upper_eyelid_raiser", "intensity": 80},
                {"preset_id": "mouth.shouting", "intensity": 45},
            ],
        }
        state, lib = _state_from_spec(spec)
        result = compile_state(state, lib)
        _assert_golden(self, "happy_and_shocked.json", result)
        self.assertIn("(happiness:", result.final_prompt)
        self.assertIn("(shocked expression:", result.final_prompt)
        self.assertIn("(outer brow raiser:", result.final_prompt)
        self.assertIn("(raised upper eyelids:", result.final_prompt)
        self.assertIn("(shouting:", result.final_prompt)
        # The order: base, body, emotion, face, mouth.
        emotion_idx = result.final_prompt.find("happiness")
        face_idx = result.final_prompt.find("outer brow")
        mouth_idx = result.final_prompt.find("shouting")
        self.assertLess(emotion_idx, face_idx)
        self.assertLess(face_idx, mouth_idx)


class SadAndAngryTest(unittest.TestCase):
    def test_sad_and_angry(self):
        spec = {
            "base_prompt": "",
            "rows": [
                {"preset_id": "emotion.sadness", "intensity": 80},
                {"preset_id": "emotion.anger", "intensity": 35},
                {"preset_id": "face.brow_lowerer", "intensity": 65},
                {"preset_id": "face.clenched_jaw", "intensity": 45},
            ],
        }
        state, lib = _state_from_spec(spec)
        result = compile_state(state, lib)
        _assert_golden(self, "sad_and_angry.json", result)
        self.assertIn("(sadness:", result.final_prompt)
        self.assertIn("(anger:", result.final_prompt)
        self.assertIn("(brow lowerer:", result.final_prompt)
        self.assertIn("(clenched jaw:", result.final_prompt)


class MultipleLightingEffectsTest(unittest.TestCase):
    def test_multiple_lighting_effects(self):
        spec = {
            "base_prompt": "",
            "rows": [
                {"preset_id": "lighting_setup.soft_diffused_lighting", "intensity": 30},
                {"preset_id": "lighting_direction.strong_backlighting", "intensity": 70},
                {"preset_id": "lighting_direction.rim_lighting", "intensity": 45},
                {"preset_id": "lighting_effect.cinematic_light_halation", "intensity": 55},
                {"preset_id": "atmosphere.dense_cinematic_fog", "intensity": 20},
            ],
        }
        state, lib = _state_from_spec(spec)
        result = compile_state(state, lib)
        _assert_golden(self, "lighting.json", result)
        self.assertIn("soft diffused lighting", result.final_prompt)
        self.assertIn("strong backlighting", result.final_prompt)
        self.assertIn("rim lighting", result.final_prompt)
        self.assertIn("cinematic light halation", result.final_prompt)
        self.assertIn("dense cinematic fog", result.final_prompt)


class CameraConfigurationTest(unittest.TestCase):
    def test_camera_configuration(self):
        spec = {
            "base_prompt": "",
            "rows": [
                {"preset_id": "framing.close_up", "intensity": 55},
                {"preset_id": "angle.low_angle", "intensity": 30},
                {"preset_id": "perspective.forced_perspective", "intensity": 75},
                {"preset_id": "lens.24mm_wide", "intensity": 35},
                {"preset_id": "aperture.f18", "intensity": 20},
                {"preset_id": "camera_body.arri_alexa_35", "intensity": 15},
                {"preset_id": "lens_family.cooke_s4", "intensity": 25},
                {"preset_id": "composition.asymmetrical_composition", "intensity": 50},
            ],
        }
        state, lib = _state_from_spec(spec)
        result = compile_state(state, lib)
        _assert_golden(self, "camera.json", result)
        self.assertIn("close-up", result.final_prompt)
        self.assertIn("low angle", result.final_prompt)
        self.assertIn("forced perspective", result.final_prompt)
        self.assertIn("24mm wide", result.final_prompt)
        self.assertIn("f/1.8", result.final_prompt)
        self.assertIn("ARRI Alexa 35", result.final_prompt)
        self.assertIn("Cooke S4", result.final_prompt)
        self.assertIn("asymmetrical composition", result.final_prompt)


class DeterministicRegressionTests(unittest.TestCase):
    def test_happy_and_shocked_deterministic(self):
        spec = {
            "rows": [
                {"preset_id": "emotion.happiness", "intensity": 60},
                {"preset_id": "emotion.shock", "intensity": 85},
            ],
        }
        state, lib = _state_from_spec(spec)
        a = compile_state(state, lib)
        b = compile_state(state, lib)
        self.assertEqual(a.final_prompt, b.final_prompt)


if __name__ == "__main__":
    unittest.main()
