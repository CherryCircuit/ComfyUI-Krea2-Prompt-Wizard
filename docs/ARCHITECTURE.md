# Architecture

This document describes the high-level architecture of the project.

## Project layout

```
ComfyUI-Krea2-Prompt-Wizard/
    __init__.py                     # registers nodes; exposes WEB_DIRECTORY
    pyproject.toml                  # project metadata
    README.md
    LICENSE
    SECURITY.md
    CHANGELOG.md

    src/
        __init__.py
        nodes.py                    # V3 node classes
        wizard.py                   # state builder / manipulation
        compiler.py                 # state -> prompt text
        assembler.py                # pure fragment assembler
        inspector.py                # trace formatter
        weight_mapping.py           # slider -> weight math
        library.py                  # library + user file IO
        saved_presets.py            # full-prompt and group preset IO
        validation.py               # pure validation routines
        schemas.py                  # constants and version
        migrations.py               # preset migrations
        conflicts.py                # conflict detection
        user_paths.py               # user directory resolver

    presets/
        default_library.json        # bundled presets
        master_presets.json         # bundled master presets
        conflicts.json              # bundled conflict reference

    web/
        js/
            extension.js
            state.js
            searchable_selector.js
            preset_row.js
            library_editor.js
            materialize.js
            inspector.js
            wizard_widget.js
        css/wizard.css
        docs/                       # per-node web documentation

    subgraphs/
        Krea2_Prompt_Wizard_Basic.json
        Krea2_Prompt_Wizard_Transparent.json
        Krea2_Prompt_Wizard_KJNodes.json
        Krea2_Prompt_Calibration.json

    workflows/
        example_basic.json
        example_emotion_blending.json
        example_cinematic_camera.json
        example_multiple_lighting_effects.json
        example_transparent_materialization.json
        example_calibration.json

    tests/
        __init__.py
        test_weights.py
        test_validation.py
        test_library.py
        test_wizard.py
        test_compiler.py
        test_assembler.py
        test_inspector.py
        test_migrations.py
        test_workflow_snapshots.py
        test_conflicts.py
        golden/                      # golden prompt tests + fixtures
            test_golden.py
            golden/                  # recorded golden outputs

    scripts/
        build_default_library.py
        build_master_presets.py
        build_conflicts.py
        build_workflows.py
        validate_library.py
        validate_workflows.py
        build_release.py

    docs/
        REFERENCE_VERSIONS.md
        KREA2_PROMPT_RESEARCH.md
        KJNODES_INTEGRATION.md
        ARCHITECTURE.md
        TRANSPARENCY.md
        THREAT_MODEL.md
        USER_LIBRARY.md
        CALIBRATION.md
        DEVELOPMENT.md
```

## Backend

The backend is a single Python package. The top-level `__init__.py`
imports `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS` from
`src.nodes`. The `WEB_DIRECTORY` constant points to `./web`, which is
how ComfyUI mounts the static extension folder.

`src/nodes.py` defines four node classes. Each class uses the V3
node API pattern (subclassing nothing, declaring `INPUT_TYPES` /
`RETURN_TYPES` / `FUNCTION` / `CATEGORY` class methods). They never
import from `comfy` or `comfy_extras` directly — the wizard is a
pure-Python package with optional ComfyUI integration.

The compiler, weight mapping, conflicts, and migrations modules are
imported by the wizard's backend but have no ComfyUI dependencies and
can be exercised in unit tests without the ComfyUI runtime.

## Frontend

The frontend uses one auto-discovered JavaScript entry point,
`web/extension.js`. Its helper files use the `.mjs` extension so
ComfyUI's recursive `*.js` extension scan does not execute them out of
order. The entry point awaits the state, selector, row, library editor,
materialize, inspector, and widget modules before registering the
extension. The wizard's visual interface is
rendered by `wizard_widget.mjs`, which reads and writes the
`wizard_state_json` STRING widget value of the `Krea2 Prompt Wizard`
node.

The frontend uses only documented ComfyUI APIs:

- `app.registerExtension` (entry point).
- `nodeType.prototype.onNodeCreated` (mounts the widget).
- `nodeType.prototype.onRemoved` (cleanup).
- `node.addDOMWidget` (registers a DOM widget).
- Scoped local HTTP routes (loads, validates, saves, and previews the library state).
- `LiteGraph.createNode` (materialize-to-nodes).
- `graph.convertToSubgraph` (subgraph creation, when available).

The frontend never monkey-patches unrelated ComfyUI prototypes, never
modifies global state, and cleans up event listeners / DOM nodes /
timers on `onRemoved`. If the extension fails to load, the wizard
node still works through the `wizard_state_json` STRING input.

## State

The wizard state is a plain JSON object. The schema is documented in
`src/schemas.py`. The state is embedded in the workflow as a STRING
widget value, which means it round-trips through ComfyUI's workflow
serialization.

The state shape is:

```
{
  "schema_version": 1,
  "base_prompt": "string",
  "model_profile": "generic" | "krea2_turbo" | "krea2_raw",
  "interface_mode": "simple" | "advanced",
  "show_work": false,
  "rows": [
    {
      "id": "row_<random>",
      "category": "<category>",
      "preset_id": "<id>",
      "label": "<label>",
      "phrase": "<phrase>",
      "control_mode": "scalar" | "bipolar" | "raw",
      "intensity": -100..100,
      "strength": -5..5,
      "enabled": true,
      "aliases": [...],
      "verification": "...",
      "source": "...",
      "positive_phrase": "<bipolar positive>",
      "negative_phrase": "<bipolar negative>",
      "neutral_phrase": "<bipolar neutral>",
      ...
    }
  ],
  "master_preset_id": "...",
  "selected_category": "..."
}
```

## Library

The bundled library is a static JSON file at
`presets/default_library.json`. The user library is at
`<user_directory>/Krea2PromptWizard/user_library.json`. Both are loaded
by the `Library` class in `src/library.py`, which merges them with a
stable priority (user presets win). Library writes use atomic
replacement with timestamped backups.

User-saved full prompts and concept groups are stored separately at
`<user_directory>/Krea2PromptWizard/saved_presets.json`. Their concept
snapshots include enabled states and exact intensity values.

## Preset snapshots

Every selected row carries a snapshot of the preset data needed to
render the prompt without consulting the library: `preset_id`,
`label`, `phrase`, `aliases`, `control_mode`, `negative_phrase`,
`neutral_phrase`, `positive_phrase`, `intensity`, `enabled`,
`verification`, `source`. This means a workflow from an older version
of the library continues to render the same prompt even if the user
library changes or the preset is renamed.

`strength` is the Wizard's direct prompt value and supports quarter
steps. `intensity` remains in saved rows for backward compatibility
with older workflows and the standalone weighted-phrase node.

Migrations are defined in `src/migrations.py` and are applied to every
row before compilation. Renamed or removed presets produce a new row
id; the legacy id is preserved in `legacy_preset_id` for traceability.
