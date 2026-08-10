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
2. The wizard uses mode **tabs**: 🎬 **Cast** and 🎥 **Scene**, with the
   advanced ✨ **Concepts** tab available from Node settings. A
   collapsible **Prompt** footer (preview, motion prompt, history,
   copy) sits at the bottom of every tab.
3. Start in **Cast**: add characters, then direct each one individually.
4. Use **Scene** for the main prompt, the selected scene, shot presets,
   and camera/lighting choices.
5. Open the **Prompt** footer for the live preview, the video motion
   prompt, and the copy buttons.

### Built-in LoRA support

Yes — the wizard can apply LoRAs for you. The node now has an optional
**Model** input and a **Model** output:

1. Connect a model to the `Model` input (skip it if you only want the
   prompt text).
2. In the Cast tab, open a character's **LoRA** section and pick a LoRA
   from your `loras` folder (the wizard lists them automatically), then
   set its strength.
3. The node applies every assigned LoRA to the model in cast order and
   passes it out of the `Model` output to your sampler.

A few honest notes on how this works under the hood:

- ComfyUI applies LoRAs to the **whole diffusion model**. There is no
  per-character model switch — so the wizard also keeps the LoRA's
  **trigger words inside that character's prompt block only**, which is
  what steers the LoRA's influence toward that character.
- LoRAs without trigger words usually respond to their **file name**
  (most are trained with it). Picking a LoRA auto-fills its file-name
  stem into the trigger-word box when it's empty.
- If the `Model` input is not connected but characters have LoRAs
  assigned, the node still works — it warns you and the LoRAs are not
  applied.

### Krea2 Save Image (prompt embedded in the PNG)

If you want the exact prompt **inside the image file itself**, use the
new **Krea2 Save Image** node instead of the plain Save Image:

```
KSampler output ──▶ Krea2 Save Image (images)
Wizard Prompt Output ──▶ Krea2 Save Image (prompt_text)
Wizard Video Motion Prompt ──▶ Krea2 Save Image (motion_text, optional)
```

It writes the standard `prompt` / `workflow` chunks **plus** the exact
resolved prompt text as its own `krea2_prompt` PNG chunk (and
`krea2_motion_prompt` when provided) — readable by any PNG metadata
tool. Several popular packs do the same automatically (WAS Node Suite's
"Save Image with Metadata", ComfyUI-Image-Saver, MelMass's
SaveImageWithMetaData, Efficiency Nodes), because the wizard already
writes `extra_pnginfo["krea2_prompt"]` on every execution.

### Getting the prompt into Timesaver's "Positive Prompt" field

The **Timesaver Artius Browser** (and A1111-style viewers) read the
standard `prompt` PNG chunk and show it as the Positive Prompt **only
when it is plain text, not the graph JSON**. With a `CLIPTextEncode`
node the graph JSON carries the literal prompt text, so Timesaver shows
it; with `Krea2 Prompt Weight` the text is a *linked* input (a node
reference, not literal text), so Timesaver has nothing to display.

Two built-in ways to fix it:

1. **Wizard setting** — enable *"Write the prompt as the standard
   'prompt' metadata chunk (Timesaver / A1111 compatible)"* in Node
   settings. The wizard then writes the resolved prompt as the final
   `prompt` chunk on every execution; the standard Save Image embeds it
   and Timesaver shows it as **Positive Prompt**. The graph JSON moves
   out of the `prompt` chunk (it stays available in the `workflow`
   chunk).
2. **Krea2 Save Image** — turn on its *plain_prompt_metadata* input.
   The saved PNG then carries a single plain-text `prompt` chunk with
   the exact prompt, with no graph JSON duplication at all.

Either way the workflow JSON stays intact in the `workflow` chunk, so
Timesaver's workflow view and PNG→workflow features keep working.

### Krea2 Prompt Saver (metadata workaround)

Your prompt *is* written into `extra_pnginfo` as `krea2_prompt`, but
whether it ends up inside the PNG depends on your Save Image node:
only Save Image variants that write `extra_pnginfo` keys will embed it
(modern built-in Save Image does; older ones and some forks only write
the standard `prompt`/`workflow` chunks). Routing the prompt through
KJNodes `Krea2PromptWeight` does not affect this either way.

For a workflow-independent record, add the **Krea2 Prompt Saver** node
and connect the wizard's `Prompt Output` (and optionally `Video Motion
Prompt`). Every execution is appended to
`ComfyUI/output/krea2_prompt_history.jsonl` with a timestamp, and the
metadata key is re-asserted at its own execution.

### Directing a scene (cast members)

Characters are now **directed** as cast members: each character owns
their own emotion, facial expression, body language, position in the
frame, face-guidance triggers, and interaction with other characters.
Two characters in one scene no longer share one emotion.

The Cast tab lists every character as its own **expandable section** —
one card per character with a clear divider, so you can see and direct
the whole cast at once. Expanding a character reveals everything for
that member together: appearance, direction, and LoRA triggers.

For every cast member you can set:

- **Placement** — a position preset such as *standing on the left side
  of the frame*. It compiles as
  `Mara (standing on the left side of the frame): …`.
- **Emotion quick picks** — one-click chips for Joy, Sadness, Anger,
  Fear, Surprise, Disgust, Serenity, and Determination. Click again to
  remove. “+ Add” opens the full searchable library, including the new
  *emotion trigger* and *face trigger* preset categories.
- **Face guidance triggers** — a free-text field where each line is
  emitted verbatim, e.g. `(sparkling bright eyes:1.4)` on its own line.
  These are the parenthetical guidance fragments Krea 2 / the KJNodes
  weighting patch respond to. (The repo's research notes that the
  `(phrase:weight)` syntax is not officially documented by Krea and is
  applied by the optional KJNodes patch; without it, parentheses are
  literal text.)
- **Body & movement** — body-language rows scoped to this character
  only.
- **Interaction** — relational direction such as *looking at Alex*.
- **LoRA trigger words** — one line per trigger, compiled only inside
  this character's block, so a LoRA loaded on the model influences this
  character alone and the rest of the cast stays distinct.

A character's static *Expression* field is skipped in the compiled
prompt once the character has direction of its own.

### Appearance (Sex, Age, and the look builder)

Each character's appearance is a set of **comboboxes**: pick a preset
value from the suggestions or type anything you want. The fields are
grouped into columns:

- **Identity & basics** — Sex (male / female / unspecified) and Age
  (child, teenager, young adult, adult, middle aged, elderly).
- **Hair & makeup** — style, length, colour, and makeup, each with a
  large curated option list.
- **Face** — eyes, nose, mouth, chin, and face shape.
- **Body & fitness** — body type, fitness, and proportions.
- **Clothing & armour** — either a full **Ensemble** (a complete look
  such as *western cowboy outfit* or *sci-fi crew uniform*) **or**
  separate **Top** and **Bottom** pieces. Choosing an ensemble disables
  the separates, and using separates disables the ensemble.

Every field also has a dice button and an **each run** checkbox.
Tick “each run” to have that one field randomized from its options
every time a job executes — mix and match per field, per character.

### Saving and casting characters

Use **Save** on a character's card to store its appearance (identity,
sex, age, clothing, hair, build) as a reusable preset. Saving with a
name that already exists asks for confirmation and then **overwrites**
the old preset instead of piling up duplicates — the same applies to
full-prompt, group, and setting presets. To reuse a character later,
open any cast member's *Character presets* picker, choose your saved
character, and press **Apply** — the appearance is replaced while the
member's emotion, face guidance, LoRA triggers, and position are kept.

### Shot presets and scenes

The **Scene** tab includes a **Shot preset** picker. Each shot is now a
**full preset**: it sets the scene (background name and description),
the camera/framing, the lighting, and the atmosphere together — pick
*Over-the-Shoulder Dialogue* and the whole scene is ready. The Scene
tab also hosts the main prompt, the **Selected scene** dropdown (picks
apply immediately; the name field is gone), and the camera / lighting /
environment / style concept groups, each with dozens of bundled presets
that load the moment you choose them.

### Video Motion Prompt (LTX-2.3)

The wizard exposes a second output, **Video Motion Prompt**. In the
**Prompt** tab, press **Draft from cast** to generate one motion line
per cast member from their emotion and body rows (e.g. *Mara (standing
on the left side of the frame) beams with joy, arms crossed, looking at
Alex*), then edit freely and enable the output. Feed the generated
still plus this motion prompt to an image-to-video model such as LTX-2.3.

### Using the concept groups

Concepts are organized into six practical groups: Subject, Expression
& Pose, Camera & Film, Lighting, Environment, and Style & Finish. Each
group can be randomized independently, or you can randomize all groups.
Randomize chooses between two and six concepts. Use the Photography /
Artwork switch to keep incompatible style and camera choices out of the
picker and randomizer. The full row grid lives in the **Concepts** tab.

### Saved presets

Use **Save Full Prompt** to store the description, concepts, enabled
states, and exact strengths together. Use **Save preset** inside a
group to store only that group's concepts and strengths. Saved presets
remain available after restarting ComfyUI.

Characters and settings have their own reusable presets. The character
editor includes built-in starting points and a compact avatar preview.
Settings can also choose a fresh location for every queued job.

Each group has its own **Load preset** menu beside Save and Randomize.
Enable **Each job** for any group that should receive a fresh random
combination every time a queued job runs. This deliberately makes the
Wizard node execute again instead of returning a cached prompt.

### Strength behaviour

Every concept uses a direct -3 to +3 strength in 0.25 steps:

- 0 emits `(phrase:0)`, while 1 emits the plain phrase.
- -1.25 emits `(phrase:-1.25)` and +3 emits `(phrase:3)`.

Hovering a concept connects it visually to its phrase in Live Preview.
Click a concept name to replace it. Click a concept inside Live Preview
to expand and locate its editable card.
- -3 applies maximum de-emphasis.

The gear button controls the range used by dice actions. It includes
0 to +1.5, 0 to +3, and -3 to +3 profiles plus custom limits.

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

The `Krea2 Prompt Wizard` exposes three outputs:

| Output | Description |
|---|---|
| `Prompt Output` | The compiled final prompt. |
| `Video Motion Prompt` | Optional per-character motion lines for image-to-video models such as LTX-2.3. Empty until enabled in the Prompt footer. |
| `Model` | The connected model with per-character LoRAs applied (if a model is connected and LoRAs are assigned). |

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
