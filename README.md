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

Registry publication is still pending. Until the pack is published, install
or update it manually from GitHub. Manager cannot reliably attribute workflow
nodes to an unpublished pack.

### Manual

Drop the `ComfyUI-Krea2-Prompt-Wizard` directory into your
`ComfyUI/custom_nodes/` directory and restart ComfyUI.

```
cd ComfyUI/custom_nodes
git clone https://github.com/CherryCircuit/ComfyUI-Krea2-Prompt-Wizard
```

Restart ComfyUI. The wizard's frontend extension loads automatically
because the package exposes `WEB_DIRECTORY`.

### Update

Pull the latest changes and restart ComfyUI:

```
cd ComfyUI/custom_nodes/ComfyUI-Krea2-Prompt-Wizard
git pull
```

Your user library and saved prompt presets in
`<user_directory>/Krea2PromptWizard/` are preserved across updates.

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
2. Use the on-node wizard panel to type a short prompt idea, then hit
   the `+` buttons to add concepts.
3. Adjust each concept with its slider or exact numeric value. Use the
   eye to temporarily hide it or the delete button to remove it.
4. Use `Prompt Output` to feed the result into a `CLIPTextEncode` node.

### Combining multiple concepts

You can combine any number of concepts. Add several emotions, lighting
effects, camera settings, and style cues, each with its own slider.

Concepts are organized into six practical groups: Subject, Expression
& Pose, Camera & Film, Lighting, Environment, and Style & Finish. Each
group can be randomized independently, or you can randomize all groups.
Randomize chooses between two and six concepts. Use the Photography /
Artwork switch to keep incompatible style and camera choices out of the
picker and randomizer.

### Saved presets

Use **Save Full Prompt** to store the description, concepts, enabled
states, and exact strengths together. Use **Save preset** inside a
group to store only that group's concepts and strengths. Saved presets
remain available after restarting ComfyUI.

Each group has its own **Load preset** menu beside Save and Randomize.
Enable **Each job** for any group that should receive a fresh random
combination every time a queued job runs. This deliberately makes the
Wizard node execute again instead of returning a cached prompt.

### Strength behaviour

Every concept uses a direct -5 to +5 strength in 0.25 steps:

- 0 emits `(phrase:0)`, while 1 emits the plain phrase.
- -1.25 emits `(phrase:-1.25)` and +3.5 emits `(phrase:3.5)`.

Hovering a concept connects it visually to its phrase in Live Preview.
Click a concept name to replace it. Click a concept inside Live Preview
to expand and locate its editable card.
- -5 applies maximum de-emphasis.

Negative values **de-emphasise** the concept. To express a *different*
emotion, add a separate concept (e.g. *Sadness*).

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

The `Krea2 Prompt Wizard` exposes one STRING output:

| Output | Description |
|---|---|
| `Prompt Output` | The compiled final prompt. |

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
