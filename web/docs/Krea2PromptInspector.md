# Krea2 Prompt Inspector

*Read-only inspector that formats a trace or state JSON into a table.*

## Inputs

| Input | Type | Description |
|---|---|---|
| `trace_json` | STRING | Trace JSON produced by the wizard. |
| `state_json` | STRING | Wizard state JSON (used when no trace is available). |
| `final_prompt` | STRING | Final prompt, displayed at the bottom of the report. |

## Outputs

| Output | Description |
|---|---|
| `report` | A formatted plain-text report. |
| `warnings` | Aggregated warnings. |
| `normalized_trace_json` | A cleaned-up copy of the trace JSON. |
