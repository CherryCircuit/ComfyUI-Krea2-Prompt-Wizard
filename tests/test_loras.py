"""Tests for the per-character LoRA pipeline and the Prompt Saver node."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from src.nodes import Krea2PromptSaver, Krea2PromptWizard


class LoRATests(unittest.TestCase):
    def test_loras_without_model_emit_a_warning_and_none_model(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "enabled": True,
                        "lora_name": "style_test.safetensors",
                        "lora_strength": 0.8,
                    }
                ],
            }
        )
        result = Krea2PromptWizard().build(state)
        self.assertEqual(result["result"][2], None)
        self.assertIn("scene", result["result"][0])

    def test_loras_without_assignments_pass_the_model_through(self):
        state = json.dumps({"base_prompt": "scene", "rows": [], "characters": []})
        sentinel = object()
        result = Krea2PromptWizard().build(state, model=sentinel)
        self.assertIs(result["result"][2], sentinel)

    def test_loras_with_model_and_missing_comfy_are_graceful(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "enabled": True,
                        "lora_name": "style_test.safetensors",
                    }
                ],
            }
        )
        sentinel = object()
        result = Krea2PromptWizard().build(state, model=sentinel)
        self.assertIs(result["result"][2], sentinel)

    def test_lora_strength_is_clamped_by_coerce(self):
        from src.wizard import coerce_state

        state = coerce_state(
            {
                "characters": [
                    {"id": "c1", "name": "Mara", "lora_strength": 99, "lora_name": "x.safetensors"}
                ]
            }
        )
        self.assertEqual(state["characters"][0]["lora_strength"], 2.0)

    def test_disabled_characters_do_not_apply_loras(self):
        state = json.dumps(
            {
                "base_prompt": "scene",
                "rows": [],
                "characters": [
                    {
                        "id": "c1",
                        "name": "Mara",
                        "enabled": False,
                        "lora_name": "style_test.safetensors",
                    }
                ],
            }
        )
        sentinel = object()
        result = Krea2PromptWizard().build(state, model=sentinel)
        self.assertIs(result["result"][2], sentinel)


class PromptSaverTests(unittest.TestCase):
    def test_records_prompt_to_history_log(self):
        saver = Krea2PromptSaver()
        with tempfile.TemporaryDirectory() as tmp:
            history = os.path.join(tmp, "history.jsonl")
            with patch("src.user_paths.output_history_path", return_value=history) as path_mock:
                out = saver.record("a perfect prompt", motion_prompt="Mara moves")
            self.assertEqual(out, ("a perfect prompt",))
            path_mock.assert_called_once()
            with open(history, "r", encoding="utf-8") as handle:
                lines = handle.read().splitlines()
            self.assertEqual(len(lines), 1)
            entry = json.loads(lines[0])
            self.assertEqual(entry["prompt"], "a perfect prompt")
            self.assertEqual(entry["motion_prompt"], "Mara moves")
            self.assertIn("timestamp", entry)

    def test_reasserts_metadata_keys(self):
        saver = Krea2PromptSaver()
        metadata = {}
        with tempfile.TemporaryDirectory() as tmp:
            history = os.path.join(tmp, "history.jsonl")
            with patch("src.user_paths.output_history_path", return_value=history):
                saver.record("prompt text", motion_prompt="motion text", extra_pnginfo=metadata)
        self.assertEqual(metadata.get("krea2_prompt"), "prompt text")
        self.assertEqual(metadata.get("krea2_motion_prompt"), "motion text")


if __name__ == "__main__":
    unittest.main()
