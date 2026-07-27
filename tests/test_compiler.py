"""Tests for the compiler module."""
from __future__ import annotations

import json
import unittest

from src.compiler import compile_state, compile_state_json
from src.wizard import add_row, empty_state
from src.library import load_library

from tests import load_default_library


def _lib():
    return load_library(
        bundled_path=__import__("os").path.join(
            __import__("os").path.dirname(__import__("os").path.dirname(__file__)),
            "presets",
            "default_library.json",
        ),
        user_path=None,
    )


def _by_id(lib):
    return {p["id"]: p for p in lib.presets if isinstance(p, dict)}


class CompilerTests(unittest.TestCase):
    def test_direct_negative_strength_is_emitted_exactly(self):
        state = empty_state()
        state["rows"] = [{
            "id": "direct_strength",
            "category": "custom",
            "preset_id": "custom.direct",
            "label": "Direct",
            "phrase": "soft rim light",
            "intensity": 0,
            "strength": -1.25,
            "control_mode": "scalar",
            "enabled": True,
        }]
        result = compile_state(state, _lib())
        self.assertEqual(result.final_prompt, "(soft rim light:-1.25)")

    def test_empty_state(self):
        state = empty_state()
        lib = _lib()
        result = compile_state(state, lib)
        self.assertEqual(result.final_prompt, "")
        self.assertEqual(result.plain_prompt, "")

    def test_basic_compile(self):
        state = empty_state()
        state["base_prompt"] = "A studio portrait"
        lib = _lib()
        presets = _by_id(lib)
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
        result = compile_state(state, lib)
        self.assertIn("A studio portrait", result.final_prompt)
        self.assertIn("shocked expression", result.plain_prompt)
        if "emotion.shock" in presets:
            self.assertIn("(shocked expression:", result.final_prompt)

    def test_no_double_weighting(self):
        """A user-supplied custom phrase containing (x:1.5) is not double-weighted."""
        state = empty_state()
        state["rows"].append({
            "id": "r1",
            "category": "custom",
            "preset_id": "custom.x",
            "phrase": "(my phrase:1.5)",
            "intensity": 50,
            "control_mode": "scalar",
            "enabled": True,
        })
        lib = _lib()
        result = compile_state(state, lib)
        # The compiler strips the embedded weighting before re-weighting.
        self.assertNotIn("(my phrase:1.5:", result.final_prompt)
        self.assertIn("my phrase", result.plain_prompt)

    def test_category_ordering(self):
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        # Add a row from each category in reversed order.
        for pid in ["custom.custom_phrase", "style.cinematic_film_still", "framing.close_up", "emotion.shock"]:
            if pid in presets:
                add_row(state, presets[pid], intensity=50)
        result = compile_state(state, lib)
        # The order in the final prompt should be: base, body, emotion, framing, style, custom.
        body_idx = result.final_prompt.lower().find("shocked expression")
        framing_idx = result.final_prompt.lower().find("close-up")
        style_idx = result.final_prompt.lower().find("cinematic")
        if body_idx >= 0 and framing_idx >= 0 and style_idx >= 0:
            self.assertLess(body_idx, framing_idx)
            self.assertLess(framing_idx, style_idx)

    def test_disable_row(self):
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
            state["rows"][0]["enabled"] = False
        result = compile_state(state, lib)
        self.assertNotIn("shocked", result.final_prompt)

    def test_dedupe_emotion(self):
        """Identical weighted fragments are deduplicated within emotion."""
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
            add_row(state, presets["emotion.shock"], intensity=75)
        result = compile_state(state, lib)
        # Two rows with the same intensity and same phrase produce the
        # same fragment, which is deduped.
        self.assertEqual(result.final_prompt.count("shocked expression"), 1)

    def test_different_intensities_preserved(self):
        """Rows with the same phrase but different intensities are kept."""
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
            add_row(state, presets["emotion.shock"], intensity=85)
        result = compile_state(state, lib)
        # Different intensities produce different fragments.
        self.assertEqual(result.final_prompt.count("shocked expression"), 2)

    def test_bipolar_row(self):
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        for p in presets.values():
            if p.get("control_mode") == "bipolar":
                add_row(state, p, intensity=80)
                break
        result = compile_state(state, lib)
        # Just make sure compile runs without error.
        self.assertIsInstance(result.final_prompt, str)

    def test_compile_state_json_roundtrip(self):
        state = empty_state()
        state["base_prompt"] = "hello"
        lib = _lib()
        result = compile_state_json(state, lib)
        self.assertIn("final_prompt", result)
        json.dumps(result)

    def test_conflict_warnings_present(self):
        state = empty_state()
        lib = _lib()
        presets = _by_id(lib)
        if "framing.extreme_close_up" in presets and "framing.wide_establishing_shot" in presets:
            add_row(state, presets["framing.extreme_close_up"], intensity=70)
            add_row(state, presets["framing.wide_establishing_shot"], intensity=70)
        result = compile_state(state, lib)
        self.assertTrue(any(w["code"].startswith("shot_size") for w in result.warnings))


class DeterministicTests(unittest.TestCase):
    def test_same_state_same_output(self):
        state = empty_state()
        state["base_prompt"] = "deterministic"
        lib = _lib()
        presets = _by_id(lib)
        if "emotion.shock" in presets:
            add_row(state, presets["emotion.shock"], intensity=75)
        result1 = compile_state(state, lib)
        result2 = compile_state(state, lib)
        self.assertEqual(result1.final_prompt, result2.final_prompt)
        self.assertEqual(result1.trace, result2.trace)


if __name__ == "__main__":
    unittest.main()
