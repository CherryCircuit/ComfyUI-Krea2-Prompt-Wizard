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
    scope: str = "global"
    character: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "row_id": self.row_id,
            "preset_id": self.preset_id,
            "label": self.label,
            "phrase": self.phrase,
            "weight": self.weight,
            "mode": self.mode,
            "enabled": self.enabled,
            "fragment": self.fragment,
            "verification": self.verification,
            "source": self.source,
            "warning": self.warning,
            "scope": self.scope,
            "character": self.character,
        }


@dataclass
class CompilationResult:
    final_prompt: str
    plain_prompt: str
    category_prompts: Dict[str, str]
    fragments: List[Fragment]
    trace: Dict[str, Any]
    warnings: List[Dict[str, Any]]
    motion_prompt: str = ""
    motion_prompt_draft: str = ""

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
                    "scope": f.scope,
                    "character": f.character,
                }
                for f in self.fragments
            ],
            "trace": dict(self.trace),
            "warnings": list(self.warnings),
            "motion_prompt": self.motion_prompt,
            "motion_prompt_draft": self.motion_prompt_draft,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


_CHARACTER_FIELDS = (
    ("identity", "identity"),
    ("sex", "sex"),
    ("age", "age"),
    ("ethnicity", "ethnicity"),
    ("subject", "subject"),  # legacy field; kept for older workflows
    ("expression", "expression"),  # legacy field; skipped when directed
    ("clothing", "clothing and armour"),  # legacy field; kept for older workflows
    ("ensemble", "costume"),
    ("clothing_top", "top"),
    ("clothing_bottom", "bottom"),
    ("hair_style", "hair style"),
    ("hair_length", "hair length"),
    ("hair_color", "hair colour"),
    ("makeup", "makeup"),
    ("eyes", "eyes"),
    ("eye_color", "eye colour"),
    ("skin_color", "skin colour"),
    ("nose", "nose"),
    ("mouth", "mouth"),
    ("chin", "chin"),
    ("face_shape", "face shape"),
    ("body_type", "body type"),
    ("fitness", "fitness"),
    ("proportions", "proportions"),
    ("additional_info", "additional characteristics"),
    ("adult_description", "adult body description"),
)

# Per-character direction categories, in canonical compile order. These are
# the categories a cast member owns individually so two characters in one
# scene never share the same emotion, expression, or body language.
_CHARACTER_DIRECTION_CATEGORIES = (
    "body",
    "emotion",
    "emotion_trigger",
    "face",
    "face_trigger",
    "gaze",
    "mouth",
    "position",
)

# Emotion keywords -> motion verb for the LTX video-motion draft. The
# first matching keyword (substring, lowercased) wins.
_MOTION_VERBS: Tuple[Tuple[Tuple[str, ...], str], ...] = (
    (("joy", "happi", "elat", "glee", "delight", "radian", "amuse", "entertain", "content"), "beams with joy"),
    (("excit", "thrill", "energ", "enthusias", "eager", "pump"), "moves energetically"),
    (("seren", "calm", "tranqu", "peace", "relief", "relax"), "stays calm"),
    (("affection", "love", "tender", "warmth", "romantic", "soft-hearted"), "behaves warmly"),
    (("pride", "proud", "accomplish", "dignif"), "holds their head high"),
    (("hope", "hopeful", "optimis", "brighten"), "brightens with hope"),
    (("wonder", "awe", "amaz", "awestruck", "breathless"), "gazes in awe"),
    (("surpris", "shock", "startl", "astonish", "caught off guard"), "reacts in surprise"),
    (("confus", "puzzl", "baffl"), "hesitates in confusion"),
    (("curious", "interest", "intrigu", "fascin", "inquisit"), "leans in curiously"),
    (("skeptic", "doubt", "wary", "suspic", "distrust", "tentative", "unsure"), "eyes warily"),
    (("anxi", "nerv", "on edge", "skittish", "worr"), "fidgets nervously"),
    (("fear", "afraid", "scared", "terrif", "terror", "horr", "dread", "panic", "hysteric"), "flinches in fear"),
    (("sad", "melanchol", "grief", "mourn", "despair", "hopeless", "lonel", "isolat", "sorrow", "pensiv", "wistful"), "looks sad"),
    (("disappoint", "let down", "sigh"), "slumps in disappointment"),
    (("embarrass", "flustered", "awkward", "shy", "shame", "humiliat", "guilt", "remorse"), "looks embarrassed"),
    (("anger", "mad", "irritat", "annoy", "frustrat", "exasper", "fury", "furious", "enrag", "rage", "raging", "incandesc"), "glowers in anger"),
    (("defian", "rebell", "stubborn"), "stands defiant"),
    (("determin", "resolute", "resolve", "assert"), "stands resolute"),
    (("disgust", "repuls", "contempt", "scorn", "sneer", "disdain"), "sneers with contempt"),
    (("bored", "apathetic", "numb", "hollow"), "looks bored"),
    (("fatigue", "exhaust", "weary", "tired", "drained"), "slumps tiredly"),
)


def _character_has_direction(character: Dict[str, Any]) -> bool:
    """A character is "directed" when they own emotion/body guidance."""
    rows = character.get("rows") or []
    if any(isinstance(r, dict) for r in rows):
        return True
    if str(character.get("face_guidance") or "").strip():
        return True
    if str(character.get("interaction") or "").strip():
        return True
    return False


def _face_guidance_lines(guidance: Any) -> List[str]:
    """Split the per-character face guidance text into verbatim lines."""
    text = str(guidance or "").strip()
    if not text:
        return []
    out: List[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line:
            out.append(line)
    return out


_LORA_EXTENSIONS = (".safetensors", ".ckpt", ".pt", ".bin")


def _lora_token_name(filename: Any) -> str:
    """The LoRA identifier used inside <lora:...> tokens: the file name
    without its extension (A1111 convention)."""
    name = str(filename or "").strip()
    for extension in _LORA_EXTENSIONS:
        if name.lower().endswith(extension):
            return name[: -len(extension)]
    return name


def _format_lora_strength(strength: float) -> str:
    """Compact decimal (0.85 -> "0.85", 1.0 -> "1", -0.5 -> "-0.5")."""
    if strength == int(strength):
        return str(int(strength))
    return f"{strength:.2f}".rstrip("0").rstrip(".")


def _lora_tokens(character: Dict[str, Any]) -> List[str]:
    """Per-character LoRA application tokens, one per assigned LoRA.

    ``<lora:filename:strength>`` follows the A1111/Forge textual convention
    that many image backends (including Krea2 wrappers) parse at inference
    time. The per-character list drives emission; legacy single-LoRA state
    (``lora_name`` / ``lora_strength``) is emitted when no list exists.
    """
    tokens: List[str] = []
    loras = character.get("loras")
    if isinstance(loras, list):
        for lora in loras:
            if not isinstance(lora, dict):
                continue
            filename = str(lora.get("filename") or "").strip()
            if not filename:
                continue
            try:
                strength = float(lora.get("strength", 0.8))
            except (TypeError, ValueError):
                strength = 0.8
            tokens.append(
                f"<lora:{_lora_token_name(filename)}:{_format_lora_strength(strength)}>"
            )
    if not tokens:
        name = str(character.get("lora_name") or "").strip()
        if name:
            try:
                strength = float(character.get("lora_strength", 0.8))
            except (TypeError, ValueError):
                strength = 0.8
            tokens.append(f"<lora:{_lora_token_name(name)}:{_format_lora_strength(strength)}>")
    return tokens


def _compile_row_fragment(
    row: Dict[str, Any],
    preset_index: Dict[str, Dict[str, Any]],
    *,
    expert: bool,
) -> Optional[Fragment]:
    """Compile one wizard row into a Fragment, or None when it emits nothing.

    Shared by the global concept rows and the per-character direction rows.
    """
    if not isinstance(row, dict):
        return None
    rid = row.get("id", "")
    cat = row.get("category", "custom")
    mode = mode_for_row(row)
    enabled = bool(row.get("enabled", True))
    raw_phrase = (row.get("phrase") or "").strip()
    preset = preset_index.get(row.get("preset_id", ""), {})
    verification = preset.get("verification", "general visual vocabulary")
    source = preset.get("source", "library")
    label = row.get("label", "") or preset.get("label", "")

    if not raw_phrase:
        return Fragment(
            category=cat,
            row_id=rid,
            preset_id=row.get("preset_id", ""),
            label=label,
            phrase="",
            weight=1.0,
            mode=mode,
            enabled=enabled,
            fragment="",
            verification=verification,
            source=source,
        )
    if row.get("verbatim"):
        # Verbatim rows (e.g. pasted parenthetical triggers) are emitted
        # exactly as typed: no stripping, no re-weighting.
        fragment = raw_phrase
        return Fragment(
            category=cat,
            row_id=rid,
            preset_id=row.get("preset_id", ""),
            label=label,
            phrase=raw_phrase,
            weight=1.0,
            mode=mode,
            enabled=enabled,
            fragment=fragment,
            verification=verification,
            source=source,
        )

    try:
        intensity = float(row.get("strength", row.get("intensity", SLIDER_DEFAULT)))
    except (TypeError, ValueError):
        intensity = SLIDER_DEFAULT
    phrase = phrase_for_row(row)
    phrase = strip_weighting(phrase)
    weight = weight_for_row(row, expert=expert)
    if not enabled or not phrase:
        fragment = strip_weighting(phrase)
        return Fragment(
            category=cat,
            row_id=rid,
            preset_id=row.get("preset_id", ""),
            label=label,
            phrase=phrase,
            weight=weight,
            mode=mode,
            enabled=enabled,
            fragment=fragment,
            verification=verification,
            source=source,
        )
    if mode == MODE_BIPOLAR and intensity == 0:
        fragment = strip_weighting(phrase)
        return Fragment(
            category=cat,
            row_id=rid,
            preset_id=row.get("preset_id", ""),
            label=label,
            phrase=phrase,
            weight=weight,
            mode=mode,
            enabled=enabled,
            fragment=fragment,
            verification=verification,
            source=source,
        )

    emitted_phrase = format_phrase(phrase, weight)
    row_warning = None
    if mode == MODE_RAW and weight < 0:
        row_warning = "Raw negative numerical weights are community-reported for Krea 2."
    elif mode == MODE_RAW and abs(weight) > 3.0:
        row_warning = "Raw weight exceeds the documented 3.0 ceiling."
    elif abs(weight) > WEIGHT_MAX_PROMINENT:
        row_warning = "Weight exceeds the safe 3.0 ceiling."
    return Fragment(
        category=cat,
        row_id=rid,
        preset_id=row.get("preset_id", ""),
        label=label,
        phrase=phrase,
        weight=weight,
        mode=mode,
        enabled=enabled,
        fragment=emitted_phrase,
        verification=verification,
        source=source,
        warning=row_warning,
    )


def _motion_verb_for_row(row: Dict[str, Any]) -> str:
    """Pick a motion verb from an emotion row's label, phrase, or aliases."""
    haystack = " ".join(
        [
            str(row.get("label") or ""),
            str(row.get("phrase") or ""),
            " ".join(str(a) for a in (row.get("aliases") or [])),
        ]
    ).lower()
    for keywords, verb in _MOTION_VERBS:
        if any(keyword in haystack for keyword in keywords):
            return verb
    return "reacts"


def _motion_line(
    character: Dict[str, Any],
    name: str,
    position: str,
    rows: Sequence[Dict[str, Any]],
) -> Optional[str]:
    """Draft one character's motion line for a video model (LTX 2.3)."""
    enabled_rows = [r for r in rows if isinstance(r, dict) and r.get("enabled", True)]
    emotion_rows = [r for r in enabled_rows if r.get("category") == "emotion"]
    body_rows = [r for r in enabled_rows if r.get("category") == "body"]
    interaction = str(character.get("interaction") or "").strip()

    strongest = None
    if emotion_rows:
        try:
            strongest = max(emotion_rows, key=lambda r: abs(float(weight_for_row(r))))
        except (TypeError, ValueError):
            strongest = emotion_rows[0]
    verb = _motion_verb_for_row(strongest) if strongest else "stands"

    head = name
    if position:
        head = f"{name} ({position})"
    bits = [f"{head} {verb}"]
    if body_rows:
        phrase = strip_weighting(str(body_rows[0].get("phrase") or "")).strip()
        if phrase:
            bits.append(phrase)
    if interaction:
        bits.append(interaction)
    return ", ".join(bits).strip() or None


def _compile_character(
    character: Dict[str, Any],
    index: int,
    preset_index: Dict[str, Dict[str, Any]],
    *,
    expert: bool,
) -> Optional[Tuple[str, str, List[Fragment], Optional[str]]]:
    """Compile one cast member into ``(clause, plain_clause, fragments, motion)``.

    Returns ``None`` for disabled or malformed characters. The clause is the
    human-readable block emitted into the final prompt; ``motion`` is the
    draft video-motion line (or ``None``).
    """
    if not isinstance(character, dict) or character.get("enabled", True) is False:
        return None
    name = str(character.get("name") or f"Character {index + 1}").strip()
    if not name:
        name = f"Character {index + 1}"
    position = str(character.get("position") or "").strip()
    rows = [r for r in (character.get("rows") or []) if isinstance(r, dict)]
    guidance = _face_guidance_lines(character.get("face_guidance"))
    interaction = str(character.get("interaction") or "").strip()
    directed = _character_has_direction(character)

    category_order = {cat: i for i, cat in enumerate(CATEGORIES)}
    rows.sort(key=lambda r: (category_order.get(str(r.get("category")), 99), 0))

    fragments: List[Fragment] = []
    for row in rows:
        fragment = _compile_row_fragment(row, preset_index, expert=expert)
        if fragment is None:
            continue
        fragment.scope = "character"
        fragment.character = name
        fragments.append(fragment)

    emitted = []
    for fragment in fragments:
        if fragment.enabled and fragment.fragment:
            if fragment.mode == MODE_BIPOLAR and fragment.phrase == "":
                continue
            emitted.append(fragment.fragment)
    # Characters own their emotion/mouth fragments; dedupe within the member.
    emitted = _dedupe_preserving_order(emitted)
    plain_emitted = []
    for fragment in fragments:
        if fragment.enabled and fragment.phrase:
            plain_emitted.append(strip_weighting(fragment.phrase))
    plain_emitted = _dedupe_preserving_order(plain_emitted)

    emitted.extend(guidance)
    plain_emitted.extend(guidance)
    lora_lines = _face_guidance_lines(character.get("lora_triggers"))
    emitted.extend(lora_lines)
    plain_emitted.extend(lora_lines)
    # A1111-style LoRA tokens, one per assigned LoRA: <lora:filename:strength>.
    # These are the textual application of a LoRA to a character; the model-
    # side application happens in the node (Model input -> Model output).
    for token in _lora_tokens(character):
        emitted.append(token)
    if interaction:
        emitted.append(interaction)
        plain_emitted.append(interaction)

    # Ensemble and separates are mutually exclusive looks. The UI enforces
    # this too; the compiler resolves any residue deterministically. The
    # legacy clothing field only compiles when no new-style look is set.
    ensemble = str(character.get("ensemble") or "").strip()
    top = str(character.get("clothing_top") or "").strip()
    bottom = str(character.get("clothing_bottom") or "").strip()
    use_ensemble = bool(ensemble)
    use_separates = bool(top or bottom)

    fields: List[str] = []
    for key, label in _CHARACTER_FIELDS:
        if directed and key == "expression":
            # A directed character's emotion is owned by its direction rows.
            continue
        if key == "ensemble" and not use_ensemble:
            continue
        if key in ("clothing_top", "clothing_bottom") and use_ensemble:
            continue
        if key == "clothing" and (use_ensemble or use_separates):
            continue
        value = str(character.get(key) or "").strip()
        if value:
            fields.append(f"{label}: {value}")

    head = f"{name} ({position})" if position else name
    if fields and emitted:
        clause = f"Character {head}: {'; '.join(fields)}, {', '.join(emitted)}"
        plain = f"Character {head}: {'; '.join(fields)}, {', '.join(plain_emitted)}"
    elif fields:
        clause = f"Character {head}: {'; '.join(fields)}"
        plain = clause
    elif emitted:
        clause = f"Character {head}, {', '.join(emitted)}"
        plain = f"Character {head}, {', '.join(plain_emitted)}"
    else:
        clause = f"Character {head}"
        plain = clause

    motion = None
    if any(f.enabled and f.fragment for f in fragments) or interaction:
        motion = _motion_line(character, name, position, rows)
    return clause, plain, fragments, motion


def _setting_part(state: Dict[str, Any]) -> str:
    setting = state.get("setting")
    if isinstance(setting, dict) and setting.get("enabled", False):
        name = str(setting.get("name") or "Scene").strip()
        description = str(setting.get("description") or "").strip()
        if description:
            return f"Setting {name}: {description}"
        if name:
            return f"Setting: {name}"
    return ""


def _compile_characters(
    state: Dict[str, Any],
    preset_index: Dict[str, Dict[str, Any]],
    *,
    expert: bool,
) -> Tuple[List[str], List[str], List[Fragment], List[Optional[str]], List[Dict[str, Any]]]:
    """Compile the cast list.

    Returns ``(clauses, plain_clauses, fragments, motion_lines, trace_entries)``.
    """
    clauses: List[str] = []
    plain_clauses: List[str] = []
    fragments: List[Fragment] = []
    motion_lines: List[Optional[str]] = []
    trace_entries: List[Dict[str, Any]] = []
    for index, character in enumerate(state.get("characters") or []):
        compiled = _compile_character(character, index, preset_index, expert=expert)
        if compiled is None:
            continue
        clause, plain, char_fragments, motion = compiled
        clauses.append(clause)
        plain_clauses.append(plain)
        fragments.extend(char_fragments)
        motion_lines.append(motion)
        trace_entries.append(
            {
                "name": str(character.get("name") or f"Character {index + 1}"),
                "position": str(character.get("position") or ""),
                "rows": [f.to_dict() for f in char_fragments],
                "face_guidance": str(character.get("face_guidance") or ""),
                "lora_triggers": str(character.get("lora_triggers") or ""),
                "interaction": str(character.get("interaction") or ""),
                "motion": motion or "",
            }
        )
    return clauses, plain_clauses, fragments, motion_lines, trace_entries


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

    preset_index = {}
    if library is not None and hasattr(library, "index_by_id"):
        try:
            preset_index = library.index_by_id()
        except Exception:
            preset_index = {}

    # Cast members compile first: each character owns their emotion, face,
    # body, gaze, mouth, and position guidance.
    character_clauses, character_plain, character_fragments, motion_lines, cast_trace = (
        _compile_characters(state, preset_index, expert=expert)
    )
    setting_part = _setting_part(state)

    rows = list(state.get("rows") or [])
    cleaned_rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        phrase = (row.get("phrase") or "").strip()
        if not phrase:
            continue
        cleaned_rows.append(row)

    fragments: List[Fragment] = []
    weights_by_id: Dict[str, float] = {}
    enabled_rows: List[Dict[str, Any]] = []

    for row in cleaned_rows:
        rid = row.get("id", "")
        cat = row.get("category", "custom")
        fragment = _compile_row_fragment(row, preset_index, expert=expert)
        if fragment is None:
            continue
        fragment.scope = "global"
        weights_by_id[rid] = fragment.weight
        fragments.append(fragment)
        if fragment.enabled and fragment.fragment and fragment.phrase:
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
    body_parts.extend(character_clauses)
    if setting_part:
        body_parts.append(setting_part)

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
    plain_parts.extend(character_plain)
    if setting_part:
        plain_parts.append(setting_part)
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

    # Video motion prompt: an explicit user override wins; otherwise the
    # cast draft is emitted only when the motion output is enabled.
    motion_draft = "\n".join([m for m in motion_lines if m]).strip()
    motion_override = str(state.get("motion_prompt") or "").strip()
    if motion_override:
        motion_prompt = motion_override
    elif state.get("motion_prompt_enabled"):
        motion_prompt = motion_draft
    else:
        motion_prompt = ""

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
                "scope": f.scope,
                "character": f.character,
            }
            for f in fragments
        ],
        "category_prompts": category_prompts,
        "cast": cast_trace,
        "final_prompt": final_prompt,
        "plain_prompt": plain_prompt,
        "motion_prompt": motion_prompt,
        "motion_prompt_draft": motion_draft,
    }

    return CompilationResult(
        final_prompt=final_prompt,
        plain_prompt=plain_prompt,
        category_prompts=category_prompts,
        fragments=fragments,
        trace=trace,
        warnings=warning_list,
        motion_prompt=motion_prompt,
        motion_prompt_draft=motion_draft,
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
