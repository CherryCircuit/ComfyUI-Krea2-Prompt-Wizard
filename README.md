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
2. The wizard now uses four **mode tabs**: 🎬 **Cast**, 🎥 **Scene**,
   ✨ **Concepts**, and 📜 **Prompt**. Only one section is visible at a
   time, so the node stays calm even for complex scenes.
3. Start in **Cast**: add characters, then direct each one individually.
4. Use **Scene** for the main prompt, setting, shot presets, and
   camera/lighting choices.
5. Check **Prompt** for the live preview, the video motion prompt, and
   the copy buttons.

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

The **Scene** tab includes a **Shot preset** picker with cinematic
starting points such as *Over-the-Shoulder Dialogue*,
*Two-Character Conversation*, *Reaction Close-Up*, *Reverse Shot*,
*Establishing Duo*, and *Intimate Two-Shot*. Shot presets add the
matching framing, angle, lens, and lighting rows in one click. The
Scene tab also hosts the main prompt, the setting editor, and the
camera / lighting / environment / style concept groups.

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

The `Krea2 Prompt Wizard` exposes two STRING outputs:

| Output | Description |
|---|---|
| `Prompt Output` | The compiled final prompt. |
| `Video Motion Prompt` | Optional per-character motion lines for image-to-video models such as LTX-2.3. Empty until enabled in the Prompt tab. |

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
