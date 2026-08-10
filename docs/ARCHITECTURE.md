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
            krea2_prompt_wizard_v3.js     # entry point (helpers are .mjs)
            state.mjs                     # schema, helpers, compile mirror
            searchable_selector.mjs
            preset_row.mjs
            library_editor.mjs
            materialize.mjs
            inspector.mjs
            wizard_widget.mjs             # the visual editor
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
        example_two_character_scene.json

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
        test_cast.py                    # per-character direction / appearance
        test_loras.py                   # LoRA pipeline, Prompt Saver, Save Image, Timesaver compat
        test_subgraphs.py               # blueprint schema + node-contract checks
        frontend_smoke.mjs              # DOM-level smoke test (fake DOM)
        frontend_state_contract.mjs     # state helper round-trip checks
        golden/                         # golden prompt tests + fixtures
            test_golden.py
            golden/                     # recorded golden outputs

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
        AGENTS.md                       # handoff notes for future agents
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

`src/nodes.py` defines six node classes: the wizard, a metadata-writing
save node (`Krea2SaveImage`), a prompt-recording node
(`Krea2PromptSaver`), the weighted-phrase primitive, the assembler, and
the inspector. Each class uses the V3 node API pattern (subclassing
nothing, declaring `INPUT_TYPES` / `RETURN_TYPES` / `FUNCTION` /
`CATEGORY` class methods). They never import from `comfy` or
`comfy_extras` at module level — all ComfyUI/PIL imports are lazy so
the package stays testable without the ComfyUI runtime.

The compiler, weight mapping, conflicts, and migrations modules are
imported by the wizard's backend but have no ComfyUI dependencies and
can be exercised in unit tests without the ComfyUI runtime.

## Frontend

The frontend uses one auto-discovered JavaScript entry point,
`web/krea2_prompt_wizard_v3.js`. Its helper files use the `.mjs` extension so
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
  "base_prompt": "string",           // UI label: "Additional info"
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
      "strength": -3..3,
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
  "selected_category": "...",
  "motion_prompt": "...",          // optional video-motion override
  "motion_prompt_enabled": false,  // emits Video Motion Prompt output
  "active_tab": "cast",            // last-used mode tab
  "footer_open": false,            // collapsible prompt footer
  "show_concepts_tab": false,      // advanced Concepts tab visibility
  "show_face_guidance": false,     // per-character face-guidance fields
  "show_motion_prompt": false,     // motion prompt section visibility
  "prompt_metadata_override": false, // plain-text "prompt" metadata chunk
  "characters": [ ... cast members ... ]
}
```

## Cast members (per-character direction)

The state's `characters` array holds *cast members*. Each member owns a
per-character direction block in addition to its appearance fields:

```
{
  "id": "character_<random>",
  "name": "Mara",
  "enabled": true,
  "character_ref": "saved_character_...",   // optional saved-character preset
  "position": "standing on the left side of the frame",
  "face_guidance": "(sparkling bright eyes:1.4)\n(genuine warm smile:1.2)",
  "interaction": "looking at Alex",
  "rows": [ ... per-character direction rows ... ],
  "lora_name": "style_x.safetensors",       // applied via the Model input
  "lora_strength": 0.8,
  "lora_triggers": "young woman\n...",
  "randomize_fields": { "hair_color": ["red", "blonde"] },   // each-run appearance pools
  "randomize_direction_groups": { "face": true },            // each-run direction flags
  "expanded": true,
  "additional_open": false,
  "sex": "female", "age": "young adult", "ethnicity": "Vulcan",
  "ensemble": "western cowboy outfit",      // or clothing_top / clothing_bottom
  "additional_info": "...",
  "subject": "adult woman",                 // legacy; kept for old workflows
  "expression": "calm confidence",          // skipped when the member has direction
  "clothing": "...",                        // legacy; migrates to ensemble, suppressed when a new look is set
  "hair_color": "...", ...
}
```

Direction rows are grouped into four per-character sections with the
full Concepts-tab action set (add, presets, save, randomize, each-run
shuffle): `emotion`, `face`, `body`, `placement`. The backend mirrors
the group→category mapping in `src/job_randomizer.py`
(`DIRECTION_GROUP_CATEGORIES`).

`src/compiler.py` compiles each member independently. Direction rows
(emotion, emotion_trigger, face, face_trigger, gaze, mouth, body,
position) are weighted per member and emitted inside that member's
clause, so two characters never share one emotion:

```
Character Mara (standing on the left side of the frame): sex: female;
age: young adult; ethnicity: Vulcan; costume: western cowboy outfit,
(joy:1.5), (gentle smile:1.25), (sparkling bright eyes:1.4), looking at Alex
```

Face-guidance lines are emitted verbatim; rows flagged `verbatim` are
emitted exactly as typed (no stripping or re-weighting). The compiler
also drafts a per-member **motion line** for video models (LTX-2.3)
from the strongest emotion and body rows; the draft is exposed as
`motion_prompt_draft`, and the effective `motion_prompt` is emitted
from the `Video Motion Prompt` output when `motion_prompt_enabled` is
set or a `motion_prompt` override exists.

## Image output and metadata

`Krea2SaveImage` writes the standard `prompt` / `workflow` chunks plus
the resolved prompt as its own `krea2_prompt` chunk (and
`krea2_motion_prompt` when provided). With `plain_prompt_metadata` it
writes the prompt text as the `prompt` chunk itself — the format the
Timesaver Artius Browser and A1111-style viewers display as "Positive
Prompt" (see `docs/AGENTS.md` §4.2 for the full mechanism).

`Krea2PromptSaver` records every execution's prompt (with timestamp)
to `ComfyUI/output/krea2_prompt_history.jsonl` and re-asserts the
metadata keys — the workflow-independent fallback when a Save Image
variant ignores `extra_pnginfo` keys.

## Subgraph blueprints

The four `subgraphs/*.json` files are frontend "subgraph blueprints":
workflows whose `definitions.subgraphs` hold reusable node groups. The
ComfyUI frontend validates them strictly — slot ids must be UUIDs,
`version` must be 1, and node input/output names must exist on the
registered nodes. Regenerate with `scripts/build_workflows.py`; the
contract is enforced by `tests/test_subgraphs.py`.

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
