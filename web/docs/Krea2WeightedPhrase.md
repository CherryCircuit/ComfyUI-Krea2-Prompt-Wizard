# Krea2 Weighted Phrase

*Transparent primitive that renders a single weighted phrase.*

The Weighted Phrase node is intentionally simple. It exists so you can
read, edit, and learn from the wizard's components by looking at them.

## Inputs

| Input | Type | Notes |
|---|---|---|
| `phrase` | STRING | Phrase to render. |
| `enabled` | BOOLEAN | When false, the row is omitted. |
| `control_mode` | ENUM | scalar / bipolar / raw. |
| `intensity` | INT | -100..100 slider. |
| `positive_phrase` | STRING | Optional bipolar positive phrase. |
| `negative_phrase` | STRING | Optional bipolar negative phrase. |
| `neutral_phrase` | STRING | Optional bipolar neutral phrase. |
| `custom_min` | FLOAT | Optional lower bound. |
| `custom_max` | FLOAT | Optional upper bound. |
| `raw_mode` | BOOLEAN | Permit raw negative numerical weights. |

## Outputs

| Output | Description |
|---|---|
| `weighted_phrase` | The rendered `(phrase:weight)` fragment. |
| `plain_phrase` | The phrase without weighting syntax. |
| `mapped_weight` | The mapped weight value. |
| `trace_json` | Full trace JSON for the Inspector. |
| `warnings` | Aggregated warnings.
