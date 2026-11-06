# Prompt Wizard v2 — "Prompt Studio"

A token-based prompt builder for **any image or video model**, not only
Krea 2. The node's class name (`Krea2PromptWizardV2`) is kept for workflow
compatibility; the visible node is **Prompt Wizard v2 — Universal**. You
write normal text and insert preset tokens; each token renders as a short
color-coded pill in the editor and expands into its stored prompt at run
time. The same document can feed Flux, SDXL, Krea 2, Wan, LTX, MiniMax H3
or a plain text encoder.

This node lives **alongside** the v1 dashboard wizard (still fully
functional) as a much smaller, editor-first replacement.

## The human mental model: Cast, Looks, Performances, Locations

The toolbar speaks in filmmaking ideas rather than prompt parameters:

| Toolbar button | Meaning |
|---|---|
| `+ Character` | Permanent identity (Serena, Marcus). Stackable. |
| `+ Look` | A saved appearance package (PILOT, RANGER, FORMAL…). A bundle of wardrobe/prop presets; one per character. |
| `+ Performance` | A semantic acting instruction ("hiding something", "trying not to cry"). One per character. |
| `+ Hair` | Hairstyle; one per character. The hair pill can own colour and colour-treatment facets. |
| `+ Emotion` | Simple emotional states. One per character. |
| `+ State` | Temporary physical conditions (wet, sweaty, muddy, exhausted). Stackable. |
| `+ Environment` / `+ Lighting` / `+ Camera` / `+ Style` | The shot itself. Camera opens framing, angle, lens and movement; Lighting opens setup, direction and colour-grade presets. |
| `+ More` | Wardrobe slots, continuity, props, and anything else. Garment pills can own colour and pattern facets. |

## Usage

1. Add the **Prompt Wizard v2 — Universal** node.
2. Type normally. Insert presets with:
   - the toolbar (`+ Character`, `+ Wardrobe`, `+ Hair`, `+ Environment`,
     `+ Lighting`, `+ Camera`, `+ Style`, `+ More`),
   - typing `[` at a word boundary (opens a searchable chooser),
   - `Ctrl/Cmd + Space`.
3. Click a pill to open its category list — pick another preset to swap it
   in place, or **Remove Token** / **Edit Preset** / **+ New Preset**.
   A hair pill also offers **Color** and **Color Style**; a garment pill
   offers **Color** and **Pattern**. These facets attach underneath the
   parent pill, so they survive a parent swap and can be randomized on
   their own.
4. Hover a pill for name, category, description and an expansion excerpt.
5. **Preview Expanded** shows the exact prompt / negative / raw outputs
   with copy buttons. The footer shows word and preset counts.
6. **Plain** toggles the raw marker text (a real textarea).
7. Connect `prompt` to your text encoder, `negative` to a negative
   CLIPTextEncode. `raw_prompt` holds the human-readable `[LABEL]` view.

Example editor content:

```
[Serena] enters [Medieval Tavern A] and looks toward the staircase.
[Candlelight] [Locked Medium Shot] [Cinematic Fantasy]
[STRICT CHARACTER CONSISTENCY]
```

The node's actual `prompt` output replaces every token with its full stored
expansion (character bible, scene bible, lighting, camera, style,
continuity instructions).

Preset names are title-cased throughout the UI (`Seaside Cottage`, not
`SEASIDE COTTAGE`; known initialisms such as `VHS` stay uppercase). Below
roughly 600 px the toolbar switches to symbols (👤 Character, 👕 Wardrobe,
🏞️ Environment, 💡 Lighting, 📷 Camera…) with a fast hover label; the full
words return as the node widens.

The **Outputs** toolbar button controls how many output dongles the node
shows: Prompt only, Prompt + Negative, First three, or All. Only trailing
outputs are removed, because deleting a middle slot would shift every later
slot index and break existing links; connected outputs are always kept.
Choose the smallest set that your workflow uses to remove the empty band
above the editor.

## How it works

- The source of truth is a plain string with inline token markers
  (`{{krea2:<preset_id>|<label>|@<host>|~}}`), stored in the node's hidden
  `prompt_doc` widget and saved inside the workflow like any other widget.
  A second hidden widget, `randomizer_doc`, holds the checkbox pools as
  JSON; an enabled refiner draft is a third, `refined_doc`.
- The frontend renders that string as text + atomic pills (contentEditable
  with input interception); the backend compiles it at execution time by
  reading presets fresh from disk.
- Preset ids are stable across renames; the label after `|` is only a
  fallback hint. If a preset is missing (renamed away, file deleted,
  disabled), the editor shows a red `[MISSING: <id>]` pill and the
  compiled output contains the same marker so nothing silently disappears.

## Slots, attachments and randomization

**Slots (exclusive groups).** Presets carry an optional exclusive group.
The shot has independent slots: **Environment**, **Time of Day**, **Light
Source**, **Light Quality**, **Light Direction**, **Color Grade**,
**Framing**, **Angle**, **Lens**, **Movement** and **Style**. Inserting a
second preset from the same slot replaces the first in place, but a light
source can coexist with a time of day, a quality and a direction, and a
camera angle can coexist with a lens and a framing. The older combined
`lighting` slot remains for legacy and user presets.

Emotion and hair are one-per-character. Wardrobe is layered: **full
outfit**, **outer**, **mid**, **base**, **lower body**, **legwear** and
**accessory**. An outer, mid and base layer stack; a full outfit clears the
separates in the randomizer; legwear and accessories are independent.
Characters, continuity and props stack freely. The Preset Manager exposes
each preset's slot.

**Facets (nested details).** Hair presets can own a **hair colour** and a
**hair colour treatment** (ombre, balayage, highlights…). Garment presets
(full outfits and layered separates) can own a **garment colour** and a
**garment pattern/texture**. Facets are full presets with their own ids and
randomizer pools, but they render as dashed pills nested inside the parent:

```
👤 Serena (💇 High Ponytail (🖌️ Honey Blonde)) (👕 Leather Biker Jacket (🎨 Crimson))
```

The flat document keeps the markers adjacent
(`@character_serena`, then `@u_hair_high_ponytail` for the colour), and the
backend, raw view and editor recurse through that tree. Deleting a parent
removes its facets; swapping a parent re-hosts them. Facets are hidden from
the generic **+ More** chooser and appear only through their parent's popup
and the randomizer board.

**Attachments.** Emotion, hair, looks and wardrobe presets attach to a
character token:
`{{krea2:character_serena|Serena}}{{krea2:wardrobe_x|Outfit|@character_serena}}`.
Facets attach to their hair or garment token in the same way, one level
deeper. In the editor the attachment renders nested inside its host pill —
`[(Serena) (Elf Queen Outfit)]` — and in the compiled prompt the
attachment expansion follows the character's block. With multiple
characters in the prompt, inserting an attachable preset asks which
character it belongs to. Deleting the host leaves the attachment as a
dashed "detached" pill you can delete or re-anchor by attaching anew.

**Randomization.** Every pill has a small dice toggle. Flagged tokens are
swapped for a random preset *of the same slot* (same category + exclusive
group) on every execution - flag a camera, some Looks and a few emotions,
queue 10-15 images, and each result differs. After each queue item the
node replaces the displayed pills with the presets that actually ran (the
dice flags stay set, so the next queue item rerolls again), and the footer
reports the number of randomized picks. The `raw_prompt` and `last_prompt`
outputs also show what was chosen. Randomized documents bypass ComfyUI's
execution cache so every queue item recompiles. The Randomizer board below
adds checkbox pools and roll-now controls on top of this.

## Collections and the Randomizer board

Presets carry an optional **collection** (`Medieval`, `Sci-Fi`, `School`,
`Casual`, `Film Stock`…). The chooser groups a category by these headings,
and the Preset Manager exposes the field. It is a plain string, so a user
can invent a collection without touching code.

The **Randomize** toolbar button opens the board that replaces the old
hunt-through-the-chooser loop:

```
Character — Serena
  Hair              [ current ]  [roll]  [loop]  12/26
    Hair · Color    [ current ]  [roll]  [loop]   6/20
    Hair · Color Style [ current ] [roll] [loop]  3/8
  Outfit            [ current ]  [roll]  [loop]  13/43
  Outer             [ current ]  [roll]  [loop]   —/13
    Outer · Color   [ current ]  [roll]  [loop]   5/24
    Outer · Pattern [ current ]  [roll]  [loop]   4/15
  Mid / Base / Lower / Legwear / Accessory …
  Emotion           [ current ]  [roll]  [loop]  17/17
SHOT
  Environment       [ current ]  [roll]  [loop]  30/51
  Time of Day       [ current ]  [roll]  [loop]   8/8
  Light Source      [ current ]  [roll]  [loop]   7/7
  Light Quality     [ current ]  [roll]  [loop]  12/12
  Light Direction   [ current ]  [roll]  [loop]   8/8
  Framing / Angle / Lens / Movement …
  Color Grade       [ current ]  [roll]  [loop]   8/8
  Style             [ current ]  [roll]  [loop]  21/21
```

Facet rows are indented under their parent and only appear once that
parent exists on the character. They currently share the facet pool key
(`garment_color|garment_color`), so one check applies to every garment;
per-garment pools and picks are planned.

- **[roll]** picks a new preset *now* and inserts or replaces that slot's token.
- **[loop]** marks the slot's token for randomization **on every queue item**
  (the existing `~` flag). It stays lit while the token is flagged.
- The **count button** opens that slot's pool: every enabled preset in the
  slot, grouped by collection, with a tri-state collection checkbox,
  per-preset checkboxes, search, `All` and `None`.
- **Roll all** rolls every available slot once; useful for a first draft
  when you do not want to write anything.
- Pools are serialized in the hidden `randomizer_doc` widget as
  `{"schema_version": 1, "pools": {"scene|scene": ["..."]}}`. The backend
  applies the same filter when a `~` token rolls at run time. An absent key
  means the whole slot is allowed; an explicit empty list means no options
  are allowed (the dice will say so).
- Slots are `category + exclusive_group`, so a wardrobe top can never swap
  with an environment. Character-bound slots attach to the character's
  token; with several characters the board repeats the section per cast
  member.

## Recipes

A **recipe** is a saved board: the pools you checked plus the picks that
were in the slots when you saved it. Open **Recipes** in the randomizer
header to:

- **Apply** a bundled recipe in one press. Each covered slot either rolls
  inside its pool (default) or restores the saved pick.
- **Save current board** as a named user recipe. The form captures the
  current pools and picks; choose *reroll* or *restore* for how it should
  behave when applied.
- **Update** a user recipe, **Save copy** a bundled one into your own file,
  or delete a user recipe.

Recipes cover the facet and layered-wardrobe pools too. Applying one
places parent slots first (character hair, outer, mid, base, lower body),
then applies colour/pattern facets in a second pass, so a newly created
garment receives its colour instead of being skipped. Bundled recipes:
Cozy Fantasy, Neon Noir, School Drama, Sunlit Nature, Grim Horror and
Historical Drama. They live in
`presets/studio/recipes.json`; user recipes live in
`<user>/Krea2PromptWizard/studio_recipes.json`. Recipes are global to the
machine (like the preset library), not embedded in a workflow. Applying one
to a prompt with no character still fills the scene slots and tells you to
add a character for the character slots.

The starter library ships **406 presets** across 73 collections, including
the generated `presets/studio/universal_*.json` block and the original Krea
2 production presets. The universal block now includes hair colours,
colour treatments, garment colours, garment patterns, layered wardrobe
pieces and stackable lighting facets. Regenerate it with
`python scripts/build_studio_universal.py`; backfill collection metadata on
the original block with `python scripts/tag_studio_collections.py`. The
slot migrations are `scripts/split_camera_lighting_slots.py`,
`scripts/split_lighting_slots.py` and `scripts/split_wardrobe_layers.py`.

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
- Dice randomization runs **once per execution**, so both frames always
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
to characters, swap via the token popup, and support dice randomization
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
| Universal starter block (generated) | `presets/studio/universal_*.json` |
| Randomizer pools (per workflow) | hidden `randomizer_doc` widget |
| Your presets / edits / deletions | `<user_directory>/Krea2PromptWizard/studio_presets.json` |
| Bundled recipes | `presets/studio/recipes.json` |
| Your recipes / deletions | `<user_directory>/Krea2PromptWizard/studio_recipes.json` |
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
Document text stores ids, not snapshots, so improving "Serena" updates
every workflow that references her. If you need an unchanged snapshot,
duplicate the preset and use the duplicate's token.

## Architecture notes (for maintainers)

```
src/studio/            backend (independent of the v1 wizard modules)
    tokens.py          pure tokenizer: document ⇄ segments + frame sections;
                       recursive raw view for nested attachments
    compiler.py        expansion (incl. bundles), pooled randomization, frames
    presets.py         schema (incl. collection/slot), bundled+user loading
    recipes.py         randomizer recipes (pools + saved picks)
    prefs.py           favorites/recents persistence
    nodes.py           ComfyUI node (5 STRING outputs incl. last frame);
                       build_ui also sends the resolved document/picks
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
    randomizer.mjs             slot board, dice/dice-every-run, pool tree
    recipe_store.mjs           bundled/user recipe cache
    recipe_panel.mjs           apply/save/delete recipes
    refine.mjs                 brain button, target settings, draft panel
    ui.mjs                     panels/modals/clipboard helpers
    studio.css
```

Frontend cache busting: bump `?v=N` in `web/prompt_studio_v2.js` AND the
cross-module imports inside `web/studio/*.mjs` (currently `v=26`) whenever
any `web/studio/*` file changes — the modules import each other with the
same query, and a partial bump forks the singleton store.

Tests: `tests/test_studio.py` (backend), `tests/test_studio_refine.py`
(refiner), `tests/frontend_studio_tokenizer.mjs`,
`tests/frontend_studio_caret_math.mjs` (pure frontend logic).

## The refiner (LLM prompt optimization)

The **Refine** button rewrites the *expanded* prompt for the model you
are aiming at. Pick a **Prompt target** in its settings:

| Target | Shape of the rewrite |
|---|---|
| Any image model | Clear natural-language prose; works with most checkpoints |
| Krea 2 (long prose) | Long, flowing description Krea 2's guide asks for |
| Flux / SDXL prose | Two to four dense sentences |
| SDXL / Illustrious tags | Comma-separated concrete tags |
| Video (Wan / LTX / H3) | One continuous action with camera behaviour |

The design follows roadmaus/ComfyUI-Continuity: one press, a draft you can
edit, and the original always intact. The refiner settings are machine-level;
the target is remembered on the machine, not in the workflow.

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
- **Settings are machine-level** (backend, model, prompt target,
  temperature, seed, reply length), stored under the pack's user directory; the remote
  endpoint and its key live in their own owner-only file and never travel
  inside a workflow. The refiner system prompt lives in
  `src/studio/refine_prompts.py` if you want to tune it for a new model.

## Known limitations (v2.5)

- **Recipes are machine-level**, not embedded in a workflow. A recipe saved
  on one computer does not travel in the `.json` workflow; share the
  `studio_recipes.json` file or a workflow that already contains its tokens.
- **Compatibility is structural, not semantic.** The randomizer clears a
  full outfit when it rolls a separate layer, and exclusive groups prevent
  two skirts or two hairstyles. It does not yet know that a beanie clashes
  with a high ponytail, or filter accessories by the chosen outfit.
- **Facet pools are shared.** Hair colour, colour treatment, garment colour
  and pattern each have one pool today, so a constraint such as "crimson"
  applies to every garment of that facet. Per-garment pools and recipe
  picks are the next step.
- **The board enforces full-outfit vs separates,** but inserting a full
  outfit manually alongside a layered token still compiles both; the
  compiler treats the groups as independent.
- **Old camera tokens** still resolve by id, but their old `camera|camera`
  pool key is no longer used; the split slots are `framing`, `angle`,
  `lens` and `movement`.
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
- Randomized runs now update the node's visible pills and footer after each
  queue item, and reflect the picks in `raw_prompt`; a per-image visual
  record (e.g. PNG metadata) is still future work.
- **Output visibility is prefix-only.** Removing a middle output slot would
  renumber later slots and break existing links, so the node removes only
  trailing outputs and keeps anything that is connected.
- Actions/expressions as a separate category are planned; the category
  system already supports them (add JSON + one toolbar entry).
