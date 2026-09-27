"""Document tokenizer for the Prompt Studio token format.

A studio document is a plain string that mixes ordinary user text with
token markers::

    [SERENA] enters {{krea2:scene_medieval_tavern_a|MEDIEVAL TAVERN A}}.

Marker grammar (v2)::

    {{krea2:<preset_id>|<label>|@<host_id>|~}}

* ``preset_id`` — stable preset reference (required).
* ``label``     — first optional field; human-readable fallback hint.
* ``@host_id``  — attachment flag: this preset belongs to a host token
                  (typically a character), e.g. an outfit or an emotion.
* ``~``         — randomize flag: at execution time the token is replaced
                  by a random preset of the same category/slot.

Flags may appear in any order after the label. All fields are optional
except the id, so v1 documents (``{{krea2:id|Label}}``) parse unchanged.

This module is pure logic with no I/O and is mirrored by
``web/studio/tokenizer.mjs``. The backend remains the authoritative
compiler at execution time; the mirror only powers the live preview.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

# Token marker grammar. The id is strict; everything after it is a pipe
# separated field list (label, then flags) parsed by _parse_fields.
TOKEN_PATTERN = re.compile(r"\{\{krea2:([A-Za-z0-9_-]+)((?:\|[^}]*)?)\}\}")

TOKEN_PREFIX = "{{krea2:"
TOKEN_SUFFIX = "}}"

TOKEN_ID_RE = re.compile(r"[A-Za-z0-9_-]+")

RANDOMIZE_FLAG = "~"
HOST_FLAG_PREFIX = "@"

_RANDOMIZE_MARKER_RE = re.compile(r"\{\{krea2:[A-Za-z0-9_-]+[^}]*~[^}]*\}\}")

# ---------------------------------------------------------------------------
# Frame sections (First / Last frame mode)
#
# ``{{frame:first}}`` and ``{{frame:last}}`` are structural markers, not
# presets. Text outside them is SHARED (appears in both frames); text after
# ``{{frame:first}}`` belongs to the first frame only; text after
# ``{{frame:last}}`` to the last frame only.
# ---------------------------------------------------------------------------

FRAME_FIRST = "{{frame:first}}"
FRAME_LAST = "{{frame:last}}"

_FRAME_MARKERS = {FRAME_FIRST: "first", FRAME_LAST: "last"}


@dataclass
class Segment:
    """One piece of a studio document.

    ``type`` is either ``"text"`` (plain user text) or ``"token"`` (a
    preset reference). Token segments keep the serialized marker in
    ``raw`` so the original document can always be reconstructed, and
    carry their document offsets in ``start``/``end`` for in-place edits.
    """

    type: str
    value: str = ""
    preset_id: str = ""
    label: str = ""
    host: str = ""
    randomize: bool = False
    raw: str = field(default="")
    start: int = 0
    end: int = 0


def _parse_fields(field_str: str) -> tuple:
    """Split the pipe-separated fields into (label, host, randomize)."""
    label = ""
    host = ""
    randomize = False
    label_taken = False
    fields = field_str.split("|") if field_str else []
    for raw_field in fields:
        item = raw_field.strip()
        if not item:
            continue
        if item == RANDOMIZE_FLAG:
            randomize = True
        elif item.startswith(HOST_FLAG_PREFIX):
            host = item[len(HOST_FLAG_PREFIX):].strip()
        elif not label_taken:
            label = item
            label_taken = True
        # Unknown later fields are ignored (forward compatibility).
    return label, host, randomize


def token_markup(
    preset_id: str,
    label: str = "",
    host: str = "",
    randomize: bool = False,
) -> str:
    """Serialize one token marker with canonical field order."""
    pid = str(preset_id or "").strip()
    if not pid or not TOKEN_ID_RE.fullmatch(pid):
        pid = re.sub(r"[^A-Za-z0-9_-]", "_", pid) or "unknown"
    fields: List[str] = []
    label = str(label or "").strip()
    if label:
        fields.append(label)
    host = str(host or "").strip()
    if host:
        fields.append(f"{HOST_FLAG_PREFIX}{host}")
    if randomize:
        fields.append(RANDOMIZE_FLAG)
    if fields:
        return f"{TOKEN_PREFIX}{pid}|{'|'.join(fields)}{TOKEN_SUFFIX}"
    return f"{TOKEN_PREFIX}{pid}{TOKEN_SUFFIX}"


def parse_document(doc: str) -> List[Segment]:
    """Split a document into text, token and frame segments, in order.

    Frame segments have ``type == "frame"`` with ``value`` ``"first"`` or
    ``"last"`` and carry no preset reference.
    """
    segments: List[Segment] = []
    pos = 0
    doc = doc or ""
    events = []
    for match in TOKEN_PATTERN.finditer(doc):
        events.append((match.start(), match.end(), "token", match))
    for marker, which in _FRAME_MARKERS.items():
        start = 0
        while True:
            index = doc.find(marker, start)
            if index < 0:
                break
            events.append((index, index + len(marker), "frame", which))
            start = index + len(marker)
    events.sort(key=lambda item: item[0])
    for start, end, kind, payload in events:
        if start < pos:
            continue  # overlapping (a frame marker inside a token — impossible, but be safe)
        if start > pos:
            segments.append(Segment(type="text", value=doc[pos:start], start=pos, end=start))
        if kind == "token":
            label, host, randomize = _parse_fields(payload.group(2))
            segments.append(
                Segment(
                    type="token",
                    preset_id=payload.group(1),
                    label=label,
                    host=host,
                    randomize=randomize,
                    raw=payload.group(0),
                    start=start,
                    end=end,
                )
            )
        else:
            segments.append(
                Segment(
                    type="frame",
                    value=payload,
                    raw=doc[start:end],
                    start=start,
                    end=end,
                )
            )
        pos = end
    if pos < len(doc):
        segments.append(Segment(type="text", value=doc[pos:], start=pos, end=len(doc)))
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


def token_ranges(doc: str) -> List[Segment]:
    """Just the token segments, in document order."""
    return [segment for segment in parse_document(doc) if segment.type == "token"]


def has_randomize(doc: str) -> bool:
    """True when any token carries the randomize flag."""
    return bool(_RANDOMIZE_MARKER_RE.search(doc or ""))


def has_frames(doc: str) -> bool:
    """True when the document contains any frame section marker."""
    return FRAME_FIRST in (doc or "") or FRAME_LAST in (doc or "")


def split_sections(doc: str) -> Dict[str, str]:
    """Split a document into SHARED / FIRST / LAST text sections.

    Text outside frame markers is shared. Content following
    ``{{frame:first}}`` belongs to the first frame (until a last-frame
    marker or the end of the document) and symmetrically for last. Any
    number of markers is tolerated; pieces accumulate in order.
    """
    doc = doc or ""
    shared: List[str] = []
    first: List[str] = []
    last: List[str] = []
    current = shared
    pos = 0
    events = []
    for marker, which in _FRAME_MARKERS.items():
        index = doc.find(marker)
        while index >= 0:
            events.append((index, marker, which))
            index = doc.find(marker, index + len(marker))
    events.sort()
    for start, marker, which in events:
        if start < pos:
            continue
        current.append(doc[pos:start])
        current = first if which == "first" else last
        pos = start + len(marker)
    current.append(doc[pos:])
    return {
        "shared": "".join(shared),
        "first": "".join(first),
        "last": "".join(last),
    }


def host_ids(doc: str) -> List[str]:
    """Distinct host ids referenced by attachment tokens, in first-use order."""
    seen: List[str] = []
    for segment in token_ranges(doc):
        if segment.host and segment.host not in seen:
            seen.append(segment.host)
    return seen


def replace_token_fields(
    doc: str,
    range_start: int,
    range_end: int,
    *,
    label: Optional[str] = None,
    host: Optional[str] = None,
    randomize: Optional[bool] = None,
) -> str:
    """Rewrite one token's optional fields in place, preserving its id."""
    for segment in parse_document(doc):
        if segment.type != "token" or segment.start != range_start:
            continue
        new_label = segment.label if label is None else label
        new_host = segment.host if host is None else host
        new_randomize = segment.randomize if randomize is None else randomize
        return (
            doc[:range_start]
            + token_markup(segment.preset_id, new_label, new_host, new_randomize)
            + doc[range_end:]
        )
    return doc


def attach_token(
    doc: str,
    host_range_start: int,
    host_range_end: int,
    preset_id: str,
    label: str,
) -> str:
    """Insert an attachment token immediately after its host token."""
    marker = token_markup(preset_id, label, host=str(
        next(
            (
                segment.preset_id
                for segment in token_ranges(doc)
                if segment.start == host_range_start
            ),
            "",
        )
    ))
    return doc[:host_range_end] + marker + doc[host_range_end:]


def raw_display(doc: str, resolve_label: Optional[Callable[[str], Optional[str]]] = None) -> str:
    """Render the human-readable version with attachments nested.

    Plain tokens become ``[LABEL]``. Attachment tokens render inside their
    host's brackets as ``(LABEL)``; if the host is absent they stand alone.
    Unknown or disabled presets render as ``[MISSING: id]``.
    """
    tokens = token_ranges(doc)
    hosts_present = {segment.preset_id for segment in tokens if not segment.host}

    def label_for(preset_id: str, fallback: str) -> str:
        if resolve_label is not None:
            resolved = resolve_label(preset_id)
            return resolved if resolved else ""
        return fallback

    parts: List[str] = []
    for segment in parse_document(doc):
        if segment.type == "text":
            parts.append(segment.value)
            continue
        if segment.type == "frame":
            continue  # structural; sections are labeled by the caller
        if segment.host and segment.host in hosts_present:
            continue  # rendered inside the host bracket below
        label = label_for(segment.preset_id, segment.label)
        if not label:
            if segment.host:
                parts.append(f"[MISSING: {segment.host}] (MISSING: {segment.preset_id})")
            else:
                parts.append(f"[MISSING: {segment.preset_id}]")
            continue
        if segment.host:
            parts.append(f"[MISSING: {segment.host}] ({label})")
            continue
        attachments = [
            attached
            for attached in tokens
            if attached.host == segment.preset_id
        ]
        if attachments:
            inner = []
            for attached in attachments:
                att_label = label_for(attached.preset_id, attached.label)
                inner.append(f"({att_label})" if att_label else f"(MISSING: {attached.preset_id})")
            parts.append(f"[{label} {' '.join(inner)}]")
        else:
            parts.append(f"[{label}]")
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
    text = re.sub(r"([.,;:!?])\1+", lambda m: m.group(0)[0] if len(m.group(0)) == 2 else m.group(0), text)
    return text.strip()
