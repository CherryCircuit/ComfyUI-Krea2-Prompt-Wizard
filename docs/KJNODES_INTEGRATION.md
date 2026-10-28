# Krea 2 weighting

The wizard supports two explicit choices. Existing workflows continue to emit weighted prompt text for an external KJNodes `Krea2PromptWeight` node. Native weighting is off by default; when off it does not patch the model and encodes the plain prompt only when a CLIP is connected.

## Positive Conditioning and native weighting

Connecting the Krea 2 Qwen3-VL CLIP opts the wizard into emitting Positive Conditioning; no state toggle is required for the output to exist. With Native conditioning weighting off, the compiled prompt is encoded as clean text (supported `(phrase:number)` annotations are stripped, the numbers are not applied) and the Model passes through unchanged. With Native conditioning weighting on, the annotated prompt is encoded and the token weights patch a model clone, replacing an external `Krea2PromptWeight` node on the direct wizard branch.

The output is valid conditioning for downstream nodes such as Conditioning Zero Out and samplers whenever a CLIP is connected. Without CLIP the output is empty (None) and downstream conditioning nodes must not consume it; the inspector reports which of the three states (native, plain, none) the last run produced.

Open Advanced & Recovered concepts to enable Native conditioning weighting and set its strength, connect the Krea 2 Model and Qwen3-VL CLIP, and connect the wizard Model and Positive Conditioning outputs to the sampler. Use those outputs together. The first three outputs retain their original positions: Prompt Output, Video Motion Prompt, Model. Positive Conditioning is appended at position four. The optional CLIP input is appended without moving existing widgets.

Native weighting removes supported annotations from the text before encoding, maps the phrases to Qwen user-content tokens, and patches a clone of the model. It requires compatible Krea 2 attention blocks and fails with an actionable message for missing inputs or an unsupported model. Negative conditioning stays external. The upstream recommendation is sampler CFG 1.0; the wizard never changes sampler settings.

The settings are serialized inside wizard state as `native_weighting_enabled` (default false) and `native_weighting_strength` (default 1.0, range 0–4). Strength zero still encodes cleaned text and installs the upstream neutral attention patch when tokens match. No matched visible tokens also passes the model through.

## Exact upstream behavior

The accepted syntax is flat `(phrase:number)`, including negative and fractional numbers. Spaces after the colon, explicit plus signs and nested expressions are unsupported. Invalid annotations may remain literal; the inspector warns instead of silently claiming they applied.

Phrase lookup tries a leading-space variant first, then the plain variant. It matches every occurrence inside the user-content span and aligns positions to the visible conditioning after truncation. For weights above one, the value factor remains one and the attention bias is twice strength times the amount above one. At or below one, the value factor is one plus strength times the amount below one, with zero attention bias.

Repeated weighted phrases preserve upstream behavior: repeated value multipliers compound, while later nonzero biases replace earlier biases at the same position. The inspector exposes encoded text, token assignments, pinned source revision and warnings for repeated phrases, unsupported syntax, unmatched or truncated tokens and existing attention patches.

## Existing workflows and combined text

No links are automatically rewritten. Continue using external KJNodes when text is combined with other nodes after the wizard; native conditioning only encodes the wizard's own final prompt. An explicit conversion is appropriate only for direct wizard-to-weighting branches. Do not apply an external weighting node again to the native patched Model; inspect warnings and wiring when combining patches.

KJNodes does not need to be installed for native weighting. The external node remains an optional companion.

## Source and license

The isolated native implementation is adapted from kijai/ComfyUI-KJNodes `nodes/model_optimization_nodes.py`, class `Krea2PromptWeight`, at installed commit `d3cfe21625e5170126ce06fbfcfe1d88108688c3`, inspected 2026-10-07. The parser, token lookup and attention implementation retain upstream semantics. Local changes add lazy imports, validation, diagnostics and isolated integration.

Copyright belongs to kijai and ComfyUI-KJNodes contributors. KJNodes is GNU GPL version 3; the derivative is distributed under GPL-3.0-only, compatible with the existing project license. The earlier Apache-2.0 attribution was incorrect. Source attribution and the modification date are retained in the isolated module.

## Verification

Dedicated CPU tests compare encoding and model patch assignments against the installed upstream implementation, exercise scalar weight ranges, repeated phrases, token truncation, input errors, clone isolation and disabled-mode slot compatibility. Runtime image quality remains dependent on the actual Krea 2 checkpoint and encoder; native enablement is an explicit user choice.
