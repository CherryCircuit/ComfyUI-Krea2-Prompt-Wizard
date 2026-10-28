# Reference Versions

This document records the exact source repositories, commit SHAs, branches, and
inspection dates used to build **ComfyUI-Krea2-Prompt-Wizard**. Sources are
inspected via `git ls-remote` / `HEAD` endpoints on GitHub. The original sources were
retrieved from the default public branch. The KJNodes entry was refreshed from
the local installed checkout on 2026-10-07 for the native weighting port.

| Repository | Branch | Commit SHA | Retrieved | Commit author |
|---|---|---|---|---|
| `Comfy-Org/ComfyUI` | `master` | `f966a2b` | 2026-07-25 | comfyanonymous |
| `Comfy-Org/ComfyUI_frontend` | `main` | `1039660` | 2026-07-25 | huang47 |
| `kijai/ComfyUI-KJNodes` | installed checkout | `d3cfe21625e5170126ce06fbfcfe1d88108688c3` | 2026-10-07 | kijai |
| `Comfy-Org/workflow_templates` | `main` | `c56b99f` | 2026-07-25 | comfyui-wiki |
| `krea-ai/krea-2` | `main` | `db3984f` | 2026-07-25 | Abhinay1997 |

Additional commits inspected for KJNodes integration history:

| Commit | Note |
|---|---|
| `1271209` | First Krea2PromptWeight commit (KJNodes) |
| `780930c` | Krea2PromptWeight: better positive weighting (KJNodes) |

## Files inspected

The following files were reviewed live from the repositories above to derive
the current API surface and behaviour documented in this project:

### ComfyUI backend

- `nodes.py` — `ComfyNodeABC`, `CLIPTextEncode`, conditioning nodes, `IO` enum
- `comfy_extras/nodes_compositing.py` — modern `ComfyNode`/`ComfyExtension` pattern
- `folder_paths.py` — `get_user_directory()`, `get_full_path()`, `get_filename_list()`
- `server.py` — `/object_info`, `/prompt`, `/userdata`, `/internal/folder_paths`

### ComfyUI frontend

- `src/extensions/core/index.ts` — extension entry points
- `src/extensions/core/customWidgets.ts` — `beforeRegisterNodeDef`, `app.registerExtension`
- `src/extensions/core/editAttention.ts` — Ctrl+up/down prompt weighting reference
- `src/extensions/core/widgetInputs.ts` — `PrimitiveNode`, `app.registerNodeDef`
- `src/extensions/core/groupNode.ts` — group node migration to subgraph
- `src/stores/domWidgetStore.ts` — DOM widget registry
- `src/scripts/api.ts` — `storeUserData`, `getUserData`, `getExtensions`

### KJNodes

- `__init__.py` — node registration table (Krea2PromptWeight confirmation)
- `nodes/nodes.py` — `JoinStringMulti`, `JoinStrings`, `WidgetToString`
- `nodes/model_optimization_nodes.py` — `Krea2PromptWeight` implementation

### Krea 2

- `README.md` — model profile (Turbo, Raw), inference defaults
- `docs/prompting.md` — official prompting guidance (natural language, no syntax claim)
- `inference.py` — sampling parameters and CLIP/autoencoder pipeline

### workflow_templates

- `README.md` — current workflow JSON and subgraph blueprint schema
- `blueprints/index.schema.json` — referenced as schema source

## License notes

| Source | License |
|---|---|
| `Comfy-Org/ComfyUI` | GPL-3.0 |
| `Comfy-Org/ComfyUI_frontend` | GPL-3.0 |
| `kijai/ComfyUI-KJNodes` | GPL-3.0 |
| `krea-ai/krea-2` | Krea Community License (model weights); repository MIT |
| `Comfy-Org/workflow_templates` | GPL-3.0 |

The isolated native Krea 2 weighting module is adapted from KJNodes at the
pinned installed revision above, retaining attribution and GPL notices. It was
modified on 2026-10-07 for lazy runtime imports, validation, inspector warnings
and isolated integration. No runtime KJNodes installation is required. Other
entries record the older API inspections and do not claim current versions.

## Build policy

This project is built against the **default public branch** of each source
repository on the **inspection date** above. Subsequent upstream changes may
require re-validation:

- `ComfyUI`: the V3 node API is stable; `ComfyNodeABC` patterns remain
- `ComfyUI_frontend`: `app.registerExtension` interface is stable
- `KJNodes`: imported nodes are referenced by class name; removals will warn
- `Krea2`: model card, prompting documentation, and CLI surface
- `workflow_templates`: workflow JSON schema and subgraph blueprint format
