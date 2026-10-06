# Krea2 Prompt Wizard v2 — "Prompt Studio"

A token-based prompt editor for Krea 2 (and image-to-video keyframing such
as MiniMax H3). You write normal text and insert preset tokens; each token
renders as a short color-coded pill in the editor and expands into its
stored prompt at run time.

This node lives **alongside** the v1 dashboard wizard (still fully
functional) as a much smaller, editor-first replacement.

## The human mental model: Cast, Looks, Performances, Locations

The toolbar speaks in filmmaking ideas rather than prompt parameters:

| Toolbar button | Meaning |
|---|---|
| `+ Character` | Permanent identity (Serena, Marcus). Stackable. |
| `+ Look` | A saved appearance package (PILOT, RANGER, FORMAL…). A bundle of wardrobe/prop presets; one per character. |
| `+ Performance` | A semantic acting instruction ("hiding something", "trying not to cry"). One per character. |
| `+ Emotion` | Simple emotional states. One per character. |
| `+ State` | Temporary physical conditions (wet, sweaty, muddy, exhausted). Stackable. |
| `+ Scene` / `+ Lighting` / `+ Camera` / `+ Style` | The shot itself — one each per prompt. |
| `+ More` | Wardrobe slots, continuity, props, and anything else. |

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
group) on every execution — flag a camera, some Looks and a few emotions,
queue 10–15 images, and each result differs. The `raw_prompt` output shows
what was actually chosen for each run. Randomized documents bypass
ComfyUI's execution cache so every queue item recompiles.

## First / Last frame mode

Click **Frames** in the toolbar to split the prompt into three sections:

```
Shared text + shared presets — identical in both frames
▾ FIRST FRAME — only this changes in the first image
…starting state…
▾ LAST FRAME — only this changes in the last image
…ending state…
```

- `prompt` / `negative` = shared + first (connect to the first-frame
  encoder); `last_prompt` / `last_negative` = shared + last (connect to
  the last-frame encoder). Without frame sections the last two outputs
  are empty strings.
- Shared presets expand into **both** frames; only the section text
  differs — no rebuilding the whole prompt twice.
- 🎲 Randomization runs **once per execution**, so both frames always
  receive identical picks (coherent frame pairs).
- Removing the sections (click **Frames** again) keeps all text; it just
  becomes shared.

## Bundles: Looks and Performances

A Look or Performance preset is a *bundle*: its expansion is the ordered
expansion of its `included_presets` (with cycle detection; missing
members render as `[MISSING: id]`). Build bundles in the Preset Manager
—the "Included presets" section appears for bundle categories, with a
member picker filtered to sensible categories (Looks pull from wardrobe/
props/nested Looks; Performances from emotions/Performances). Negatives
are the union of the members'. Because bundles are presets, they attach
to characters, swap via the token popup, and support 🎲 randomization
(random Look per run) like everything else.

## Favorites, recents and visual browsing

- The chooser opens with **★ Favorites** and **Recent** sections (star
  toggles on every row); recents update automatically on insertion.
- Any preset can carry a **preview image**: put a picture in
  `<user>/Krea2PromptWizard/previews/` and set the filename in the
  manager's "Preview image" field (full URLs work too). Rows with
  previews render as visual cards.
- Prefs live in `studio_prefs.json` next to the user preset file.

## Storage

| Layer | Location |
|---|---|
| Bundled starter presets (shipped, read-only) | `presets/studio/*.json` |
| Your presets / edits / deletions | `<user_directory>/Krea2PromptWizard/studio_presets.json` |
| Favorites + recents | `<user_directory>/Krea2PromptWizard/studio_prefs.json` |
| Manual preview images | `<user_directory>/Krea2PromptWizard/previews/` |

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
    tokens.py          pure tokenizer: document ⇄ segments + frame sections
    compiler.py        expansion (incl. bundles), randomization, frames
    presets.py         schema, bundled+user loading, tolerant validation
    prefs.py           favorites/recents persistence
    nodes.py           ComfyUI node (5 STRING outputs incl. last frame)
    api.py             /krea2_prompt_studio routes (presets, prefs, previews)
    refine_prompts.py  refiner harness: Krea 2 system prompt, ChatML, parser
    refine_local.py    refiner backend: in-process text-encoder LLM (comfy.sd)
    refine_remote.py   refiner backend: OpenAI-compatible server client
    refine_settings.py machine-level refiner settings
    refine_api.py      refiner routes (models, settings, run)
    package_paths.py   bundled dir + user file paths

web/prompt_studio_v2.js        entry (auto-discovered, .js)
web/studio/*.mjs               modules (NOT auto-imported)
    tokenizer.mjs              JS mirror of tokens.py (+ compile mirror)
    caret_math.mjs             pure doc-offset ⇄ caret point math
    preset_store.mjs           fetch/merge/save + category/slot metadata
    editor.mjs                 contentEditable pill editor + history +
                               nested attachments + dice toggles
    chooser.mjs / host_picker.mjs / token_popup.mjs /
    manager.mjs / preview.mjs
    refine.mjs                 brain button, settings popover, draft panel
    ui.mjs                     panels/modals/clipboard helpers
    studio.css
```

Frontend cache busting: bump `?v=N` in `web/prompt_studio_v2.js` AND the
cross-module imports inside `web/studio/*.mjs` (currently `v=4`) whenever
any `web/studio/*` file changes — the modules import each other with the
same query, and a partial bump forks the singleton store.

Tests: `tests/test_studio.py` (backend), `tests/test_studio_refine.py`
(refiner), `tests/frontend_studio_tokenizer.mjs`,
`tests/frontend_studio_caret_math.mjs` (pure frontend logic).

## The refiner (LLM prompt optimization)

The 🧠 **Refine** button rewrites the *expanded* prompt into the long,
flowing natural-language description Krea 2's own guide asks for. The
design follows roadmaus/ComfyUI-Continuity: one press, a draft you can
edit, and the original always intact.

- **Two backends.** *In ComfyUI* (default) loads a full Qwen3-VL (4B/8B) or
  Qwen3.5 text encoder from `models/text_encoders` through ComfyUI's own
  model management — weights are evicted by the next sampler pass and
  released after each generation. *On a local server* talks to LM Studio,
  Ollama, llama.cpp, vLLM or any OpenAI-compatible endpoint; the settings
  panel probes ports 1234/11434 so setup is usually zero-config.
- **The draft, not a rewrite-in-place.** The result is stored per section
  in a hidden `refined_doc` widget with its source text, author model and
  an enabled flag. Enabled drafts replace the node's `prompt` (and
  `last_prompt`) outputs at run time; negatives always stay the presets'.
  Toggle, edit, or Revert in the panel; a "prompt edited since" badge
  marks drafts whose source text has moved on.
- **One call per section.** With frame sections active, the first-frame
  and last-frame prompts are refined and toggled separately — they are two
  encodings at run time, so neither draft belongs to the other.
- **Fidelity checks.** Quoted render text must survive the rewrite and
  invented quotation marks are flagged — both advisory, shown beside the
  editable draft.
- **Settings are machine-level** (backend, model, temperature, seed,
  reply length), stored under the pack's user directory; the remote
  endpoint and its key live in their own owner-only file and never travel
  inside a workflow. The refiner system prompt lives in
  `src/studio/refine_prompts.py` if you want to tune it for a new model.

## Known limitations (v2.2)

- Token drag-repositioning and First/Last "delta" tooling (what changed
  between frames) are future work.
- Preview images are manual (drop a file, set the filename). Automated
  preview generation (standardized test scenes per category) is planned
  and needs a render pipeline.
- Preset creation is form-based; no LLM is contacted (a pack principle).
  Guided-create forms may come later without one.
- Reference images are stored in the schema but unused.
- Undo/redo is the editor's private stack (browser-native undo inside the
  rich editor is intercepted); the plain textarea keeps native undo.
- Randomized runs log their picks to the console and reflect them in
  `raw_prompt`; a per-image visual record (e.g. PNG metadata) is future
  work.
- Actions/expressions as a separate category are planned; the category
  system already supports them (add JSON + one toolbar entry).
