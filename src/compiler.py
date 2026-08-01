"""The prompt compiler.

The compiler is a pure function:

    compile_state(state, library) -> CompilationResult

It takes a wizard state and a :class:`Library`, walks the rows, normalises
duplicates, generates the per-category prompt fragments, and produces a
final prompt plus a structured trace JSON the Inspector can render.

The compiler is deterministic: feeding the same inputs twice produces the
same outputs. The only randomness is in the trace JSON timestamp, which is
omitted from the JSON when not provided.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from . import conflicts
from .schemas import (
    CATEGORIES,
    MAX_PROMPT_LENGTH,
    MODE_BIPOLAR,
    MODE_RAW,
    MODE_SCALAR,
    SCHEMA_VERSION,
    SLIDER_DEFAULT,
    WEIGHT_HARD_WARNING_THRESHOLD,
    WEIGHT_MAX_PROMINENT,
    WEIGHT_WARN_THRESHOLD,
)
from .validation import raise_if_errors, validate_state
from .weight_mapping import (
    format_phrase,
    mode_for_row,
    phrase_for_row,
    strip_weighting,
    weight_for_row,
)


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------


@dataclass
class Fragment:
    """A single compiled fragment attributable to a wizard row."""

    category: str
    row_id: str
    preset_id: str
    label: str
    phrase: str
    weight: float
    mode: str
    enabled: bool
    fragment: str
    verification: str = "general visual vocabulary"
    source: str = "library"
    warning: Optional[str] = None


@dataclass
class CompilationResult:
    final_prompt: str
    plain_prompt: str
    category_prompts: Dict[str, str]
    fragments: List[Fragment]
    trace: Dict[str, Any]
    warnings: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "final_prompt": self.final_prompt,
            "plain_prompt": self.plain_prompt,
            "category_prompts": dict(self.category_prompts),
            "fragments": [
                {
                    "category": f.category,
                    "row_id": f.row_id,
                    "preset_id": f.preset_id,
                    "label": f.label,
                    "phrase": f.phrase,
                    "weight": f.weight,
                    "mode": f.mode,
                    "enabled": f.enabled,
                    "fragment": f.fragment,
                    "verification": f.verification,
                    "source": f.source,
                    "warning": f.warning,
                }
                for f in self.fragments
            ],
            "trace": dict(self.trace),
            "warnings": list(self.warnings),
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


_CHARACTER_FIELDS = (
    ("identity", "identity"),
    ("subject", "subject"),
    ("expression", "expression"),
    ("clothing", "clothing and armour"),
    ("hair_style", "hair style"),
    ("hair_length", "hair length"),
    ("hair_color", "hair colour"),
    ("makeup", "makeup"),
    ("eyes", "eyes"),
    ("nose", "nose"),
    ("mouth", "mouth"),
    ("chin", "chin"),
    ("face_shape", "face shape"),
    ("body_type", "body type"),
    ("fitness", "fitness"),
    ("proportions", "proportions"),
    ("adult_description", "adult body description"),
)


def _structured_prompt_parts(state: Dict[str, Any]) -> List[str]:
    """Compile the human-facing character and setting editors."""
    parts: List[str] = []
    for index, character in enumerate(state.get("characters") or []):
        if not isinstance(character, dict) or character.get("enabled", True) is False:
            continue
        name = str(character.get("name") or f"Character {index + 1}").strip()
        details = []
        for key, label in _CHARACTER_FIELDS:
            value = str(character.get(key) or "").strip()
            if value:
                details.append(f"{label}: {value}")
        if details:
            parts.append(f"Character {name}: " + "; ".join(details))
        elif name:
            parts.append(f"Character {name}")

    setting = state.get("setting")
    if isinstance(setting, dict) and setting.get("enabled", False):
        name = str(setting.get("name") or "Scene").strip()
        description = str(setting.get("description") or "").strip()
        if description:
            parts.append(f"Setting {name}: {description}")
        elif name:
            parts.append(f"Setting: {name}")
    return parts


def compile_state(
    state: Dict[str, Any],
    library: Any,
    *,
    expert: bool = False,
) -> CompilationResult:
    """Compile a wizard state into a structured prompt result."""
    if not isinstance(state, dict):
        raise TypeError("state must be a JSON object")
    validation = validate_state(state)
    raise_if_errors(validation)

    base_prompt = (state.get("base_prompt") or "").strip()
    structured_parts = _structured_prompt_parts(state)
    rows = list(state.get("rows") or [])

    # Tidy: skip rows without a phrase or with an explicit invalid entry.
    cleaned_rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        phrase = (row.get("phrase") or "").strip()
        if not phrase:
            continue
        cleaned_rows.append(row)

    preset_index = {}
    if library is not None and hasattr(library, "index_by_id"):
        try:
            preset_index = library.index_by_id()
        except Exception:
            preset_index = {}

    fragments: List[Fragment] = []
    weights_by_id: Dict[str, float] = {}
    enabled_rows: List[Dict[str, Any]] = []

    for row in cleaned_rows:
        rid = row.get("id", "")
        cat = row.get("category", "custom")
        mode = mode_for_row(row)
        try:
            intensity = float(row.get("strength", row.get("intensity", SLIDER_DEFAULT)))
        except (TypeError, ValueError):
            intensity = SLIDER_DEFAULT
        enabled = bool(row.get("enabled", True))
        phrase = phrase_for_row(row)
        phrase = strip_weighting(phrase)
        weight = weight_for_row(row, expert=expert)
        weights_by_id[rid] = weight

        preset = preset_index.get(row.get("preset_id", ""), {})
        verification = preset.get("verification", "general visual vocabulary")
        source = preset.get("source", "library")

        if not enabled or not phrase:
            fragments.append(
                Fragment(
                    category=cat,
                    row_id=rid,
                    preset_id=row.get("preset_id", ""),
                    label=row.get("label", "") or preset.get("label", ""),
                    phrase=phrase,
                    weight=weight,
                    mode=mode,
                    enabled=enabled,
                    fragment=strip_weighting(phrase),
                    verification=verification,
                    source=source,
                )
            )
            continue

        if mode == MODE_BIPOLAR and intensity == 0:
            # Bipolar rows with slider at zero contribute nothing.
            fragments.append(
                Fragment(
                    category=cat,
                    row_id=rid,
                    preset_id=row.get("preset_id", ""),
                    label=row.get("label", "") or preset.get("label", ""),
                    phrase=phrase,
                    weight=weight,
                    mode=mode,
                    enabled=enabled,
                    fragment=strip_weighting(phrase),
                    verification=verification,
                    source=source,
                )
            )
            continue

        emitted_phrase = format_phrase(phrase, weight)
        row_warning = None
        if mode == MODE_RAW and weight < 0:
            row_warning = "Raw negative numerical weights are community-reported for Krea 2."
        elif mode == MODE_RAW and abs(weight) > 3.0:
            row_warning = "Raw weight exceeds the documented 3.0 ceiling."
        elif abs(weight) > WEIGHT_MAX_PROMINENT:
            row_warning = "Weight exceeds the safe 3.0 ceiling."

        fragments.append(
            Fragment(
                category=cat,
                row_id=rid,
                preset_id=row.get("preset_id", ""),
                label=row.get("label", "") or preset.get("label", ""),
                phrase=phrase,
                weight=weight,
                mode=mode,
                enabled=enabled,
                fragment=emitted_phrase,
                verification=verification,
                source=source,
                warning=row_warning,
            )
        )
        enabled_rows.append(row)

    # Detect duplicates (enabled rows only).
    duplicate_pairs = _detect_duplicate_emissions(enabled_rows)

    # Build per-category fragments.
    category_prompts: Dict[str, str] = {cat: "" for cat in CATEGORIES}
    for cat in CATEGORIES:
        parts: List[str] = []
        for f in fragments:
            if not f.enabled or not f.fragment:
                continue
            if f.category != cat:
                continue
            if f.mode == MODE_BIPOLAR:
                # Bipolar rows with neutral phrase emit nothing.
                if f.phrase == "":
                    continue
            parts.append(f.fragment)
        # Deduplicate accidental repeats while preserving order.
        if cat in ("emotion", "mouth"):
            parts = _dedupe_preserving_order(parts)
        category_prompts[cat] = " ".join(parts).strip()

    # Build the final prompt in the canonical compile order.
    body_parts: List[str] = []
    if base_prompt:
        body_parts.append(base_prompt.rstrip())
    body_parts.extend(structured_parts)

    for cat in CATEGORIES:
        text = category_prompts.get(cat, "")
        if text:
            body_parts.append(text)

    final_prompt = ", ".join([p for p in body_parts if p]).strip()
    final_prompt = _normalise_punctuation(final_prompt)

    # Plain prompt: same order, no weighting syntax.
    plain_parts: List[str] = []
    if base_prompt:
        plain_parts.append(base_prompt.rstrip())
    plain_parts.extend(structured_parts)
    for cat in CATEGORIES:
        plain_fragments = []
        for f in fragments:
            if not f.enabled or not f.phrase:
                continue
            if f.category != cat:
                continue
            plain_fragments.append(strip_weighting(f.phrase))
        if cat in ("emotion", "mouth"):
            plain_fragments = _dedupe_preserving_order(plain_fragments)
        text = " ".join(plain_fragments).strip()
        if text:
            plain_parts.append(text)
    plain_prompt = ", ".join([p for p in plain_parts if p]).strip()
    plain_prompt = _normalise_punctuation(plain_prompt)

    # Detect conflicts.
    warning_list = conflicts.collect_all_warnings(
        enabled_rows,
        weights_by_id=weights_by_id,
        prompt=final_prompt,
    )
    if duplicate_pairs:
        warning_list.append(
            {
                "code": "rows.duplicate_filtered",
                "severity": "info",
                "message": "Duplicate fragments were removed from the final prompt.",
                "row_ids": [rid for pair in duplicate_pairs for rid in pair],
            }
        )

    trace = {
        "schema_version": SCHEMA_VERSION,
        "rows": [
            {
                "id": f.row_id,
                "category": f.category,
                "preset_id": f.preset_id,
                "label": f.label,
                "phrase": f.phrase,
                "weight": f.weight,
                "mode": f.mode,
                "enabled": f.enabled,
                "fragment": f.fragment,
                "verification": f.verification,
                "source": f.source,
                "warning": f.warning,
            }
            for f in fragments
        ],
        "category_prompts": category_prompts,
        "final_prompt": final_prompt,
        "plain_prompt": plain_prompt,
    }

    return CompilationResult(
        final_prompt=final_prompt,
        plain_prompt=plain_prompt,
        category_prompts=category_prompts,
        fragments=fragments,
        trace=trace,
        warnings=warning_list,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_MULTISPACE_RE = re.compile(r"\s+")
_DUPLICATE_SEPARATOR_RE = re.compile(r"\s*,\s*")


def _normalise_punctuation(text: str) -> str:
    """Collapse repeated whitespace and stray commas/spaces."""
    if not text:
        return ""
    text = _MULTISPACE_RE.sub(" ", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text.strip(", ").strip()


def _dedupe_preserving_order(items: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _detect_duplicate_emissions(rows: Sequence[Dict[str, Any]]) -> List[Tuple[str, str]]:
    """Return list of (row_a_id, row_b_id) pairs whose emitted phrases collide."""
    seen: Dict[str, str] = {}
    pairs: List[Tuple[str, str]] = []
    for r in rows:
        if not r.get("enabled", True):
            continue
        phrase = (r.get("phrase") or "").strip().lower()
        if not phrase:
            continue
        if phrase in seen:
            pairs.append((seen[phrase], r.get("id", "")))
        else:
            seen[phrase] = r.get("id", "")
    return pairs


# ---------------------------------------------------------------------------
# Convenience wrappers
# ---------------------------------------------------------------------------


def compile_state_json(state: Dict[str, Any], library: Any) -> Dict[str, Any]:
    """Return the entire compilation result as JSON-serialisable structures."""
    result = compile_state(state, library)
    return result.to_dict()


def trace_json(state: Dict[str, Any], library: Any) -> str:
    """Return a JSON string of the trace portion of the compilation result."""
    result = compile_state(state, library)
    return json.dumps(result.trace, ensure_ascii=False, indent=2)


def warnings_json(state: Dict[str, Any], library: Any) -> str:
    """Return a JSON string of the warnings from the compilation result."""
    result = compile_state(state, library)
    return json.dumps(result.warnings, ensure_ascii=False, indent=2)


def state_json(state: Dict[str, Any]) -> str:
    """Return a JSON string of the (validated) wizard state."""
    validate_state(state)
    return json.dumps(state, ensure_ascii=False, indent=2)
