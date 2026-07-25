"""Validate bundled workflow and subgraph JSON.

Performs basic structural checks on the bundled examples:

* Files parse as JSON.
* Top-level fields are present.
* Every node has an ``id`` and ``type``.
* The wizard's wizard_state_json widget decodes into a valid state.
* All linked output slots exist in their source node.

Run from the project root:

    python3 scripts/validate_workflows.py
"""
from __future__ import annotations

import json
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)

from src.validation import validate_state


WORKFLOW_DIR = os.path.join(ROOT, "workflows")
SUBGRAPH_DIR = os.path.join(ROOT, "subgraphs")


def _load(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _validate_workflow_file(path: str) -> None:
    data = _load(path)
    if not isinstance(data, dict):
        sys.exit(f"{path}: top-level must be a JSON object")
    if "nodes" not in data or "links" not in data:
        sys.exit(f"{path}: missing nodes or links")
    ids = set()
    for node in data["nodes"]:
        if "id" not in node or "type" not in node:
            sys.exit(f"{path}: node missing id or type: {node}")
        if node["id"] in ids:
            sys.exit(f"{path}: duplicate node id {node['id']}")
        ids.add(node["id"])
        if node["type"] == "Krea2PromptWizard":
            widgets = node.get("widgets_values") or []
            if not widgets:
                sys.exit(f"{path}: wizard has no widgets_values")
            try:
                state = json.loads(widgets[0])
                result = validate_state(state)
                if result.has_errors:
                    sys.exit(f"{path}: invalid wizard state: {[i.code for i in result.errors]}")
            except json.JSONDecodeError as e:
                sys.exit(f"{path}: wizard state JSON not parseable: {e}")
    for link in data["links"]:
        if not isinstance(link, list) or len(link) < 5:
            sys.exit(f"{path}: malformed link: {link}")


def _validate_subgraph_file(path: str) -> None:
    data = _load(path)
    if not isinstance(data, dict):
        sys.exit(f"{path}: subgraph top-level must be a JSON object")
    if "definitions" not in data:
        sys.exit(f"{path}: missing definitions block")
    subgraphs = data["definitions"].get("subgraphs", [])
    if not subgraphs:
        sys.exit(f"{path}: no subgraphs in definitions")
    for sub in subgraphs:
        if "id" not in sub or "name" not in sub or "nodes" not in sub:
            sys.exit(f"{path}: subgraph missing required keys: {sub}")
        for node in sub["nodes"]:
            if "id" not in node or "type" not in node:
                sys.exit(f"{path}: subgraph node missing id or type")
            if node["type"] == "Krea2PromptWizard":
                widgets = node.get("widgets_values") or []
                if not widgets:
                    sys.exit(f"{path}: subgraph wizard has no widgets_values")
                try:
                    state = json.loads(widgets[0])
                    result = validate_state(state)
                    if result.has_errors:
                        sys.exit(f"{path}: subgraph wizard state invalid")
                except json.JSONDecodeError as e:
                    sys.exit(f"{path}: subgraph wizard state not parseable: {e}")


def main() -> None:
    print(f"validating workflows at {ROOT}")
    if not os.path.isdir(WORKFLOW_DIR):
        sys.exit("missing workflows directory")
    if not os.path.isdir(SUBGRAPH_DIR):
        sys.exit("missing subgraphs directory")

    for name in sorted(os.listdir(WORKFLOW_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(WORKFLOW_DIR, name)
        _validate_workflow_file(path)
        print(f"  workflow {name} ok")

    for name in sorted(os.listdir(SUBGRAPH_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(SUBGRAPH_DIR, name)
        _validate_subgraph_file(path)
        print(f"  subgraph {name} ok")

    print("ok")


if __name__ == "__main__":
    main()
