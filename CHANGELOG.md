# CHANGELOG

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
