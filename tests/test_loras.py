"""Tests for the per-character LoRA pipeline, the Prompt Saver node, and
the metadata-writing Save Image node."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from src import api as api_module
from src.nodes import Krea2PromptSaver, Krea2PromptWizard, Krea2SaveImage


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

    def test_compiled_prompt_has_no_lora_tags(self):
        # LoRAs are applied by the Krea2CharacterLoras hook node, never as
        # <lora:...> text tokens in the prompt.
        from src.compiler import compile_state
        from src.library import load_library

        state = {
            "base_prompt": "scene",
            "rows": [],
            "characters": [
                {
                    "id": "c1",
                    "name": "Mara",
                    "enabled": True,
                    "lora_name": "realism.safetensors",
                    "lora_strength": 0.8,
                    "loras": [{"filename": "realism.safetensors", "strength": 0.8}],
                }
            ],
        }
        result = compile_state(state, load_library())
        self.assertNotIn("<lora:", result.final_prompt)

    def test_character_lora_manifest_output(self):
        from src.nodes import _character_lora_json

        state = {
            "characters": [
                {
                    "id": "c1",
                    "name": "Mara",
                    "enabled": True,
                    "position": "standing on the left side",
                    "loras": [
                        {"filename": "woman_blonde.safetensors", "strength": 1.0},
                        {"filename": "realism.safetensors", "strength": 0.8},
                    ],
                },
                {"id": "c2", "name": "Ghost", "enabled": False, "loras": [{"filename": "x.safetensors", "strength": 1.0}]},
                {"id": "c3", "name": "Ivo", "enabled": True, "position": "on the right", "lora_name": "legacy.safetensors", "lora_strength": 1.25},
            ]
        }
        manifest = json.loads(_character_lora_json(state))
        self.assertEqual(len(manifest["characters"]), 2)
        self.assertEqual(manifest["characters"][0]["name"], "Mara")
        self.assertEqual(manifest["characters"][0]["position"], "standing on the left side")
        self.assertEqual(len(manifest["characters"][0]["loras"]), 2)
        self.assertEqual(manifest["characters"][1]["loras"], [{"filename": "legacy.safetensors", "strength": 1.25}])

    def test_regional_node_splits_segments_and_strips_tags(self):
        from src.nodes import Krea2CharacterLoras

        text = (
            "portrait, Character Mara: woman with blonde hair, (joy:1.5) <lora:woman_blonde:1.0>, "
            "Character Ivo: man in a trench coat <lora:man_trenchcoat:1.0>, Setting Street: rainy"
        )
        segments = Krea2CharacterLoras.split_segments(text)
        self.assertEqual(len(segments), 3)
        self.assertEqual(segments[0][1], None)
        self.assertEqual(segments[1][1], "mara")
        self.assertNotIn("<lora:", segments[1][0])
        self.assertNotIn("(joy:1.5)", segments[1][0])
        self.assertIn("joy", segments[1][0])
        self.assertIn("woman with blonde hair", segments[1][0])
        self.assertEqual(segments[2][1], "ivo")
        self.assertNotIn("<lora:", segments[2][0])

    def test_regional_node_skips_hooks_on_quantized_model(self):
        # GGUF / quantized models expose "...weight_scale" state-dict keys
        # that the hook patcher cannot resolve; the node must skip hooks
        # (never crash the sampler) and explain itself in the log.
        from src.nodes import Krea2CharacterLoras

        class FakeModelQ:
            def model_state_dict(self):
                return {"blocks.0.attn.to_q.weight_scale": object()}

        class FakeUtils:
            @staticmethod
            def load_torch_file(path, safe_load=True):
                return {"tensors": True}

            @staticmethod
            def get_attr(model, path):
                raise AttributeError("unresolvable on quantized model")

        class FakeFolderPaths:
            @staticmethod
            def get_full_path(folder, name):
                return "C:/loras/" + name

        class FakeTensor:
            def __init__(self, shape):
                self.shape = shape

            def __setitem__(self, key, value):
                pass

        class FakeTorch:
            float32 = "float32"

            @staticmethod
            def zeros(shape, dtype=None):
                return FakeTensor(shape)

        class FakeClip:
            def tokenize(self, text):
                return {"k": [[("tok", text)]]}

            def encode_from_tokens_scheduled(self, tokens):
                return [("cond", {"model_options": {}})] if isinstance(tokens, dict) else []

        class FakeHooks:
            class HookGroup:
                def __init__(self):
                    self.hooks = []

                def clone_and_combine(self, other):
                    self.hooks.append(other)
                    return self

            @staticmethod
            def create_hook_lora(lora=None, strength_model=1.0, strength_clip=0.0):
                return "hook"

            @staticmethod
            def set_hooks_for_conditioning(cond, hooks, append_hooks=True, cache=None):
                cond[0][1]["hooks"] = hooks
                return cond

        manifest = json.dumps({
            "characters": [{"name": "Mara", "position": "on the left",
                            "loras": [{"filename": "woman_blonde.safetensors", "strength": 1.0}]}]
        })
        text = "Character Mara: woman with blonde hair"

        fake_comfy = types.ModuleType("comfy")
        fake_comfy.hooks = FakeHooks()
        fake_comfy.utils = FakeUtils()
        node = Krea2CharacterLoras()
        with patch.dict(
            sys.modules,
            {
                "comfy": fake_comfy,
                "comfy.hooks": FakeHooks(),
                "comfy.utils": FakeUtils(),
                "torch": FakeTorch(),
                "folder_paths": FakeFolderPaths(),
            },
        ), patch("os.path.exists", return_value=True):
            conditioning, _model, log_text = node.encode(FakeModelQ(), FakeClip(), text, manifest, mask_size=8)

        self.assertIn("quantized", log_text)
        self.assertIn("matched but hooks were SKIPPED", log_text)
        self.assertNotIn("hooks", conditioning[0][1])

    def test_regional_node_region_selection(self):
        from src.nodes import Krea2CharacterLoras

        region = Krea2CharacterLoras.region_for
        self.assertEqual(region("standing on the left side of the frame", 0, 2), "left")
        self.assertEqual(region("standing on the right side", 0, 2), "right")
        self.assertEqual(region("in the centre", 0, 2), "center")
        self.assertEqual(region("", 0, 2), "left")
        self.assertEqual(region("", 1, 2), "right")
        self.assertEqual(region("", 0, 3), "left")
        self.assertEqual(region("", 1, 3), "center")
        self.assertEqual(region("", 2, 3), "right")

    def test_regional_node_builds_masks(self):
        from src.nodes import Krea2CharacterLoras

        class FakeTensor:
            def __init__(self, shape):
                self.shape = shape
                self._mask = [0.0] * (shape[2] * shape[3])

            def __setitem__(self, key, value):
                pass

            def __getitem__(self, key):
                return self

        class FakeTorch:
            float32 = "float32"

            @staticmethod
            def zeros(shape, dtype=None):
                return FakeTensor(shape)

        left = Krea2CharacterLoras._build_mask.__wrapped__("left", 8) if hasattr(Krea2CharacterLoras._build_mask, "__wrapped__") else None
        # _build_mask imports torch lazily; patch sys.modules and re-run.
        with patch.dict(sys.modules, {"torch": FakeTorch()}):
            mask = Krea2CharacterLoras._build_mask("left", 8)
        self.assertEqual(mask.shape, (1, 1, 8, 8))

    def test_regional_node_encode_attaches_hooks_and_masks(self):
        from src.nodes import Krea2CharacterLoras

        recorded = {}

        class FakeHooks:
            class HookGroup:
                def __init__(self):
                    self.hooks = ["h"]

                def clone_and_combine(self, other):
                    self.hooks = self.hooks + [other]
                    return self

            @staticmethod
            def create_hook_lora(lora=None, strength_model=1.0, strength_clip=0.0):
                return "hook:" + str(strength_model)

            @staticmethod
            def set_hooks_for_conditioning(cond, hooks, append_hooks=True, cache=None):
                cond[0][1]["hooks"] = hooks
                return cond

        class FakeUtils:
            @staticmethod
            def load_torch_file(path, safe_load=True):
                return {"tensors": True}

        class FakeFolderPaths:
            @staticmethod
            def get_full_path(folder, name):
                return "C:/loras/" + name if name == "woman_blonde.safetensors" else ""

        class FakeTensor:
            def __init__(self, shape):
                self.shape = shape

            def __setitem__(self, key, value):
                pass

        class FakeTorch:
            float32 = "float32"

            @staticmethod
            def zeros(shape, dtype=None):
                return FakeTensor(shape)

        class FakeClip:
            def tokenize(self, text):
                recorded["tokenized"] = text
                return {"k": [[("tok", text)]]}

            def encode_from_tokens_scheduled(self, tokens):
                return [("cond", {"model_options": {}})] if isinstance(tokens, dict) else []

        class FakeModel:
            pass

        def fake_deepcopy(value):
            return dict(value)

        manifest = json.dumps({
            "characters": [
                {
                    "name": "Mara",
                    "position": "on the left",
                    "loras": [{"filename": "woman_blonde.safetensors", "strength": 1.0}],
                }
            ]
        })
        text = "Character Mara: woman with blonde hair (joy:1.5) <lora:woman_blonde:1.0>"

        node = Krea2CharacterLoras()
        fake_comfy = types.ModuleType("comfy")
        fake_comfy.hooks = FakeHooks()
        fake_comfy.utils = FakeUtils()
        with patch.dict(
            sys.modules,
            {
                "comfy": fake_comfy,
                "comfy.hooks": FakeHooks(),
                "comfy.utils": FakeUtils(),
                "torch": FakeTorch(),
                "folder_paths": FakeFolderPaths(),
            },
        ), patch("copy.deepcopy", side_effect=fake_deepcopy), patch("os.path.exists", return_value=True):
            fake_model = FakeModel()
            base = [("base-cond", {"model_options": {}})]
            conditioning, model, log_text = node.encode(fake_model, FakeClip(), text, manifest, conditioning=base, mask_size=8)

        self.assertIs(model, fake_model)
        # The base conditioning stays at the front; the regional segment appends.
        self.assertEqual(conditioning[0][0], "base-cond")
        self.assertEqual(len(conditioning), 2)
        cond = conditioning[1]
        self.assertIn("hooks", cond[1])
        self.assertIn("mask", cond[1])
        self.assertIn("mask_strength", cond[1])
        self.assertNotIn("<lora:", recorded["tokenized"])
        self.assertNotIn("(joy:1.5)", recorded["tokenized"])
        self.assertIn("Character 'mara'", log_text)
        self.assertIn("woman_blonde.safetensors@1", log_text)



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


class _ImageSlice:
    def __init__(self, array):
        self._array = array

    def cpu(self):
        return self

    def numpy(self):
        return self._array


class SaveImageTests(unittest.TestCase):
    """Krea2 Save Image must embed the exact prompt as PNG metadata."""

    def _fake_folder_paths(self, output_dir):
        counter = {"value": 0}

        def get_output_directory():
            return output_dir

        def get_save_image_path(prefix, base, count, size):
            counter["value"] += 1
            os.makedirs(os.path.join(base, "krea2"), exist_ok=True)
            return (os.path.join(base, "krea2"), "krea2_image", counter["value"] - 1, "krea2", prefix)

        return types.SimpleNamespace(
            get_output_directory=get_output_directory,
            get_save_image_path=get_save_image_path,
        )

    def test_saves_png_with_prompt_metadata(self):
        import numpy as np

        class FakeTensor:
            def __init__(self, array):
                self._array = array
                self.shape = (array.shape[0], array.shape[1], array.shape[2], array.shape[3])

            def cpu(self):
                return self

            def numpy(self):
                return self._array

            def __iter__(self):
                for index in range(self._array.shape[0]):
                    yield _ImageSlice(self._array[index])

        with tempfile.TemporaryDirectory() as tmp:
            fake_paths = self._fake_folder_paths(tmp)
            with patch.dict(sys.modules, {"folder_paths": fake_paths}):
                node = Krea2SaveImage()
                images = FakeTensor(np.zeros((1, 64, 64, 3), dtype=np.float32))
                payload = node.save(
                    images,
                    filename_prefix="Krea2",
                    prompt_text="a perfect cinematic still of Mara",
                    motion_text="Mara smiles slowly",
                    prompt={"nodes": []},
                    extra_pnginfo={"workflow": {"nodes": []}},
                )
            self.assertEqual(payload["result"], ("krea2_image_00000_.png",))
            self.assertEqual(payload["ui"]["images"][0]["type"], "output")
            saved = os.path.join(tmp, "krea2", "krea2_image_00000_.png")
            self.assertTrue(os.path.exists(saved))
            with open(saved, "rb") as handle:
                from PIL import Image

                img = Image.open(handle)
                self.assertEqual(img.text.get("krea2_prompt"), "a perfect cinematic still of Mara")
                self.assertEqual(img.text.get("krea2_motion_prompt"), "Mara smiles slowly")
                self.assertIn("prompt", img.text)
                self.assertIn("workflow", img.text)

    def test_no_prompt_text_writes_only_standard_chunks(self):
        import numpy as np

        class FakeTensor:
            def __init__(self):
                self.shape = (1, 16, 16, 3)

            def cpu(self):
                return self

            def numpy(self):
                return np.zeros((1, 16, 16, 3), dtype=np.float32)

            def __iter__(self):
                yield _ImageSlice(np.zeros((16, 16, 3), dtype=np.float32))

        with tempfile.TemporaryDirectory() as tmp:
            fake_paths = self._fake_folder_paths(tmp)
            with patch.dict(sys.modules, {"folder_paths": fake_paths}):
                payload = Krea2SaveImage().save(
                    FakeTensor(),
                    filename_prefix="Plain",
                    prompt_text="",
                    motion_text="",
                    prompt={"nodes": []},
                    extra_pnginfo={},
                )
            saved = os.path.join(tmp, "krea2", payload["result"][0])
            with open(saved, "rb") as handle:
                from PIL import Image

                img = Image.open(handle)
                self.assertNotIn("krea2_prompt", img.text)
    def test_node_contract(self):
        self.assertEqual(Krea2SaveImage.RETURN_TYPES, ("STRING",))
        self.assertEqual(Krea2SaveImage.RETURN_NAMES, ("filename",))
        self.assertTrue(Krea2SaveImage.OUTPUT_NODE)
        self.assertEqual(Krea2SaveImage.CATEGORY, "_Krea2 Prompt Wizard")
        inputs = Krea2SaveImage.INPUT_TYPES()
        self.assertIn("images", inputs["required"])
        self.assertIn("prompt_text", inputs["optional"])
        self.assertIn("motion_text", inputs["optional"])


class WizardMetadataOverrideTests(unittest.TestCase):
    """The wizard's prompt_metadata_override writes the resolved prompt as
    the standard 'prompt' metadata chunk."""

    def test_override_writes_plain_prompt_into_extra_pnginfo(self):
        metadata = {"workflow": {"nodes": []}}
        state = json.dumps(
            {
                "base_prompt": "portrait of a traveler",
                "rows": [],
                "prompt_metadata_override": True,
            }
        )
        Krea2PromptWizard().build(state, extra_pnginfo=metadata)
        self.assertEqual(metadata.get("prompt"), "portrait of a traveler")
        self.assertEqual(metadata.get("krea2_prompt"), "portrait of a traveler")

    def test_override_off_keeps_graph_prompt_unset(self):
        metadata = {"workflow": {"nodes": []}}
        state = json.dumps({"base_prompt": "portrait", "rows": []})
        Krea2PromptWizard().build(state, extra_pnginfo=metadata)
        self.assertNotIn("prompt", metadata)
        self.assertEqual(metadata.get("krea2_prompt"), "portrait")


# ---------------------------------------------------------------------------
# Faithful port of the Timesaver Artius Browser prompt extraction
# (AlexYez/comfyui-artius-browser, tsab/media/prompt_metadata.py,
# TSExtractPromptPartsFromPromptField). Used to prove the metadata the
# wizard writes is what Timesaver shows as "Positive Prompt".
# ---------------------------------------------------------------------------


def ts_extract_prompt_parts(prompt_field):
    """Port of Timesaver's TSExtractPromptPartsFromPromptField."""
    if not isinstance(prompt_field, str):
        return "", ""
    text = prompt_field.strip()
    if not text:
        return "", ""
    try:
        import json as _json

        payload = _json.loads(text)
    except _json.JSONDecodeError:
        return text[:16000], ""
    if not isinstance(payload, dict):
        return text[:16000], ""

    positive, negative, fallback = [], [], []

    def add(bucket, value):
        if not isinstance(value, str):
            return
        clean = value.strip()
        if clean and clean not in bucket:
            bucket.append(clean)

    def node_text(node):
        inputs = node.get("inputs", {}) if isinstance(node.get("inputs"), dict) else {}
        if isinstance(inputs.get("text"), str):
            return inputs["text"]
        widgets = node.get("widgets_values")
        if isinstance(widgets, list) and widgets and isinstance(widgets[0], str):
            return widgets[0]
        return ""

    def resolve_ref(ref):
        if isinstance(ref, (list, tuple)) and ref:
            rid = str(ref[0])
            return rid if rid in payload else ""
        return ""

    text_by_node = {}
    for node_id, node in payload.items():
        if not isinstance(node, dict):
            continue
        value = node_text(node).strip()
        if not value:
            continue
        text_by_node[str(node_id)] = value
        name_blob = (str(node.get("class_type") or node.get("type") or "") + " " + str(
            node.get("_meta", {}).get("title") if isinstance(node.get("_meta"), dict) else node.get("title") or ""
        )).lower()
        if "negative" in name_blob:
            add(negative, value)
        elif "positive" in name_blob:
            add(positive, value)
        elif "cliptextencode" in name_blob or "textencode" in name_blob or "prompt" in name_blob:
            add(fallback, value)

    def collect_from_ref(ref, visited=None):
        rid = resolve_ref(ref)
        if not rid or rid in (visited or set()):
            return []
        visited = set(visited or [])
        visited.add(rid)
        node = payload.get(rid)
        if not isinstance(node, dict):
            return []
        collected = []
        direct = text_by_node.get(rid, "")
        if direct:
            collected.append(direct)
        inputs = node.get("inputs", {}) if isinstance(node.get("inputs"), dict) else {}
        for value in inputs.values():
            collected.extend(collect_from_ref(value, visited))
        return collected

    for node in payload.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs", {}) if isinstance(node.get("inputs"), dict) else {}
        for ref in (inputs.get("positive"), inputs.get("negative")):
            for found in collect_from_ref(ref):
                add(positive if ref is inputs.get("positive") else negative, found)

    if not positive and not negative and not fallback:
        # Timesaver's final fallback walk: any string under a key hint of
        # positive / prompt / text (link tuples are skipped).
        def walk(node, key_hint=""):
            if isinstance(node, dict):
                for key, child in node.items():
                    walk(child, str(key).lower())
                return
            if isinstance(node, list):
                if isinstance(node[0], (str, int)) if node else False:
                    if str(node[0]) in payload:
                        return
                for child in node:
                    walk(child, key_hint)
                return
            if not isinstance(node, str):
                return
            if "negative" in key_hint:
                add(negative, node)
            elif "positive" in key_hint:
                add(positive, node)
            elif key_hint in {"prompt", "text"}:
                add(fallback, node)

        walk(payload)

    if positive:
        return "\n\n".join(positive)[:16000], "\n\n".join(negative)[:16000]
    positive_fallback = [v for v in fallback if v not in negative]
    if positive_fallback:
        return "\n\n".join(positive_fallback)[:16000], "\n\n".join(negative)[:16000]
    if not negative:
        return "\n\n".join(fallback)[:16000], ""
    return "", "\n\n".join(negative)[:16000]


def png_prompt_chunk(path):
    from PIL import Image

    with Image.open(path) as img:
        return img.info.get("prompt", "")


class TimesaverCompatibilityTests(unittest.TestCase):
    """Prove the metadata the wizard writes is shown as Positive Prompt by
    the Timesaver Artius Browser's own extraction rules."""

    def _save_with_saver(self, tmp, **kwargs):
        import numpy as np

        class FakeTensor:
            def __init__(self):
                self.shape = (1, 16, 16, 3)

            def cpu(self):
                return self

            def numpy(self):
                return np.zeros((1, 16, 16, 3), dtype=np.float32)

            def __iter__(self):
                yield _ImageSlice(np.zeros((16, 16, 3), dtype=np.float32))

        fake_paths = SaveImageTests()._fake_folder_paths(tmp)
        with patch.dict(sys.modules, {"folder_paths": fake_paths}):
            payload = Krea2SaveImage().save(FakeTensor(), **kwargs)
        return os.path.join(tmp, "krea2", payload["result"][0])

    def test_graph_json_with_linked_krea2_prompt_weight_shows_no_positive(self):
        """Reproduces the user's symptom: a graph JSON prompt chunk whose
        text lives on a linked Krea2PromptWeight input yields no Positive
        Prompt under Timesaver's rules."""
        graph = {
            "10": {"class_type": "Krea2PromptWizard", "inputs": {"wizard_state_json": '{"base_prompt": "scene"}'}},
            "11": {"class_type": "Krea2PromptWeight", "inputs": {"text": [10, 0]}},
            "12": {"class_type": "KSampler", "inputs": {"positive": [11, 1]}},
        }
        positive, negative = ts_extract_prompt_parts(json.dumps(graph))
        self.assertEqual(positive, "")
        self.assertEqual(negative, "")

    def test_negative_node_titled_negative_keeps_positive_empty(self):
        """A negative CLIPTextEncode pushes the fallback bucket away, so the
        positive stays empty for linked prompts."""
        graph = {
            "11": {"class_type": "Krea2PromptWeight", "inputs": {"text": [10, 0]}},
            "12": {"class_type": "CLIPTextEncode", "inputs": {"text": "low quality"}},
            "13": {"class_type": "KSampler", "inputs": {"positive": [11, 1], "negative": [12, 0]}},
        }
        positive, negative = ts_extract_prompt_parts(json.dumps(graph))
        self.assertEqual(positive, "")
        self.assertEqual(negative, "low quality")

    def test_plain_prompt_chunk_is_shown_as_positive_prompt(self):
        """Timesaver treats a non-JSON prompt chunk as the Positive Prompt."""
        with tempfile.TemporaryDirectory() as tmp:
            path = self._save_with_saver(
                tmp,
                filename_prefix="Krea2",
                prompt_text="Character Mara (left of frame): (joy:1.5)",
                motion_text="",
                plain_prompt_metadata=True,
                prompt={"nodes": []},
                extra_pnginfo={"workflow": {"nodes": []}},
            )
            self.assertEqual(
                png_prompt_chunk(path),
                "Character Mara (left of frame): (joy:1.5)",
            )
            positive, _ = ts_extract_prompt_parts(png_prompt_chunk(path))
            self.assertEqual(positive, "Character Mara (left of frame): (joy:1.5)")

    def test_wizard_override_is_shown_as_positive_prompt_through_save_image(self):
        """The wizard's prompt_metadata_override plus the standard SaveImage
        (graph JSON first, extra_pnginfo second — PIL last chunk wins) yields
        a plain-text prompt chunk that Timesaver shows as Positive Prompt."""
        import numpy as np
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "save_image_style.png")
            metadata = PngInfo()
            # SaveImage writes the graph JSON first...
            metadata.add_text("prompt", json.dumps({"11": {"class_type": "Krea2PromptWeight", "inputs": {"text": [10, 0]}}}))
            # ...then the extra_pnginfo loop writes the wizard's override.
            metadata.add_text("prompt", "portrait of a traveler")
            metadata.add_text("workflow", json.dumps({"nodes": []}))
            Image.fromarray(np.zeros((16, 16, 3), dtype=np.uint8)).save(path, pnginfo=metadata)
            self.assertEqual(png_prompt_chunk(path), "portrait of a traveler")
            positive, _ = ts_extract_prompt_parts(png_prompt_chunk(path))
            self.assertEqual(positive, "portrait of a traveler")

    def test_literal_clip_text_encode_in_graph_is_shown_as_positive(self):
        """The classic route: a CLIPTextEncode with a literal (unlinked)
        text widget is found by Timesaver's node buckets."""
        graph = {
            "11": {"class_type": "Krea2PromptWeight", "inputs": {"text": [10, 0]}},
            "12": {"class_type": "CLIPTextEncode", "inputs": {"text": "the literal prompt", "clip": [1, 1]}},
            "13": {"class_type": "KSampler", "inputs": {"positive": [11, 1]}},
        }
        positive, _ = ts_extract_prompt_parts(json.dumps(graph))
        self.assertEqual(positive, "the literal prompt")


if __name__ == "__main__":
    unittest.main()
