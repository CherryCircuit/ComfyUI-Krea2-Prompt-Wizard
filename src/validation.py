"""Pure validation routines for the wizard state and preset structure.

The validator never raises — it always returns a list of structured
``ValidationIssue`` records. Other modules (compiler, assembler, frontend
``/wizard`` round-trip) collect these issues and surface them as
warnings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

from .schemas import (
    ALLOWED_MODES,
    ALLOWED_PROFILES,
    ALLOWED_VERIFICATIONS,
    CATEGORIES,
    MODE_BIPOLAR,
    MODE_RAW,
    MODE_SCALAR,
    PRESET_KEYS_OPTIONAL,
    PRESET_KEYS_REQUIRED,
    ROW_KEYS_OPTIONAL,
    ROW_KEYS_REQUIRED,
    SAFE_WEIGHT_MAX,
    SAFE_WEIGHT_MIN,
    SCHEMA_VERSION,
    SLIDER_DEFAULT,
    SLIDER_MAX,
    SLIDER_MIN,
    SchemaError,
)


@dataclass
class ValidationIssue:
    """A single validation problem found in a preset or wizard state."""

    code: str
    message: str
    severity: str = "warning"  # one of "info", "warning", "error"
    path: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity,
            "path": self.path,
        }


@dataclass
class ValidationResult:
    issues: List[ValidationIssue] = field(default_factory=list)

    def extend(self, issues: Iterable[ValidationIssue]) -> None:
        for i in issues:
            self.issues.append(i)

    def add(self, code: str, message: str, severity: str = "warning", path: str = "") -> None:
        self.issues.append(
            ValidationIssue(code=code, message=message, severity=severity, path=path)
        )

    @property
    def errors(self) -> List[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> List[ValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def info(self) -> List[ValidationIssue]:
        return [i for i in self.issues if i.severity == "info"]

    @property
    def has_errors(self) -> bool:
        return any(i.severity == "error" for i in self.issues)

    def to_dict_list(self) -> List[Dict[str, Any]]:
        return [i.to_dict() for i in self.issues]


def _coerce_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value)


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: float = 1.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("true", "yes", "1", "on"):
        return True
    if text in ("false", "no", "0", "off"):
        return False
    return default


def _is_valid_preset_id(pid: str) -> bool:
    """Return True if the supplied id consists of alphanumeric characters,
    underscores, hyphens, and dots, with at least one character.
    """
    if not pid:
        return False
    for ch in pid:
        if not (ch.isalnum() or ch in "._-"):
            return False
    return True


# ---------------------------------------------------------------------------
# Preset validation
# ---------------------------------------------------------------------------


def validate_preset(preset: Any, *, path: str = "preset") -> ValidationResult:
    """Validate a preset dictionary. Returns a ``ValidationResult``."""
    result = ValidationResult()
    if not isinstance(preset, dict):
        result.add("preset.not_object", "Preset must be a JSON object", severity="error", path=path)
        return result

    for key in PRESET_KEYS_REQUIRED:
        if key not in preset:
            result.add(
                "preset.missing_required_field",
                f"Preset is missing required field '{key}'",
                severity="error",
                path=f"{path}.{key}",
            )

    pid = _coerce_str(preset.get("id", ""))
    if pid and not _is_valid_preset_id(pid):
        result.add(
            "preset.invalid_id",
            f"Preset id `{pid}` must be alphanumeric, '.', '_' or '-' only",
            severity="error",
            path=f"{path}.id",
        )

    category = _coerce_str(preset.get("category", ""))
    if category and category not in CATEGORIES:
        result.add(
            "preset.unknown_category",
            f"Preset category '{category}' is not one of the documented categories",
            severity="error",
            path=f"{path}.category",
        )

    label = _coerce_str(preset.get("label", ""))
    if not label:
        result.add("preset.empty_label", "Preset label is empty", severity="error", path=f"{path}.label")

    phrase = _coerce_str(preset.get("phrase", ""))
    if not phrase:
        result.add("preset.empty_phrase", "Preset phrase is empty", severity="error", path=f"{path}.phrase")
    if phrase.count("(") != phrase.count(")"):
        result.add(
            "preset.unbalanced_parentheses",
            "Preset phrase has unbalanced parentheses",
            severity="warning",
            path=f"{path}.phrase",
        )

    if "verbatim" in preset and not isinstance(preset["verbatim"], bool):
        result.add(
            "preset.invalid_verbatim",
            "Preset 'verbatim' must be a boolean",
            severity="error",
            path=f"{path}.verbatim",
        )

    default_strength = _coerce_int(preset.get("default_strength", SLIDER_DEFAULT), SLIDER_DEFAULT)
    if default_strength < SLIDER_MIN or default_strength > SLIDER_MAX:
        result.add(
            "preset.default_strength_out_of_range",
            f"Preset default_strength {default_strength} is outside the slider range",
            severity="error",
            path=f"{path}.default_strength",
        )

    mode = _coerce_str(preset.get("control_mode", MODE_SCALAR), MODE_SCALAR)
    if mode not in ALLOWED_MODES:
        result.add(
            "preset.invalid_mode",
            f"Preset control_mode '{mode}' is not one of scalar/bipolar/raw",
            severity="error",
            path=f"{path}.control_mode",
        )

    if mode == MODE_BIPOLAR:
        if not _coerce_str(preset.get("phrase", "")):
            # For bipolar, the "phrase" field is used as a fallback label but
            # the actual phrases live in negative_phrase / positive_phrase.
            pass
        if not _coerce_str(preset.get("negative_phrase", "")):
            result.add(
                "preset.bipolar_missing_negative",
                "Bipolar preset is missing negative_phrase",
                severity="error",
                path=f"{path}.negative_phrase",
            )
        if not _coerce_str(preset.get("positive_phrase", "")):
            result.add(
                "preset.bipolar_missing_positive",
                "Bipolar preset is missing positive_phrase",
                severity="error",
                path=f"{path}.positive_phrase",
            )

    verification = _coerce_str(preset.get("verification", "general visual vocabulary"))
    if verification not in ALLOWED_VERIFICATIONS:
        result.add(
            "preset.invalid_verification",
            f"Preset verification '{verification}' is not a known status",
            severity="warning",
            path=f"{path}.verification",
        )

    safe_min = preset.get("safe_weight_min", SAFE_WEIGHT_MIN)
    safe_max = preset.get("safe_weight_max", SAFE_WEIGHT_MAX)
    if safe_min is not None and safe_max is not None:
        try:
            if float(safe_min) >= float(safe_max):
                result.add(
                    "preset.invalid_weight_range",
                    "Preset safe_weight_min must be less than safe_weight_max",
                    severity="error",
                    path=f"{path}.safe_weight_min",
                )
        except (TypeError, ValueError):
            result.add(
                "preset.invalid_weight_range_type",
                "Preset safe_weight_min/max must be numeric",
                severity="error",
                path=f"{path}.safe_weight_min",
            )

    profiles = preset.get("compatible_profiles", [])
    if profiles is not None:
        if not isinstance(profiles, (list, tuple)):
            result.add(
                "preset.incompatible_profiles_type",
                "compatible_profiles must be a list",
                severity="error",
                path=f"{path}.compatible_profiles",
            )
        else:
            for p in profiles:
                if p not in ALLOWED_PROFILES:
                    result.add(
                        "preset.unknown_profile",
                        f"compatible_profiles contains unknown profile '{p}'",
                        severity="warning",
                        path=f"{path}.compatible_profiles",
                    )

    schema_version = preset.get("schema_version", SCHEMA_VERSION)
    if schema_version is not None:
        try:
            if int(schema_version) > SCHEMA_VERSION:
                result.add(
                    "preset.future_schema_version",
                    f"Preset schema_version {schema_version} is newer than supported ({SCHEMA_VERSION})",
                    severity="warning",
                    path=f"{path}.schema_version",
                )
        except (TypeError, ValueError):
            result.add(
                "preset.invalid_schema_version",
                "Preset schema_version must be an integer",
                severity="warning",
                path=f"{path}.schema_version",
            )

    for key in PRESET_KEYS_OPTIONAL:
        if key in preset and key not in PRESET_KEYS_REQUIRED:
            # Reserved for future discrimination; not validated exhaustively.
            continue

    return result


def validate_presets(presets: Any) -> ValidationResult:
    """Validate a list of preset dictionaries."""
    result = ValidationResult()
    if not isinstance(presets, list):
        result.add("presets.not_list", "Library must be a JSON list", severity="error")
        return result
    seen_ids: Set[str] = set()
    for idx, preset in enumerate(presets):
        sub = validate_preset(preset, path=f"presets[{idx}]")
        result.extend(sub.issues)
        pid = preset.get("id") if isinstance(preset, dict) else None
        if pid:
            if pid in seen_ids:
                result.add(
                    "presets.duplicate_id",
                    f"Duplicate preset id '{pid}'",
                    severity="error",
                    path=f"presets[{idx}].id",
                )
            seen_ids.add(pid)
    return result


# ---------------------------------------------------------------------------
# Row validation
# ---------------------------------------------------------------------------


def validate_row(row: Any, *, path: str = "row") -> ValidationResult:
    """Validate a single wizard row."""
    result = ValidationResult()
    if not isinstance(row, dict):
        result.add("row.not_object", "Row must be a JSON object", severity="error", path=path)
        return result

    for key in ROW_KEYS_REQUIRED:
        if key not in row:
            result.add(
                "row.missing_required_field",
                f"Row is missing required field '{key}'",
                severity="error",
                path=f"{path}.{key}",
            )

    category = _coerce_str(row.get("category", ""))
    if category and category not in CATEGORIES:
        result.add(
            "row.unknown_category",
            f"Row category '{category}' is not one of the documented categories",
            severity="error",
            path=f"{path}.category",
        )

    preset_id = _coerce_str(row.get("preset_id", ""))
    if not preset_id:
        result.add(
            "row.missing_preset_id",
            "Row is missing preset_id",
            severity="error",
            path=f"{path}.preset_id",
        )

    phrase = _coerce_str(row.get("phrase", ""))
    if not phrase:
        result.add(
            "row.empty_phrase",
            "Row is missing phrase",
            severity="error",
            path=f"{path}.phrase",
        )

    if phrase.count("(") != phrase.count(")"):
        result.add(
            "row.unbalanced_parentheses",
            "Row phrase has unbalanced parentheses",
            severity="warning",
            path=f"{path}.phrase",
        )

    intensity = _coerce_int(row.get("intensity", SLIDER_DEFAULT), SLIDER_DEFAULT)
    if intensity < SLIDER_MIN or intensity > SLIDER_MAX:
        result.add(
            "row.intensity_out_of_range",
            f"Row intensity {intensity} is outside the slider range",
            severity="error",
            path=f"{path}.intensity",
        )

    if "strength" in row:
        try:
            strength = float(row["strength"])
            if strength < -3 or strength > 3:
                raise ValueError
        except (TypeError, ValueError):
            result.add(
                "row.strength_out_of_range",
                "Concept strength must be a number from -3 to +3",
                severity="error",
                path=f"{path}.strength",
            )

    if "verbatim" in row and not isinstance(row["verbatim"], bool):
        result.add(
            "row.invalid_verbatim",
            "Row 'verbatim' must be a boolean",
            severity="error",
            path=f"{path}.verbatim",
        )

    mode = _coerce_str(row.get("control_mode", MODE_SCALAR), MODE_SCALAR)
    if mode not in ALLOWED_MODES:
        result.add(
            "row.invalid_mode",
            f"Row control_mode '{mode}' is not one of scalar/bipolar/raw",
            severity="error",
            path=f"{path}.control_mode",
        )

    if mode == MODE_BIPOLAR:
        if not _coerce_str(row.get("positive_phrase", "")):
            result.add(
                "row.bipolar_missing_positive",
                "Bipolar row is missing positive_phrase",
                severity="error",
                path=f"{path}.positive_phrase",
            )
        if not _coerce_str(row.get("negative_phrase", "")):
            result.add(
                "row.bipolar_missing_negative",
                "Bipolar row is missing negative_phrase",
                severity="error",
                path=f"{path}.negative_phrase",
            )

    enabled = _coerce_bool(row.get("enabled", True), True)
    if not isinstance(enabled, bool):
        result.add(
            "row.invalid_enabled",
            "Row 'enabled' must be a boolean",
            severity="error",
            path=f"{path}.enabled",
        )

    safe_min = row.get("safe_weight_min")
    safe_max = row.get("safe_weight_max")
    if safe_min is not None and safe_max is not None:
        try:
            if float(safe_min) >= float(safe_max):
                result.add(
                    "row.invalid_weight_range",
                    "Row safe_weight_min must be less than safe_weight_max",
                    severity="error",
                    path=f"{path}.safe_weight_min",
                )
        except (TypeError, ValueError):
            result.add(
                "row.invalid_weight_range_type",
                "Row safe_weight_min/max must be numeric",
                severity="error",
                path=f"{path}.safe_weight_min",
            )

    return result


def validate_rows(rows: Any) -> ValidationResult:
    """Validate a list of wizard rows."""
    result = ValidationResult()
    if not isinstance(rows, list):
        result.add("rows.not_list", "Wizard rows must be a JSON list", severity="error")
        return result
    seen_ids: Set[str] = set()
    for idx, row in enumerate(rows):
        sub = validate_row(row, path=f"rows[{idx}]")
        result.extend(sub.issues)
        rid = row.get("id") if isinstance(row, dict) else None
        if rid:
            if rid in seen_ids:
                result.add(
                    "rows.duplicate_id",
                    f"Duplicate row id '{rid}'",
                    severity="error",
                    path=f"rows[{idx}].id",
                )
            seen_ids.add(rid)
    return result


# ---------------------------------------------------------------------------
# Wizard state validation
# ---------------------------------------------------------------------------


def validate_state(state: Any) -> ValidationResult:
    """Validate a wizard state dictionary."""
    result = ValidationResult()
    if not isinstance(state, dict):
        result.add("state.not_object", "Wizard state must be a JSON object", severity="error")
        return result

    schema_version = _coerce_int(state.get("schema_version", SCHEMA_VERSION), SCHEMA_VERSION)
    if schema_version > SCHEMA_VERSION:
        result.add(
            "state.future_schema_version",
            f"State schema_version {schema_version} is newer than supported ({SCHEMA_VERSION})",
            severity="warning",
            path="state.schema_version",
        )

    base = _coerce_str(state.get("base_prompt", ""))
    if base.count("(") != base.count(")"):
        result.add(
            "state.unbalanced_parentheses",
            "Base prompt has unbalanced parentheses",
            severity="warning",
            path="state.base_prompt",
        )

    profile = _coerce_str(state.get("model_profile", "generic"))
    if profile not in ALLOWED_PROFILES:
        result.add(
            "state.unknown_profile",
            f"Unknown model profile '{profile}'",
            severity="error",
            path="state.model_profile",
        )

    mode = _coerce_str(state.get("interface_mode", "simple"))
    if mode not in ("simple", "advanced"):
        result.add(
            "state.invalid_interface_mode",
            f"Invalid interface_mode '{mode}'",
            severity="warning",
            path="state.interface_mode",
        )

    result.extend(validate_rows(state.get("rows", [])).issues)

    characters = state.get("characters", [])
    if not isinstance(characters, list):
        result.add(
            "state.invalid_characters",
            "Wizard 'characters' must be a JSON list",
            severity="error",
            path="state.characters",
        )
    else:
        for idx, character in enumerate(characters):
            cpath = f"state.characters[{idx}]"
            if not isinstance(character, dict):
                result.add(
                    "state.invalid_character",
                    "Character must be a JSON object",
                    severity="warning",
                    path=cpath,
                )
                continue
            name = _coerce_str(character.get("name", ""))
            if not name:
                result.add(
                    "state.character_missing_name",
                    "Character is missing a name",
                    severity="warning",
                    path=f"{cpath}.name",
                )
            if "rows" in character:
                result.extend(validate_rows(character["rows"]).issues)
            position = _coerce_str(character.get("position", ""))
            if position.count("(") != position.count(")"):
                result.add(
                    "state.character_position_unbalanced",
                    "Character position has unbalanced parentheses",
                    severity="warning",
                    path=f"{cpath}.position",
                )
            guidance = _coerce_str(character.get("face_guidance", ""))
            if guidance.count("(") != guidance.count(")"):
                result.add(
                    "state.character_guidance_unbalanced",
                    "Character face guidance has unbalanced parentheses",
                    severity="warning",
                    path=f"{cpath}.face_guidance",
                )

    master_preset_id = _coerce_str(state.get("master_preset_id", "") or "")
    if master_preset_id and not isinstance(master_preset_id, str):
        result.add(
            "state.invalid_master_preset_id",
            "master_preset_id must be a string",
            severity="error",
            path="state.master_preset_id",
        )

    return result


# ---------------------------------------------------------------------------
# User library validation
# ---------------------------------------------------------------------------


def validate_user_library(library: Any) -> ValidationResult:
    """Validate a user-library top-level object."""
    result = ValidationResult()
    if not isinstance(library, dict):
        result.add("library.not_object", "User library must be a JSON object", severity="error")
        return result

    schema_version = _coerce_int(library.get("schema_version", SCHEMA_VERSION), SCHEMA_VERSION)
    if schema_version > SCHEMA_VERSION:
        result.add(
            "library.future_schema_version",
            f"User library schema_version {schema_version} is newer than supported ({SCHEMA_VERSION})",
            severity="warning",
            path="library.schema_version",
        )

    result.extend(validate_presets(library.get("presets", [])).issues)
    return result


# ---------------------------------------------------------------------------
# Public helper
# ---------------------------------------------------------------------------


def raise_if_errors(result: ValidationResult) -> None:
    """Raise :class:`SchemaError` if validation produced errors."""
    if result.has_errors:
        joined = "; ".join(f"{i.code}: {i.message}" for i in result.errors)
        raise SchemaError(joined)
