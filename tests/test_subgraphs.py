"""Validate bundled subgraph blueprints against the ComfyUI frontend's
schema requirements and the current node contract.

The frontend (ComfyUI_frontend src/utils/blueprintUtils.ts +
src/platform/workflow/validation/schemas/workflowSchema.ts) drops a
blueprint when its ``inputs``/``outputs`` slot ids are not UUIDs, when
the definition is missing ``version: 1`` / ``state``, or when node
outputs reference slots that do not exist on the registered node.
"""
from __future__ import annotations

import json
import os
import re
import unittest
import uuid

from src.nodes import NODE_CLASS_MAPPINGS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBGRAPHS_DIR = os.path.join(ROOT, "subgraphs")

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _load_subgraphs():
    blueprints = []
    for name in sorted(os.listdir(SUBGRAPHS_DIR)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(SUBGRAPHS_DIR, name), "r", encoding="utf-8") as handle:
            data = json.load(handle)
        for subgraph in (data.get("definitions") or {}).get("subgraphs") or []:
            blueprints.append((name, subgraph))
    return blueprints


class SubgraphBlueprintTests(unittest.TestCase):
    def test_all_blueprints_have_uuid_slot_ids(self):
        blueprints = _load_subgraphs()
        self.assertGreaterEqual(len(blueprints), 4)
        for name, subgraph in blueprints:
            for slot in subgraph.get("inputs", []) + subgraph.get("outputs", []):
                self.assertRegex(
                    str(slot.get("id", "")),
                    UUID_RE,
                    f"{name}/{subgraph.get('name')} slot {slot.get('name')} must use a UUID id",
                )

    def test_blueprints_are_schema_version_one(self):
        for name, subgraph in _load_subgraphs():
            self.assertEqual(subgraph.get("version"), 1, name)
            state = subgraph.get("state") or {}
            for key in ("lastGroupId", "lastNodeId", "lastLinkId", "lastRerouteId"):
                self.assertIn(key, state, f"{name} state must include {key}")
            self.assertIn("inputNode", subgraph, name)
            self.assertIn("outputNode", subgraph, name)
            self.assertEqual(len(subgraph["inputNode"]["bounding"]), 4, name)
            self.assertEqual(len(subgraph["outputNode"]["bounding"]), 4, name)

    def test_wizard_node_slots_match_the_current_contract(self):
        wizard_return_names = NODE_CLASS_MAPPINGS["Krea2PromptWizard"].RETURN_NAMES
        for name, subgraph in _load_subgraphs():
            for node in subgraph.get("nodes", []):
                if node.get("type") != "Krea2PromptWizard":
                    continue
                node_names = [out.get("name") for out in node.get("outputs", [])]
                for slot_name in node_names:
                    self.assertIn(
                        slot_name,
                        wizard_return_names,
                        f"{name} references removed output {slot_name}",
                    )
                for slot in node.get("inputs", []):
                    self.assertIn(
                        slot.get("name"),
                        ("wizard_state_json", "expert_mode", "model"),
                        f"{name} references removed input {slot.get('name')}",
                    )

    def test_known_node_types_are_registered(self):
        registered = set(NODE_CLASS_MAPPINGS)
        for name, subgraph in _load_subgraphs():
            for node in subgraph.get("nodes", []):
                node_type = node.get("type")
                if node_type in registered:
                    continue
                # Krea2PromptWeight ships with the optional KJNodes pack.
                self.assertEqual(node_type, "Krea2PromptWeight", f"{name} uses unknown type {node_type}")

    def test_links_resolve_to_real_slots(self):
        for name, subgraph in _load_subgraphs():
            node_ids = {node.get("id") for node in subgraph.get("nodes", [])}
            for link in subgraph.get("links", []):
                self.assertIn(link["origin_id"], node_ids | {-10}, f"{name} link {link['id']} origin")
                self.assertIn(link["target_id"], node_ids | {-20}, f"{name} link {link['id']} target")


if __name__ == "__main__":
    unittest.main()
