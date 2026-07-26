from __future__ import annotations

import json
import asyncio
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
        self.assertEqual(javascript_files, ["extension.js"])

    def test_entrypoint_loads_helpers_before_registration(self):
        source = (ROOT / "web" / "extension.js").read_text(encoding="utf-8")
        self.assertIn('import { app } from "../../scripts/app.js"', source)
        self.assertIn('await import("./js/state.mjs")', source)
        self.assertIn('await import("./js/wizard_widget.mjs")', source)
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

    def test_wizard_has_one_prompt_output(self):
        self.assertEqual(Krea2PromptWizard.RETURN_TYPES, ("STRING",))
        self.assertEqual(Krea2PromptWizard.RETURN_NAMES, ("Prompt Output",))

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
        self.assertEqual(result, ("portrait of a traveler",))

    def test_frontend_data_routes_are_registered(self):
        handlers = {}

        class FakeRoutes:
            def get(self, path):
                def decorator(handler):
                    handlers[path] = handler
                    return handler

                return decorator

        fake_web = types.SimpleNamespace(json_response=lambda payload: payload, Response=object)
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
                "/krea2_prompt_wizard/library",
                "/krea2_prompt_wizard/master_presets",
            },
        )
        library_payload = asyncio.run(handlers["/krea2_prompt_wizard/library"](None))
        masters_payload = asyncio.run(handlers["/krea2_prompt_wizard/master_presets"](None))
        self.assertGreater(len(library_payload["presets"]), 500)
        self.assertGreater(len(masters_payload["master_presets"]), 10)
        api_module._ROUTES_REGISTERED = False


if __name__ == "__main__":
    unittest.main()
