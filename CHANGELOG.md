# CHANGELOG

## 1.4.1 — v1.4.0 regression fixes

### Fixes

- **Cast direction sections now collapse.** Each per-character section
  (Emotion, Face & gaze, Body & movement, Placement) responds to header
  clicks again, exactly like the Scene groups: click the header to
  collapse or expand, and the collapse state is remembered per
  character (`character.collapsed_direction`) so one member's
  collapse choices never affect another. New characters start fully
  expanded, matching v1.4.0's first-run behaviour.
- **Removed the useless "or type a position" row on every cast
  member.** The old row built a select listing every position concept
  (not just positions) plus a dice that picked one at random — the
  label promised free text but the control was a fixed dropdown. The
  row, its dice, and its dead CSS are gone. `character.position` is
  untouched in state, so existing prompts still compile
  "Character X (standing on the left side of the frame)" exactly as
  before.
- **The Mii-style avatar lost its definition.** The v1.4.0 borderless
  styling also stripped the avatar's sex-accent border, leaving the
  little box on the card looking blank. The sex accent is restored as
  a soft tinted ring (`is-male` blue, `is-female` pink, unspecified
  grey) around the avatar art, and the smoke test now asserts that
  identity fields reach the avatar as modifier classes.
- Bumped frontend cache imports to `?v=6` so ComfyUI reloads the
  updated assets.

### Notes

- Appearance-field randomization needs no change: the v1.4.0 dice
  already supports click-to-roll and Shift-click to toggle 🔀 each-run
  randomization; this release verifies it and keeps its CSS.

## 1.4.2 — Fix "Failed to load subgraph blueprints x4"

- Bundled subgraph blueprint files were being written as full workflow envelopes (the actual blueprint nested under `definitions.subgraphs`). The ComfyUI frontend's `zSubgraphDefinition` schema expects each file to BE the bare blueprint, so all four blueprints (`Krea2_Prompt_Wizard_Basic/Transparent/KJNodes`, `Krea2_Prompt_Calibration`) were rejected on every load, producing the `Failed to load subgraph blueprints x4` toast.
- `scripts/build_workflows.py` now writes each subgraph as the bare blueprint object (`make_subgraph_*()` already returned the correct shape).
- `tests/test_subgraphs.py` and `scripts/validate_workflows.py` updated to accept either the new bare format or the legacy wrapped format, so downstream forks stay green.
- Versions bumped 1.4.1 → 1.4.2.

## 1.4.1 — Fix v1.4.0 regressions

## 1.4.0 — Apple-style prompt exploration UI

- Reworked the wizard chrome toward a calmer Apple-style interface: soft surfaces, fewer borders, larger readable type, and spacing-based grouping.
- Added a sticky PROMPT chip that keeps the compiled prompt, cast/concept/LoRA counts, and copy action visible while editing.
- Compressed appearance randomization to one per-field icon: click 🎲 to roll once, Shift-click to toggle 🔀 each-run randomization.
- Retired the separate Concepts tab from normal UI chrome; scene-level concepts remain on Scene, and per-character direction/concepts remain on Cast.
- Removed the fixed 700×720 auto-grow floor so the node can shrink when the content is compact.
- Bumped frontend cache imports to `?v=5` so ComfyUI reloads the updated assets.


## 1.3.4 — 2026-08-10

### Fixes

- **"Failed to load subgraph blueprints x4" on launch** — the four
  bundled subgraph blueprints used slot ids like `i0`/`o0`, which the
  ComfyUI frontend rejects (its `zSubgraphIO` schema requires UUID
  ids), and referenced node outputs that no longer exist
  (`FINAL_PROMPT`, `TRACE_JSON`, `WARNINGS`, `base_prompt_override`).
  Blueprints regenerated with UUID slot ids and the current node
  contract (`Prompt Output`, `Video Motion Prompt`, `Model`); a new
  test suite validates every blueprint against the frontend's schema
  and the registered node definitions.
- **Stale legacy looks** — characters from pre-1.2.0 workflows carried
  `clothing`/`subject`/`expression` fields that compiled
  ("clothing and armour: elegant formal dress") with no UI to clear
  them. `clothing` now migrates into the editable **Ensemble** field on
  load, and the compiler suppresses legacy `clothing` whenever
  ensemble/top/bottom are set.
- **Per-character direction randomization ran only when the global
  randomize flag existed** — `randomize_enabled_groups` returned early
  when `randomize_on_job` was absent, skipping per-character
  randomization entirely. Restructured so character randomization
  always runs.

### Features

- **Character direction sections now match the Concepts tab exactly:**
  the count sits on the right, and each section (Emotion, Face & gaze,
  Body & movement, Placement) has the full action set — blue "+ Add",
  auto-loading presets, Save preset, randomize dice, and the each-run
  shuffle. Per-direction randomization also works on every queued job
  (`randomize_direction_groups`, honored by the backend).
- **Ethnicity field** under Identity & Hair with 60+ options covering
  Earth ethnicities and popular sci-fi species (Vulcan, Twi'lek,
  Asari, Na'vi, …), compiled as `ethnicity: …`.
- **Avatar fits its frame** — the art renders inside a scaled layer
  with a larger 104×154 canvas, so hair, body, and label are no longer
  clipped; header avatars are bigger too.
- **Concept rows** — breathing room between the star and the title and
  between the slider and the numeric readout; the number box hides its
  spinners and is wide enough for values like `1.75`.

## 1.3.3 — 2026-08-10

### Features

- **Timesaver Artius Browser "Positive Prompt" support.** Root cause
  identified from Timesaver's own extraction code
  (`TSExtractPromptPartsFromPromptField`): it shows the `prompt` chunk
  as the Positive Prompt only when it is plain text, and when it is the
  graph JSON it skips *linked* text inputs — exactly what
  `Krea2PromptWeight` produces. Two built-in fixes:
  - New wizard setting *"Write the prompt as the standard 'prompt'
    metadata chunk (Timesaver / A1111 compatible)"* — the resolved
    prompt is written as the final `prompt` chunk every execution;
    standard Save Image embeds it (PIL readers take the last chunk).
  - `Krea2 Save Image` gains a `plain_prompt_metadata` input that
    writes a single plain-text `prompt` chunk.
  The graph JSON remains available in the `workflow` chunk either way.
- Tests now include a faithful port of Timesaver's extraction rules,
  proving: the old graph-JSON/linked-input format shows no positive
  prompt (the reported symptom), while both fixes are shown as the
  Positive Prompt.

## 1.3.2 — 2026-08-09

### Features

- **Krea2 Save Image** — new built-in image saver that embeds the exact
  generated prompt into the PNG as its own `krea2_prompt` text chunk
  (plus `krea2_motion_prompt`), alongside the standard `prompt` /
  `workflow` chunks. Connect the KSampler output to `images` and the
  wizard's `Prompt Output` to `prompt_text`. End-to-end test writes a
  real PNG and verifies the metadata round-trip.
- Docs for metadata-savvy third-party savers (WAS Node Suite,
  ComfyUI-Image-Saver, MelMass SaveImageWithMetaData, Efficiency
  Nodes) that pick up the wizard's `extra_pnginfo["krea2_prompt"]`
  automatically.

## 1.3.1 — 2026-08-09

Fixes and polish from the 1.3.0 round.

### Fixes

- **Cast tab no longer blanks out when adding a character.** The
  appearance grid passed a live `HTMLCollection` where a node was
  expected, which crashed rendering in real browsers only. The grid now
  builds its columns directly, the test harness rejects non-node
  appends, and any future render error is shown inside the node instead
  of a blank panel.
- **Video motion prompt is hidden by default** and lives behind a
  "Show the video motion prompt section (LTX-2.3)" toggle in Node
  settings.
- Settings toggles (Concepts tab, face guidance, motion section) now
  re-render immediately.
- Frontend assets bumped to `?v=4` to clear stale browser caches.

### UI polish

- The preview is now stacked — the visual preview followed by the raw
  prompt code — instead of Pretty/Code tabs, with a single Preview
  heading.
- Top bar: the "My presets" row lost its box/background and fits on one
  line; Save Full Prompt is expanded.
- Shuffle (🔀) buttons are larger.
- The Scene tab lays the **Additional info** box and the Scene box side
  by side, with a clear gap before the Camera & Film section.
- "Main prompt" is now labelled **Additional info**.
- Delete buttons (concepts, characters, presets) turn red on hover;
  the concept delete button is compact and no longer overflows its row.
- Concept rows are single-line: the title wraps to two lines beside
  the slider and the numeric readout.

## 1.3.0 — 2026-08-09

Built-in LoRA support, Mii-style character previews, and a decluttered
Scene tab.

### Features

- **Built-in LoRA support** — the wizard now has an optional `Model`
  input and `Model` output. The Cast tab lists every LoRA in your loras
  folder per character, with a strength slider; the node applies them
  to the connected model. Trigger words (auto-filled from the file name
  when a LoRA has none) compile only inside that character's block.
- **Krea2 Prompt Saver** — new companion node that records every
  execution's exact prompt (and motion prompt) to
  `ComfyUI/output/krea2_prompt_history.jsonl` and re-asserts the image
  metadata, working around Save Image variants that ignore
  `extra_pnginfo` keys.
- **Mii-style avatar previews** — sex border (blue / pink / neutral),
  iris colours (including heterochromia), eye shapes, nose shapes,
  mouth shapes, chin shapes, face shapes, 40+ hair styles, 10 hair
  lengths, age tells (bigger eyes and a shorter frame for children, one
  eye-bag line for middle aged, two for elderly). No more squashing.
- **Prompt footer** — the Prompt tab is gone; a collapsible prompt
  footer (preview, motion prompt, history, copy, Show Work) now lives
  on every tab.
- **Concepts tab hidden by default** — re-enabled from Node settings
  ("Show the advanced Concepts tab").
- **Quick directions** — emotion chips replaced by 20 multi-concept
  TV/movie direction presets (Acting Shady, Heartbroken, Furious
  Outburst, …) that set emotion + face + body together.
- **Character direction sections** now use the exact Concepts-tab style
  (blue + Add, standard row cards) per category: Emotion, Face & gaze,
  Body & movement, Placement.
- **Scene tab decluttered** — full-prompt presets moved to the top bar
  beside the Photography/Artwork switch; shot presets are now complete
  presets that set the scene, camera, lighting, and atmosphere together;
  "Selected scene" dropdown (name field removed); fewer, wider columns.
- **Shuffle icons** — every "each run" checkbox became a 🔀 shuffle
  button (groups, the scene, and every appearance field).
- **Group presets** — 63 new bundled presets (92 total) across Subject
  & Expression, Camera & Film, Lighting, Environment, and Style &
  Finish; presets load automatically when chosen (Load button removed).
- **Comboboxes** — picking a preset no longer filters the dropdown;
  typing still does. "Adult body description" became **Additional
  info**, hidden behind a checkbox, with an auto-expanding text box.
- **Tab safety** — applying backend-resolved state (per-job
  randomization) no longer yanks you off the tab you're working on;
  UI state (tabs, footer, expanded characters, collapse flags) is
  preserved.

### Backward compatibility

- Old workflows compile unchanged. The Model output is additive.

## 1.2.0 — 2026-08-09

Cast editor overhaul: stacked character sections, per-character LoRA
triggers, overwrite-on-save, and the appearance look builder.

### Features

- **Stacked character sections** — the Cast tab lists every character
  as its own expandable card with clear dividers; expanding a card
  reveals appearance, direction, and LoRA triggers together (no more
  click-to-switch character tabs).
- **Per-character LoRA triggers** — free-text trigger words and a new
  `lora_trigger` preset category (20 starters, community reported),
  compiled only inside that character's block so a LoRA loaded on the
  model influences that character alone.
- **Appearance look builder** — every field is a combobox (pick a
  preset or type anything), grouped into columns: Identity & basics
  (Sex: male/female/unspecified, Age), Hair & makeup, Face,
  Body & fitness, and Clothing & armour.
- **Ensembles vs separates** — clothing offers full looks (60+
  ensembles such as "western cowboy outfit", "sci-fi crew uniform") or
  separate Top / Bottom pieces; choosing one disables the other.
- **Each run per field** — every appearance field has a "each run"
  checkbox that randomizes just that field from its options on every
  queued job (snapshot pools are compiled in so the backend needs no
  frontend data).
- **Overwrite confirmation** — saving a character, full-prompt, group,
  or setting preset with an existing name asks for confirmation and
  replaces the old preset instead of duplicating.
- Expression was removed from the character appearance editor; it now
  lives only in the per-character direction (emotion) section. Legacy
  characters with an expression field still compile unchanged.
- Character presets (builtin + saved) migrated to the new schema.

### Backward compatibility

- Old characters (subject / expression / clothing fields) compile
  exactly as before.
- Legacy workflow states without the new fields render with them empty.

## 1.1.0 — 2026-08-01

Scene-director overhaul: cast members, per-character direction, and a
minimal tabbed interface.

### Features

- **Mode tabs** — the editor is organised into 🎬 Cast, 🎥 Scene,
  ✨ Concepts, and 📜 Prompt. Only one section renders at a time.
- **Per-character direction** — each cast member owns their own emotion
  chips, emotion/face/body/position rows, face-guidance triggers, and
  interaction with other characters. Two characters in one scene no
  longer share one emotion.
- **Face guidance triggers** — free-text per-character lines emitted
  verbatim (e.g. `(sparkling bright eyes:1.4)`), plus new bundled
  `emotion_trigger` and `face_trigger` preset categories.
- **Position presets** — new `position` category (25 placements) and
  `Name (position): …` compilation.
- **Video Motion Prompt** — new second STRING output with a cast
  draft (one motion line per character) for LTX-2.3 image-to-video.
- **Shot presets** — six new cinematic master presets
  (Over-the-Shoulder, Two-Character Conversation, Reaction Close-Up,
  Reverse Shot, Establishing Duo, Intimate Two-Shot).
- **Verbatim rows** — rows flagged `verbatim` are emitted exactly as
  typed, without stripping or re-weighting.
- The dead Show Work toggle is wired into the Prompt tab; header
  controls moved into a compact overflow menu.
- New example workflow: `example_two_character_scene.json`.

### Backward compatibility

- The state schema stays additive: old workflows compile unchanged
  (`Character X: …` legacy format preserved).
- The wizard now exposes two outputs; the first (`Prompt Output`)
  behaves exactly as before.

## 1.0.0 — 2026-07-25

Initial release of ComfyUI-Krea2-Prompt-Wizard.

### Features

- **Krea2 Prompt Wizard** — main all-in-one visual prompt-building node
  with a fully styled frontend widget.
- **Krea2 Weighted Phrase** — small transparent primitive node.
- **Krea2 Prompt Assembler** — pure assembler for fragment lists.
- **Krea2 Prompt Inspector** — read-only inspector that formats trace
  and state JSON into a table.
- Bundled starter library with 601 presets across 25 categories.
- 15 master presets covering common Krea 2 use cases.
- Searchable preset library with category filtering, alias search,
  and mouse-wheel navigation.
- Three weighting modes: standard emphasis, bipolar, and raw.
- Live preview, Show Work panel, and per-category output channels.
- Library editor with Add/Edit/Duplicate/Delete/Import/Export and
  *Edit as Text* mode.
- Materialize to Nodes and Create Transparent Subgraph.
- Workflow-embedded preset snapshots for portability.
- Preset migrations, atomic writes, and timestamped backups.
- 16 conflict-detection rules with plain-language warnings.
- 140 unit + integration tests including 4 golden prompt tests.
- 6 example workflows and 4 reusable subgraph blueprints.

### Security

- No network activity. Verified offline.
- No subprocess execution.
- No `eval`, `exec`, or dynamic code loading.
- Atomic user-library writes with timestamped backups.
- User data isolated to `<user_directory>/Krea2PromptWizard/`.

### References

- ComfyUI `f966a2b`
- ComfyUI_frontend `1039660`
- ComfyUI-KJNodes `e27a505` (Krea2PromptWeight: `780930c`)
- workflow_templates `c56b99f`
- krea-2 `db3984f`
