"""Weight mapping from a slider value to a `(phrase:weight)` weight.

The spec documents three weighting modes:

1. ``scalar``    — the standard emphasis / de-emphasis curve.
2. ``bipolar``   — explicit opposite phrase with two anchors.
3. ``raw``       — advanced mode that can output negative numerical weights.

The Wizard frontend displays a single slider that always ranges from
``-100`` to ``+100``. The semantics of the slider depend on the chosen
``control_mode`` of the row.
"""
from __future__ import annotations

import math
from typing import Optional, Tuple

from .schemas import (
    BIPOLAR_DEFAULT_RANGE,
    MODE_BIPOLAR,
    MODE_RAW,
    MODE_SCALAR,
    NEG_EXPONENT,
    NEG_GAIN,
    POS_EXPONENT,
    POS_GAIN,
    RAW_WEIGHT_EXPERT_MAX,
    RAW_WEIGHT_EXPERT_MIN,
    RAW_WEIGHT_MAX,
    RAW_WEIGHT_MIN,
    SAFE_WEIGHT_MAX,
    SAFE_WEIGHT_MIN,
    SLIDER_DEFAULT,
    SLIDER_MAX,
    SLIDER_MIN,
    WEIGHT_DECIMALS,
)


def _format_weight(weight: float) -> str:
    """Format a weight to a clean string with at most ``WEIGHT_DECIMALS``
    decimals, stripping trailing zeros and a trailing decimal point.
    """
    rounded = round(float(weight), WEIGHT_DECIMALS)
    if rounded == 0.0:
        return "0"
    return f"{rounded:.{WEIGHT_DECIMALS}f}".rstrip("0").rstrip(".")


def clamp_weight(weight: float, lo: float = SAFE_WEIGHT_MIN, hi: float = SAFE_WEIGHT_MAX) -> float:
    """Clamp a weight value to the supplied range, with a guard for NaN."""
    if weight != weight:  # NaN
        return lo
    if weight < lo:
        return lo
    if weight > hi:
        return hi
    return weight


def slider_to_weight_scalar(slider: int) -> float:
    """Convert a slider value to a weight using the standard scalar curve.

    * 0     -> 1.0 (neutral)
    * +100  -> SAFE_WEIGHT_MAX (default 3.0)
    * -100  -> SAFE_WEIGHT_MIN (default 0.1)
    """
    if slider is None:
        slider = SLIDER_DEFAULT
    if slider == 0:
        return 1.0
    if slider > 0:
        norm = slider / 100.0
        raw = 1.0 + POS_GAIN * (norm ** POS_EXPONENT)
    else:
        norm = abs(slider) / 100.0
        raw = 1.0 - NEG_GAIN * (norm ** NEG_EXPONENT)
    return clamp_weight(raw, SAFE_WEIGHT_MIN, SAFE_WEIGHT_MAX)


def slider_to_weight_raw(slider: int, expert: bool = False) -> float:
    """Convert a slider to a raw weight spanning the negative domain.

    The mapping is a simple linear remap of the slider range to the
    raw weight range. This is the *advanced* mode; it always produces
    a weight, including negative numerics.
    """
    if slider is None:
        slider = SLIDER_DEFAULT
    if expert:
        lo, hi = RAW_WEIGHT_EXPERT_MIN, RAW_WEIGHT_EXPERT_MAX
    else:
        lo, hi = RAW_WEIGHT_MIN, RAW_WEIGHT_MAX
    # Linear interpolation from -100..+100 onto lo..hi.
    raw = lo + (slider - SLIDER_MIN) * (hi - lo) / (SLIDER_MAX - SLIDER_MIN)
    return clamp_weight(raw, lo, hi)


def bipolar_extension(slider: int) -> Tuple[float, float]:
    """Compute an emphasis amplitude for a bipolar row.

    Returns ``(mag, sign)`` where ``mag`` is in [0, 1] range and ``sign`` is
    either -1 or +1. The Wizard frontend uses this to feed the same
    scalar slider curve uniforms downstream.
    """
    if slider is None:
        slider = SLIDER_DEFAULT
    if slider == 0:
        return 0.0, 0.0
    sign = 1.0 if slider > 0 else -1.0
    mag = abs(slider) / 100.0
    return mag, sign


def slider_to_weight_bipolar(slider: int) -> float:
    """Map a bipolar slider to a magnitude using the standard scalar curve.

    The result is the *emphasis magnitude* to apply to whichever phrase
    (positive or negative) is selected by the slider sign.
    """
    mag, _ = bipolar_extension(slider)
    if mag == 0:
        return 1.0
    return 1.0 + POS_GAIN * (mag ** POS_EXPONENT)


def resolve_bipolar_range(row: dict) -> Tuple[float, float]:
    """Return the safe weight range for a bipolar row, defaulting to the
    documented ``BIPOLAR_DEFAULT_RANGE`` if not specified.
    """
    lo = row.get("safe_weight_min", BIPOLAR_DEFAULT_RANGE[0])
    hi = row.get("safe_weight_max", BIPOLAR_DEFAULT_RANGE[1])
    try:
        lo = float(lo)
    except (TypeError, ValueError):
        lo = BIPOLAR_DEFAULT_RANGE[0]
    try:
        hi = float(hi)
    except (TypeError, ValueError):
        hi = BIPOLAR_DEFAULT_RANGE[1]
    if lo >= hi:
        lo, hi = BIPOLAR_DEFAULT_RANGE
    return lo, hi


def format_phrase(phrase: str, weight: float) -> str:
    """Render a weighted phrase using the standard ``(phrase:weight)`` syntax.

    Critically, the spec requires:

    * ``(phrase:1.0)`` *must not* be emitted — emit the plain phrase instead.
    * Trailing zeros must be stripped — emit ``(phrase:2.4)`` not ``(phrase:2.400)``.
    """
    if phrase is None:
        return ""
    text = str(phrase).strip()
    if not text:
        return ""
    if not math.isfinite(weight):
        return text
    if weight == 1.0:
        return text
    return f"({text}:{_format_weight(weight)})"


def is_already_weighted(text: str) -> bool:
    """Return True if the supplied text appears to already contain
    weighting syntax such as ``(phrase:1.5)``.
    """
    if text is None:
        return False
    s = str(text)
    if not s:
        return False
    # Look for a closing parenthesis preceded by a colon-number pair.
    if not s.endswith(")"):
        return False
    depth = 0
    for ch in reversed(s):
        if ch == ")":
            depth += 1
        elif ch == "(":
            depth -= 1
            if depth == 0:
                # The outermost close meets its matching open; check the
                # token immediately before the close for a weight.
                inside = s[s.rfind("(") + 1 : -1]
                if ":" in inside:
                    head, _, tail = inside.rpartition(":")
                    if not tail.strip():
                        return False
                    try:
                        float(tail.strip())
                    except ValueError:
                        return False
                    if not head.strip():
                        return False
                    return True
                return False
    return False


def strip_weighting(text: str) -> str:
    """Remove any weighting syntax from a phrase.

    Used to prevent double-weighting when a user-supplied custom phrase
    already contains ``(phrase:1.5)``.
    """
    if text is None:
        return ""
    s = str(text).strip()
    if not s:
        return ""
    if not s.endswith(")"):
        return s
    depth = 0
    for ch in reversed(s):
        if ch == ")":
            depth += 1
        elif ch == "(":
            depth -= 1
            if depth == 0:
                inside = s[s.rfind("(") + 1 : -1]
                if ":" in inside:
                    head, _, tail = inside.rpartition(":")
                    tail = tail.strip()
                    if tail:
                        try:
                            float(tail)
                        except ValueError:
                            return s
                        return head.strip()
                return s
    return s


def mode_for_row(row: dict) -> str:
    """Return the weighting mode for a row, defaulting to scalar."""
    mode = row.get("control_mode") or MODE_SCALAR
    if mode not in (MODE_SCALAR, MODE_BIPOLAR, MODE_RAW):
        return MODE_SCALAR
    return mode


def weight_for_row(row: dict, expert: bool = False) -> float:
    """Resolve the weight for a row given its mode and intensity."""
    try:
        slider = int(row.get("intensity", SLIDER_DEFAULT))
    except (TypeError, ValueError):
        slider = SLIDER_DEFAULT
    if slider < SLIDER_MIN:
        slider = SLIDER_MIN
    if slider > SLIDER_MAX:
        slider = SLIDER_MAX
    mode = mode_for_row(row)
    if mode == MODE_RAW:
        return slider_to_weight_raw(slider, expert=expert)
    if mode == MODE_BIPOLAR:
        return slider_to_weight_bipolar(slider)
    return slider_to_weight_scalar(slider)


def phrase_for_row(row: dict) -> str:
    """Return the phrase to render for a row, considering bipolar mode."""
    if mode_for_row(row) == MODE_BIPOLAR:
        try:
            slider = int(row.get("intensity", SLIDER_DEFAULT))
        except (TypeError, ValueError):
            slider = SLIDER_DEFAULT
        if slider > 0:
            pos = row.get("positive_phrase") or row.get("phrase")
            return strip_weighting(pos) if pos else ""
        if slider < 0:
            neg = row.get("negative_phrase") or row.get("phrase")
            return strip_weighting(neg) if neg else ""
        neutral = row.get("neutral_phrase")
        return strip_weighting(neutral) if neutral else ""
    return strip_weighting(row.get("phrase") or "")
