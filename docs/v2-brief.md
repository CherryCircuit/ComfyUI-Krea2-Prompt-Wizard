# Krea2 Prompt Wizard — v2 Redesign Brief

**Date:** 2026-08-12
**Author:** Graeme (transcribed voice note + clarifying answers)
**Repo:** `E:/ComfyUI_Feb2026/ComfyUI/custom_nodes/ComfyUI-Krea2-Prompt-Wizard`
**Live server (DO NOT TOUCH):** `http://192.168.1.90:8188`
**Live remote main:** `5031fe7` (v1.5 — shipped but unusable, see below)
**Tests baseline:** 230/230 python, 11/11 packaging, frontend smoke pass, frontend state contract pass.

---

## 1. Why v1.5 failed

Graeme opened the node fresh and could not:
- Click "Character 1" header to expand sub-controls.
- See any of the per-character fields the original v1 had (eye color/size, hair color, build, fit, etc.).
- Find Final Prompt Preview, Scene, or Shot as click-to-toggle headers.
- Use the LoRA connector (no explainer, "connect to list your LoRA's").
- Tell "Additional info" apart from "Description".
- Tell active LoRA/shuffle/randomize state from inactive state.
- Scroll without the ComfyUI canvas zooming.

Symptoms trace to a single root cause: **inconsistent header affordance, no real tab structure, and visual chrome (collapse buttons, nested borders, emoji icons) that hides the underlying controls.**

---

## 1.5 Product thesis (Graeme, 2026-08-12 — supersedes the simpler v2 spec)

The Krea2 Prompt Wizard exists to make KJNodes' weighted `(phrase:weight)` parentheses framework **usable**. Krea2 alone does not understand facial expression magnitude; the wizard compiles user choices into the weighted prompt that KJNodes' Krea2 Prompt Weight node consumes. **The wizard is the magic that turns small simple user choices into a weighted prompt that the image model actually follows.**

This is non-negotiable for v2:
- Every visible concept must surface its `-3` to `+3` weight control (slider OR up/down stepper — agent picks whichever fits the layout).
- The concept library is the product surface. v2 must NOT collapse it to single-option dropdowns.
- `presets/default_library.json` (684 concepts, 29 categories, schema_version 1) is the source of truth.
- `presets/conflicts.json` is already populated with mutually-incompatible combinations (e.g. `shot_size.extreme_close_up_vs_establishing`). v2 must surface this, not ignore it.

### Simplification patterns (use these, NOT choice elimination)

1. **Coalesce near-synonyms into curated buckets.** 16 framing options → 3-4 user-facing buckets ("Close-up", "Medium", "Wide", "Establishing"), each mapping to the right underlying concept(s).
2. **Conflict-aware cascading filters.** Picking "anger" filters the emotion list to compatible options only. Use `conflicts.json` to drive the filter.
3. **Visual drag-to-position picker** for spatial concepts (angle, perspective, framing, position) — drag a camera icon around a subject icon, the wizard translates that into the right `(phrase:weight)` tuple.
4. **Multi-concept stacking** where it makes sense (emotion + emotion2 if compatible; pose + camera_movement; lighting_setup + lighting_direction).
5. **Custom phrase escape hatch** — already exists (`custom` category). Surface it so users can break out of the curated set.

### Concept row layout — `[−]` value `[+]` (Graeme-confirmed 2026-08-12)

Per-concept row in the "Concepts Applied to <character>" subsection:

```
[ Concept label ]              [ − ]    [  +1.5  ]    [ + ]    [ × ]
```

- `[ − ]` and `[ + ]` are pill buttons with the same height and corner-radius as Add/Load/Save Preset buttons.
- Step increment is `0.5`. Click-and-hold auto-repeats.
- The center **value display** is a click-and-drag slider surrogate: mousedown on the value, drag vertically (up = +0.5/10px, down = −0.5/10px), release. Cursor changes to `ns-resize` on hover.
- Range: `-3.0` to `+3.0`, default per `default_strength` in `default_library.json`.
- `×` removes the concept row.
- All values display in monospace at the same size.
- Active concept (currently selected / hovered) glows with the CAST purple accent (matches the approved concept image).

This satisfies the brief's `-3` to `+3` weight requirement while staying compact — no slider track takes up width when the user is happy with ±step.

### Phase 2 deferred (Graeme, 2026-08-12: "want it all, but if it makes sense to keep things a bit simpler for this phase, then yeah you can move that to phase 2")

- **Drag-to-position scene diagram** with camera icon + subject icons + light-source icon all on one plane. Cast tab for multiple characters. v1 includes only the Lighting Direction compass-rose; v2 (Phase 2) adds the camera icon, the subject position icons, and the multi-character drag interaction.
- **Full conflict-aware cascading across all 29 categories.** v1 ships with `framing`, `angle`, `emotion` cascading as proof. Phase 2 extends to all 29.
- **Character avatar artwork quality** (the "neck not attached / expression wrong" SVG art). Separate visual pass.

---

## 2. v2 redesign goals (Graeme-confirmed 2026-08-12)

### 2.1 Two-tab structure (CONFIRMED Q1)

Two tabs at the top of the node body:

- **CAST** tab — everything per character:
  - One character card per cast member (default 1, allow add).
  - Per character: name, identity chips (gender, age range, ethnicity), hair / eyes / build / fit dropdowns (renamed "fit" — see 2.6), character LoRA list (see 2.5), emotions, face & gaze, body & movement, placement in frame, quick directions.
  - Subject-level concepts (e.g. character-specific styling concepts) also live here.

- **SCENE** tab — everything about the scene the characters are in:
  - Type (Photography / Artwork) + Setting + Shot on ONE horizontal row (Q1 follow-up).
  - Description (merge "Additional info" + "Description" into one — see 2.6).
  - Camera, Lighting, Environment, Style — each its own collapsible subsection (CONFIRMED Q3).
  - Final Prompt Preview (plain code, see 2.5).

Tab switcher sits at the top of the node body, just below the model connector row and above all content. Active tab is bright; inactive is fully desaturated gray.

### 2.2 Header-click toggles everywhere (kill the collapse buttons)

- **NO** dedicated "collapse / expand" buttons anywhere. Those are "disgusting" — Graeme's word, not mine.
- Every section header IS the toggle. Hover state makes it obvious the header is clickable.
- Consistent across: each Cast card, Scene subsections (Camera / Lighting / Environment / Style), Concepts block, Final Prompt Preview, LoRA sections, Quick Directions.
- When the section is collapsed, only the header row is visible. When expanded, the header sits flush against the content with the section's background color.

### 2.3 Visual chrome — flat, distinct, on black

- The whole node interior lives on a near-black background (current `.krea2-wizard-root` tone).
- Sections use **different background colors / tints** to be visually distinct without outlines:
  - CAST tab body: slightly cool tint.
  - Each Cast card: own tint, distinct from siblings.
  - SCENE tab body: slightly warm tint.
  - Camera / Lighting / Environment / Style subsections: each a distinct tint. Do NOT stack five identical swatches.
- Borders only where they actually separate visually distinct regions (outer card edge). NO nested `.container > .container > .container` borders.
- Pill buttons (Add / Load / Save Preset / Type / Setting / Shot / etc.) — equal height, radius reduced from current (a little less round).

### 2.4 Iconography — SVG, not emojis

- Dice, shuffle, randomize, add, save, load, delete, collapse-state indicator → custom SVG (vector) so active/inactive color is fully controllable.
- **NO emojis** anywhere in the wizard.
- Active state: bright accent color.
- Inactive state: fully desaturated grayscale (NOT faded blue, NOT slightly tinted).

### 2.5 LoRA redesign (CONFIRMED Q4)

- LoRA is **per-character**, lives only inside each Cast card on the CAST tab.
- File picker UX: **"Add LoRA" opens a native file browser** so Graeme selects a `.safetensors` file from disk (autodetect from his `models/loras` folder is nice-to-have but file picker is the contract).
- Multiple LoRAs per character supported via "+ Add LoRA" button. List of (filename, strength slider, optional direction) per character.
- The wizard must emit per-character LoRA application in the final prompt so the chosen LoRAs apply only to that character, not the whole image. (Current behavior applies LoRAs to the whole image — that breaks character specificity.)
- Remove the stray LoRA row on the SCENE tab.

### 2.6 Other cleanups (from Q6, Q1 follow-up, and original voice note)

- **Rename "Fit"** → something legible. Candidates: "Build", "Physique", "Fitness". Pick one.
- **Merge "Additional info" + "Description"** into a single field on the Scene tab. If they really are functionally identical, drop one. If different, document the difference in a tooltip on the remaining one.
- **Type / Setting / Shot** on one horizontal row, not stacked.
- **Save Preset** button size = same height as Add / Load Preset.
- **Pretty Prompt Preview** — kept in code, default OFF in settings (CONFIRMED Q5). Plain prompt code shown in Final Prompt Preview by default. Settings menu restored to toggle it back on.
- **Quick Directions** — only useful if their underlying emotion/face/body/placement controls are visible. Either show those controls, or hide quick directions. Don't ship a button that changes invisible state.
- **Cast sub-control layout:** Hair label + Hair dropdown on the SAME row. Eyes, Build, (renamed) on the same row. Three to four columns total so all per-character dropdowns fit on one row.

### 2.7 Out of scope for v2

- Character avatar artwork quality (the "neck not attached / expression wrong" SVG art). Schedule a separate visual pass.
- Any backend / Python-side changes unless a v2 UI item requires it (LoRA per-character application MAY require backend support — flag it if so).
- Settings menu redesign beyond restoring the toggle for Pretty Prompt Preview.

---

## 3. Process contract

1. **Concept art first** (Graeme's standing correction: no claiming UI done before screenshot audit). Generate compact + expanded GPT-image PNGs and get sign-off BEFORE any code.
2. **Worktree isolation.** OpenCode agent runs in `~/Hermes/Runtime/worktrees/krea2-redesign-v2-<date>`. NEVER against the live ComfyUI checkout. NEVER restart ComfyUI. NEVER drive Graeme's browser.
3. **Bounded runtime:** `--max-minutes 45`, `--idle-minutes 15`.
4. **No commit/push/reset/cleanup from the worker.** Parent verifies with tests + asset-hash compare + headless screenshot before any commit.
5. **5-minute heartbeat** to Hermes: Dev (telegram -1003922251026) when work is active, silent when state file marks finished.
6. After completion, parent runs:
   - `node --check` on all modified JS/MJS
   - `node tests/frontend_smoke.mjs` and `node tests/frontend_state_contract.mjs`
   - `python -m unittest discover -s tests`
   - asset hash compare vs live `http://192.168.1.90:8188/extensions/ComfyUI-Krea2-Prompt-Wizard/...`
   - headless Edge screenshot of compact + expanded, side-by-side with the Graeme-signed concept art

---

## 4. Acceptance bar

Graeme opens the node, picks the CAST tab, sees at least one character card with Hair/Eyes/Build/(Renamed) dropdowns visible inline, can add a LoRA via file picker, can collapse/expand the card by clicking its header, can switch to the SCENE tab and see Camera/Lighting/Environment/Style as distinct subsections, can toggle each subsection's visibility by clicking its header, and can read the plain final prompt code at the bottom. No emojis. No nested borders. No dedicated collapse buttons. Section backgrounds distinct.

If any of that fails, v2 is not done.
