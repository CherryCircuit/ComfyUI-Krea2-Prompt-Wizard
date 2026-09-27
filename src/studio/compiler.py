"""Prompt compilation for the Prompt Studio.

Turns a token document into the three node outputs:

* ``prompt``      — every token replaced by its preset expansion
* ``negative``    — the combined, de-duplicated negatives of used presets
* ``raw_prompt``  — the human-readable ``[LABEL]`` rendering

Tokens flagged with ``~`` are first replaced by a random preset drawn from
the same category and exclusive group (the "slot"), so queueing several
images yields deliberately different looks. Attachment tokens (outfits,
emotions) follow their host character in document order and therefore
expand directly after the character's own block.

Pure logic; no ComfyUI imports so it runs identically in tests.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass
from typing import Callable, List, Optional

from .tokens import (
    RANDOMIZE_FLAG,
    clean_spacing,
    parse_document,
    raw_display,
    token_markup,
    token_ranges,
)
from .presets import Preset, PresetStore


@dataclass
class CompiledPrompt:
    prompt: str
    negative: str
    raw_prompt: str
    used_preset_ids: Optional[List[str]] = None
    missing_preset_ids: Optional[List[str]] = None
    random_choices: Optional[List[dict]] = None

    def __post_init__(self) -> None:
        if self.used_preset_ids is None:
            self.used_preset_ids = []
        if self.missing_preset_ids is None:
            self.missing_preset_ids = []
        if self.random_choices is None:
            self.random_choices = []


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


def random_candidates(
    store: PresetStore,
    preset: Preset,
    exclude_id: str = "",
) -> List[Preset]:
    """Presets that can be swapped in for ``preset`` by the randomizer.

    Same category, same exclusive group (a "slot" — camera, wardrobe top,
    ...), enabled. The currently selected preset is excluded so every
    randomized run visibly changes the look.
    """
    candidates = []
    for candidate in store.by_category(preset.category):
        if not candidate.enabled:
            continue
        if candidate.exclusive_group != preset.exclusive_group:
            continue
        if exclude_id and candidate.id == exclude_id:
            continue
        candidates.append(candidate)
    return candidates


def randomize_document(
    doc: str,
    store: PresetStore,
    rng: Optional[random.Random] = None,
) -> tuple:
    """Replace ``~``-flagged tokens with a random same-slot preset.

    Returns ``(new_doc, choices)`` where ``choices`` describes each pick
    (``token_id``, ``chosen_id``, ``chosen_name``). Tokens whose own
    preset is missing or that have no alternatives are left untouched.
    Attachments keep their host; labels update to the chosen preset so
    the raw output and any downstream tooling show what was used.
    """
    chooser = rng.choice if rng is not None else random.choice
    choices: List[dict] = []
    # Rebuild from the end so earlier ranges stay valid while we splice.
    replacements: List[tuple] = []
    for segment in token_ranges(doc):
        if not segment.randomize:
            continue
        preset = store.get(segment.preset_id)
        if preset is None or not preset.enabled:
            continue
        candidates = random_candidates(store, preset, exclude_id=preset.id)
        if not candidates:
            continue
        chosen = chooser(candidates)
        marker = token_markup(
            chosen.id,
            chosen.name,
            host=segment.host,
            randomize=True,  # keep the flag: the token stays randomizable
        )
        replacements.append((segment.start, segment.end, marker, segment.preset_id, chosen))

    new_doc = doc
    for start, end, marker, old_id, chosen in reversed(replacements):
        new_doc = new_doc[:start] + marker + new_doc[end:]
        choices.append(
            {
                "token_id": old_id,
                "chosen_id": chosen.id,
                "chosen_name": chosen.name,
            }
        )
    choices.reverse()
    return new_doc, choices


def compile_document(
    doc: str,
    store: PresetStore,
    rng: Optional[random.Random] = None,
) -> CompiledPrompt:
    """Compile one studio document into the node's outputs."""
    active_doc = doc or ""
    choices: List[dict] = []
    if rng is not None:
        # Randomization only runs when explicitly enabled by the caller
        # (the node passes an rng when the document asks for it).
        active_doc, choices = randomize_document(active_doc, store, rng=rng)

    parts: List[str] = []
    used: List[str] = []
    missing: List[str] = []
    for segment in parse_document(active_doc):
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
    negative = ", ".join(_negative_clauses(store, used))
    raw = raw_display(
        active_doc,
        lambda preset_id: store.label_of(preset_id),
    )
    return CompiledPrompt(
        prompt=clean_spacing("".join(parts)),
        negative=negative,
        raw_prompt=clean_spacing(raw),
        used_preset_ids=used,
        missing_preset_ids=missing,
        random_choices=choices,
    )
