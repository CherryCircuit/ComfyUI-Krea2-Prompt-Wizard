"""Conflict detection for the wizard.

Conflicts are *informational warnings*, not blockers. The spec requires
that the compiler must not silently remove user choices even when
conflicts are detected. The wizard instead emits a warning and lets the
user resolve the conflict themselves.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .schemas import MODE_BIPOLAR, MODE_RAW, MODE_SCALAR, WEIGHT_HARD_WARNING_THRESHOLD, WEIGHT_MAX_PROMINENT, WEIGHT_WARN_THRESHOLD


# ---------------------------------------------------------------------------
# Conflict specification
# ---------------------------------------------------------------------------


@dataclass
class ConflictRule:
    """A rule that two presets are mutually exclusive or contradictory."""

    rule_id: str
    description: str
    predicates: Tuple[Tuple[str, str], ...]
    severity: str = "warning"

    def matches(self, phrase: str) -> bool:
        s = (phrase or "").lower()
        if not s:
            return False
        for must, must_not in self.predicates:
            if must.lower() in s and must_not.lower() not in s:
                return True
        return False


# ---------------------------------------------------------------------------
# Conflict catalogue
# ---------------------------------------------------------------------------

CONFLICT_RULES: List[ConflictRule] = [
    ConflictRule(
        "shot_size.extreme_close_up_vs_establishing",
        "Extreme close-up conflicts with wide establishing shot.",
        predicates=(("extreme close-up", "wide establishing shot"),),
    ),
    ConflictRule(
        "shot_size.establishing_vs_macro",
        "Wide establishing shot conflicts with macro close-up.",
        predicates=(("macro close-up", "wide establishing shot"),),
    ),
    ConflictRule(
        "depth_of_field.shallow_vs_deep",
        "Shallow depth of field conflicts with deep focus.",
        predicates=(
            ("extremely shallow depth of field", "deep focus"),
            ("shallow depth of field", "deep focus"),
            ("shallow depth of field", "everything in sharp focus"),
        ),
    ),
    ConflictRule(
        "camera_movement.locked_vs_aggressive",
        "Locked-off camera conflicts with aggressive camera movement.",
        predicates=(
            ("locked-off camera", "whip pan"),
            ("locked-off camera", "crash zoom"),
            ("locked-off camera", "rapid forward camera movement"),
        ),
    ),
    ConflictRule(
        "movement.frozen_action_vs_motion_blur",
        "Frozen action conflicts with strong motion blur.",
        predicates=(
            ("frozen action", "strong motion blur"),
            ("frozen action", "controlled motion blur"),
        ),
    ),
    ConflictRule(
        "composition.symmetric_vs_asymmetry",
        "Symmetrical composition conflicts with strong asymmetry.",
        predicates=(
            ("symmetrical composition", "dynamic left-heavy composition"),
            ("symmetrical composition", "dynamic right-heavy composition"),
        ),
    ),
    ConflictRule(
        "lighting.front_vs_back",
        "Front lighting conflicts with extreme backlighting.",
        predicates=(("front lighting", "strong backlighting"),),
    ),
    ConflictRule(
        "lighting.soft_vs_chiaroscuro",
        "Soft flat lighting conflicts with hard chiaroscuro.",
        predicates=(
            ("soft diffused lighting", "chiaroscuro"),
            ("overcast natural lighting", "chiaroscuro"),
        ),
    ),
    ConflictRule(
        "composition.minimal_vs_dense",
        "Minimal background conflicts with dense environmental complexity.",
        predicates=(
            ("uncluttered environment", "dense layered detail"),
            ("strong negative space", "highly detailed environment"),
            ("minimal detail", "intricate detail"),
        ),
    ),
    ConflictRule(
        "perspective.macro_vs_distant",
        "Macro perspective conflicts with distant establishing shot.",
        predicates=(
            ("macro close-up", "distant environmental framing"),
            ("macro close-up", "wide establishing shot"),
        ),
    ),
    ConflictRule(
        "emotion.competing_maximum",
        "Several competing emotions at maximum strength.",
        predicates=(),
    ),
    ConflictRule(
        "lens.multiple_focal_lengths",
        "Multiple camera focal lengths selected.",
        predicates=(),
    ),
    ConflictRule(
        "aperture.contradictory",
        "Multiple contradictory apertures selected.",
        predicates=(),
    ),
]


# ---------------------------------------------------------------------------
# Preset family detection
# ---------------------------------------------------------------------------

LENGTH_FAMILIES = {
    "ultra_wide": ["8mm", "14mm", "18mm"],
    "wide": ["21mm", "24mm", "28mm"],
    "documentary": ["35mm"],
    "natural_wide": ["40mm"],
    "normal": ["50mm", "58mm"],
    "portrait_normal": ["65mm"],
    "portrait": ["75mm", "85mm", "100mm"],
    "macro_portrait": ["105mm macro"],
    "telephoto": ["135mm", "200mm"],
    "long_telephoto": ["300mm", "600mm"],
}


APERTURE_FAMILIES = {
    "wide_open": ["f/1.0", "f/1.2", "f/1.4", "f/1.8"],
    "moderate": ["f/2", "f/2.8"],
    "mid": ["f/4", "f/5.6"],
    "narrow": ["f/8", "f/11", "f/16"],
}


def _family_for(phrase: str, families: Dict[str, Sequence[str]]) -> Optional[str]:
    s = (phrase or "").lower()
    for family, members in families.items():
        for m in members:
            if m.lower() in s:
                return family
    return None


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


def detect_conflicts(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect pairs of rows that conflict with each other.

    Returns a list of warnings. Each warning is a dict of the form::

        {"code": str, "severity": str, "message": str, "row_ids": [str, str]}
    """
    warnings: List[Dict[str, Any]] = []
    enabled_rows = [r for r in rows if r.get("enabled", True)]
    phrases = [(r, (r.get("phrase") or "").lower()) for r in enabled_rows]

    # Pairwise rule check.
    for r1, p1 in phrases:
        for r2, p2 in phrases:
            if r1.get("id") == r2.get("id"):
                continue
            for rule in CONFLICT_RULES:
                if rule.matches(p1) and _phrase_excludes(p2, rule.predicates):
                    warnings.append(
                        {
                            "code": rule.rule_id,
                            "severity": rule.severity,
                            "message": rule.description,
                            "row_ids": [r1.get("id", ""), r2.get("id", "")],
                        }
                    )

    # Multiple focal lengths.
    lens_families = {}
    for r, p in phrases:
        fam = _family_for(p, LENGTH_FAMILIES)
        if fam:
            lens_families.setdefault(fam, []).append(r)
    if len(lens_families) > 1:
        warnings.append(
            {
                "code": "lens.multiple_focal_lengths",
                "severity": "warning",
                "message": "Multiple focal length families selected: "
                + ", ".join(sorted(lens_families.keys())),
                "row_ids": [r.get("id", "") for rs in lens_families.values() for r in rs],
            }
        )

    # Contradictory apertures.
    aperture_families = {}
    for r, p in phrases:
        fam = _family_for(p, APERTURE_FAMILIES)
        if fam:
            aperture_families.setdefault(fam, []).append(r)
    if "wide_open" in aperture_families and "narrow" in aperture_families:
        warnings.append(
            {
                "code": "aperture.contradictory",
                "severity": "warning",
                "message": "Both wide-open and narrow apertures are selected.",
                "row_ids": [
                    r.get("id", "")
                    for rs in (
                        aperture_families.get("wide_open", []),
                        aperture_families.get("narrow", []),
                    )
                    for r in rs
                ],
            }
        )

    return warnings


def _phrase_excludes(phrase: str, predicates: Tuple[Tuple[str, str], ...]) -> bool:
    """Inverse of :meth:`ConflictRule.matches` for a single phrase."""
    s = phrase or ""
    if not s:
        return False
    for must, must_not in predicates:
        if must_not.lower() in s:
            return True
    return False


# ---------------------------------------------------------------------------
# Aggregate weight threshold warnings
# ---------------------------------------------------------------------------


def detect_weight_threshold_warnings(rows: Sequence[Dict[str, Any]], weights_by_id: Dict[str, float]) -> List[Dict[str, Any]]:
    """Detect rows that exceed the documented weight thresholds."""
    warnings: List[Dict[str, Any]] = []
    high = []
    harder = []
    absolute = []
    for r in rows:
        if not r.get("enabled", True):
            continue
        rid = r.get("id", "")
        w = float(weights_by_id.get(rid, 1.0))
        if abs(w) > WEIGHT_MAX_PROMINENT:
            absolute.append((r, w))
        if w > WEIGHT_WARN_THRESHOLD:
            high.append((r, w))
        if w > WEIGHT_HARD_WARNING_THRESHOLD:
            harder.append((r, w))
    if len(high) > 5:
        warnings.append(
            {
                "code": "weights.too_many_high",
                "severity": "warning",
                "message": "More than 5 concepts have weight > 2.0; the result may be unstable.",
                "row_ids": [r.get("id", "") for r, _ in high],
            }
        )
    if len(harder) > 2:
        warnings.append(
            {
                "code": "weights.too_many_hard",
                "severity": "warning",
                "message": "More than 2 concepts have weight > 2.7; the result may be unstable.",
                "row_ids": [r.get("id", "") for r, _ in harder],
            }
        )
    for r, w in absolute:
        warnings.append(
            {
                "code": "weights.absolute_max_exceeded",
                "severity": "warning",
                "message": f"Weight {w:.2f} exceeds the 3.0 prominent ceiling.",
                "row_ids": [r.get("id", "")],
            }
        )
    return warnings


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------


def detect_duplicates(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect rows whose phrase duplicates another enabled row."""
    warnings: List[Dict[str, Any]] = []
    seen: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        if not r.get("enabled", True):
            continue
        phrase = (r.get("phrase") or "").strip().lower()
        if not phrase:
            continue
        seen.setdefault(phrase, []).append(r)
    for phrase, rs in seen.items():
        if len(rs) > 1:
            warnings.append(
                {
                    "code": "rows.duplicate_phrase",
                    "severity": "warning",
                    "message": f"Duplicate phrase '{phrase}' is enabled in {len(rs)} rows.",
                    "row_ids": [r.get("id", "") for r in rs],
                }
            )
    return warnings


# ---------------------------------------------------------------------------
# Aggregated entry point
# ---------------------------------------------------------------------------


def detect_prompt_length_warnings(prompt: str) -> List[Dict[str, Any]]:
    """Warn when the assembled prompt gets excessively long."""
    warnings: List[Dict[str, Any]] = []
    LENGTH_WARN = 5_000
    LENGTH_HARD = 20_000
    if len(prompt) > LENGTH_HARD:
        warnings.append(
            {
                "code": "prompt.excessive_length",
                "severity": "warning",
                "message": f"Final prompt is {len(prompt)} characters long (>20,000).",
                "row_ids": [],
            }
        )
    elif len(prompt) > LENGTH_WARN:
        warnings.append(
            {
                "code": "prompt.long",
                "severity": "info",
                "message": f"Final prompt is {len(prompt)} characters long.",
                "row_ids": [],
            }
        )
    return warnings


def detect_raw_negative_warnings(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Warn whenever any row uses raw negative weights."""
    warnings: List[Dict[str, Any]] = []
    for r in rows:
        if not r.get("enabled", True):
            continue
        if r.get("control_mode") == MODE_RAW:
            try:
                intensity = int(r.get("intensity", 0))
            except (TypeError, ValueError):
                intensity = 0
            if intensity < 0:
                warnings.append(
                    {
                        "code": "raw.negative_used",
                        "severity": "warning",
                        "message": "Raw negative numerical weights are community-reported and may be unstable.",
                        "row_ids": [r.get("id", "")],
                    }
                )
    return warnings


def collect_all_warnings(
    rows: Sequence[Dict[str, Any]],
    *,
    weights_by_id: Optional[Dict[str, float]] = None,
    prompt: str = "",
) -> List[Dict[str, Any]]:
    weights_by_id = weights_by_id or {}
    out: List[Dict[str, Any]] = []
    out.extend(detect_conflicts(rows))
    out.extend(detect_weight_threshold_warnings(rows, weights_by_id))
    out.extend(detect_duplicates(rows))
    out.extend(detect_raw_negative_warnings(rows))
    out.extend(detect_prompt_length_warnings(prompt))
    return out
