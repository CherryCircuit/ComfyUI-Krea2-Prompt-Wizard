# Krea2 Prompt Wizard

*Transparent, database-driven visual prompt builder for Krea 2 image generation
inside ComfyUI.*

The main `Krea2 Prompt Wizard` node lets you assemble a Krea 2 prompt
without manually writing `(phrase:weight)` syntax. Pick concepts from a
searchable preset library, dial each concept from -3 to +3, and let
the wizard render the final prompt plus a Show Work table that lists
every phrase and weight the wizard contributes.

Every added concept has a direct -3 to +3 slider in 0.25 steps, exact
numeric value, visibility eye, and delete button. Concepts are grouped into Subject, Expression &
Pose, Camera & Film, Lighting, Environment, and Style & Finish.
Randomize one group or all groups, and save either the complete prompt
or any individual group with its exact values.

Saved group presets can be loaded from that group's action bar. Enable
**Each job** to generate a fresh random setup for that group on every
queued execution while leaving the main description unchanged.

People & Characters provides compact named character tabs, a simple
avatar preview, built-in and user character presets, and expandable
appearance controls. Setting & Scene includes a large location library,
user presets, and its own **Each job** option.

Open the gear button to choose the strength range used by every dice
action. Gentle uses 0 to +1.5, Positive uses 0 to +3, Wild uses -3 to
+3, and custom quarter-step limits are available.

Click a concept name to replace it with the current choice already
highlighted. Hover cards or linked phrases in Live Preview to see their
relationship, and click a preview phrase to reveal its card.

The Photography / Artwork switch filters incompatible style and camera
choices from both the concept picker and group randomization. Randomize
chooses between two and six concepts for a group.

## Inputs

| Input | Type | Description |
|---|---|---|
| `wizard_state_json` | STRING | The wizard state, usually managed by the visual editor. |
| `expert_mode` | BOOLEAN | Advanced control for raw numerical weights. |

## Outputs

| Output | Description |
|---|---|
| `Prompt Output` | The final weighted prompt, ready to connect to a text encoder. |

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
