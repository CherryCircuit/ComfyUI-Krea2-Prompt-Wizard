from __future__ import annotations

import json
import asyncio
import shutil
import subprocess
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from src import api as api_module
from src.nodes import Krea2PromptWizard, NODE_CLASS_MAPPINGS


ROOT = Path(__file__).resolve().parents[1]


class FrontendPackagingTests(unittest.TestCase):
    def test_only_entrypoint_is_auto_discovered(self):
        javascript_files = sorted(
            path.relative_to(ROOT / "web").as_posix()
            for path in (ROOT / "web").rglob("*.js")
        )
        self.assertEqual(javascript_files, ["krea2_prompt_wizard_v3.js"])

    def test_entrypoint_loads_helpers_before_registration(self):
        source = (ROOT / "web" / "krea2_prompt_wizard_v3.js").read_text(encoding="utf-8")
        self.assertIn('import { app } from "../../scripts/app.js"', source)
        self.assertIn('await import("./js/state.mjs?v=17")', source)
        self.assertIn('await import("./js/wizard_widget.mjs?v=17")', source)
        self.assertLess(source.index("await import"), source.index("app.registerExtension"))

    def test_all_entrypoint_helper_modules_exist(self):
        helpers = (
            "state.mjs",
            "searchable_selector.mjs",
            "preset_row.mjs",
            "library_editor.mjs",
            "materialize.mjs",
            "inspector.mjs",
            "wizard_widget.mjs",
        )
        for helper in helpers:
            self.assertTrue((ROOT / "web" / "js" / helper).is_file(), helper)

    def test_picker_paints_selection_before_parent_render(self):
        source = (ROOT / "web" / "js" / "searchable_selector.mjs").read_text(
            encoding="utf-8"
        )
        choose_body = source[source.index("function choose(index)") :]
        self.assertLess(
            choose_body.index("renderResults();"),
            choose_body.index("onToggle(preset, willSelect)"),
        )

    def test_prompt_editor_has_no_nested_scroll_or_resize(self):
        stylesheet = (ROOT / "web" / "css" / "wizard.css").read_text(
            encoding="utf-8"
        )
        editor_block = stylesheet[
            stylesheet.index(".krea2-wizard-editor")
            : stylesheet.index(".krea2-wizard-prompt-field")
        ]
        base_block = stylesheet[
            stylesheet.index(".krea2-wizard-base {")
            : stylesheet.index(".krea2-wizard-preview {")
        ]
        self.assertNotIn("max-height", editor_block)
        self.assertIn("overflow: visible", editor_block)
        self.assertIn("resize: none", base_block)
        self.assertIn("overflow: hidden", base_block)

    def test_wizard_has_prompt_motion_and_model_outputs(self):
        self.assertEqual(
            Krea2PromptWizard.RETURN_TYPES,
            ("STRING", "STRING", "MODEL", "STRING"),
        )
        self.assertEqual(
            Krea2PromptWizard.RETURN_NAMES,
            ("Prompt Output", "Video Motion Prompt", "Model", "Character LoRA"),
        )

    def test_nodes_use_requested_category(self):
        for node_class in NODE_CLASS_MAPPINGS.values():
            self.assertEqual(node_class.CATEGORY, "_Krea2 Prompt Wizard")

    def test_wizard_compiles_embedded_state(self):
        state = {
            "schema_version": 1,
            "base_prompt": "portrait of a traveler",
            "rows": [],
        }
        result = Krea2PromptWizard().build(json.dumps(state))
        self.assertEqual(
            result["result"],
            ("portrait of a traveler", "", None, '{"characters": []}'),
        )
        self.assertEqual(json.loads(result["ui"]["krea2_resolved_state"][0])["base_prompt"], "portrait of a traveler")
        self.assertEqual(result["ui"]["krea2_prompt_output"], ["portrait of a traveler"])
        self.assertEqual(result["ui"]["krea2_motion_prompt"], [""])

    def test_frontend_data_routes_are_registered(self):
        handlers = {}

        class FakeRoutes:
            def get(self, path):
                def decorator(handler):
                    handlers[("GET", path)] = handler
                    return handler

                return decorator

            def post(self, path):
                def decorator(handler):
                    handlers[("POST", path)] = handler
                    return handler

                return decorator

        fake_web = types.SimpleNamespace(
            json_response=lambda payload, status=200: {"body": payload, "status": status},
            Response=object,
        )
        fake_aiohttp = types.SimpleNamespace(web=fake_web)
        fake_server = types.SimpleNamespace(
            PromptServer=types.SimpleNamespace(
                instance=types.SimpleNamespace(routes=FakeRoutes())
            )
        )

        api_module._ROUTES_REGISTERED = False
        with patch.dict(sys.modules, {"aiohttp": fake_aiohttp, "server": fake_server}):
            api_module.register_routes()

        self.assertEqual(
            set(handlers),
            {
                ("GET", "/krea2_prompt_wizard/library"),
                ("POST", "/krea2_prompt_wizard/library"),
                ("GET", "/krea2_prompt_wizard/master_presets"),
                ("GET", "/krea2_prompt_wizard/saved_presets"),
                ("POST", "/krea2_prompt_wizard/saved_presets"),
                ("GET", "/krea2_prompt_wizard/concept_colors"),
                ("POST", "/krea2_prompt_wizard/concept_colors"),
                ("GET", "/krea2_prompt_wizard/loras"),
                ("POST", "/krea2_prompt_wizard/preview"),
            },
        )
        library_payload = asyncio.run(handlers[("GET", "/krea2_prompt_wizard/library")](None))
        masters_payload = asyncio.run(handlers[("GET", "/krea2_prompt_wizard/master_presets")](None))
        self.assertGreater(len(library_payload["body"]["presets"]), 500)
        self.assertGreater(len(masters_payload["body"]["master_presets"]), 10)

        class FakeRequest:
            async def json(self):
                return {
                    "presets": [
                        {
                            "id": "user.test",
                            "category": "custom",
                            "label": "Test preset",
                            "phrase": "test phrase",
                            "default_strength": 0,
                            "control_mode": "scalar",
                            "aliases": [],
                            "verification": "general visual vocabulary",
                            "schema_version": 1,
                        }
                    ]
                }

        reloaded = types.SimpleNamespace(presets=[{"id": "user.test", "origin": "user"}])
        with patch.object(api_module, "save_user_library") as save, patch.object(
            api_module, "reload_library", return_value=reloaded
        ):
            saved_payload = asyncio.run(
                handlers[("POST", "/krea2_prompt_wizard/library")](FakeRequest())
            )
        save.assert_called_once()
        self.assertEqual(saved_payload["status"], 200)
        self.assertEqual(saved_payload["body"]["presets"], reloaded.presets)
        api_module._ROUTES_REGISTERED = False

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for the DOM smoke test")
    def test_wizard_dom_initializes(self):
        subprocess.run(
            [shutil.which("node"), str(ROOT / "tests" / "frontend_smoke.mjs")],
            cwd=ROOT,
            check=True,
        )

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for the frontend state contract")
    def test_frontend_state_contract(self):
        subprocess.run(
            [shutil.which("node"), str(ROOT / "tests" / "frontend_state_contract.mjs")],
            cwd=ROOT,
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
