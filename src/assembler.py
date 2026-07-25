"""The Krea2 Prompt Assembler.

The assembler is a small reusable helper node that joins a base prompt
with a list of dynamic string fragments and returns the final, plain,
category, and trace outputs. It is functionally a subset of the wizard
that exists for users who want a transparent pipeline without the
visual builder.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass
class AssemblerResult:
    final_prompt: str
    plain_prompt: str
    category_prompts: Dict[str, str]
    trace: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "final_prompt": self.final_prompt,
            "plain_prompt": self.plain_prompt,
            "category_prompts": dict(self.category_prompts),
            "trace": dict(self.trace),
        }


def assemble(
    base: str,
    fragments: Sequence[Dict[str, Any]],
    *,
    category_order: Optional[Sequence[str]] = None,
    separator: str = ", ",
    normalize: bool = True,
) -> AssemblerResult:
    """Assemble a final prompt from a base string and a list of fragments.

    Each fragment is a dict with the following keys:

    * ``text`` (required) — the raw phrase to embed.
    * ``category`` (optional) — used to group fragments into per-category
      outputs. Defaults to ``"custom"``.
    * ``weight`` (optional, float, default ``1.0``) — applies standard
      ``(phrase:weight)`` syntax when numeric and not equal to 1.0.
    * ``mode`` (optional, default ``"scalar"``) — informational only; the
      assembler does not interpret the mode.
    * ``enabled`` (optional, default ``True``) — when false the fragment
      is omitted from the final prompt.
    * ``label`` / ``id`` (optional) — included in the trace output.
    """
    if not isinstance(fragments, (list, tuple)):
        fragments = []

    fragments_list = [dict(f) for f in fragments if isinstance(f, dict)]

    if category_order is None:
        category_order = ["custom"]
    seen_categories = set()
    for f in fragments_list:
        cat = f.get("category") or "custom"
        if cat not in seen_categories:
            category_order.append(cat)
            seen_categories.add(cat)

    category_prompts: Dict[str, str] = {cat: "" for cat in category_order}
    trace_rows: List[Dict[str, Any]] = []
    enabled_keys: List[str] = []

    for cat in category_order:
        parts: List[str] = []
        for f in fragments_list:
            if (f.get("category") or "custom") != cat:
                continue
            if not f.get("enabled", True):
                continue
            text = str(f.get("text", "")).strip()
            if not text:
                continue
            try:
                weight = float(f.get("weight", 1.0))
            except (TypeError, ValueError):
                weight = 1.0
            if weight == 1.0:
                rendered = text
            else:
                rendered = _format_weighted(text, weight)
            parts.append(rendered)
            trace_rows.append(
                {
                    "id": f.get("id", ""),
                    "label": f.get("label", ""),
                    "category": cat,
                    "text": text,
                    "weight": weight,
                    "mode": f.get("mode", "scalar"),
                    "rendered": rendered,
                }
            )
        category_prompts[cat] = " ".join(parts).strip()

    body_parts: List[str] = []
    if base and base.strip():
        body_parts.append(base.strip())
    for cat in category_order:
        text = category_prompts.get(cat, "")
        if text:
            body_parts.append(text)
    final_prompt = separator.join([p for p in body_parts if p]).strip()
    if normalize:
        final_prompt = _normalize(final_prompt)

    # Plain prompt: strip weighting syntax.
    plain_parts: List[str] = []
    if base and base.strip():
        plain_parts.append(base.strip())
    for cat in category_order:
        plain_fragments = []
        for f in fragments_list:
            if (f.get("category") or "custom") != cat:
                continue
            if not f.get("enabled", True):
                continue
            text = str(f.get("text", "")).strip()
            if not text:
                continue
            plain_fragments.append(_strip_weight(text))
        text = " ".join(plain_fragments).strip()
        if text:
            plain_parts.append(text)
    plain_prompt = separator.join(plain_parts).strip()
    if normalize:
        plain_prompt = _normalize(plain_prompt)

    trace = {
        "schema_version": 1,
        "categories": list(category_order),
        "rows": trace_rows,
        "fragments_emitted": len(trace_rows),
    }

    return AssemblerResult(
        final_prompt=final_prompt,
        plain_prompt=plain_prompt,
        category_prompts=category_prompts,
        trace=trace,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_weighted(text: str, weight: float) -> str:
    rounded = round(weight, 2)
    if rounded == 1.0:
        return text
    formatted = f"{rounded:.2f}".rstrip("0").rstrip(".")
    return f"({text}:{formatted})"


def _strip_weight(text: str) -> str:
    text = text.strip()
    if not text.endswith(")"):
        return text
    if text.startswith("("):
        inner = text[1:-1]
    else:
        inner = text
    if ":" in inner:
        head, _, tail = inner.rpartition(":")
        try:
            float(tail.strip())
        except ValueError:
            return text
        return head.strip()
    return text


def _normalize(text: str) -> str:
    if not text:
        return ""
    import re as _re

    text = _re.sub(r"\s+", " ", text)
    text = _re.sub(r"\s*,\s*", ", ", text)
    text = _re.sub(r"\(\s+", "(", text)
    text = _re.sub(r"\s+\)", ")", text)
    return text.strip(", ").strip()


def trace_to_json(result: AssemblerResult) -> str:
    return json.dumps(result.trace, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Conformance helpers
# ---------------------------------------------------------------------------


def category_outputs_to_list(category_prompts: Dict[str, str]) -> List[str]:
    """Return category prompts ordered by category name, with empty strings omitted."""
    return [v for v in category_prompts.values() if v]
