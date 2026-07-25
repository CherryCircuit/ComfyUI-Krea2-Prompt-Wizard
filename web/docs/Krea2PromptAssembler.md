# Krea2 Prompt Assembler

*Reusable assembler that joins a base prompt with a list of dynamic
fragments and returns the final, plain, category, and trace outputs.*

The assembler is a transparent alternative to the wizard. It is
functionally a subset of the wizard that exists for users who want a
pipeline without the visual builder.

## Inputs

| Input | Type | Description |
|---|---|---|
| `base_prompt` | STRING | Base scene description. |
| `separator` | STRING | Separator (default `", "`). |
| `fragment_count` | INT | Number of fragments to expose (1..16). |
| `fragment_<n>` | STRING | Fragment text. |
| `fragment_<n>_weight` | FLOAT | Fragment weight. |
| `fragment_<n>_category` | STRING | Category for grouping. |

## Outputs

| Output | Description |
|---|---|
| `final_prompt` | Weighted prompt. |
| `plain_prompt` | Plain prompt. |
| `body_prompt` | Body fragments. |
| `emotion_prompt` | Emotion fragments. |
| `face_prompt` | Facial fragments. |
| `camera_prompt` | Camera fragments. |
| `composition_prompt` | Composition fragments. |
| `lighting_prompt` | Lighting fragments. |
| `movement_prompt` | Movement fragments. |
| `atmosphere_prompt` | Atmosphere fragments. |
| `style_prompt` | Style fragments. |
| `detail_prompt` | Detail fragments. |
| `custom_prompt` | Custom fragments. |
| `trace_json` | Trace JSON for the Inspector. |
| `warnings` | Aggregated warnings. |
