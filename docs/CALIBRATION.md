# Calibration

The wizard ships a calibration workflow for testing how different
weights and phrases affect Krea 2 outputs. This document describes
how to use the workflow and how to record the results.

## What calibration does

The calibration workflow is a minimal Krea 2 text-to-image
configuration. The user picks a base scene plus a single concept and
varies the weight from 0.5 to 3.0. The user records the resulting
image and notes any artefacts.

The wizard does not run inference. The user is responsible for
running the workflow in ComfyUI with a Krea 2 model and recording the
results by hand (or with their own tooling).

## How to use

1. Open `workflows/example_calibration.json` in ComfyUI.
2. Open the `Krea2PromptWizard` node. Set a base scene in the
   *Base Scene Prompt* field.
3. Click *+ Add Concept* and add a single concept (e.g. `Shock`).
4. The concept's row will be rendered with the wizard's default
   intensity. Adjust the slider to 0.5, 0.75, 1.0, 1.25, 1.5, 1.8,
   2.2, 2.6, 3.0 in turn.
5. Connect the wizard to a `CLIPTextEncode` (or KJNodes
   `Krea2PromptWeight`) and a `KSampler`.
6. Run the workflow for each weight value.
7. Record the results in the bundled
   `docs/CALIBRATION_RESULTS.md` (created by you).

## What to record

For each weight value, record:

| Field | Description |
|---|---|
| Weight | The weight value (0.5..3.0). |
| Adherence | 0-10, how well the concept is reflected in the image. |
| Artifacts | 0-10, any visual artefacts introduced. |
| Composition damage | 0-10, how much the overall composition is affected. |
| Interaction with other phrases | Free-form notes. |
| Model | The model profile (`krea2_turbo` or `krea2_raw`). |
| Date | The test date. |
| Tester | The tester's name. |
| Notes | Any other observations. |

## Recommended constant settings

Hold the following constant across runs:

- Base prompt.
- Seed.
- Resolution.
- Sampler.
- Model profile.
- Workflow settings (CFG, steps, etc.).

## Updating preset verification

When you have collected enough data, update the preset's
`verification` field in the user library to one of:

- `locally tested` — you have run the calibration at least once.
- `krea2_turbo verified` — you have controlled local Krea 2 Turbo
  results.
- `krea2_raw verified` — you have controlled local Krea 2 Raw
  results.
- `unreliable` — the preset produces inconsistent results.
- `deprecated` — the preset is being replaced by a newer preset.

To update, open the Library editor, click the preset's verification
field, and pick a new value. The change is saved to the user
library on the next Save.

## What the wizard does not do

The wizard does not:

- Run inference. Calibration requires a working Krea 2 model.
- Store calibration data. You record the data in your own files.
- Auto-update verification. You update verification by hand.

The wizard's role in calibration is to **generate a transparent,
well-formatted prompt** that the user can run through Krea 2 and
record the output of.
