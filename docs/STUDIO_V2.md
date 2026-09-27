# Krea2 Prompt Wizard v2 — "Prompt Studio"

A token-based prompt editor for Krea 2 (and image-to-video keyframing such
as MiniMax H3). You write normal text and insert preset tokens; each token
renders as a short color-coded pill in the editor and expands into its
stored prompt at run time.

This node lives **alongside** the v1 dashboard wizard (still fully
functional) as a much smaller, editor-first replacement.

## Usage

1. Add the **Krea2 Prompt Wizard v2** node.
2. Type normally. Insert presets with:
   - the toolbar (`+ Character`, `+ Scene`, `+ Lighting`, `+ Camera`,
     `+ Style`, `+ Continuity`, `+ More`),
   - typing `[` at a word boundary (opens a searchable chooser),
   - `Ctrl/Cmd + Space`.
3. Click a pill to open its category list — pick another preset to swap it
   in place, or **Remove Token** / **Edit Preset** / **+ New Preset**.
4. Hover a pill for name, category, description and an expansion excerpt.
5. **Preview Expanded** shows the exact prompt / negative / raw outputs
   with copy buttons. The footer shows word and preset counts.
6. **Plain** toggles the raw marker text (a real textarea).
7. Connect `prompt` to your text encoder, `negative` to a negative
   CLIPTextEncode. `raw_prompt` holds the human-readable `[LABEL]` view.

Example editor content:

```
[SERENA] enters [MEDIEVAL TAVERN A] and looks toward the staircase.
[CANDLELIGHT] [LOCKED MEDIUM SHOT] [CINEMATIC FANTASY]
[STRICT CHARACTER CONSISTENCY]
```

The node's actual `prompt` output replaces every token with its full stored
expansion (character bible, scene bible, lighting, camera, style,
continuity instructions).

## How it works

- The source of truth is a plain string with inline token markers
  (`{{krea2:<preset_id>|<label>|@<host>|~}}`), stored in the node's hidden
  `prompt_doc` widget and saved inside the workflow like any other widget.
- The frontend renders that string as text + atomic pills (contentEditable
  with input interception); the backend compiles it at execution time by
  reading presets fresh from disk.
- Preset ids are stable across renames; the label after `|` is only a
  fallback hint. If a preset is missing (renamed away, file deleted,
  disabled), the editor shows a red `[MISSING: <id>]` pill and the
  compiled output contains the same marker so nothing silently disappears.

## Slots, attachments and randomization

**Slots (exclusive groups).** Presets carry an optional exclusive group.
Camera, Lighting, Style and Scene presets are one-per-prompt: inserting a
second one *replaces* the first in place (a camera can't be a wide
establishing shot and a close-up at once). Emotion is one-per-character.
Wardrobe has three slots — full outfit, upper body, lower body — so a top
and a bottom stack, but two tops do not. Characters, continuity and props
stack freely. The Preset Manager exposes each preset's slot.

**Attachments.** Emotion and wardrobe presets attach to a character
token: `{{krea2:character_serena|SERENA}}{{krea2:wardrobe_x|OUTFIT|@character_serena}}`.
In the editor the attachment renders nested inside the character pill —
`[(SERENA) (ELF QUEEN OUTFIT)]` — and in the compiled prompt the
attachment expansion follows the character's block. With multiple
characters in the prompt, inserting an attachable preset asks which
character it belongs to. Deleting the host leaves the attachment as a
dashed "detached" pill you can delete or re-anchor by attaching anew.

**Randomization.** Every pill has a small 🎲 toggle. Flagged tokens are
swapped for a random preset *of the same slot* (same category + exclusive
group) on every execution — flag a camera, some outfits and a few
emotions, queue 10–15 images, and each result differs. The `raw_prompt`
output shows what was actually chosen for each run. Randomized documents
bypass ComfyUI's execution cache so every queue item recompiles.

## Storage

| Layer | Location |
|---|---|
| Bundled starter presets (shipped, read-only) | `presets/studio/*.json` |
| Your presets / edits / deletions | `<user_directory>/Krea2PromptWizard/studio_presets.json` |

Both layers are human-readable JSON. User entries override bundled presets
with the same id; a `{"id": "...", "deleted": true}` tombstone hides a
bundled preset. Malformed files or entries are skipped with a console
warning — they never prevent ComfyUI from starting.

## Preset Manager

Open via the **Presets** toolbar button (or a token popup → **Edit
Preset**). Create, duplicate, edit, delete, search and filter presets.
Each preset has: name, category, **slot** (exclusive group), prompt
expansion, optional negative clauses, description (shown in hover
tooltips), tags, notes, and an enabled flag. `reference_images` is
reserved for future image-reference support.

## Editing presets that a workflow already uses

Preset edits propagate: the next execution re-reads presets from disk.
Document text stores ids, not snapshots, so improving "SERENA" updates
every workflow that references her. If you need an unchanged snapshot,
duplicate the preset and use the duplicate's token.

## Architecture notes (for maintainers)

```
src/studio/            backend (independent of the v1 wizard modules)
    tokens.py          pure tokenizer: document ⇄ segments
    compiler.py        expansion, negative dedupe, raw rendering
    presets.py         schema, bundled+user loading, tolerant validation
    nodes.py           ComfyUI node (prompt/negative/raw_prompt STRINGs)
    api.py             /krea2_prompt_studio routes
    package_paths.py   bundled dir + user file path

web/prompt_studio_v2.js        entry (auto-discovered, .js)
web/studio/*.mjs               modules (NOT auto-imported)
    tokenizer.mjs              JS mirror of tokens.py (+ compile mirror)
    caret_math.mjs             pure doc-offset ⇄ caret point math
    preset_store.mjs           fetch/merge/save + category/slot metadata
    editor.mjs                 contentEditable pill editor + history +
                               nested attachments + dice toggles
    chooser.mjs / host_picker.mjs / token_popup.mjs /
    manager.mjs / preview.mjs
    ui.mjs                     panels/modals/clipboard helpers
    studio.css
```

Frontend cache busting: bump `?v=N` in `web/prompt_studio_v2.js`
(currently `v=1`) whenever any `web/studio/*` file changes.

Tests: `tests/test_studio.py` (backend),
`tests/frontend_studio_tokenizer.mjs`, `tests/frontend_studio_caret_math.mjs`
(pure frontend logic).

## Known limitations (v2.1)

- Tokens are not drag-repositionable yet (insert/delete/swap cover the
  workflow; drag is planned).
- No First/Last Frame tabs yet — the compiler accepts the document as one
  block; segment-scoped compilation (SHARED/FIRST/LAST) is the next major
  feature and slots in without schema changes.
- Reference images are stored in the schema but unused.
- Undo/redo is the editor's private stack (browser-native undo inside the
  rich editor is intercepted); the plain textarea keeps native undo.
- Preset edits do not retroactively rewrite saved expansion snapshots
  (there are none by design — see propagation above).
- Randomized runs log their picks to the console and reflect them in
  `raw_prompt`; a per-image visual record (e.g. PNG metadata) is future
  work.
- Actions/expressions as a separate category are planned; the category
  system already supports them (add JSON + one toolbar entry).
