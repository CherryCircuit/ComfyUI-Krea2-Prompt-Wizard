"""Prompt compilation for the Prompt Studio.

Turns a token document into the node outputs:

* ``prompt``        — shared + first-frame text, tokens expanded
* ``negative``      — combined negatives of the presets used above
* ``raw_prompt``    — the human-readable ``[LABEL]`` rendering
* ``last_prompt``   — shared + last-frame text (frames mode only)
* ``last_negative`` — combined negatives for the last frame

Bundle presets (Looks, Performances) inline their ``included_presets``
expansions in order, with cycle detection; a bundle's negatives are the
union of its members'.

Tokens flagged with ``~`` are first replaced by a random preset drawn
from the same category and exclusive group (the "slot"). Randomization
runs ONCE over the whole document, so in frames mode both frames receive
identical picks — essential for coherent first/last pairs.

The inheritance model is composition + text order: a character's block
comes first, then its Look, then its other attachments, then scene text;
later text refines earlier text. Pure logic; no ComfyUI imports.
"""
from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .presets import Preset, PresetStore
from .tokens import (
    clean_spacing,
    has_frames,
    parse_document,
    raw_display,
    split_sections,
    token_markup,
)


@dataclass
class CompiledPrompt:
    prompt: str
    negative: str
    raw_prompt: str
    last_prompt: str = ""
    last_negative: str = ""
    has_frames: bool = False
    used_preset_ids: List[str] = field(default_factory=list)
    missing_preset_ids: List[str] = field(default_factory=list)
    random_choices: List[dict] = field(default_factory=list)
    #: The document after this run's dice were resolved. Sent to the UI so
    #: the node can show the presets that were actually used.
    randomized_doc: str = ""


_CLAUSE_SPLIT = re.compile(r"[\n,]+")


# ---------------------------------------------------------------------------
# Bundle expansion
# ---------------------------------------------------------------------------


def expand_preset(
    preset: Preset,
    store: PresetStore,
    _seen: Optional[frozenset] = None,
) -> Tuple[str, List[str]]:
    """Expand one preset to (prompt_text, contributing_preset_ids).

    Bundles inline their members depth-first. Cycles are cut with a
    visible marker; missing or disabled members render ``[MISSING: id]``.
    """
    if not preset.included_presets:
        return preset.prompt.strip(), [preset.id]
    seen = _seen or frozenset()
    if preset.id in seen:
        return f"[CYCLIC BUNDLE: {preset.id}]", []
    seen = seen | {preset.id}
    parts: List[str] = []
    used: List[str] = [preset.id]
    for member_id in preset.included_presets:
        member = store.get(member_id)
        if member is None or not member.enabled:
            parts.append(f"[MISSING: {member_id}]")
            used.append(member_id)  # surface in missing/negative accounting
            continue
        text, member_ids = expand_preset(member, store, seen)
        if text:
            parts.append(text)
        used.extend(member_ids)
    return " ".join(part for part in parts if part), used


# ---------------------------------------------------------------------------
# Negatives
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Randomization
# ---------------------------------------------------------------------------


def slot_key(category: str, exclusive_group: str = "") -> str:
    """Stable key for one randomizer pool.

    A pool is scoped to a category plus its exclusive group, which is the
    same boundary the randomizer already uses: a camera cannot swap with a
    wardrobe top, and two wardrobe tops share one slot.
    """
    return f"{category or 'other'}|{exclusive_group or ''}"


def parse_pools(raw: str) -> Dict[str, set]:
    """Read the hidden ``randomizer_doc`` JSON into pool key -> allowed ids.

    Tolerant by design: a workflow written by an older or newer frontend
    must still queue. Unknown keys, non-list values and junk ids are
    ignored; a missing entry means "all presets in the slot are allowed".
    """
    try:
        data = json.loads(raw or "")
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    pools = data.get("pools")
    if not isinstance(pools, dict):
        return {}
    out: Dict[str, set] = {}
    for key, ids in pools.items():
        if not isinstance(key, str) or not isinstance(ids, list):
            continue
        allowed = {
            str(item).strip()
            for item in ids
            if isinstance(item, str) and str(item).strip()
        }
        out[key] = allowed
    return out


def candidates_for_slot(
    store: PresetStore,
    category: str,
    exclusive_group: str = "",
    *,
    exclude_id: str = "",
    pools: Optional[Dict[str, set]] = None,
) -> List[Preset]:
    """Enabled presets in one slot, narrowed by an optional pool."""
    allowed = pools.get(slot_key(category, exclusive_group)) if pools else None
    candidates = []
    for candidate in store.by_category(category):
        if not candidate.enabled:
            continue
        if candidate.exclusive_group != exclusive_group:
            continue
        if allowed is not None and candidate.id not in allowed:
            continue
        if exclude_id and candidate.id == exclude_id:
            continue
        candidates.append(candidate)
    return candidates


def random_candidates(
    store: PresetStore,
    preset: Preset,
    exclude_id: str = "",
    pools: Optional[Dict[str, set]] = None,
) -> List[Preset]:
    """Presets that can be swapped in for ``preset`` by the randomizer.

    Same category, same exclusive group (a "slot" — camera, wardrobe top,
    ...), enabled, and inside the user's checked pool when one exists. The
    currently selected preset is excluded so every randomized run visibly
    changes the look.
    """
    return candidates_for_slot(
        store,
        preset.category,
        preset.exclusive_group,
        exclude_id=exclude_id,
        pools=pools,
    )


def randomize_document(
    doc: str,
    store: PresetStore,
    rng: Optional[random.Random] = None,
    pools: Optional[Dict[str, set]] = None,
) -> Tuple[str, List[dict]]:
    """Replace ``~``-flagged tokens with a random same-slot preset.

    Runs over the WHOLE document (frame markers are irrelevant here: they
    are plain text that survives the splice), so both frames share picks.
    Returns ``(new_doc, choices)``.
    """
    chooser = rng.choice if rng is not None else random.choice
    choices: List[dict] = []
    segments = parse_document(doc)

    def parse_node(index: int):
        """One token plus its adjacent attachment subtree."""
        segment = segments[index]
        children = []
        end = segment.end
        next_index = index + 1
        while (
            next_index < len(segments)
            and segments[next_index].type == "token"
            and segments[next_index].host == segment.preset_id
            and segments[next_index].start == end
        ):
            child, child_next = parse_node(next_index)
            children.append(child)
            end = child["end"]
            next_index = child_next
        return (
            {
                "segment": segment,
                "children": children,
                "end": end,
                "next": next_index,
            },
            next_index,
        )

    def render_node(node: dict, host: Optional[str] = None) -> str:
        segment = node["segment"]
        chosen = None
        if segment.randomize:
            preset = store.get(segment.preset_id)
            if preset is not None and preset.enabled:
                candidates = random_candidates(
                    store, preset, exclude_id=preset.id, pools=pools
                )
                if candidates:
                    chosen = chooser(candidates)
        chosen_id = chosen.id if chosen is not None else segment.preset_id
        chosen_name = chosen.name if chosen is not None else segment.label
        # Children point at the id that actually appears in this run, so a
        # randomized hairstyle keeps its colour facets and a randomized
        # garment keeps its colour/pattern facets.
        marker = token_markup(
            chosen_id,
            chosen_name,
            host=host if host is not None else segment.host,
            randomize=segment.randomize,
        )
        if chosen is not None:
            choices.append(
                {
                    "token_id": segment.preset_id,
                    "chosen_id": chosen.id,
                    "chosen_name": chosen.name,
                }
            )
        inner = "".join(
            render_node(child, chosen_id) for child in node["children"]
        )
        return marker + inner

    parts: List[str] = []
    index = 0
    while index < len(segments):
        segment = segments[index]
        if segment.type == "text":
            parts.append(segment.value)
            index += 1
            continue
        if segment.type == "frame":
            parts.append(segment.raw or segment.value)
            index += 1
            continue
        node, next_index = parse_node(index)
        parts.append(render_node(node))
        index = next_index
    return "".join(parts), choices


# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------


def _expand_segments(doc: str, store: PresetStore) -> Tuple[str, List[str], List[str]]:
    """Expand one section document to (prompt_text, used_ids, missing_ids)."""
    parts: List[str] = []
    used: List[str] = []
    missing: List[str] = []
    for segment in parse_document(doc):
        if segment.type == "text":
            parts.append(segment.value)
            continue
        if segment.type == "frame":
            continue  # structural; never appears inside a section
        preset = store.get(segment.preset_id)
        if preset is None or not preset.enabled:
            if segment.preset_id not in missing:
                missing.append(segment.preset_id)
            parts.append(f"[MISSING: {segment.preset_id}]")
            continue
        text, contributing = expand_preset(preset, store)
        if segment.preset_id not in used:
            used.append(segment.preset_id)
        used.extend(pid for pid in contributing if pid not in used)
        for member_id in contributing:
            member = store.get(member_id)
            if member is None and member_id not in missing:
                missing.append(member_id)
        parts.append(text)
    return clean_spacing("".join(parts)), used, missing


def _compile_section(doc: str, store: PresetStore) -> Tuple[str, str, List[str], List[str]]:
    text, used, missing = _expand_segments(doc, store)
    negative = ", ".join(_negative_clauses(store, used))
    return text, negative, used, missing


def compile_document(
    doc: str,
    store: PresetStore,
    rng: Optional[random.Random] = None,
    pools: Optional[Dict[str, set]] = None,
) -> CompiledPrompt:
    """Compile one studio document into the node's outputs.

    ``pools`` narrows every random draw to the ids the user checked in the
    randomizer. Absent or empty pools mean the whole slot stays available.
    """
    active_doc = doc or ""
    choices: List[dict] = []
    if rng is not None:
        # One randomization pass per execution: both frames share picks.
        active_doc, choices = randomize_document(
            active_doc, store, rng=rng, pools=pools
        )

    if has_frames(active_doc):
        sections = split_sections(active_doc)
        prompt, negative, used, missing = _compile_section(
            sections["shared"] + sections["first"], store
        )
        last_prompt, last_negative, last_used, last_missing = _compile_section(
            sections["shared"] + sections["last"], store
        )
        for pid in last_used:
            if pid not in used:
                used.append(pid)
        for pid in last_missing:
            if pid not in missing:
                missing.append(pid)
        raw = raw_display(sections["shared"] + sections["first"],
                          lambda pid: store.label_of(pid))
        if sections["last"].strip():
            raw += "\n[LAST FRAME]\n" + raw_display(sections["shared"] + sections["last"],
                                                    lambda pid: store.label_of(pid))
        return CompiledPrompt(
            prompt=prompt,
            negative=negative,
            raw_prompt=clean_spacing(raw),
            last_prompt=last_prompt,
            last_negative=last_negative,
            has_frames=True,
            used_preset_ids=used,
            missing_preset_ids=missing,
            random_choices=choices,
            randomized_doc=active_doc,
        )

    prompt, negative, used, missing = _compile_section(active_doc, store)
    raw = raw_display(active_doc, lambda pid: store.label_of(pid))
    return CompiledPrompt(
        prompt=prompt,
        negative=negative,
        raw_prompt=clean_spacing(raw),
        used_preset_ids=used,
        missing_preset_ids=missing,
        random_choices=choices,
        randomized_doc=active_doc,
    )
