# Transparency

The wizard's defining principle is that **nothing is hidden from the
user**. This document enumerates the mechanisms that enforce
transparency.

## 1. Every row shows its rendered fragment

The wizard's row component displays the exact `(phrase:weight)` string
the backend will emit. The preview updates as the slider moves. There
is no "magic" between the slider and the prompt.

## 2. The Show Work panel

The Show Work panel renders a table of every selected concept with
its category, mode, slider value, mapped weight, compiled fragment,
and verification status. The Inspector node produces the same report.

## 3. Per-category outputs

The wizard exposes a separate STRING output for every category. The
final prompt is the sum of these categories, in the documented order.
You can wire the categories individually into other nodes if you want
to inspect or modify them.

## 4. Trace JSON

The wizard emits a structured `TRACE_JSON` that lists every row, the
weight that was applied, the phrase that was emitted, and the
verification status. The trace is the input to the Inspector node.

## 5. Materialize to Nodes

The Materialize button creates real ComfyUI nodes that mirror the
wizard's current configuration. Each row becomes a `Krea2 Weighted
Phrase` node. Each category becomes a `Krea2 Prompt Assembler`. The
user can rearrange, reconnect, and inspect these nodes. The wizard
node itself is preserved.

## 6. Create Transparent Subgraph

If the current ComfyUI version supports subgraph conversion, the wizard
packages the materialized configuration as a reusable subgraph. The
wizard node itself is preserved.

## 7. The Wizard never silently removes the user's choices

The wizard emits warnings for conflicts and never silently drops a
selected row. The trace JSON lists every row, including disabled
ones, with their `enabled` flag.

## 8. The Wizard never executes user text

The wizard validates and assembles text. It never evaluates a user
phrase as Python or JavaScript. The validator never uses `eval` or
`exec`.

## 9. The Wizard never calls external services

The wizard performs no network activity. The bundled data is
self-contained. The frontend extension loads only from the local
ComfyUI extension directory.

## 10. Library editing is transparent

The Library editor uses a line-based text format that requires no JSON
knowledge. The bundled defaults are restored only after the user
confirms. Every user edit creates a timestamped backup of the
previous file.

## 11. The Wizard never modifies the user's library without action

The wizard loads the user library on demand. The Library editor's
"Save" button is the only path that writes to disk. Restore Bundled
Defaults explicitly empties the user library after a backup.

## 12. Determinism

The compiler is a pure function. Feeding the same wizard state twice
produces the same prompt. The trace JSON is deterministic.
