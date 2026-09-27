"""Document tokenizer for the Prompt Studio token format.

A studio document is a plain string that mixes ordinary user text with
token markers::

    [SERENA] enters {{krea2:scene_medieval_tavern_a|MEDIEVAL TAVERN A}}.

The serialized marker is the source of truth stored in the workflow. It
references a preset by ``id`` (stable across renames) and carries a
human-readable display label used as a fallback when the preset cannot be
resolved.

This module is pure logic with no I/O and is mirrored by
``web/studio/tokenizer.mjs``. The backend remains the authoritative
compiler at execution time; the mirror only powers the live preview.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, List, Optional

# Token marker grammar: {{krea2:<id>|<label>}}  (label optional)
TOKEN_PATTERN = re.compile(r"\{\{krea2:([A-Za-z0-9_-]+)(?:\|([^}]*))?\}\}")

TOKEN_PREFIX = "{{krea2:"
TOKEN_SUFFIX = "}}"

TOKEN_ID_RE = re.compile(r"[A-Za-z0-9_-]+")


@dataclass
class Segment:
    """One piece of a studio document.

    ``type`` is either ``"text"`` (plain user text) or ``"token"`` (a
    preset reference). Token segments keep the serialized marker in
    ``raw`` so the original document can always be reconstructed.
    """

    type: str
    value: str = ""
    preset_id: str = ""
    label: str = ""
    raw: str = field(default="")


def token_markup(preset_id: str, label: str = "") -> str:
    """Serialize one token marker for a preset id and display label."""
    pid = str(preset_id or "").strip()
    if not pid or not TOKEN_ID_RE.fullmatch(pid):
        pid = re.sub(r"[^A-Za-z0-9_-]", "_", pid) or "unknown"
    label = str(label or "").strip()
    if label:
        return f"{TOKEN_PREFIX}{pid}|{label}{TOKEN_SUFFIX}"
    return f"{TOKEN_PREFIX}{pid}{TOKEN_SUFFIX}"


def parse_document(doc: str) -> List[Segment]:
    """Split a document into text and token segments, in order."""
    segments: List[Segment] = []
    pos = 0
    doc = doc or ""
    for match in TOKEN_PATTERN.finditer(doc):
        if match.start() > pos:
            segments.append(Segment(type="text", value=doc[pos:match.start()]))
        preset_id = match.group(1)
        label = (match.group(2) or "").strip()
        segments.append(
            Segment(
                type="token",
                preset_id=preset_id,
                label=label,
                raw=match.group(0),
            )
        )
        pos = match.end()
    if pos < len(doc):
        segments.append(Segment(type="text", value=doc[pos:]))
    return segments


def serialize_segments(segments: List[Segment]) -> str:
    """Rebuild the document string from segments."""
    parts: List[str] = []
    for segment in segments:
        if segment.type == "token":
            parts.append(segment.raw or token_markup(segment.preset_id, segment.label))
        else:
            parts.append(segment.value)
    return "".join(parts)


def raw_display(doc: str, resolve_label: Optional[Callable[[str], Optional[str]]] = None) -> str:
    """Render the human-readable version: tokens become ``[LABEL]``.

    ``resolve_label`` may return the current display label for a preset
    id; unknown or disabled presets render as ``[MISSING: id]``.
    """
    parts: List[str] = []
    for segment in parse_document(doc):
        if segment.type == "text":
            parts.append(segment.value)
            continue
        label = segment.label
        if resolve_label is not None:
            resolved = resolve_label(segment.preset_id)
            label = resolved if resolved else ""
        if label:
            parts.append(f"[{label}]")
        else:
            parts.append(f"[MISSING: {segment.preset_id}]")
    return "".join(parts)


def clean_spacing(text: str) -> str:
    """Collapse artifacts left behind by in-place expansion.

    Doubled spaces introduced when a token vanishes between two words are
    the common case; paragraph breaks are preserved. Exactly-doubled
    punctuation (``..`` or ``,,``) from a token expansion colliding with
    the surrounding text is collapsed too, while ellipses (``...``) and
    longer runs survive.
    """
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +\n", "\n", text)
    text = re.sub(r"\n +", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse exactly-doubled punctuation (see docstring): runs of length
    # two become one; longer runs (ellipses) are left untouched.
    text = re.sub(r"([.,;:!?])\1+", lambda m: m.group(0)[0] if len(m.group(0)) == 2 else m.group(0), text)
    return text.strip()
