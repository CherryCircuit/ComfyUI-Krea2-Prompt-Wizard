"""The Krea2 Prompt Inspector.

The Inspector is a small read-only helper node that accepts a trace or
state JSON and produces a formatted report. The report is rendered as a
plain-text table inside one STRING output and a structured trace JSON
that downstream nodes can consume.

The Inspector is intentionally pure: it does not run the compiler
itself. It only formats data the compiler has already produced.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass
class InspectorReport:
    text: str
    warnings: List[str]
    normalized_trace: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "warnings": list(self.warnings),
            "normalized_trace": dict(self.normalized_trace),
        }


def inspect(
    trace_json: Optional[str] = None,
    state_json: Optional[str] = None,
    final_prompt: Optional[str] = None,
) -> InspectorReport:
    """Build an inspector report from any combination of inputs.

    ``trace_json`` is preferred. ``state_json`` is used when no trace is
    available. ``final_prompt`` is shown at the bottom of the report.
    """
    trace: Dict[str, Any] = {}
    warnings: List[str] = []

    if trace_json:
        try:
            parsed = json.loads(trace_json)
            if isinstance(parsed, dict):
                trace = parsed
            else:
                warnings.append("trace_json must be a JSON object")
        except json.JSONDecodeError as e:
            warnings.append(f"trace_json could not be parsed: {e}")
    elif state_json:
        try:
            parsed = json.loads(state_json)
            if isinstance(parsed, dict):
                trace = {
                    "schema_version": parsed.get("schema_version", 1),
                    "rows": parsed.get("rows", []),
                }
            else:
                warnings.append("state_json must be a JSON object")
        except json.JSONDecodeError as e:
            warnings.append(f"state_json could not be parsed: {e}")

    lines: List[str] = []
    lines.append("Krea2 Prompt Wizard Inspector")
    lines.append("=" * 32)
    if trace.get("schema_version"):
        lines.append(f"Schema version: {trace['schema_version']}")
    rows = trace.get("rows") or []
    if not rows:
        lines.append("(no rows in trace)")
    lines.append("")
    lines.append(_format_table(rows))
    if final_prompt is not None:
        lines.append("")
        lines.append("Final prompt")
        lines.append("-" * 12)
        lines.append(final_prompt.strip())

    return InspectorReport(
        text="\n".join(lines) + "\n",
        warnings=warnings,
        normalized_trace=_normalize_trace(trace),
    )


def _format_table(rows: Sequence[Dict[str, Any]]) -> str:
    headers = [
        ("category", 16),
        ("label", 26),
        ("mode", 9),
        ("slider", 7),
        ("weight", 7),
        ("verification", 22),
        ("fragment", 0),
    ]
    out: List[str] = []
    header_line = "  ".join(_pad(h[0], h[1]) for h in headers)
    out.append(header_line)
    out.append("-" * len(header_line))
    for row in rows:
        if not isinstance(row, dict):
            continue
        slider = row.get("intensity", row.get("slider", 0))
        weight = row.get("weight", 1.0)
        fragment = row.get("fragment", row.get("phrase", ""))
        if row.get("mode") == "raw" and isinstance(weight, (int, float)):
            fragment_disp = f"({row.get('phrase', '')}:{_format_weight(weight)})"
        else:
            fragment_disp = fragment
        row_text = "  ".join(
            [
                _pad(str(row.get("category", "")), 16),
                _pad(str(row.get("label", "")), 26),
                _pad(str(row.get("mode", "scalar")), 9),
                _pad(str(slider), 7),
                _pad(_format_weight(weight), 7),
                _pad(str(row.get("verification", "general visual vocabulary")), 22),
                fragment_disp,
            ]
        )
        out.append(row_text)
    return "\n".join(out)


def _pad(text: str, width: int) -> str:
    if width <= 0:
        return text
    if len(text) >= width:
        return text[: max(0, width - 1)] + "…"
    return text + " " * (width - len(text))


def _format_weight(weight: float) -> str:
    try:
        w = float(weight)
    except (TypeError, ValueError):
        return str(weight)
    rounded = round(w, 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def _normalize_trace(trace: Dict[str, Any]) -> Dict[str, Any]:
    """Return a cleaned-up copy of the trace for downstream consumption."""
    return {
        "schema_version": trace.get("schema_version", 1),
        "rows": [dict(r) for r in trace.get("rows", []) if isinstance(r, dict)],
        "category_prompts": dict(trace.get("category_prompts", {}) or {}),
        "final_prompt": trace.get("final_prompt", ""),
        "plain_prompt": trace.get("plain_prompt", ""),
    }


def report_to_json(report: InspectorReport) -> str:
    return json.dumps(report.to_dict(), ensure_ascii=False, indent=2)


def report_to_text(report: InspectorReport) -> str:
    return report.text
