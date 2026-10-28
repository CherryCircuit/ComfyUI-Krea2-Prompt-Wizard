"""Two-editor preset saves must preserve unrelated server changes."""
import copy
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from src.saved_presets import (SavedPresetConflict, load_saved_presets,
                               persist_saved_presets, save_saved_presets)


def preset(pid, label=None):
    return {"id": pid, "label": label or pid, "scope": "full", "rows": []}


class PresetMergeTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory(prefix="krea2_merge_"))
        self.path = str(Path(directory) / "saved_presets.json")

    def test_two_nodes_can_add_from_the_same_baseline(self):
        baseline = []
        persist_saved_presets([preset("a")], base_presets=baseline, path=self.path)
        result = persist_saved_presets([preset("b")], base_presets=baseline, path=self.path)
        self.assertEqual([p["id"] for p in result], ["a", "b"])
        self.assertEqual(baseline, [])

    def test_unrelated_add_edit_and_delete_survive_local_edit(self):
        baseline = [preset("a"), preset("b"), preset("c")]
        save_saved_presets(baseline, self.path)
        remote = [preset("a"), preset("b", "remote edit"), preset("d")]
        persist_saved_presets(remote, base_presets=baseline, path=self.path)
        submitted = [preset("a", "local edit"), preset("b"), preset("c")]
        result = persist_saved_presets(submitted, base_presets=baseline, path=self.path)
        self.assertEqual({p["id"]: p["label"] for p in result}, {"a": "local edit", "b": "remote edit", "d": "d"})

    def test_local_delete_preserves_unrelated_remote_changes(self):
        baseline = [preset("a"), preset("b")]
        save_saved_presets([preset("a"), preset("b", "remote"), preset("c")], self.path)
        result = persist_saved_presets([preset("b")], base_presets=baseline, path=self.path)
        self.assertEqual({p["id"]: p["label"] for p in result}, {"b": "remote", "c": "c"})

    def test_same_id_conflict_does_not_write_or_backup(self):
        baseline = [preset("a")]
        save_saved_presets([preset("a", "remote")], self.path)
        before = Path(self.path).read_bytes()
        with patch("src.saved_presets.atomic_write") as write, patch("src.saved_presets.timestamp_backup") as backup:
            with self.assertRaises(SavedPresetConflict) as caught:
                persist_saved_presets([preset("a", "local"), preset("new")], base_presets=baseline, path=self.path)
            self.assertEqual(caught.exception.conflict_ids, ["a"])
            self.assertEqual(caught.exception.latest[0]["label"], "remote")
            write.assert_not_called()
            backup.assert_not_called()
        self.assertEqual(Path(self.path).read_bytes(), before)

    def test_edit_delete_conflict_and_identical_delta(self):
        baseline = [preset("a")]
        save_saved_presets([], self.path)
        with self.assertRaises(SavedPresetConflict):
            persist_saved_presets([preset("a", "local")], base_presets=baseline, path=self.path)
        self.assertEqual(persist_saved_presets([], base_presets=baseline, path=self.path), [])
        save_saved_presets([preset("a", "same")], self.path)
        self.assertEqual(persist_saved_presets([preset("a", "same")], base_presets=baseline, path=self.path)[0]["label"], "same")

    def test_legacy_interface_still_replaces_the_full_list(self):
        save_saved_presets([preset("a")], self.path)
        result = persist_saved_presets([preset("b")], path=self.path)
        self.assertEqual([p["id"] for p in result], ["b"])


class PresetRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        try:
            from aiohttp import web
            from aiohttp.test_utils import TestClient, TestServer
        except ImportError:
            self.skipTest("aiohttp is available in the ComfyUI validation runtime")
        from src import api
        directory = self.enterContext(tempfile.TemporaryDirectory(prefix="krea2_merge_route_"))
        self.path = str(Path(directory) / "presets.json")
        routes = web.RouteTableDef()
        self.enterContext(patch.dict(sys.modules, {"server": SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(routes=routes)))}))
        self.enterContext(patch.object(api, "_ROUTES_REGISTERED", False))
        self.enterContext(patch.object(api, "load_saved_presets", lambda: load_saved_presets(self.path)))
        self.enterContext(patch.object(api, "persist_saved_presets", lambda presets, **kwargs: persist_saved_presets(presets, path=self.path, **kwargs)))
        api.register_routes()
        app = web.Application()
        app.add_routes(routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        if hasattr(self, "client"):
            await self.client.close()

    async def test_merge_returns_latest_and_conflict_is_409(self):
        endpoint = "/krea2_prompt_wizard/saved_presets"
        response = await self.client.post(endpoint, json={"presets": [preset("a")], "base_presets": []})
        self.assertEqual(response.status, 200)
        response = await self.client.post(endpoint, json={"presets": [preset("b")], "base_presets": []})
        self.assertEqual(response.status, 200)
        self.assertEqual([p["id"] for p in (await response.json())["presets"]], ["a", "b"])
        before = Path(self.path).read_bytes()
        response = await self.client.post(endpoint, json={"presets": [preset("a", "collision")], "base_presets": []})
        self.assertEqual(response.status, 409)
        payload = await response.json()
        self.assertEqual(payload["error"]["code"], "saved_presets.conflict")
        self.assertEqual(payload["conflict_ids"], ["a"])
        self.assertEqual(Path(self.path).read_bytes(), before)

    async def test_legacy_post_and_invalid_baseline(self):
        endpoint = "/krea2_prompt_wizard/saved_presets"
        response = await self.client.post(endpoint, json={"presets": [preset("old")]})
        self.assertEqual(response.status, 200)
        response = await self.client.post(endpoint, json={"presets": [preset("new")]})
        self.assertEqual(response.status, 200)
        self.assertEqual([p["id"] for p in (await response.json())["presets"]], ["new"])
        response = await self.client.post(endpoint, json={"presets": [], "base_presets": None})
        self.assertEqual(response.status, 400)
        self.assertEqual(load_saved_presets(self.path)[0]["id"], "new")


if __name__ == "__main__":
    unittest.main()
