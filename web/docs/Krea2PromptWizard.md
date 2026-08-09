# Krea2 Prompt Wizard

*Transparent, database-driven visual prompt builder for Krea 2 image generation
inside ComfyUI.*

The main `Krea2 Prompt Wizard` node lets you assemble a Krea 2 prompt
without manually writing `(phrase:weight)` syntax. Pick concepts from a
searchable preset library, dial each concept from -3 to +3, and let
the wizard render the final prompt plus a Show Work table that lists
every phrase and weight the wizard contributes.

## Mode tabs

The editor is organised into four tabs so the node stays calm:

| Tab | Contents |
|---|---|
| 🎬 **Cast** | Saved characters, cast members, and per-character direction. |
| 🎥 **Scene** | Main prompt, setting, shot presets, and the camera / lighting / environment / style concept groups. |
| ✨ **Concepts** | The full concept grid (all groups), the add-concept picker, and per-group presets / randomize / Each job. |
| 📜 **Prompt** | Live preview (Pretty / Code), video motion prompt, history, copy buttons, and Show Work. |

## Directing cast members

The Cast tab lists every character as its own **expandable card** with
a clear divider. Expanding a card reveals everything for that member
together: appearance, direction, and LoRA triggers.

Each cast member owns:

- **Placement** — position presets such as *standing on the left side
  of the frame* compile as `Name (position): …`.
- **Emotion quick picks** — one-click chips (Joy, Sadness, Anger, Fear,
  Surprise, Disgust, Serenity, Determination). Click again to remove.
- **Emotion & face** — per-character rows from the emotion, emotion
  trigger, face, face trigger, gaze, and mouth categories.
- **Face guidance triggers** — free-text lines emitted verbatim, e.g.
  `(sparkling bright eyes:1.4)`. Parentheses and weights are preserved.
- **Body & movement** — per-character body-language rows.
- **LoRA trigger words** — free-text lines compiled only inside this
  character's block, so a LoRA loaded on the model influences this
  character alone.
- **Interaction** — relational direction such as *looking at Alex*.

Characters therefore no longer share one emotion: a cast of two can
have one member joyful and the other sad in a single prompt.

## Appearance

Each appearance field is a **combobox**: pick from curated options or
type anything. Fields are grouped into columns:

- **Identity & basics** — Sex (male / female / unspecified), Age
  (child, teenager, young adult, adult, middle aged, elderly).
- **Hair & makeup** — style, length, colour, makeup.
- **Face** — eyes, nose, mouth, chin, face shape.
- **Body & fitness** — body type, fitness, proportions.
- **Clothing & armour** — a full **Ensemble** look *or* separate
  **Top** / **Bottom** pieces. Choosing one disables the other.

Every field has a dice button and an **each run** checkbox that
randomizes that one field from its options on every queued job.

**Save** on a character card stores the look as a reusable preset;
saving with a name that already exists asks for confirmation and
overwrites instead of duplicating. Applying a saved character to a cast
member replaces the appearance but keeps the member's emotion, face
guidance, LoRA triggers, and position.

## Shot presets

The Scene tab's **Shot preset** picker offers cinematic starting points
(*Over-the-Shoulder Dialogue*, *Two-Character Conversation*,
*Reaction Close-Up*, *Reverse Shot*, *Establishing Duo*,
*Intimate Two-Shot*) plus the existing scene presets.

## Video Motion Prompt

The node exposes a **Video Motion Prompt** STRING output. In the Prompt
tab, **Draft from cast** builds one motion line per cast member from
their emotion and body rows; edit the text freely and enable the
output. Feed the generated still plus this prompt to an image-to-video
model such as LTX-2.3.

## Inputs

| Input | Type | Description |
|---|---|---|
| `wizard_state_json` | STRING | The wizard state, usually managed by the visual editor. |
| `expert_mode` | BOOLEAN | Advanced control for raw numerical weights. |

## Outputs

| Output | Description |
|---|---|
| `Prompt Output` | The final weighted prompt, ready to connect to a text encoder. |
| `Video Motion Prompt` | Optional per-character motion lines for image-to-video models. Empty until enabled. |

## Notes

- The wizard never calls external services. It is fully offline.
- The wizard never executes commands or runs injected code.
- The wizard never modifies the user's library file without explicit
  action in the Library editor.
- Full-prompt and group presets are saved locally only when you choose
  Save Full Prompt or Save preset.
- Character and setting presets are saved to the same local preset
  library and are available in other workflows.
- When prompt metadata is enabled, connect Prompt Output to the text
  encoder that drives the image. ComfyUI's normal Save Image node then
  stores the exact resolved text in the PNG metadata as `krea2_prompt`.
  The generated-prompt history below Preview keeps recent outputs ready
  to copy during the current session.
- `(phrase:weight)` syntax is a community-reported behaviour for Krea 2.
  The KJNodes `Krea2PromptWeight` node implements it. The wizard
  generates the syntax but does not patch the model.
