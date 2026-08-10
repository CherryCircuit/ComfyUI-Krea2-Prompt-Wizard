"""Generate bundled example workflows and subgraph blueprints.

The workflows and subgraphs are simple: they embed the wizard's outputs
into a minimal ComfyUI text-to-image pipeline. Users can drop these
into a ComfyUI installation that has the wizard and a working model
to verify the wizard.

Subgraph blueprints follow the format documented in
``docs/REFERENCE_VERSIONS.md`` and the workflow_templates repo. The
``extra.workflowRendererVersion`` and ``version`` fields are set to
match the current ComfyUI and frontend versions.
"""
from __future__ import annotations

import json
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)

from src.schemas import SCHEMA_VERSION
from src.wizard import empty_state


def _write(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Wrote", path)


def make_basic_workflow() -> dict:
    """Single-prompt workflow that feeds the wizard's output into CLIPTextEncode."""
    state = empty_state()
    state["base_prompt"] = "A studio portrait, sharp focus"
    return {
        "id": "8a4f72d6-2f1c-4b21-9d8a-1c3e7f9b4a01",
        "revision": 1,
        "last_node_id": 12,
        "last_link_id": 6,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [-200, -100],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "FINAL_PROMPT", "type": "STRING", "links": [1]},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            },
            {
                "id": 11,
                "type": "MarkdownNote",
                "pos": [-200, 460],
                "size": [500, 160],
                "flags": {},
                "order": 1,
                "mode": 0,
                "inputs": [],
                "outputs": [],
                "title": "Krea2 Prompt Wizard — Basic",
                "properties": {},
                "widgets_values": [
                    "## Krea2 Prompt Wizard — Basic\n\n"
                    "The `Krea2 Prompt Wizard` node emits a `FINAL_PROMPT` STRING.\n\n"
                    "Connect it to a `CLIPTextEncode` node, then a KSampler, and render.\n\n"
                    "The wizard also exposes `PLAIN_PROMPT`, per-category outputs, "
                    "`TRACE_JSON`, `STATE_JSON`, and `WARNINGS` for inspection."
                ],
            },
        ],
        "links": [],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def make_emotion_blending_workflow() -> dict:
    state = empty_state()
    state["base_prompt"] = "A candid portrait"
    state["rows"] = [
        {
            "id": "r1",
            "category": "emotion",
            "preset_id": "emotion.happiness",
            "label": "Happiness",
            "phrase": "happiness",
            "control_mode": "scalar",
            "intensity": 60,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
        {
            "id": "r2",
            "category": "emotion",
            "preset_id": "emotion.shock",
            "label": "Shock",
            "phrase": "shocked expression",
            "control_mode": "scalar",
            "intensity": 85,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
        {
            "id": "r3",
            "category": "face",
            "preset_id": "face.outer_brow_raiser",
            "label": "Outer brow raiser",
            "phrase": "outer brow raiser",
            "control_mode": "scalar",
            "intensity": 70,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
    ]
    return {
        "id": "5b3a81d2-4c19-4b27-8c3d-9a2f4e6b1d02",
        "revision": 1,
        "last_node_id": 12,
        "last_link_id": 4,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [-200, -100],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "FINAL_PROMPT", "type": "STRING", "links": [1]},
                    {"name": "TRACE_JSON", "type": "STRING", "links": [2]},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            },
            {
                "id": 11,
                "type": "Krea2PromptInspector",
                "pos": [380, -100],
                "size": [400, 380],
                "flags": {},
                "order": 1,
                "mode": 0,
                "inputs": [
                    {"name": "trace_json", "type": "STRING", "link": 2},
                ],
                "outputs": [
                    {"name": "report", "type": "STRING", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": ["", "", ""],
            },
        ],
        "links": [
            [1, 10, 0, 12, 0, "STRING"],
            [2, 10, 13, 11, 0, "STRING"],
        ],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def make_cinematic_camera_workflow() -> dict:
    state = empty_state()
    state["base_prompt"] = "A cinematic street scene at night"
    state["rows"] = [
        {"id": "r1", "category": "framing", "preset_id": "framing.close_up", "label": "Close-up", "phrase": "close-up", "control_mode": "scalar", "intensity": 55, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r2", "category": "angle", "preset_id": "angle.low_angle", "label": "Low angle", "phrase": "low angle", "control_mode": "scalar", "intensity": 30, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r3", "category": "perspective", "preset_id": "perspective.forced_perspective", "label": "Forced perspective", "phrase": "forced perspective", "control_mode": "scalar", "intensity": 75, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r4", "category": "lens", "preset_id": "lens.24mm_wide", "label": "24mm wide", "phrase": "24mm wide", "control_mode": "scalar", "intensity": 35, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r5", "category": "aperture", "preset_id": "aperture.f18", "label": "f/1.8", "phrase": "f/1.8", "control_mode": "scalar", "intensity": 20, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r6", "category": "lens_family", "preset_id": "lens_family.cooke_s4", "label": "Cooke S4", "phrase": "Cooke S4", "control_mode": "scalar", "intensity": 25, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r7", "category": "composition", "preset_id": "composition.asymmetrical_composition", "label": "Asymmetrical composition", "phrase": "asymmetrical composition", "control_mode": "scalar", "intensity": 50, "enabled": True, "verification": "general visual vocabulary"},
    ]
    return {
        "id": "f3d49c71-9c83-4b2a-8b3f-1c4d2e5f7a08",
        "revision": 1,
        "last_node_id": 10,
        "last_link_id": 1,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [0, 0],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "FINAL_PROMPT", "type": "STRING", "links": [1]},
                    {"name": "CAMERA_PROMPT", "type": "STRING", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            }
        ],
        "links": [],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def make_lighting_workflow() -> dict:
    state = empty_state()
    state["base_prompt"] = "A dramatic interior"
    state["rows"] = [
        {"id": "r1", "category": "lighting_setup", "preset_id": "lighting_setup.soft_diffused_lighting", "label": "Soft diffused lighting", "phrase": "soft diffused lighting", "control_mode": "scalar", "intensity": 30, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r2", "category": "lighting_direction", "preset_id": "lighting_direction.strong_backlighting", "label": "Strong backlighting", "phrase": "strong backlighting", "control_mode": "scalar", "intensity": 70, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r3", "category": "lighting_direction", "preset_id": "lighting_direction.rim_lighting", "label": "Rim lighting", "phrase": "rim lighting", "control_mode": "scalar", "intensity": 45, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r4", "category": "lighting_effect", "preset_id": "lighting_effect.cinematic_light_halation", "label": "Cinematic halation", "phrase": "cinematic light halation", "control_mode": "scalar", "intensity": 55, "enabled": True, "verification": "general visual vocabulary"},
        {"id": "r5", "category": "atmosphere", "preset_id": "atmosphere.dense_cinematic_fog", "label": "Dense cinematic fog", "phrase": "dense cinematic fog", "control_mode": "scalar", "intensity": 20, "enabled": True, "verification": "general visual vocabulary"},
    ]
    return {
        "id": "d4a7f9c2-1e5b-4a31-83d6-9a2b4c5d8e0f",
        "revision": 1,
        "last_node_id": 10,
        "last_link_id": 1,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [0, 0],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "LIGHTING_PROMPT", "type": "STRING", "links": [1]},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            }
        ],
        "links": [],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def make_materialize_workflow() -> dict:
    """A workflow that exercises the materialized nodes pattern.

    The wizard's wizard_state_json is configured to demonstrate the
    materialization; the user is expected to click "Materialize" in
    the wizard's UI to expand the configuration into individual
    Krea2WeightedPhrase nodes.
    """
    state = empty_state()
    state["base_prompt"] = "Materialize me"
    return {
        "id": "c1a8e2b4-3f6d-4a82-9e7c-2b5f8d1c4a09",
        "revision": 1,
        "last_node_id": 10,
        "last_link_id": 0,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [0, 0],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "FINAL_PROMPT", "type": "STRING", "links": []},
                    {"name": "PLAIN_PROMPT", "type": "STRING", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            }
        ],
        "links": [],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def make_subgraph_basic() -> dict:
    """A reusable subgraph: prompt -> Krea2PromptWizard -> prompt string.

    Slot ids in the blueprint must be UUIDs: the ComfyUI frontend's
    ``zSubgraphIO`` schema validates ``inputs``/``outputs`` ids with
    ``z.string().uuid()`` and drops the whole blueprint on failure.
    """
    return {
        "id": "b3d8a1f2-4c2e-4b5d-9c8a-1e3f7b2d4a01",
        "version": 1,
        "state": {
            "lastGroupId": 0,
            "lastNodeId": 1,
            "lastLinkId": 1,
            "lastRerouteId": 0,
        },
        "revision": 0,
        "config": {},
        "name": "Krea2 Wizard — Basic",
        "inputNode": {
            "id": -10,
            "bounding": [-80, 100, 120, 60],
        },
        "outputNode": {
            "id": -20,
            "bounding": [380, 100, 120, 60],
        },
        "inputs": [
            {
                "id": "7f4c8e9a-1b2c-4d3e-8f0a-9b8c7d6e5f01",
                "name": "wizard_state_json",
                "type": "STRING",
                "linkIds": [1],
                "pos": [20, 110],
            }
        ],
        "outputs": [
            {
                "id": "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01",
                "name": "Prompt Output",
                "type": "STRING",
                "linkIds": [2],
                "localized_name": "Prompt Output",
                "pos": [400, 110],
            }
        ],
        "widgets": [],
        "nodes": [
            {
                "id": 1,
                "type": "Krea2PromptWizard",
                "pos": [60, 60],
                "size": [300, 200],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [
                    {
                        "name": "wizard_state_json",
                        "type": "STRING",
                        "widget": {"name": "wizard_state_json"},
                        "link": 1,
                    }
                ],
                "outputs": [
                    {"name": "Prompt Output", "type": "STRING", "links": [2]},
                    {"name": "Video Motion Prompt", "type": "STRING", "links": []},
                    {"name": "Model", "type": "MODEL", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(empty_state())],
            }
        ],
        "groups": [],
        "links": [
            {
                "id": 2,
                "origin_id": 1,
                "origin_slot": 0,
                "target_id": -20,
                "target_slot": 0,
                "type": "STRING",
            }
        ],
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
    }


def make_subgraph_transparent() -> dict:
    """A transparent subgraph blueprint: every component is exposed."""
    return {
        "id": "a7b2c4d8-9e3f-4a16-83b5-2c4e7d9a1f08",
        "version": 1,
        "state": {
            "lastGroupId": 0,
            "lastNodeId": 10,
            "lastLinkId": 5,
            "lastRerouteId": 0,
        },
        "revision": 0,
        "config": {},
        "name": "Krea2 Wizard — Transparent",
        "inputNode": {"id": -10, "bounding": [-80, 220, 120, 60]},
        "outputNode": {"id": -20, "bounding": [800, 220, 120, 60]},
        "inputs": [
            {
                "id": "6a2f3b8c-4d5e-4f6a-9b0c-1d2e3f4a5b01",
                "name": "wizard_state_json",
                "type": "STRING",
                "linkIds": [1],
                "pos": [20, 230],
            },
            {
                "id": "7b3f4c9d-5e6f-4a7b-8c1d-2e3f4a5b6c01",
                "name": "model",
                "type": "MODEL",
                "linkIds": [2],
                "pos": [20, 250],
            },
        ],
        "outputs": [
            {
                "id": "8c4f5da0-6f7a-4b8c-9d2e-3f4a5b6c7d01",
                "name": "Prompt Output",
                "type": "STRING",
                "linkIds": [3],
                "pos": [820, 230],
            },
            {
                "id": "9d5f6ea1-7f8b-4c9d-ae3f-4a5b6c7d8e01",
                "name": "Video Motion Prompt",
                "type": "STRING",
                "linkIds": [4],
                "pos": [820, 250],
            },
            {
                "id": "0e6f7fa2-8f9c-4dae-bf40-5a6b7c8d9f01",
                "name": "Model",
                "type": "MODEL",
                "linkIds": [5],
                "pos": [820, 270],
            },
        ],
        "widgets": [],
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [60, 80],
                "size": [320, 200],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [
                    {
                        "name": "wizard_state_json",
                        "type": "STRING",
                        "widget": {"name": "wizard_state_json"},
                        "link": 1,
                    },
                    {
                        "name": "model",
                        "type": "MODEL",
                        "link": 2,
                    },
                ],
                "outputs": [
                    {"name": "Prompt Output", "type": "STRING", "links": [3]},
                    {"name": "Video Motion Prompt", "type": "STRING", "links": [4]},
                    {"name": "Model", "type": "MODEL", "links": [5]},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(empty_state()), False],
            }
        ],
        "groups": [],
        "links": [
            {"id": 3, "origin_id": 10, "origin_slot": 0, "target_id": -20, "target_slot": 0, "type": "STRING"},
            {"id": 4, "origin_id": 10, "origin_slot": 1, "target_id": -20, "target_slot": 1, "type": "STRING"},
            {"id": 5, "origin_id": 10, "origin_slot": 2, "target_id": -20, "target_slot": 2, "type": "MODEL"},
        ],
        "extra": {"frontendVersion": "1.42.8", "workflowRendererVersion": "LG"},
    }


def make_subgraph_kj_nodes() -> dict:
    """Subgraph blueprint that demonstrates optional KJNodes integration."""
    return {
        "id": "e9c5b7d3-1a4f-4b86-92c5-7d3e8f1a2b09",
        "version": 1,
        "state": {
            "lastGroupId": 0,
            "lastNodeId": 11,
            "lastLinkId": 6,
            "lastRerouteId": 0,
        },
        "revision": 0,
        "config": {},
        "name": "Krea2 Wizard — KJNodes integration",
        "inputNode": {"id": -10, "bounding": [-80, 220, 120, 60]},
        "outputNode": {"id": -20, "bounding": [1200, 220, 120, 60]},
        "inputs": [
            {
                "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c01",
                "name": "wizard_state_json",
                "type": "STRING",
                "linkIds": [1],
                "pos": [20, 230],
            },
            {
                "id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d01",
                "name": "model",
                "type": "MODEL",
                "linkIds": [2],
                "pos": [20, 250],
            },
            {
                "id": "3c4d5e6f-7a8b-4c9d-ae0f-2a3b4c5d6e01",
                "name": "clip",
                "type": "CLIP",
                "linkIds": [3],
                "pos": [20, 270],
            },
        ],
        "outputs": [
            {
                "id": "4d5e6f70-8a9b-4dae-bf01-3a4b5c6d7e01",
                "name": "Prompt Output",
                "type": "STRING",
                "linkIds": [6],
                "pos": [1220, 230],
            },
            {
                "id": "5e6f7081-9a0b-4ebf-c012-4a5b6c7d8e01",
                "name": "Conditioning",
                "type": "CONDITIONING",
                "linkIds": [7],
                "pos": [1220, 250],
            },
        ],
        "widgets": [],
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [60, 80],
                "size": [300, 200],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [
                    {
                        "name": "wizard_state_json",
                        "type": "STRING",
                        "widget": {"name": "wizard_state_json"},
                        "link": 1,
                    },
                ],
                "outputs": [
                    {"name": "Prompt Output", "type": "STRING", "links": [4]},
                    {"name": "Video Motion Prompt", "type": "STRING", "links": []},
                    {"name": "Model", "type": "MODEL", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(empty_state())],
            },
            {
                "id": 11,
                "type": "Krea2PromptWeight",
                "pos": [400, 80],
                "size": [300, 200],
                "flags": {},
                "order": 1,
                "mode": 0,
                "inputs": [
                    {"name": "clip", "type": "CLIP", "link": 3},
                    {"name": "model", "type": "MODEL", "link": 2},
                    {"name": "text", "type": "STRING", "link": 4},
                ],
                "outputs": [
                    {"name": "model", "type": "MODEL", "links": []},
                    {"name": "conditioning", "type": "CONDITIONING", "links": [7]},
                ],
                "properties": {
                    "cnr_id": "comfyui-kj-nodes",
                    "ver": "1.4.7",
                },
                "widgets_values": ["", 1.0],
            }
        ],
        "groups": [],
        "links": [
            {"id": 7, "origin_id": 11, "origin_slot": 1, "target_id": -20, "target_slot": 1, "type": "CONDITIONING"},
            {"id": 4, "origin_id": 10, "origin_slot": 0, "target_id": 11, "target_slot": 2, "type": "STRING"},
            {"id": 6, "origin_id": 10, "origin_slot": 0, "target_id": -20, "target_slot": 0, "type": "STRING"},
        ],
        "extra": {"frontendVersion": "1.42.8", "workflowRendererVersion": "LG"},
    }


def make_calibration_workflow() -> dict:
    """Calibration workflow used to record per-weight test outcomes.

    The wizard is configured with a base scene plus a single emotion
    row at the default strength of 0. The user can flip through
    weights (0.5..3.0) and record their local Krea 2 outcomes.
    """
    state = empty_state()
    state["base_prompt"] = "Calibration scene"
    return {
        "id": "5b2c1a8e-7d4f-4e3b-9c2a-1b6e8d3f4a07",
        "revision": 1,
        "last_node_id": 10,
        "last_link_id": 0,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [0, 0],
                "size": [500, 480],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "FINAL_PROMPT", "type": "STRING", "links": []},
                    {"name": "PLAIN_PROMPT", "type": "STRING", "links": []},
                    {"name": "TRACE_JSON", "type": "STRING", "links": []},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.0.0",
                },
                "widgets_values": [json.dumps(state)],
            }
        ],
        "links": [],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {"frontendVersion": "1.42.8", "workflowRendererVersion": "LG"},
        "version": 0.4,
    }


def make_two_character_scene_workflow() -> dict:
    """A two-character scene: each cast member owns their emotion, face
    guidance, body language, and placement; a motion prompt is emitted
    for image-to-video models such as LTX-2.3.
    """
    state = empty_state()
    state["base_prompt"] = "A rainy street corner at night, a diner glows in the background"
    state["motion_prompt_enabled"] = True
    state["active_tab"] = "cast"
    state["characters"] = [
        {
            "id": "c1",
            "name": "Mara",
            "enabled": True,
            "expanded": True,
            "identity": "A streetwise courier who has seen too many winters",
            "sex": "female",
            "age": "young adult",
            "ensemble": "leather biker outfit",
            "hair_color": "red",
            "hair_length": "shoulder-length",
            "hair_style": "loose waves",
            "body_type": "athletic build",
            "position": "standing on the left side of the frame",
            "face_guidance": "(sparkling bright eyes:1.4)\n(genuine warm smile:1.2)",
            "lora_triggers": "young woman",
            "interaction": "looking at Alex",
            "rows": [
                {
                    "id": "r1",
                    "category": "emotion",
                    "preset_id": "emotion.joy",
                    "label": "Joy",
                    "phrase": "joy",
                    "control_mode": "scalar",
                    "intensity": 0,
                    "strength": 1.5,
                    "enabled": True,
                    "verification": "general visual vocabulary",
                },
                {
                    "id": "r2",
                    "category": "mouth",
                    "preset_id": "mouth.gentle_smile",
                    "label": "Gentle smile",
                    "phrase": "gentle smile",
                    "control_mode": "scalar",
                    "intensity": 0,
                    "strength": 1.25,
                    "enabled": True,
                    "verification": "general visual vocabulary",
                },
                {
                    "id": "r3",
                    "category": "body",
                    "preset_id": "body.arms_crossed",
                    "label": "Arms crossed",
                    "phrase": "arms crossed",
                    "control_mode": "scalar",
                    "intensity": 0,
                    "strength": 1.0,
                    "enabled": True,
                    "verification": "general visual vocabulary",
                },
            ],
        },
        {
            "id": "c2",
            "name": "Alex",
            "enabled": True,
            "expanded": True,
            "identity": "A weary detective carrying an old case file",
            "sex": "male",
            "age": "middle aged",
            "ensemble": "noir trench coat and fedora",
            "hair_color": "dark brown",
            "hair_style": "messy layered",
            "body_type": "average build",
            "position": "standing on the right side of the frame",
            "face_guidance": "(a quivering lower lip:1.3)",
            "interaction": "avoiding eye contact",
            "rows": [
                {
                    "id": "r4",
                    "category": "emotion",
                    "preset_id": "emotion.sadness",
                    "label": "Sadness",
                    "phrase": "sadness",
                    "control_mode": "scalar",
                    "intensity": 0,
                    "strength": 1.5,
                    "enabled": True,
                    "verification": "general visual vocabulary",
                },
                {
                    "id": "r5",
                    "category": "body",
                    "preset_id": "body.hunched_shoulders",
                    "label": "Hunched shoulders",
                    "phrase": "hunched shoulders",
                    "control_mode": "scalar",
                    "intensity": 0,
                    "strength": 1.0,
                    "enabled": True,
                    "verification": "general visual vocabulary",
                },
            ],
        },
    ]
    state["rows"] = [
        {
            "id": "g1",
            "category": "framing",
            "preset_id": "framing.over_the_shoulder_shot",
            "label": "Over-the-shoulder shot",
            "phrase": "over-the-shoulder shot",
            "control_mode": "scalar",
            "intensity": 0,
            "strength": 1.0,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
        {
            "id": "g2",
            "category": "lens",
            "preset_id": "lens.85mm_portrait",
            "label": "85mm portrait",
            "phrase": "85mm portrait",
            "control_mode": "scalar",
            "intensity": 0,
            "strength": 1.0,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
        {
            "id": "g3",
            "category": "lighting_setup",
            "preset_id": "lighting_setup.neon_lighting",
            "label": "Neon lighting",
            "phrase": "neon lighting",
            "control_mode": "scalar",
            "intensity": 0,
            "strength": 1.0,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
        {
            "id": "g4",
            "category": "atmosphere",
            "preset_id": "atmosphere.light_rain",
            "label": "Light rain",
            "phrase": "light rain",
            "control_mode": "scalar",
            "intensity": 0,
            "strength": 1.0,
            "enabled": True,
            "verification": "general visual vocabulary",
        },
    ]
    state["setting"] = {
        "enabled": True,
        "name": "Rainy street",
        "description": "wet asphalt reflecting neon light",
    }
    return {
        "id": "9e2b6d4f-8a1c-4e7b-93d5-6f2a8c1b4e07",
        "revision": 1,
        "last_node_id": 11,
        "last_link_id": 3,
        "nodes": [
            {
                "id": 10,
                "type": "Krea2PromptWizard",
                "pos": [-200, -100],
                "size": [760, 720],
                "flags": {},
                "order": 0,
                "mode": 0,
                "inputs": [],
                "outputs": [
                    {"name": "Prompt Output", "type": "STRING", "links": [1]},
                    {"name": "Video Motion Prompt", "type": "STRING", "links": [2]},
                ],
                "properties": {
                    "cnr_id": "comfyui-krea2-prompt-wizard",
                    "ver": "1.1.0",
                },
                "widgets_values": [json.dumps(state)],
            },
            {
                "id": 11,
                "type": "MarkdownNote",
                "pos": [-200, 480],
                "size": [760, 200],
                "flags": {},
                "order": 1,
                "mode": 0,
                "inputs": [],
                "outputs": [],
                "title": "Krea2 Prompt Wizard — Two-Character Scene",
                "properties": {},
                "widgets_values": [
                    "## Two-Character Scene\n\n"
                    "Two cast members with **separate** emotions and body language: "
                    "Mara is joyful, Alex is sad.\n\n"
                    "• **Prompt Output** — the Krea 2 still prompt (feed it to CLIPTextEncode).\n"
                    "• **Video Motion Prompt** — per-character motion lines for LTX-2.3 "
                    "image-to-video generation.\n\n"
                    "Swap emotions, placements, face-guidance triggers, or the shot preset "
                    "in the wizard's Cast / Scene / Concepts / Prompt tabs."
                ],
            },
        ],
        "links": [
            [1, 10, 0, 11, 0, "STRING"],
            [2, 10, 1, 11, 1, "STRING"],
        ],
        "groups": [],
        "definitions": {"subgraphs": []},
        "config": {},
        "extra": {
            "frontendVersion": "1.42.8",
            "workflowRendererVersion": "LG",
        },
        "version": 0.4,
    }


def main() -> None:
    workflows_dir = os.path.join(ROOT, "workflows")
    subgraphs_dir = os.path.join(ROOT, "subgraphs")
    os.makedirs(workflows_dir, exist_ok=True)
    os.makedirs(subgraphs_dir, exist_ok=True)

    _write(os.path.join(workflows_dir, "example_basic.json"), make_basic_workflow())
    _write(os.path.join(workflows_dir, "example_emotion_blending.json"), make_emotion_blending_workflow())
    _write(os.path.join(workflows_dir, "example_cinematic_camera.json"), make_cinematic_camera_workflow())
    _write(os.path.join(workflows_dir, "example_multiple_lighting_effects.json"), make_lighting_workflow())
    _write(os.path.join(workflows_dir, "example_transparent_materialization.json"), make_materialize_workflow())
    _write(os.path.join(workflows_dir, "example_calibration.json"), make_calibration_workflow())
    _write(os.path.join(workflows_dir, "example_two_character_scene.json"), make_two_character_scene_workflow())

    sub_workflow = make_basic_workflow()
    sub_workflow["definitions"]["subgraphs"] = [make_subgraph_basic()]
    sub_workflow["nodes"] = []
    _write(os.path.join(subgraphs_dir, "Krea2_Prompt_Wizard_Basic.json"), sub_workflow)

    sub_transparent = make_basic_workflow()
    sub_transparent["definitions"]["subgraphs"] = [make_subgraph_transparent()]
    sub_transparent["nodes"] = []
    _write(os.path.join(subgraphs_dir, "Krea2_Prompt_Wizard_Transparent.json"), sub_transparent)

    sub_kj = make_basic_workflow()
    sub_kj["definitions"]["subgraphs"] = [make_subgraph_kj_nodes()]
    sub_kj["nodes"] = []
    _write(os.path.join(subgraphs_dir, "Krea2_Prompt_Wizard_KJNodes.json"), sub_kj)

    sub_calibration = make_basic_workflow()
    sub_calibration["definitions"]["subgraphs"] = [make_subgraph_basic()]
    sub_calibration["nodes"] = []
    _write(os.path.join(subgraphs_dir, "Krea2_Prompt_Calibration.json"), sub_calibration)


if __name__ == "__main__":
    main()
