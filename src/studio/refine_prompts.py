"""The Krea 2 refiner's harness: what is asked, and how the reply is read.

The refine button sends the user's expanded prompt to a small local LLM and
gets prose back that Krea 2 was trained to read. This module is the half of
that arrangement which is pure data — the system prompt, the Qwen ChatML
turns, the reply contract and its parser, and the mechanical fidelity
checks — so it imports neither torch nor ComfyUI and is unit-tested as is.
`refine_local.py` holds the weights; `refine_remote.py` holds the wire;
`refine_api.py` knows about the routes and the preset store.

Architecture inspired by roadmaus/ComfyUI-Continuity (MIT), re-written for
Krea 2 and this pack's token document.

One section per call. The frontend refines the FIRST-frame prompt and the
LAST-frame prompt separately when frame sections are active, because the
node executes them as two separate encodings and a single blended rewrite
would belong to neither.
"""
from __future__ import annotations

import json
import re


class RefineError(RuntimeError):
    """The refiner could not produce a usable rewrite."""


# ---- what one call costs -----------------------------------------------------

# The output budget in tokens, not a context size. The ComfyUI Qwen3-VL
# tokenizer never truncates the request; this only bounds the answer.
NUM_PREDICT = 4096
MIN_PREDICT = 512
MAX_PREDICT = 16384

# Krea 2 prompt guidance favors long, detailed prose; the ceiling on what a
# rewrite may grow to is generous, and models that stop early cost nothing.
DEFAULT_MAX_TOKENS = 2048


def reply_tokens(value) -> int:
    """The user's reply-length setting, made usable. Junk falls back to default."""
    try:
        return max(MIN_PREDICT, min(MAX_PREDICT, int(value)))
    except (TypeError, ValueError):
        return NUM_PREDICT


# ---- the ChatML form ---------------------------------------------------------
#
# `CLIP.tokenize` receives one string; a Qwen tokenizer that sees it begin
# with `<|im_start|>` passes it through verbatim rather than wrapping it in
# its single-user-turn template. Writing the turns here is also what makes
# room for a system turn and a prefilled reply.

# The reply opens mid-JSON. Nothing constrains the sampler to a shape, and
# the real-world failure is not malformed JSON but a model that answers
# "Here is your prompt:" first and fences the object afterwards. Starting the
# assistant's turn inside the object removes the place where that goes.
PREFILL = "{"

# Qwen3's convention for "answer without reasoning". Skipped templates skip
# this too, so it is written by hand; a reasoning model with no suppression
# spends the whole budget thinking and returns nothing.
_THINK_CLOSE = "<think>\n\n</think>\n\n"


def chatml(system: str, message: str, prefill: str = PREFILL) -> str:
    """system + user + an assistant turn already begun, as one Qwen prompt."""
    return (
        "<|im_start|>system\n" + system + "<|im_end|>\n"
        "<|im_start|>user\n" + message + "<|im_end|>\n"
        "<|im_start|>assistant\n" + _THINK_CLOSE + prefill
    )


# ---- the instruction ---------------------------------------------------------

# What Krea's own prompting guide asks for, distilled: natural language,
# long detailed descriptions, and quoted text for anything that must be
# rendered. See docs/KREA2_PROMPT_RESEARCH.md.

SYSTEM_PROMPT = """\
You are a prompt engineer for the Krea 2 image model. You rewrite short or \
rough image prompts into the flowing, richly detailed natural-language \
description Krea 2 was trained to read.

Rules:
1. Keep everything the request names. Every subject, character, action, \
emotion, garment, place, lighting setup, camera choice and style stays in \
the rewrite. Never swap the user's choices for your own ideas.
2. Expand with concrete visual detail: materials, textures, color, light, \
atmosphere, composition, expression. Add only what a photograph or frame \
of the described scene could show. Never invent new people, objects or events.
3. The result is prose, not tags. Write complete sentences in a natural \
order, strongest elements first. No keyword lists, no weights, no \
parentheses, no markdown, no headings, no commentary.
4. Text inside "quotation marks" is words the finished image must render. \
Keep it exactly as written, still inside its quotation marks.
5. Quotation marks may appear ONLY around renderable on-image text such as \
signs or captions. Never quote ordinary description words.
6. Output plain prompt text only. Do not describe what you did, do not \
offer alternatives, do not ask questions.

Reply with one JSON object in exactly this form:
{"prompt": "<the rewritten prompt>"}

Write the rewritten prompt as the value of "prompt" and nothing else.\
"""

_USER_LEDE = "Rewrite this Krea 2 image prompt.\n\nTHE PROMPT:\n{body}"


def user_message(section_label: str, body: str) -> str:
    """What to rewrite: which output it feeds, and the expanded text itself."""
    return (
        f"This text feeds the node's {section_label} output.\n\n"
        + _USER_LEDE.format(body=(body or "").strip())
    )


# ---- the reply ---------------------------------------------------------------

_FENCE_RE = re.compile(r"^```(?:\w+)?\s*(.*?)\s*```$", re.DOTALL)
THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def json_object(content: str) -> dict:
    """The model's content string -> the object it meant to return.

    Tolerant on the way in — a leaked <think> block, a markdown fence, a
    sentence in front of the object — strict about what comes out.
    """
    text = THINK_RE.sub("", content or "").strip()
    fenced = _FENCE_RE.match(text)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{"):
        at = text.find("{")
        if at < 0:
            raise RefineError(f"the model did not return JSON: {content[:300]}")
        text = text[at:text.rfind("}") + 1]
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise RefineError(
            f"the model's JSON could not be read ({exc}): {text[:300]}"
        ) from exc
    if not isinstance(data, dict):
        raise RefineError("the model returned JSON, but not an object")
    return data


def parse_reply(content: str) -> str:
    """The model's content string -> the rewritten prompt text."""
    data = json_object(content)
    body = data.get("prompt")
    if not isinstance(body, str) or not body.strip():
        raise RefineError(
            'the reply had no "prompt" text in it — try again, or pick a '
            "different model"
        )
    return body.strip()


# ---- fidelity checks ---------------------------------------------------------

_QUOTED_RE = re.compile(r'"([^"\n]{2,120})"|“([^”\n]{2,120})”')


def _plain(text: str) -> str:
    """Text made comparable: one spacing, one apostrophe, one case."""
    text = (text or "").replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).lower()


def quoted(text: str) -> list:
    """The spans the request itself puts in quotation marks, in order."""
    return [a or b for a, b in _QUOTED_RE.findall(text or "")]


def dropped_quotes(request: str, written: str) -> list:
    """Quoted request text the rewrite does not carry. Empty is good.

    Quotation marks are the user dictating words the image must render, and
    Krea's own guide recommends the form — so this is the one fidelity
    promise that can be checked mechanically. The comparison forgives what
    prose rules change (casing, curly quotes, spacing, terminal punctuation)
    and nothing else.
    """
    haystack = _plain(written)
    missing = []
    for span in quoted(request):
        needle = _plain(span).strip(" .!?,;:")
        if needle and needle not in haystack and span not in missing:
            missing.append(span)
    return missing


def stray_quotes(request: str, written: str) -> list:
    """Quote pairs in the rewrite that the request never had.

    Rule 5 exists because a quotation mark around ordinary prose reads to
    Krea 2 as renderable text and prints stray words on the image. A model
    that decorates its own description with quotes produces exactly that,
    so the ones it invented are named. Matched forgivingly, the same way
    `dropped_quotes` compares, so a preserved span is never reported twice.
    """
    kept = {_plain(span).strip(" .!?,;:") for span in quoted(request)}
    stray = []
    for span in quoted(written):
        needle = _plain(span).strip(" .!?,;:")
        if needle and needle not in kept and span not in stray:
            stray.append(span)
    return stray[:1]


def check(request: str, written: str) -> list:
    """What is wrong with a rewrite, as advisory messages. Empty means good."""
    problems = []
    for span in dropped_quotes(request, written):
        problems.append(
            f'the request quotes "{span}" and the rewrite does not carry it — '
            "those exact words will not reach the model. Edit them back in, "
            "or refine again."
        )
    for span in stray_quotes(request, written):
        problems.append(
            f'the rewrite quotes "{span}" but the request did not — Krea 2 may '
            "try to render those words on the image. Remove the quotation "
            "marks unless they label on-image text."
        )
    return problems
