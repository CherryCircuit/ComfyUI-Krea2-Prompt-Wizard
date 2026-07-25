# KJNodes Integration

KJNodes (`kijai/ComfyUI-KJNodes`) is an optional companion pack that
ships a `Krea2PromptWeight` node. The Krea2PromptWeight node
implements `(phrase:weight)` weighting for Krea 2 by patching the
attention layers of the underlying MMDiT model.

The wizard **does not** implement `(phrase:weight)` by itself. It
generates the syntax and emits it through `FINAL_PROMPT`. Whether the
syntax is actually applied to the model depends on the consumer of
the `FINAL_PROMPT` output.

## When to use KJNodes

| Consumer of FINAL_PROMPT | Behaviour |
|---|---|
| A standard `CLIPTextEncode` node | The syntax is treated as literal text. Weights are not applied. This is **not** recommended for Krea 2. |
| A `Krea2PromptWeight` node from KJNodes | The syntax is parsed and applied to the model via attention patching. **This is the recommended consumer for Krea 2.** |
| A `ComfyUI` native `(word:weight)` attention editor | The syntax is not parsed by the Qwen3-VL encoder; the wizard's output is treated as literal text. |
| A `Krea 2 Prompt Weight` (capitalised differently) | The display name "Krea2 Prompt Weight" matches the wizard's expected integration partner. |

## KJNodes references

| Field | Value |
|---|---|
| Class name | `Krea2PromptWeight` |
| Display name | `Krea2 Prompt Weight` |
| Repository | `kijai/ComfyUI-KJNodes` |
| Commit | `e27a505` (initial commit: `1271209`, refinement: `780930c`) |
| Inputs | `clip`, `model`, `text`, `strength` |
| Outputs | `model`, `conditioning` |
| Experimental | `true` |
| Recommended sampler CFG | `1.0` |

The tooltip on the KJNodes node reads:

> "Set sampler CFG to 1.0."

> "Removal (weight<0) is the reliable direction; emphasis (weight>1) works but is looser."

The wizard does not modify the model or the conditioning; it only
generates the prompt text. The KJNodes node is responsible for
applying the prompt to the Krea 2 model.

## Wizard behaviour

The wizard's `FINAL_PROMPT` output is identical regardless of whether
KJNodes is installed. The wizard is **unaware** of KJNodes and does
not check for it. The user is responsible for wiring the
`FINAL_PROMPT` into the right consumer.

The bundled `subgraphs/Krea2_Prompt_Wizard_KJNodes.json` blueprint
demonstrates the recommended wiring. It uses the wizard to generate
the prompt and the KJNodes `Krea2PromptWeight` node to apply it.

## Subgraph wiring

```
[Krea2 Prompt Wizard]
    .FINAL_PROMPT
        |
        v
[Krea2PromptWeight]
    .text = FINAL_PROMPT
    .clip = CLIP
    .model = MODEL
    .strength = 1.0
        |
        v
    .conditioning
        |
        v
[KSampler]
    cfg = 1.0
```

## Failure cases

The wizard's prompt is independent of the model. The KJNodes node
may fail to apply the weighting if:

- The Qwen3-VL encoder does not produce the expected tokenisation for
  the wizard's phrases.
- The user supplies a phrase that is not in the Qwen3-VL vocabulary.
- The model architecture does not match the Krea 2 MMDiT (i.e. the
  user is using a different Krea 2 model checkpoint).

In all cases, the wizard's `FINAL_PROMPT` is unchanged. The trace
JSON accurately reflects what the wizard produced.

## Compatibility matrix

| Model profile | Wizard | Standard `CLIPTextEncode` | KJNodes `Krea2PromptWeight` |
|---|---|---|---|
| Krea 2 Turbo | OK | Literal text | Recommended |
| Krea 2 Raw | OK | Literal text | Recommended |
| Generic | OK | Standard weighting | Untested |

## Verifying the integration

To verify the integration is working:

1. Open the bundled `workflows/example_basic.json`.
2. Connect `Krea2PromptWizard.FINAL_PROMPT` to a `CLIPTextEncode` node
   and a `KSampler`.
3. Run the workflow. Inspect the generated image and the prompt.
4. Open the bundled `subgraphs/Krea2_Prompt_Wizard_KJNodes.json`. The
   subgraph uses `Krea2PromptWeight` instead of `CLIPTextEncode`.
5. Compare the prompts the two workflows generate. The prompts
   should be identical; the difference is whether the weighting is
   applied to the model.
