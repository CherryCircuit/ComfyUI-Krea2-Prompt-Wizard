# V1 validation record

Recorded 2026-10-07 for the 1.10.0 single-workspace overhaul. Final source freeze used frontend cache 33. Results below distinguish
real runtime checks from the fixture harness and CPU parity from rendering.

| Check | Recorded result |
|---|---|
| Automated suite checkpoint | Final frozen suite: 402 tests passed in 5.328 seconds. |
| Materialized export | Real backend compiler and assembler produced identical text with character, environment, lighting, direct and raw negative weights. |
| Native CPU parity | 14 checks passed against upstream encoding and attention, including numerical torch comparisons. |
| Real ComfyUI CPU runtime | ComfyUI 0.39.0 / frontend 1.55.14 on isolated port 8199: four outputs, two Wizard nodes, preset save/rename/duplicate/delete, identity preservation and queue output passed. |
| Browser checks | Real runtime: 360×438 and 560×680 at canvas zoom 50%, 75%, 100% and 150%, each without horizontal overflow and with one vertical workspace scroller. Harness: 360×420, 560×680 and 900×760 checks passed. |
| GPU image parity | Not exercised; memory preflight stopped before model loading. |

Actual runtime checks saved Shock through the named in-app dialog with
four weights (3, 2, 1.5, 2), retained those rows when loading Serena's
identity, applied Cinematic two-light and Forest clearing presets, and
queued successfully. Final cache-33 queue `396f9be4-6abd-44e8-ba21-b9d5ae19ca91`
returned all four weighted Shock concepts and the environment description
exactly once. The Shock trace retained preset origin, the performance.shock
action and the owning character row. Legacy Anger weights matched the backend. Isolated test
presets were cleaned after rename, duplicate and delete checks. Two stale
cached nodes independently saved different presets; HTTP storage contained
both. Reloading identity preserved the Shock header.

The focused editor opened through actual browser interaction. At canvas
zoom 75%, focus used its own 100% scale and scrolled from 0 to 720 while
the canvas stayed at 75%. Physical
light distance accepted zero using native keyboard entry and synchronized
its sliders; metre-to-foot display conversion was checked. Thirty lines
of textarea input grew the editor and one Undo restored the complete
prior text. All 32 protected V2 and original-user-data hashes matched.
Five baseline workflows and 19 preset compatibility checks passed at
the earlier checkpoint. The real-runtime matrix covered two node sizes; 900-pixel width was
checked in the harness only. GPU rendering was not exercised.

Native conditioning enablement is in Advanced & Recovered concepts,
using Native conditioning weighting and its adjacent strength control.

The GPU preflight record is `build/validation-native/preflight.json`.
The 12 GB GPU had about 2.2 GB free and system memory about 5.1 GB free.
No extra model load or render was attempted. The user's running server,
resident model and original user data were preserved. CPU conditioning
parity does not establish generated-image parity or model quality.

Repeat verification using the installed `prompt-wizard-validation`
skill and DEVELOPMENT.md. Store dated screenshots and machine-readable
results under ignored `build/validation-*` directories, including the
runtime URL, node width, canvas zoom and scenario in each record. Keep
user data and model files out of shared evidence. Update this document
only with measured outcomes and clearly retain untested limitations.
