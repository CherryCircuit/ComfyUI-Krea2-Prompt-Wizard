# Krea2 Prompt Wizard

*Transparent, database-driven visual prompt builder for Krea 2 image generation
inside ComfyUI.*

The main `Krea2 Prompt Wizard` node lets you assemble a Krea 2 prompt
without manually writing `(phrase:weight)` syntax. Pick concepts from a
searchable preset library, dial each slider from -100 to +100, and let
the wizard render the final prompt plus a Show Work table that lists
every phrase and weight the wizard contributes.

## Inputs

| Input | Type | Description |
|---|---|---|
| `wizard_state_json` | STRING | The wizard state, usually driven by the widget. JSON. |
| `base_prompt_override` | STRING | Optional replacement for the base prompt. |
| `model_profile` | ENUM | Generic / Krea 2 Turbo / Krea 2 Raw. |
| `expert_mode` | BOOLEAN | Permit raw negative weights above the 3.0 ceiling. |

## Outputs

| Output | Description |
|---|---|
| `FINAL_PROMPT` | Weighted prompt with category ordering. |
| `PLAIN_PROMPT` | Same prompt without weighting syntax. |
| `BODY_PROMPT` | Body language / pose row fragments. |
| `EMOTION_PROMPT` | Emotion fragments. |
| `FACE_PROMPT` | Facial action fragments. |
| `CAMERA_PROMPT` | Framing + angle + perspective + lens + aperture + body. |
| `COMPOSITION_PROMPT` | Composition fragments. |
| `LIGHTING_PROMPT` | Lighting setup + direction + effects. |
| `MOVEMENT_PROMPT` | Subject + camera + environment motion. |
| `ATMOSPHERE_PROMPT` | Atmosphere fragments. |
| `STYLE_PROMPT` | Style/medium fragments. |
| `DETAIL_PROMPT` | Detail fragments. |
| `CUSTOM_PROMPT` | Customised fragments. |
| `TRACE_JSON` | Full trace JSON for the Inspector. |
| `STATE_JSON` | The state JSON, as supplied / persisted. |
| `WARNINGS` | Aggregated warnings formatted as a multi-line string. |

## Notes

- The wizard never calls external services. It is fully offline.
- The wizard never executes commands or runs injected code.
- The wizard never modifies the user's library file without explicit
  action in the Library editor.
- `(phrase:weight)` syntax is a community-reported behaviour for Krea 2.
  The KJNodes `Krea2PromptWeight` node implements it. The wizard
  generates the syntax but does not patch the model.
