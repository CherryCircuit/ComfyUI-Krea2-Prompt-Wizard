# Prompt Wizard v2 → v3: direction and recommendations

**Status:** working notes after the nested-facet pass
(2026-10-29). This document is deliberately honest about what is shipped,
what is still a recommendation, and what should not be built.

## 1. What v2 gets right

- The token document is the right backbone. It is serializable in the
  workflow, tolerant of missing presets, and keeps the user's own words.
- Presets as stable ids with live expansion is the right content model.
  Edits propagate; workflows do not freeze a stale copy.
- The refiner's "draft, not rewrite-in-place" model is right. The original
  prompt is never destroyed.
- Frames mode (shared / first / last) is a real differentiator for video
  workflows.

## 2. What v2 was missing

1. **The library was a single production's bible.** Four scenes, five
   lights, five cameras and three styles cannot be a universal prompt
   builder. The fix is content + taxonomy, not more UI.
2. **Randomization existed but was blind.** The dice picked from every
   preset in the slot; there was no way to say "sci-fi or school
   environments only". The v1 wizard's checkbox pools were the missing
   control surface.
3. **The node fought its own frame.** `onNodeCreated` referenced an
   undefined `node`, so `setDoc` and the fit call threw after the widget
   mounted. That is the root cause of the "refine stretches past the node"
   reports: the panel had no height management, and the node never
   shrank after a draft was reverted.
4. **The refiner spoke only Krea 2.** A universal library still produced a
   Krea-shaped rewrite.

## 3. What this pass ships

- **406 presets / 73 collections** in the bundled library: environments
  (12 collections), layered wardrobe, 26 hair presets plus hair colours and
  colour treatments, lighting by time/source/quality/direction, camera by
  framing/angle/lens/movement, style/film looks, garment colours and
  patterns, states and props.
- **Collections as schema**, not tags: chooser headers, manager field,
  hover text, randomizer pool tree.
- **Randomizer board**: slot rows with roll-now, every-run toggle and a
  checkbox pool; tri-state collection checkboxes; search; `Roll all`;
  per-character slots; pools serialized in `randomizer_doc`.
- **Backend pool filtering** with tolerant JSON parsing.
- **Refiner targets**: Any image model (default), Krea 2, Flux/SDXL prose,
  SDXL/Illustrious tags, Video (Wan/LTX/H3).
- **Recipes**: six bundled starting points plus save/apply/update/delete for
  user recipes, with reroll or restore-picks modes.
- **Independent shot slots**: framing, angle, lens and movement; time of
  day, light source, light quality, light direction and color grade.
- **Nested facets**: hair colour/treatment and garment colour/pattern
  attach under their parent token, recurse in the editor and raw view, and
  have their own randomizer rows. Layered wardrobe (outer/mid/base/lower/
  legwear/accessory) lets pieces coexist and clear a full outfit.
- **Run feedback**: after a randomized queue item the node shows the
  presets that actually ran, while keeping the dice flags for the next run.
- **Output trimming**: Prompt only / Prompt + Negative / First three / All,
  trailing-only so links stay valid.
- **Title case and compact toolbar**: preset names are title-cased, the
  all-caps CSS is gone, and the toolbar swaps to symbols with fast hover
  labels below 600 px.
- **Node fit fix**: last-child measurement, grow *and* shrink, capped
  warning height.
- **Display name** `Prompt Wizard v2 — Universal` (class name unchanged for
  workflow compatibility).

## 4. Recommended next moves, in order

Recipes and the camera/lighting slot split shipped in 1.11; the remaining
items are the next round.

### P1 - recipes (shipped in 1.11)

The board is useful, but every new node starts with "all options" pools.
Add **recipes**: save the current slot selection + pools as a named preset
(`recipes/*.json` or the user preset store). A recipe is one click to a
complete random starting point: "Cozy fantasy", "Neon noir", "School
drama". Recipes should be shareable as JSON and shipped with the pack.
This is the natural successor to the v1 "preset" feeling.

### P1 - camera and lighting slots (shipped in 1.11)

Camera presets used to contain framing, angle, lens and movement together,
so "close-up" and "low angle" could not roll independently. The split is
now `framing`, `angle`, `lens` and `movement` (each its own exclusive
group); lighting became time of day, source, quality and direction, with
colour grade already separate. The randomizer rows gained the corresponding
dice.

### P1 - declarative compatibility rules

The nested model exposes the next real gap: slots stop *structural*
conflicts (two hairstyles), but not *semantic* ones (a beanie over a high
ponytail, a necklace under a turtleneck, a full outfit plus a jacket).
Add optional preset fields:

```
"compatible_tags": ["hair_updo"],     // only with these
"conflicts_tags": ["hat", "helmet"],  // never with these
"conflict_mode": "remove" | "warn"   // default warn
```

and evaluate them when inserting, rolling, or applying a recipe. The pool
tree can grey out or annotate incompatible rows, and a roll can report
"cleared Beanie". Defaults must stay permissive: user presets without the
fields never become unselectable. This is the generalization of the
current full-outfit clearing rule, not a hard-coded matrix.

### P1 - per-garment facet pools and picks

Today all garment colours share `garment_color|garment_color`, so a recipe
cannot say "crimson jacket, cream shirt". Key facet pools and recipe picks
by their parent slot (for example
`garment_color|garment_color@wardrobe_outer`) while keeping the shared key
as the fallback. The board already renders one facet row per parent, so the
UI work is mostly the pool key and the two-pass recipe apply. Do the same
for hair colour so two characters can have different colours.

### P1 - per-slot locks and a run seed

`~` rerolls every flagged slot on every run. A user often wants "new
outfit every run, but hold the environment". Add a lock icon per slot
(already possible with the token flag) and a **run seed** so a batch is
reproducible. The v1 wizard had exactly this; v2 lost it. The seed belongs
in the hidden randomizer JSON, not in the workflow prompt.

### P2 — prompt-dialect compiler

The refiner handles dialects, but the refiner is optional and needs an LLM.
Add a lightweight **output dialect** at compile time:
`natural` (current), `tags` (comma-separated preset phrases), and
`compact` (one sentence per slot). This makes the node useful for SDXL /
Illustrious users who do not want an LLM in the loop. The compiler already
has all the pieces; it needs a formatter and a node setting.

### P2 — negative-prompt policy per target

Flux and some video models do not use a negative prompt; SDXL does. Add a
per-target policy: `negative` (current), `none` (empty output), or
`folded` (append "avoid: …" for models that accept it). Keep the output
slot for compatibility, but label it clearly.

### P2 — visual preset previews

The pool is a list of names. A thumbnail per preset (manual preview image
already supported) would make "randomize the environment" feel like a
contact sheet. The existing `preview_image` field and `/previews/` route
are enough; the missing piece is a shipped thumbnail set and a render
recipe. Do not auto-generate at install time.

### P3 — preset packs and sharing

The user library already overrides/tombstones bundled presets. Package a
collection (with its presets and recipes) as a single JSON file with a
version and a license. That is the community story: "install the Cozy
Fantasy pack", not "hand-edit JSON".

### P3 — node chrome (partly shipped)

The five outputs reserve five rows at the top of the node, which is why
there was a blank band above the editor. ComfyUI always draws output slots
above the body, so controls cannot literally sit beside them without a
custom node implementation. The shipped compromise is the **Outputs**
button: Prompt only, Prompt + Negative, First three, or All. Only trailing
outputs are removed, and connected outputs are kept, so links remain valid.
The remaining option is a future recipe/status strip in the saved space;
breaking the five-output contract is still not worth it.

## 5. Things not to do

- **Do not turn the node back into a form.** The token document is the
  reason v2 is pleasant; the board should feed it, not replace it.
- **Do not auto-generate preview images at install.** They need a render
  pipeline and honest model/recipe labels.
- **Do not make the refiner mandatory.** A universal prompt builder must
  work with no LLM on the machine.
- **Do not put the randomizer pools in `prompt_doc`.** They are settings,
  not text; the hidden widget keeps the document readable and the pools
  workflow-scoped.
- **Do not silently drop old presets.** Keep the Krea 2 production block;
  it is a valid collection, and old workflows reference its ids.

## 6. Verification note

The running ComfyUI process caches the Python preset store at startup.
The new preset files, `collection` field, `randomizer_doc` input and
refiner targets require a **ComfyUI restart** to appear in the live node.
The frontend-only parts (board, roll-now, node fit, target selector UI) can
be tested without a restart; the backend tests cover the rest.
