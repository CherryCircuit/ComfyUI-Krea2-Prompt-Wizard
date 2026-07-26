# ComfyUI-Krea2-Prompt-Wizard

A **transparent, database-driven visual prompt builder for Krea 2 image
generation inside ComfyUI**.

The wizard ships with four nodes:

| Node | Purpose |
|---|---|
| `Krea2 Prompt Wizard` | The main all-in-one visual prompt builder. |
| `Krea2 Weighted Phrase` | A small, transparent primitive that renders one `(phrase:weight)` fragment. |
| `Krea2 Prompt Assembler` | A pure assembler for fragment lists (no visual builder). |
| `Krea2 Prompt Inspector` | A read-only inspector that formats a trace JSON into a table. |

The wizard never calls an LLM, never contacts external services, and
never downloads models. It generates a transparent, well-formatted
prompt plus a structured trace JSON you can inspect.

## Installation

### ComfyUI Manager

Search for *Krea2 Prompt Wizard* in the ComfyUI Manager and install.

### Manual

Drop the `ComfyUI-Krea2-Prompt-Wizard` directory into your
`ComfyUI/custom_nodes/` directory and restart ComfyUI.

```
cd ComfyUI/custom_nodes
git clone https://github.com/ComfyUI-Krea2-Prompt-Wizard/ComfyUI-Krea2-Prompt-Wizard
```

Restart ComfyUI. The wizard's frontend extension loads automatically
because the package exposes `WEB_DIRECTORY`.

### Update

Pull the latest changes and restart ComfyUI:

```
cd ComfyUI/custom_nodes/ComfyUI-Krea2-Prompt-Wizard
git pull
```

Your user library (`<user_directory>/Krea2PromptWizard/user_library.json`)
is preserved across updates.

### Uninstall

```
rm -rf ComfyUI/custom_nodes/ComfyUI-Krea2-Prompt-Wizard
```

Optionally remove your user data:

```
rm -rf <user_directory>/Krea2PromptWizard
```

The wizard writes to no other locations on disk.

## Basic usage

1. Add a `Krea2 Prompt Wizard` node.
2. Use the built-in dropdowns to pick a starter master preset and any
   extra emotion, lighting, camera, composition, or style presets you
   want.
3. Edit the base prompt template text directly in the multiline box.
4. Use `FINAL_PROMPT` (or any other channel) to feed the result into a
   `CLIPTextEncode` node.

### Combining multiple concepts

You can combine a starter recipe with extra dropdown presets. For more
advanced row-by-row control, use the `Krea2 Weighted Phrase` and
`Krea2 Prompt Assembler` nodes.

### Slider behaviour

The slider is always -100 to +100. In *Standard emphasis* mode:

- 0 emits the plain phrase (e.g. `shocked expression`).
- +100 emits `(phrase:3.0)`.
- -100 emits `(phrase:0.1)`.

Negative values **de-emphasise** the concept. To express a *different*
emotion, add a separate row (e.g. *Sadness*).

### Weighting modes

The wizard supports three modes per row:

1. **Standard emphasis** (default). The standard positive/negative curve.
2. **Bipolar**. Two opposite phrases share a slider; positive values
   select and emphasise the *positive* phrase, negative values select
   and emphasise the *negative* phrase, zero emits the neutral phrase.
3. **Raw** (advanced). Linear remap onto the -3.0..+3.0 range, with
   expert override up to ±4.0. The wizard emits a prominent warning
   whenever raw negative numerical weights are used.

### Library editor

If the optional frontend panel loads, the wizard header exposes a
library editor. You can:

- Add, edit, duplicate, and delete user presets.
- Search, filter by category, show user / bundled / verified only.
- Edit presets as a line-based text format (no JSON required).
- Import and export user libraries as JSON files.
- Restore the bundled defaults. User presets are preserved in a
  timestamped backup before being replaced.

### Show Work

Toggle *Show Work* in the wizard header to display a table of every
selected concept with its category, mode, slider value, mapped weight,
compiled fragment, and verification status. The Show Work panel
serves the same role as the `Krea2 Prompt Inspector` node.

### Materialize to Nodes

Click *Materialize* in the wizard header to expand the current
configuration into a group of normal ComfyUI nodes:

- One `Krea2 Weighted Phrase` per selected row.
- One `Krea2 Prompt Assembler` per category.
- The original Wizard node is left untouched so you can still edit it.

This is the recommended way to **learn** how the wizard works: every
row, every weight, and every category is visible and editable.

### Create Transparent Subgraph

If your ComfyUI version supports it, click *Create Subgraph* to
package the materialized configuration as a reusable subgraph. The
original Wizard node is preserved.

### Materialized groups are editable

Every materialized node is a real ComfyUI node. You can:

- Re-arrange them on the canvas.
- Reconnect them.
- Insert additional nodes in between.
- Re-run the workflow to see the new prompt.

## Outputs

The `Krea2 Prompt Wizard` exposes 16 STRING outputs:

| Output | Description |
|---|---|
| `FINAL_PROMPT` | Weighted prompt in category order. |
| `PLAIN_PROMPT` | Same prompt without `(phrase:weight)` syntax. |
| `BODY_PROMPT`, `EMOTION_PROMPT`, `FACE_PROMPT`, `CAMERA_PROMPT`, `COMPOSITION_PROMPT`, `LIGHTING_PROMPT`, `MOVEMENT_PROMPT`, `ATMOSPHERE_PROMPT`, `STYLE_PROMPT`, `DETAIL_PROMPT`, `CUSTOM_PROMPT` | Per-category fragments. |
| `TRACE_JSON` | Full trace JSON for the Inspector. |
| `STATE_JSON` | The wizard state JSON, as persisted. |
| `WARNINGS` | Aggregated warnings formatted as a multi-line string. |

## KJNodes integration (optional)

KJNodes is **not** required. The wizard works without it. If you have
KJNodes installed (`kijai/ComfyUI-KJNodes`), you can route the
`FINAL_PROMPT` STRING into the `Krea2 Prompt Weight` node to apply
Krea 2's attention-patched weighting. See
[`docs/KJNODES_INTEGRATION.md`](docs/KJNODES_INTEGRATION.md) and the
`subgraphs/Krea2_Prompt_Wizard_KJNodes.json` blueprint.

## Security

The wizard performs **no network activity**. It runs entirely on the
local ComfyUI host. The full security review is in
[`SECURITY.md`](SECURITY.md) and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Limitations

- The wizard is a prompt construction tool, not an inference engine.
  It cannot verify Krea 2 outputs.
- `(phrase:weight)` syntax is a community-reported behaviour for Krea 2.
  The official Krea 2 documentation does not formally guarantee it.
  Use the KJNodes `Krea2 Prompt Weight` node to apply it.
- The bundled library contains **no Krea 2 verified** presets. All
  presets ship as *general visual vocabulary* or *community reported*.
  Run the calibration workflow to record your own local results and
  update the verification status accordingly.
- The frontend is built against the current `Comfy-Org/ComfyUI_frontend`
  default branch. Older frontends may not support every feature.
  The backend compiler is the source of truth and works in any
  ComfyUI version.

## Troubleshooting

- **The wizard's visual panel does not appear.** Check the browser
  console for errors. The wizard node still works through the
  `wizard_state_json` STRING input.
- **A preset is missing after an update.** The wizard embeds a
  snapshot of every selected row in the workflow. If the bundled
  preset is renamed, the wizard auto-migrates the snapshot to the
  new id and adds a `legacy_preset_id` field for traceability.
- **Compile errors in the workflow.** The wizard never raises during
  execution. The backend falls back to the base prompt and returns
  a warning explaining the failure.

## Documentation

| Document | Description |
|---|---|
| [`docs/REFERENCE_VERSIONS.md`](docs/REFERENCE_VERSIONS.md) | Reference repository commits and dates. |
| [`docs/KREA2_PROMPT_RESEARCH.md`](docs/KREA2_PROMPT_RESEARCH.md) | Krea 2 prompt weighting research notes. |
| [`docs/KJNODES_INTEGRATION.md`](docs/KJNODES_INTEGRATION.md) | Optional KJNodes integration details. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Backend / frontend architecture. |
| [`docs/TRANSPARENCY.md`](docs/TRANSPARENCY.md) | How transparency is enforced. |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Threat model. |
| [`docs/USER_LIBRARY.md`](docs/USER_LIBRARY.md) | User library location and format. |
| [`docs/CALIBRATION.md`](docs/CALIBRATION.md) | Calibration workflow. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Developer guide. |
| [`SECURITY.md`](SECURITY.md) | Security review and uninstall. |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history. |

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE).
