"""Native Krea 2 weighting adapted from kijai/ComfyUI-KJNodes.

Source: nodes/model_optimization_nodes.py, commit
 d3cfe21625e5170126ce06fbfcfe1d88108688c3 (Krea2PromptWeight).
Copyright (c) kijai and ComfyUI-KJNodes contributors.
SPDX-License-Identifier: GPL-3.0-only
This derivative is distributed under GNU GPL version 3; see LICENSE.
Modified 2026-10-07: lazy runtime imports, input validation and diagnostics,
isolated integration. Parser, matching and attention
math retain upstream behavior, including duplicate scaling/bias assignment.
"""
from __future__ import annotations
import math
import re
import types

SOURCE_REVISION = "d3cfe21625e5170126ce06fbfcfe1d88108688c3"
_PATTERN = re.compile(r"\(([^():]+):(-?\d*\.?\d+)\)")

_QWEN_IM_START, _QWEN_USER, _QWEN_NL, _QWEN_IM_END = 151644, 872, 198, 151645

def _krea2_user_content_span(ids):
    # token span of the user prompt, between '<|im_start|>user\n' and the next '<|im_end|>'
    for i in range(len(ids) - 2):
        if ids[i] == _QWEN_IM_START and ids[i + 1] == _QWEN_USER and ids[i + 2] == _QWEN_NL:
            start = i + 3
            end = start
            while end < len(ids) and ids[end] != _QWEN_IM_END:
                end += 1
            return start, end
    return None, None

def _krea2_token_ids(clip, text):
    tok = clip.tokenize(text)
    key = next(iter(tok))
    return [t[0] for t in tok[key][0]]

def _find_subsequence(seq, sub, lo, hi):
    out = []
    n = len(sub)
    if n == 0:
        return out
    for i in range(lo, hi - n + 1):
        if seq[i:i + n] == sub:
            out.append(i)
    return out


def krea2_attn_forward_weight(self, x, freqs=None, mask=None, transformer_options={}):
    import torch
    from comfy.ldm.modules.attention import optimized_attention, attention_pytorch
    from einops import rearrange
    from comfy.ldm.flux.math import apply_rope

    q, k, v, gate = self.wq(x), self.wk(x), self.wv(x), self.gate(x)
    q = rearrange(q, "B L (H D) -> B H L D", H=self.heads)
    k = rearrange(k, "B L (H D) -> B H L D", H=self.kvheads)
    v = rearrange(v, "B L (H D) -> B H L D", H=self.kvheads)
    # weights: list of (pos, v_factor, k_bias). v_factor scales the token's VALUE (removal/de-emphasis; <0 flips
    # to subtract the concept). k_bias adds to the token's attention logit (emphasis: more of the image attends
    # to it -> more of the concept), which works far better for amplification than scaling the value.
    weights = transformer_options.get("krea2_token_weights")
    if weights:
        v = v.clone()
        for pos, v_factor, _ in weights:
            if v_factor != 1.0 and pos < v.shape[2]:
                v[:, :, pos] = v[:, :, pos] * v_factor
    q, k = self.qknorm(q, k)
    if freqs is not None:
        q, k = apply_rope(q, k, freqs)
    if self.kvheads != self.heads:
        rep = self.heads // self.kvheads
        k = k.repeat_interleave(rep, dim=1)
        v = v.repeat_interleave(rep, dim=1)
    bias = None
    if weights and any(kb != 0.0 for _, _, kb in weights):
        bias = q.new_zeros(1, k.shape[2])
        for pos, _, kb in weights:
            if kb != 0.0 and pos < bias.shape[1]:
                bias[:, pos] = kb
    if bias is not None:
        out = attention_pytorch(q, k, v, self.heads, mask=bias, skip_reshape=True)
    else:
        out = optimized_attention(q, k, v, self.heads, mask=mask, skip_reshape=True, transformer_options=transformer_options)
    return self.wo(out * torch.sigmoid(gate))

class Krea2WeightPatch:
    def __get__(self, obj, objtype=None):
        return types.MethodType(krea2_attn_forward_weight, obj)


def parse_weighted_text(text):
    """Use the pinned upstream flat syntax without widening its grammar."""
    terms = [(m.group(1).strip(), float(m.group(2))) for m in _PATTERN.finditer(text)]
    return _PATTERN.sub(lambda m: m.group(1), text), terms


def encode_plain(clip, text):
    """Encode text into conditioning without applying token weights.

    Used when a CLIP is connected but the weighting toggle is off, so the
    Positive Conditioning output stays a valid conditioning object for
    downstream nodes (ConditioningZeroOut, samplers) instead of None.
    Supported weighting annotations are stripped, matching the native
    path's clean text; the numeric weights are simply not applied.
    """
    if clip is None:
        raise ValueError("Encoding Positive Conditioning requires a CLIP input.")
    clean, _terms = parse_weighted_text(text)
    tokens = clip.tokenize(clean)
    cond = clip.encode_from_tokens_scheduled(tokens)
    details = {"enabled": False, "strength": 0, "encoded_text": clean,
               "source_revision": SOURCE_REVISION, "token_weights": [], "warnings": []}
    return cond, details


def _validate_model(model):
    try:
        diffusion_model = model.get_model_object("diffusion_model")
        blocks = diffusion_model.blocks
        required = ("wq", "wk", "wv", "gate", "heads", "kvheads", "qknorm", "wo")
        if not blocks or any(not all(hasattr(b.attn, k) for k in required) for b in blocks):
            raise AttributeError("incompatible attention")
        if not callable(model.clone) or not callable(model.add_object_patch):
            raise AttributeError("incompatible model patcher")
        return diffusion_model
    except (AttributeError, KeyError, TypeError) as exc:
        raise ValueError("Native weighting requires a Krea 2 model with compatible attention blocks. Disable native weighting for other models.") from exc


def encode_native(clip, model, text, strength=1.0):
    """Return model, conditioning and inspector details; never mutate input model."""
    if model is None or clip is None:
        raise ValueError("Native weighting requires both Model and CLIP inputs. Connect a Krea 2 model and its Qwen3-VL CLIP, or disable native weighting.")
    strength = float(strength)
    if not math.isfinite(strength) or not 0 <= strength <= 4:
        raise ValueError("Native weighting strength must be a finite number from 0 to 4.")
    _validate_model(model)
    clean, terms = parse_weighted_text(text)
    warnings = []
    if re.search(r"\([^\n]*:[^\n]*\)", clean) or re.search(r"\([^)]*\([^)]*:", text):
        warnings.append("Unsupported weighting syntax remains literal text. Use flat (phrase:number) syntax without spaces after the colon, explicit plus signs or nesting.")
    phrases = [phrase for phrase, _ in terms]
    if len(set(phrases)) != len(phrases):
        warnings.append("Repeated weighted phrases match every occurrence; their value multipliers compound and later nonzero attention biases replace earlier biases, matching KJNodes.")
    options = getattr(model, "model_options", {}).get("transformer_options", {})
    patches = getattr(model, "object_patches", {})
    if options.get("krea2_token_weights") or any("attn.forward" in str(k) for k in patches):
        warnings.append("The connected model already has attention weighting or attention patches. Native weighting can replace an earlier patch; avoid double weighting.")
    tok = clip.tokenize(clean)
    key = next(iter(tok))
    ids = [t[0] for t in tok[key][0]]
    cond = clip.encode_from_tokens_scheduled(tok)
    cond_len = cond[0][0].shape[1]
    visible_start = len(ids) - cond_len
    start, end = _krea2_user_content_span(ids)
    if start is None:
        start, end = visible_start, len(ids)
    pairs = []
    for phrase, w in terms:
        v_factor, k_bias = ((1.0, strength * (w - 1.0) * 2.0) if w > 1.0
                            else (1.0 + strength * (w - 1.0), 0.0))
        positions = []
        for variant in (" " + phrase, phrase):
            sub = _krea2_token_ids(clip, variant)
            ps, pe = _krea2_user_content_span(sub)
            if ps is None:
                continue
            sub = sub[ps:pe]
            matches = _find_subsequence(ids, sub, start, end)
            if matches:
                for mi in matches:
                    positions.extend(mi + off - visible_start for off in range(len(sub)))
                break
        visible = [cp for cp in positions if 0 <= cp < cond_len]
        if not visible:
            warnings.append(f"Weighted phrase '{phrase}' was not found in visible encoded prompt tokens; skipped.")
        elif len(visible) != len(positions):
            warnings.append(f"Weighted phrase '{phrase}' was partially truncated by the encoder.")
        pairs.extend((cp, v_factor, k_bias) for cp in visible)
    details = {"enabled": True, "strength": strength, "encoded_text": clean,
               "source_revision": SOURCE_REVISION, "token_weights": pairs, "warnings": warnings}
    if not pairs:
        return model, cond, details
    model_clone = model.clone()
    diffusion_model = model_clone.get_model_object("diffusion_model")
    transformer_options = model_clone.model_options.get("transformer_options", {}).copy()
    transformer_options["krea2_token_weights"] = pairs
    model_clone.model_options["transformer_options"] = transformer_options
    for idx, block in enumerate(diffusion_model.blocks):
        patched_attn = Krea2WeightPatch().__get__(block.attn, block.attn.__class__)
        model_clone.add_object_patch(f"diffusion_model.blocks.{idx}.attn.forward", patched_attn)
    return model_clone, cond, details

