"""CPU-only parity checks against the pinned installed KJNodes implementation."""
import copy
import json
import math
import sys
from pathlib import Path
import re
import types
import unittest
from unittest.mock import patch
import torch
from src import krea2_weighting as native
from src.nodes import Krea2PromptWizard


class Clip:
    def __init__(self, visible=None):
        self.visible = visible
        self.encoded = []

    def tokenize(self, text):
        ids = [151644, 872, 198] + [ord(c) for c in text] + [151645]
        return {"qwen": [[(i, 1.0) for i in ids]]}

    def encode_from_tokens_scheduled(self, tokens):
        ids = tokens["qwen"][0]
        self.encoded.append(ids)
        return [[torch.zeros(1, self.visible if self.visible is not None else len(ids), 2), {}]]


class Model:
    def __init__(self):
        attn = types.SimpleNamespace(**{k: None for k in ("wq", "wk", "wv", "gate", "heads", "kvheads", "qknorm", "wo")})
        self.diffusion = types.SimpleNamespace(blocks=[types.SimpleNamespace(attn=attn)])
        self.model_options = {"transformer_options": {"existing": "retained"}}
        self.object_patches = {}

    def clone(self):
        return copy.deepcopy(self)

    def get_model_object(self, key):
        return self.diffusion

    def add_object_patch(self, name, value):
        self.object_patches[name] = value


class NativeWeightingTests(unittest.TestCase):
    def test_cache_hook_accepts_all_declared_inputs(self):
        schema = Krea2PromptWizard.INPUT_TYPES()
        inputs = {"wizard_state_json": json.dumps({"base_prompt": "red"}),
                  "expert_mode": False, "model": Model(), "clip": Clip(),
                  "extra_pnginfo": {"workflow": {"nodes": []}}}
        declared = set(schema["required"]) | set(schema["optional"]) | set(schema["hidden"])
        self.assertEqual(set(inputs), declared)
        self.assertEqual(Krea2PromptWizard.IS_CHANGED(**inputs), inputs["wizard_state_json"])
        inputs["wizard_state_json"] = json.dumps({"randomize_on_job": {"lighting": True}})
        self.assertTrue(math.isnan(Krea2PromptWizard.IS_CHANGED(**inputs)))

    def test_flat_parser_exact_grammar(self):
        clean, terms = native.parse_weighted_text("(red:-.5) (blue:0) (green:1.5) (a:+2) (b: 2)")
        self.assertEqual(terms, [("red", -.5), ("blue", 0), ("green", 1.5)])
        self.assertEqual(clean, "red blue green (a:+2) (b: 2)")

    def test_weight_ranges_clone_and_original_unchanged(self):
        for weight in (0, 1, -1, .25, 2):
            with self.subTest(weight=weight):
                model, clip = Model(), Clip()
                out, cond, details = native.encode_native(clip, model, f"(red:{weight})", 1)
                factor = 1 if weight > 1 else weight
                bias = (weight - 1) * 2 if weight > 1 else 0
                self.assertEqual(details["token_weights"], [(i, factor, bias) for i in (3, 4, 5)])
                self.assertIsNot(out, model)
                self.assertEqual(model.model_options, {"transformer_options": {"existing": "retained"}})
                self.assertEqual(model.object_patches, {})
                self.assertEqual(len(out.object_patches), 1)
                self.assertEqual(cond[0][0].shape[1], 7)

    def test_repeats_all_occurrences_and_duplicate_pairs(self):
        out, _, info = native.encode_native(Clip(), Model(), "(red:.5) red (red:2)")
        pairs = info["token_weights"]
        self.assertEqual([p[0] for p in pairs[:8]], [6, 7, 8, 9, 10, 11, 12, 13])
        self.assertEqual(len(pairs), 16)
        self.assertTrue(any("Repeated" in w for w in info["warnings"]))

    def test_zero_and_no_match_bypass(self):
        model = Model()
        out, _, _ = native.encode_native(Clip(), model, "(red:2)", 0)
        self.assertIsNot(out, model)
        out, _, info = native.encode_native(Clip(visible=1), model, "(red:2)")
        self.assertIs(out, model)
        self.assertTrue(info["warnings"])

    def test_partial_truncation_alignment(self):
        _, _, info = native.encode_native(Clip(visible=3), Model(), "(red:2)")
        self.assertEqual(info["token_weights"], [(0, 1., 2.), (1, 1., 2.)])
        self.assertTrue(any("truncated" in w for w in info["warnings"]))

    def test_unsupported_syntax_and_previous_patch_warning(self):
        model = Model()
        model.model_options["transformer_options"]["krea2_token_weights"] = [(3, .5, 0)]
        _, _, info = native.encode_native(Clip(), model, "(red:+2)")
        self.assertEqual(info["encoded_text"], "(red:+2)")
        self.assertEqual(len(info["warnings"]), 2)

    def test_actionable_required_inputs_and_architecture(self):
        for clip, model in ((None, Model()), (Clip(), None), (Clip(), object())):
            with self.assertRaisesRegex(ValueError, "Native weighting requires"):
                native.encode_native(clip, model, "red")

    def test_plain_encode_strips_annotations_and_requires_clip(self):
        clip = Clip()
        cond, details = native.encode_plain(clip, "(red:2) blue")
        self.assertEqual(details["enabled"], False)
        self.assertEqual(details["encoded_text"], "red blue")
        self.assertEqual(details["token_weights"], [])
        self.assertEqual(details["warnings"], [])
        self.assertEqual(len(clip.encoded), 1)
        self.assertEqual(cond[0][0].shape[1], 12)
        with self.assertRaisesRegex(ValueError, "requires a CLIP"):
            native.encode_plain(None, "red")

    def test_clip_without_weighting_encodes_plain_conditioning(self):
        model, clip = Model(), Clip()
        result = Krea2PromptWizard().build(json.dumps({"base_prompt": "(red:2) blue"}), model=model, clip=clip)
        self.assertEqual(Krea2PromptWizard.RETURN_TYPES, ("STRING", "STRING", "MODEL", "CONDITIONING"))
        self.assertEqual(Krea2PromptWizard.RETURN_NAMES[:3], ("Prompt Output", "Video Motion Prompt", "Model"))
        self.assertIs(result["result"][2], model)
        conditioning = result["result"][3]
        self.assertIsNotNone(conditioning)
        self.assertIsInstance(conditioning, list)
        self.assertEqual(len(clip.encoded), 1)
        self.assertEqual(result["ui"]["krea2_encoded_prompt"], ["red blue"])
        trace = json.loads(result["ui"]["krea2_trace"][0])["native_weighting"]
        self.assertEqual(trace["conditioning"], "plain")
        self.assertEqual(trace["encoded_text"], "red blue")
        self.assertFalse(trace["enabled"])

    def test_no_clip_leaves_conditioning_empty(self):
        result = Krea2PromptWizard().build(json.dumps({"base_prompt": "red"}))
        self.assertIsNone(result["result"][3])
        trace = json.loads(result["ui"]["krea2_trace"][0])["native_weighting"]
        self.assertEqual(trace["conditioning"], "none")

    def test_node_enable_errors_without_connections(self):
        with self.assertRaisesRegex(ValueError, "both Model and CLIP"):
            Krea2PromptWizard().build(json.dumps({"native_weighting_enabled": True}))

    def test_node_encoded_output_trace_and_metadata_preservation(self):
        model, clip = Model(), Clip()
        graph = {"original_graph": True}
        metadata = {"workflow": graph, "another_key": "keep"}
        result = Krea2PromptWizard().build(json.dumps({"base_prompt": "(red:2)",
            "native_weighting_enabled": True, "document_revision": 7}),
            model=model, clip=clip, extra_pnginfo=metadata)
        self.assertEqual(result["result"][0], "(red:2)")
        self.assertIsNot(result["result"][2], model)
        self.assertIsNotNone(result["result"][3])
        self.assertEqual(result["ui"]["krea2_encoded_prompt"], ["red"])
        self.assertEqual(result["ui"]["krea2_resolved_revision"], [7])
        native_trace = json.loads(result["ui"]["krea2_trace"][0])["native_weighting"]
        self.assertEqual(native_trace["encoded_text"], "red")
        self.assertEqual(native_trace["conditioning"], "native")
        self.assertIs(metadata["workflow"], graph)
        self.assertEqual(metadata["another_key"], "keep")
        self.assertNotIn("prompt", metadata)

    def test_plain_metadata_compatibility_emits_warning(self):
        metadata = {}
        result = Krea2PromptWizard().build(json.dumps({"base_prompt": "red", "prompt_metadata_override": True}), extra_pnginfo=metadata)
        self.assertEqual(metadata["prompt"], "red")
        self.assertTrue(any("graph metadata" in w for w in result["ui"]["krea2_warnings"]))

    def test_attention_forward_cpu_parity(self):
        source = Path(r"E:/ComfyUI_Feb2026/ComfyUI/custom_nodes/ComfyUI-KJNodes/nodes/model_optimization_nodes.py")
        if not source.exists():
            self.skipTest("Pinned local KJNodes source unavailable")
        text = source.read_text(encoding="utf-8")
        calls = []

        def attention(q, k, v, heads, mask=None, **kwargs):
            calls.append((v.clone(), mask.clone() if mask is not None else None))
            out = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=mask)
            return out.transpose(1, 2).reshape(out.shape[0], out.shape[2], -1)

        attention_module = types.ModuleType("comfy.ldm.modules.attention")
        attention_module.attention_pytorch = attention
        attention_module.optimized_attention = attention
        rope_module = types.ModuleType("comfy.ldm.flux.math")
        rope_module.apply_rope = lambda q, k, freqs: (q, k)
        modules = {"comfy.ldm.modules.attention": attention_module, "comfy.ldm.flux.math": rope_module}
        for name in ("comfy", "comfy.ldm", "comfy.ldm.modules", "comfy.ldm.flux"):
            modules[name] = types.ModuleType(name)
        namespace = {"types": types, "torch": torch,
                     "attention_pytorch": attention, "optimized_attention": attention}
        exec(text[text.index("def krea2_attn_forward_weight("):text.index("class Krea2PromptWeight:")], namespace)
        torch.manual_seed(82)
        x = torch.randn(1, 4, 4)
        attn = types.SimpleNamespace(heads=2, kvheads=1, wq=lambda t: t, wk=lambda t: t[..., :2],
                                     wv=lambda t: t[..., :2], gate=lambda t: t,
                                     qknorm=lambda q, k: (q, k), wo=lambda t: t)
        for weights in ([(1, .5, 0), (1, -.5, 0)], [(1, 1, 2), (1, 1, 4)], [(1, .5, 0), (2, 1, 2)], []):
            with self.subTest(weights=weights), patch.dict(sys.modules, modules):
                options = {"krea2_token_weights": weights}
                before = x.clone()
                expected = namespace["krea2_attn_forward_weight"](attn, x, freqs=True, transformer_options=options)
                actual = native.krea2_attn_forward_weight(attn, x, freqs=True, transformer_options=options)
                torch.testing.assert_close(actual, expected)
                torch.testing.assert_close(x, before)
                if weights == [(1, .5, 0), (1, -.5, 0)]:
                    torch.testing.assert_close(calls[-1][0][0, 0, 1], x[0, 1, :2] * -.25)
                if weights == [(1, 1, 2), (1, 1, 4)]:
                    self.assertEqual(calls[-1][1][0, 1].item(), 4)

    def test_installed_upstream_encoding_parity(self):
        source = Path(r"E:/ComfyUI_Feb2026/ComfyUI/custom_nodes/ComfyUI-KJNodes/nodes/model_optimization_nodes.py")
        if not source.exists():
            self.skipTest("Pinned local KJNodes source unavailable")
        text = source.read_text(encoding="utf-8")
        start = text.index("_QWEN_IM_START,")
        end = text.index("class SkipLayerGuidanceWanVideo:", start)
        namespace = {"types": types, "logging": types.SimpleNamespace(warning=lambda *a: None, info=lambda *a: None)}
        exec(text[start:end], namespace)
        for strength in (0, .2, 1, 4):
            for prompt in ("(red:-1) (blue:2)", "(red:.5) red (red:3)", "(red:1)", "(red: 2)"):
                with self.subTest(strength=strength, prompt=prompt):
                    expected, _ = namespace["Krea2PromptWeight"]().encode(Clip(), Model(), prompt, strength)
                    actual, _, _ = native.encode_native(Clip(), Model(), prompt, strength)
                    self.assertEqual(actual.model_options, expected.model_options)
                    self.assertEqual(list(actual.object_patches), list(expected.object_patches))


if __name__ == "__main__":
    unittest.main()
