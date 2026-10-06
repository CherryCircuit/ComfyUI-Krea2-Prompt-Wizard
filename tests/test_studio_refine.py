"""Tests for the Prompt Studio refiner: harness, remote client, settings, node."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

from src.studio import refine_prompts
from src.studio import refine_remote
from src.studio import refine_settings
from src.studio.nodes import Krea2PromptWizardV2, parse_refined
from src.studio.presets import Preset, PresetStore


def _fake_folder_paths(user_dir):
    module = types_module()
    module.get_user_directory = lambda: user_dir
    return module


def types_module():
    import types

    return types.ModuleType("folder_paths")


class HarnessTests(unittest.TestCase):
    def test_chatml_wraps_turns_and_prefills(self):
        prompt = refine_prompts.chatml("SYS", "MSG")
        self.assertIn("<|im_start|>system\nSYS<|im_end|>", prompt)
        self.assertIn("<|im_start|>user\nMSG<|im_end|>", prompt)
        self.assertTrue(prompt.endswith("<|im_start|>assistant\n<think>\n\n</think>\n\n{"))

    def test_reply_tokens_clamps(self):
        self.assertEqual(refine_prompts.reply_tokens(10), refine_prompts.MIN_PREDICT)
        self.assertEqual(refine_prompts.reply_tokens(999999), refine_prompts.MAX_PREDICT)
        self.assertEqual(refine_prompts.reply_tokens("junk"), refine_prompts.NUM_PREDICT)

    def test_json_object_strips_think_and_fence(self):
        content = "<think>hmm</think>\n```json\n{\"prompt\": \"a cat\"}\n```"
        self.assertEqual(refine_prompts.json_object(content), {"prompt": "a cat"})

    def test_json_object_finds_embedded_object(self):
        content = 'Here is your rewrite:\n{"prompt": "a cat"} hope it helps'
        self.assertEqual(refine_prompts.json_object(content), {"prompt": "a cat"})

    def test_json_object_refuses_prose(self):
        with self.assertRaises(refine_prompts.RefineError):
            refine_prompts.json_object("no json here at all")

    def test_parse_reply_extracts_prompt(self):
        self.assertEqual(
            refine_prompts.parse_reply('{"prompt": "  a fox  "}'), "a fox"
        )

    def test_parse_reply_refuses_empty(self):
        with self.assertRaises(refine_prompts.RefineError):
            refine_prompts.parse_reply('{"prompt": "   "}')

    def test_dropped_quotes_reports_missing_render_text(self):
        request = 'A sign that says "OPEN" hangs on the door.'
        self.assertEqual(refine_prompts.dropped_quotes(request, "A sign hangs on the door."), ["OPEN"])
        self.assertEqual(refine_prompts.dropped_quotes(request, 'A sign that says "open!" hangs there.'), [])

    def test_stray_quotes_flags_invented_quotes_only(self):
        request = "a woman in a red coat"
        written = 'She wears a "red coat" in the snow.'
        self.assertEqual(refine_prompts.stray_quotes(request, written), ["red coat"])
        preserved = 'A sign reads "OPEN" in the window.'
        request2 = 'A sign reads "OPEN" in the window.'
        self.assertEqual(refine_prompts.stray_quotes(request2, preserved), [])

    def test_check_combines_both_quote_problems(self):
        request = 'A sign says "STOP".'
        written = "He says \"go\" instead."
        problems = refine_prompts.check(request, written)
        self.assertEqual(len(problems), 2)
        self.assertIn("STOP", problems[0])
        self.assertIn("go", problems[1])

    def test_check_clean_rewrite_passes(self):
        self.assertEqual(refine_prompts.check("a fox in snow", "An orange fox walks through deep snow."), [])


class RemoteUrlTests(unittest.TestCase):
    def test_normalize_strips_endpoint_tails(self):
        self.assertEqual(
            refine_remote.normalize_url("http://localhost:1234/v1/chat/completions"),
            "http://localhost:1234/v1",
        )
        self.assertEqual(
            refine_remote.normalize_url("http://x:1234/v1/"),
            "http://x:1234/v1",
        )

    def test_normalize_refuses_non_http(self):
        with self.assertRaises(refine_remote.ConfigError):
            refine_remote.normalize_url("file:///etc/passwd")

    def test_normalize_empty_is_empty(self):
        self.assertEqual(refine_remote.normalize_url("   "), "")


class RemoteCredentialTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        patcher = mock.patch.dict(sys.modules, {"folder_paths": _fake_folder_paths(self.tmp)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_key_is_bound_to_url(self):
        refine_remote.configure("http://localhost:1234/v1", key="sk-test")
        self.assertEqual(refine_remote.status(), {"url": "http://localhost:1234/v1", "key_set": True})
        # Moving the URL without a new key drops the credential.
        refine_remote.configure("http://192.168.1.10:1234/v1")
        self.assertEqual(refine_remote.status(), {"url": "http://192.168.1.10:1234/v1", "key_set": False})

    def test_status_never_returns_the_key(self):
        refine_remote.configure("http://localhost:1234/v1", key="sk-secret")
        self.assertNotIn("sk-secret", json.dumps(refine_remote.status()))

    def test_key_refused_without_url(self):
        with self.assertRaises(refine_remote.ConfigError):
            refine_remote.configure("", key="sk-x")

    def test_key_with_control_characters_refused(self):
        with self.assertRaises(refine_remote.ConfigError):
            refine_remote.configure("http://localhost:1234/v1", key="sk\nx")

    def test_key_file_is_json_on_disk(self):
        refine_remote.configure("http://localhost:1234/v1", key="sk-on-disk")
        path = os.path.join(self.tmp, refine_remote.FILE)
        with open(path, "r", encoding="utf-8") as handle:
            stored = json.load(handle)
        self.assertEqual(stored["key"], "sk-on-disk")


class RemoteHeaderTests(unittest.TestCase):
    def test_key_never_rides_plain_http_to_remote_hosts(self):
        with self.assertRaises(refine_prompts.RefineError):
            refine_remote._headers("http://api.example.com/v1", "sk-x")

    def test_key_allowed_over_https(self):
        headers = refine_remote._headers("https://api.example.com/v1", "sk-x")
        self.assertEqual(headers["Authorization"], "Bearer sk-x")

    def test_key_allowed_to_loopback_http(self):
        headers = refine_remote._headers("http://localhost:1234/v1", "sk-x")
        self.assertEqual(headers["Authorization"], "Bearer sk-x")

    def test_scrub_blots_the_key(self):
        self.assertEqual(refine_remote._scrub("bad key sk-x leaked", "sk-x"), "bad key ••• leaked")


class RemoteNegotiationTests(unittest.TestCase):
    def test_adapt_drops_refused_parameter(self):
        payload = {"temperature": 0.3, "seed": 5}
        change = refine_remote.adapt("Unsupported parameter: 'seed'", payload)
        self.assertEqual(change, "seed")
        self.assertNotIn("seed", payload)
        self.assertIn("temperature", payload)

    def test_adapt_renames_max_tokens(self):
        payload = {"max_tokens": 512}
        change = refine_remote.adapt("use max_completion_tokens, not max_tokens", payload)
        self.assertEqual(change, "max_tokens -> max_completion_tokens")
        self.assertEqual(payload["max_completion_tokens"], 512)

    def test_adapt_refuses_unrelated_parameters(self):
        payload = {"temperature": 0.3}
        self.assertIsNone(refine_remote.adapt("Invalid model name 'nope'", payload))

    def test_messages_shape(self):
        turns = refine_remote.messages("SYS", "MSG")
        self.assertEqual(turns[0]["role"], "system")
        self.assertEqual(turns[1]["role"], "user")

    def test_content_reads_choices_and_detects_thinking(self):
        body = {"choices": [{"message": {"reasoning": "thinking...", "content": "hi"},
                             "finish_reason": "stop"}]}
        content, finish, thought = refine_remote._content(body)
        self.assertEqual((content, finish, thought), ("hi", "stop", True))

    def test_content_joins_part_lists(self):
        body = {"choices": [{"message": {"content": [{"text": "a"}, {"text": "b"}]}}]}
        self.assertEqual(refine_remote._content(body)[0], "ab")


class RefineSettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        patcher = mock.patch.dict(os.environ, {"COMFYUI_USER_DIR": self.tmp})
        patcher.start()
        self.addCleanup(patcher.stop)
        # Drop any cached file state between tests.
        import importlib

        importlib.reload(refine_settings)

    def test_defaults_when_missing(self):
        settings = refine_settings.load_settings()
        self.assertEqual(settings["backend"], "local")
        self.assertEqual(settings["seed"], -1)
        self.assertEqual(settings["max_tokens"], refine_prompts.DEFAULT_MAX_TOKENS)

    def test_roundtrip_and_coercion(self):
        stored = refine_settings.save_settings(
            {"backend": "remote", "remote_model": "qwen3", "temperature": "0.55",
             "seed": 7, "max_tokens": 99, "nonsense": "dropped"}
        )
        self.assertEqual(stored["backend"], "remote")
        self.assertEqual(stored["temperature"], 0.55)
        # max_tokens 99 clamps up to the floor.
        self.assertEqual(stored["max_tokens"], refine_prompts.MIN_PREDICT)
        self.assertNotIn("nonsense", stored)
        again = refine_settings.load_settings()
        self.assertEqual(again["remote_model"], "qwen3")
        self.assertEqual(again["backend"], "remote")


class RefineRunTests(unittest.TestCase):
    def setUp(self):
        self.store = PresetStore(
            [
                Preset(id="scene_tavern", name="TAVERN", category="scene",
                       prompt="A tavern.", negative=""),
            ]
        )

    def _run(self, body, chat):
        from src.studio import refine_api

        with mock.patch.object(refine_api, "get_store", lambda: self.store), \
             mock.patch("src.studio.refine_local.chat", chat), \
             mock.patch("src.studio.refine_remote.chat", chat), \
             mock.patch.object(refine_settings, "load_settings",
                               lambda: dict(refine_settings.DEFAULTS, model="enc.bin")):
            return refine_api.run_refine(body)

    def test_run_compiles_section_and_returns_draft(self):
        def chat(model, system, message, **kwargs):
            self.assertEqual(model, "enc.bin")
            self.assertIn("A tavern.", message)
            return '{"prompt": "A crowded tavern at dusk."}'

        result = self._run({"doc": "{{krea2:scene_tavern|TAVERN}}", "section": "prompt"}, chat)
        self.assertEqual(result["body"], "A crowded tavern at dusk.")
        self.assertEqual(result["source"], "A tavern.")
        self.assertEqual(result["model"], "enc.bin")
        self.assertEqual(result["problems"], [])

    def test_run_reports_dropped_quotes(self):
        def chat(model, system, message, **kwargs):
            return '{"prompt": "A sign hangs by the door."}'

        doc = 'A sign that reads "{{krea2:scene_tavern|TAVERN}}" hangs by the door.'
        result = self._run({"doc": doc, "section": "prompt"}, chat)
        self.assertTrue(any("quotes" in problem for problem in result["problems"]))

    def test_run_refuses_empty_section(self):
        with self.assertRaises(refine_prompts.RefineError):
            self._run({"doc": "   ", "section": "prompt"}, lambda *a, **k: "")

    def test_run_refuses_last_prompt_without_frames(self):
        with self.assertRaises(refine_prompts.RefineError):
            self._run({"doc": "plain text", "section": "last_prompt"}, lambda *a, **k: "")


class NodeRefinedDocTests(unittest.TestCase):
    def _node(self):
        return Krea2PromptWizardV2()

    def _store(self):
        return PresetStore(
            [Preset(id="scene_tavern", name="TAVERN", category="scene",
                    prompt="A tavern.", negative="bugs")]
        )

    def test_parse_refined_tolerant(self):
        self.assertEqual(parse_refined(""), {})
        self.assertEqual(parse_refined("not json"), {})
        self.assertEqual(parse_refined('{"prompt": {"body": ""}}'), {})
        parsed = parse_refined(
            json.dumps({"prompt": {"body": "B", "enabled": False, "model": "m", "source": "s"},
                        "junk": {"body": "x"}})
        )
        self.assertEqual(set(parsed), {"prompt"})
        self.assertFalse(parsed["prompt"]["enabled"])
        self.assertEqual(parsed["prompt"]["model"], "m")

    def test_enabled_draft_replaces_prompt_output(self):
        refined = json.dumps({"prompt": {"body": "Refined prose.", "enabled": True,
                                         "model": "enc", "source": "A tavern."}})
        with mock.patch("src.studio.nodes.get_store", lambda: self._store()):
            prompt, negative, raw, last, last_neg = self._node().build(
                prompt_doc="{{krea2:scene_tavern|TAVERN}}", refined_doc=refined
            )
        self.assertEqual(prompt, "Refined prose.")
        # Negatives are never the draft's: they stay the presets' own.
        self.assertEqual(negative, "bugs")
        self.assertEqual(raw, "[TAVERN]")
        self.assertEqual(last, "")

    def test_disabled_draft_queues_user_text(self):
        refined = json.dumps({"prompt": {"body": "Refined prose.", "enabled": False}})
        with mock.patch("src.studio.nodes.get_store", lambda: self._store()):
            prompt, _negative, _raw, _last, _last_neg = self._node().build(
                prompt_doc="{{krea2:scene_tavern|TAVERN}}", refined_doc=refined
            )
        self.assertEqual(prompt, "A tavern.")

    def test_last_prompt_draft_applies_only_in_frames_mode(self):
        refined = json.dumps({"last_prompt": {"body": "Refined last.", "enabled": True}})
        doc = "{{krea2:scene_tavern|TAVERN}}{{frame:last}}Dusk."
        with mock.patch("src.studio.nodes.get_store", lambda: self._store()):
            prompt, _neg, raw, last, _ln = self._node().build(
                prompt_doc=doc, refined_doc=refined
            )
        self.assertIn("[LAST FRAME]", raw)
        self.assertIn("Refined last.", last)
        self.assertNotIn("Refined last.", prompt)


if __name__ == "__main__":
    unittest.main()
