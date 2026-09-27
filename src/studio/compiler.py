"""Prompt compilation for the Prompt Studio.

Turns a token document into the three node outputs:

* ``prompt``      — every token replaced by its preset expansion
* ``negative``    — the combined, de-duplicated negatives of used presets
* ``raw_prompt``  — the human-readable ``[LABEL]`` rendering

Pure logic; no ComfyUI imports so it runs identically in tests.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from .tokens import (
    clean_spacing,
    parse_document,
    raw_display,
)
from .presets import PresetStore


@dataclass
class CompiledPrompt:
    prompt: str
    negative: str
    raw_prompt: str
    used_preset_ids: List[str] = None  # type: ignore[assignment]
    missing_preset_ids: List[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.used_preset_ids is None:
            self.used_preset_ids = []
        if self.missing_preset_ids is None:
            self.missing_preset_ids = []


def _expand_segments(doc: str, store: PresetStore) -> tuple:
    """Return (expanded_prompt, used_ids, missing_ids) for a document."""
    parts: List[str] = []
    used: List[str] = []
    missing: List[str] = []
    for segment in parse_document(doc):
        if segment.type == "text":
            parts.append(segment.value)
            continue
        preset = store.get(segment.preset_id)
        if preset is None or not preset.enabled:
            if segment.preset_id not in missing:
                missing.append(segment.preset_id)
            parts.append(f"[MISSING: {segment.preset_id}]")
            continue
        if segment.preset_id not in used:
            used.append(segment.preset_id)
        parts.append(preset.prompt.strip())
    return clean_spacing("".join(parts)), used, missing


_CLAUSE_SPLIT = re.compile(r"[\n,]+")


def _negative_clauses(store: PresetStore, used_ids: List[str]) -> List[str]:
    """Collect negative text from used presets, de-duplicated case-insensitively."""
    seen = set()
    clauses: List[str] = []
    for preset_id in used_ids:
        preset = store.get(preset_id)
        if not preset or not preset.negative.strip():
            continue
        for raw_clause in _CLAUSE_SPLIT.split(preset.negative):
            clause = raw_clause.strip()
            if not clause:
                continue
            key = clause.casefold()
            if key in seen:
                continue
            seen.add(key)
            clauses.append(clause)
    return clauses


def compile_document(doc: str, store: PresetStore) -> CompiledPrompt:
    """Compile one studio document into the node's outputs."""
    expanded, used, missing = _expand_segments(doc or "", store)
    negative = ", ".join(_negative_clauses(store, used))
    raw = raw_display(
        doc or "",
        lambda preset_id: store.label_of(preset_id),
    )
    return CompiledPrompt(
        prompt=expanded,
        negative=negative,
        raw_prompt=clean_spacing(raw),
        used_preset_ids=used,
        missing_preset_ids=missing,
    )
