# Krea 2 Prompt Research

This document records what is known, supported, **not** officially guaranteed,
and community-reported about Krea 2 prompt weighting. Everything here is
derived from the sources listed in `docs/REFERENCE_VERSIONS.md`.

## Summary of evidence

| Source | Status | What it says |
|---|---|---|
| Krea official `README.md` | Officially documented | "Use natural language prompts to generate images" |
| Krea official `docs/prompting.md` | Officially documented | "Long detailed prompts yield best results"; recommends putting quotes around text-rendering words |
| Krea official `inference.py` | Visible in source code | Plain string passed to `sample()`; no weighting syntax used |
| `Qwen/Qwen3-VL-4B-Instruct` text encoder | Visible in source code | Standard Qwen3-VL tokenizer; treats `(` and `)` as ordinary characters |
| KJNodes Krea2PromptWeight | Community / experimental | Patches attention layers to apply per-token weighting via `(phrase:weight)` regex |
| Community usage | Community reported | `(phrase:weight)` syntax has been observed to influence Krea 2 outputs when used with the KJNodes patch |
| Local Krea2 verification | Locally tested | (Not yet; this release ships without a tested Krea2 model) |
| ComfyUI native `(word:weight)` attention editor | Unverified | ComfyUI's `(word:weight)` syntax is parsed by the CLIP encoder, **not** by Krea 2's Qwen3-VL encoder without the KJNodes patch |

## Officially documented Krea behaviour

From `krea-ai/krea-2/README.md` and `krea-ai/krea-2/docs/prompting.md`:

- "We recommend users to use natural language prompts to generate images."
- "Long detailed prompts yield best results, but the model is capable of
  generating high quality images with minimal prompt engineering."
- "For text rendering, we recommend putting quotes around the words to be rendered."
- Sample inference: `uv run inference.py "a fox walking in the snow" --checkpoint oss_turbo --steps 8 --cfg 0.0 --mu 1.15 --width 2048 --height 2048`
- Turbo: 8 steps, CFG 0.0, mu 1.15, 1k–2k resolution.
- Raw: 52 steps, CFG 3.5, 1k resolution.

Krea's official documentation does **not** describe `(phrase:weight)` syntax
and does not formally guarantee that weighted parentheses will affect the
output.

## Behaviour visible in official Krea source code

`krea-ai/krea-2/inference.py` calls `sample(..., [prompt] * num_images, ...)`.

The `prompt` is a plain string passed straight through to the Qwen3-VL
conditioner. The conditioning pipeline is:

1. `Qwen3VLConditioner` tokenises the prompt.
2. The MMDiT attends to those tokens across 28 blocks.
3. No textual weighting syntax is parsed before conditioning.

This means the `(phrase:weight)` syntax, if used unmodified, would be treated
as literal punctuation.

## Behaviour implemented by KJNodes

`kijai/ComfyUI-KJNodes/nodes/model_optimization_nodes.py` exposes a node
called `Krea2PromptWeight` (commit `1271209`, refined in `780930c`).

The implementation:

1. Parses `(phrase:weight)` patterns from the prompt string.
2. Removes the weighting syntax from the prompt text.
3. Tokenises the cleaned string and locates each phrase's token positions.
4. Stores `(token_position, value_multiplier, attention_bias)` triples in
   `model_options["transformer_options"]["krea2_token_weights"]`.
5. Patches every MMDiT block's attention `forward` so it applies the
   per-token weighting (compounded over 28 blocks).
6. The tooltip on the KJNodes node explicitly states:

   > "Set sampler CFG to 1.0."

   > "Removal (weight<0) is the reliable direction; emphasis (weight>1) works but is looser."

The implementation is marked `EXPERIMENTAL = True` in KJNodes.

## Community-reported behaviour

- `(phrase:weight)` syntax with `weight > 1` is widely reported as emphasising
  a concept in Krea 2 outputs when used with the KJNodes patch.
- `(phrase:weight)` with `weight < 0` is reported as removing/repressing the
  concept.
- Both effects are described as "compounded over all 28 blocks" and
  "model-dependent" by the KJNodes author.
- Without the KJNodes patch, the syntax is not implemented by Krea 2.

## Locally tested behaviour

This release of ComfyUI-Krea2-Prompt-Wizard ships **without** locally tested
Krea 2 outputs because the test environment does not have a Krea 2 model
checkpoint, the Qwen3-VL-4B-Instruct text encoder, or the MMDiT weights
required to run inference. The JSON calibration report workflow is provided
to allow users to record their own local tests.

## Unverified assumptions

The following assumptions are made by this project but have **not** been
locally verified:

- The Qwen3-VL-4B-Instruct encoder tokenises Krea 2 prompts in the same way
  as standard Qwen3-VL.
- The `(phrase:weight)` syntax is interpreted by the Qwen3-VL encoder (with
  the KJNodes patch) according to the KJNodes tooltip behaviour.
- The Krea 2 model card is reachable and matches the upstream behaviour.

## What this project does

This project **does not** interpret `(phrase:weight)` syntax by itself. It
generates a transparent, human-readable, well-formatted prompt plus a
trace JSON that clearly shows every phrase and its weight. It is designed to
feed into the KJNodes `Krea2PromptWeight` node when present, and to fall
back to the plain unweighted prompt otherwise.

## Verification status for presets

Every preset in `presets/default_library.json` carries a `verification` field.
Allowed values are:

- `general visual vocabulary` — concept is widely used in photography / film
  vocabulary and is meaningful to a text encoder.
- `community reported` — community usage suggests Krea 2 picks up the
  concept, but no controlled local test exists.
- `locally tested` — the user ran the calibration workflow and recorded a
  result.
- `krea2_turbo verified` — controlled local test on Krea 2 Turbo exists.
- `krea2_raw verified` — controlled local test on Krea 2 Raw exists.
- `unreliable` — concept has been observed to be inconsistent; treat as a
  hint rather than a guarantee.
- `deprecated` — replaced by a newer preset; verification is left in place
  for migration.

By default, **no preset is marked as Krea 2 verified**. Promoted presets
remain `general visual vocabulary` or `community reported` until a tester
records a controlled Krea 2 generation.

## Limitations

- The wizard does not run inference and cannot verify Krea 2 output.
- The wizard is a prompt construction tool; Krea 2's actual rendering
  behaviour is independent of this project's output.
- Multiplier semantics follow the KJNodes tooltip: emphasis (`weight > 1`)
  is "looser" than de-emphasis (`weight < 0`).
- Negative numerical weights are documented as community-reported for Krea 2
  and may be unstable.
