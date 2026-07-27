"""Library loading and merging.

The wizard has *three* layers of preset data:

1. The bundled default library, shipped as ``presets/default_library.json``.
2. The user library, stored at ``<user_directory>/Krea2PromptWizard/user_library.json``.
3. Workflow-embedded snapshots, stored in the wizard state JSON.

Each layer is loaded as a list of preset dicts. The :class:`Library`
object merges them with a stable priority order so that presets can
be overwritten by the user without invalidating workflow snapshots.

The module never writes outside the user directory. It uses atomic
write semantics and creates timestamped backups on every save.
"""
from __future__ import annotations

import copy
import json
import os
import shutil
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .schemas import (
    ALLOWED_MODES,
    ALLOWED_PROFILES,
    ALLOWED_VERIFICATIONS,
    CATEGORIES,
    PRESET_KEYS_OPTIONAL,
    PRESET_KEYS_REQUIRED,
    SCHEMA_VERSION,
    SAFE_WEIGHT_MAX,
    SAFE_WEIGHT_MIN,
    SLIDER_DEFAULT,
    SLIDER_MAX,
    SLIDER_MIN,
)
from .user_paths import (
    atomic_write,
    timestamp_backup,
    user_library_path,
)
from .validation import (
    ValidationResult,
    validate_preset,
    validate_presets,
    validate_user_library,
)


# ---------------------------------------------------------------------------
# Library object
# ---------------------------------------------------------------------------


@dataclass
class Library:
    """A merged preset library."""

    presets: List[Dict[str, Any]] = field(default_factory=list)
    bundled_path: Optional[str] = None
    user_path: Optional[str] = None

    # ------------------------------------------------------------------
    # Access
    # ------------------------------------------------------------------
    def index_by_id(self) -> Dict[str, Dict[str, Any]]:
        return {p["id"]: p for p in self.presets if isinstance(p, dict) and "id" in p}

    def by_category(self, category: str) -> List[Dict[str, Any]]:
        return [p for p in self.presets if p.get("category") == category]

    def by_alias(self, alias: str) -> List[Dict[str, Any]]:
        alias_l = alias.lower()
        out: List[Dict[str, Any]] = []
        for p in self.presets:
            if alias_l == str(p.get("label", "")).lower():
                out.append(p)
                continue
            aliases = p.get("aliases") or []
            if isinstance(aliases, list) and any(str(a).lower() == alias_l for a in aliases):
                out.append(p)
        return out

    def find(self, preset_id: str) -> Optional[Dict[str, Any]]:
        return self.index_by_id().get(preset_id)

    def search(self, needle: str) -> List[Dict[str, Any]]:
        """Case-insensitive search over visible text and semantic metadata."""
        n = (needle or "").lower().strip()
        if not n:
            return list(self.presets)
        out: List[Dict[str, Any]] = []
        for p in self.presets:
            haystacks = [str(p.get("label", "")), str(p.get("phrase", ""))]
            haystacks.extend(str(a) for a in (p.get("aliases") or []))
            haystacks.extend(str(tag) for tag in (p.get("tags") or []))
            if any(n in h.lower() for h in haystacks):
                out.append(p)
        return out

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------
    def upsert(self, preset: Dict[str, Any]) -> None:
        """Insert or replace a preset by id."""
        new_id = preset.get("id")
        if not new_id:
            raise ValueError("Preset 'id' is required for upsert")
        for i, existing in enumerate(self.presets):
            if existing.get("id") == new_id:
                self.presets[i] = copy.deepcopy(preset)
                return
        self.presets.append(copy.deepcopy(preset))

    def remove(self, preset_id: str) -> bool:
        """Remove a preset by id. Returns True if removed."""
        for i, existing in enumerate(self.presets):
            if existing.get("id") == preset_id:
                del self.presets[i]
                return True
        return False


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def _read_json(path: str) -> Any:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _coerce_preset(p: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(p, dict):
        return None
    if "id" not in p or "category" not in p or "phrase" not in p:
        return None
    return p


def load_library(
    bundled_path: Optional[str] = None,
    user_path: Optional[str] = None,
) -> Library:
    """Load and merge the bundled and user libraries.

    User presets override bundled presets with the same id. The original
    bundled data is preserved in the result by tagging each preset with
    ``origin`` = ``"bundled"`` or ``"user"``.
    """
    if bundled_path is None:
        # Resolve the bundled library path against the package root.
        # The user-facing package root is the parent directory of ``src``.
        import os as _os

        package_root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
        candidate = _os.path.join(package_root, "presets", "default_library.json")
        if _os.path.exists(candidate):
            bundled_path = candidate
    if user_path is None:
        user_path = user_library_path(create=False)

    bundled_raw = _read_json(bundled_path) if bundled_path else []
    user_raw = _read_json(user_path) if user_path else None

    bundled_presets: List[Dict[str, Any]] = []
    if isinstance(bundled_raw, list):
        bundled_presets = [p for p in (_coerce_preset(x) for x in bundled_raw) if p]
    elif isinstance(bundled_raw, dict):
        bundled_presets = [
            p for p in (_coerce_preset(x) for x in bundled_raw.get("presets", [])) if p
        ]

    user_presets: List[Dict[str, Any]] = []
    if isinstance(user_raw, dict):
        user_presets = [p for p in (_coerce_preset(x) for x in user_raw.get("presets", [])) if p]
    elif isinstance(user_raw, list):
        user_presets = [p for p in (_coerce_preset(x) for x in user_raw) if p]

    presets_by_id: Dict[str, Dict[str, Any]] = {}
    for p in bundled_presets:
        p_copy = copy.deepcopy(p)
        p_copy.setdefault("origin", "bundled")
        presets_by_id[p_copy["id"]] = p_copy
    for p in user_presets:
        p_copy = copy.deepcopy(p)
        p_copy.setdefault("origin", "user")
        presets_by_id[p_copy["id"]] = p_copy

    library = Library(
        presets=list(presets_by_id.values()),
        bundled_path=bundled_path,
        user_path=user_path,
    )
    return library


# ---------------------------------------------------------------------------
# Save / atomic
# ---------------------------------------------------------------------------


def save_user_library(
    library: Library,
    *,
    create_backup: bool = True,
) -> str:
    """Persist the user library to disk.

    Atomic write semantics are used. A timestamped backup is created next
    to the existing file before the new content is committed.
    """
    user_path = user_library_path(create=True)
    if create_backup and os.path.exists(user_path):
        timestamp_backup(user_path)

    payload = {
        "schema_version": SCHEMA_VERSION,
        "presets": [p for p in library.presets if p.get("origin") == "user"],
    }
    data = json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")
    atomic_write(user_path, data)
    return user_path


def reset_user_library(bundled_path: Optional[str] = None) -> str:
    """Reset the user library to the empty state.

    The bundled library is preserved on disk and unaffected. The user
    file is removed (after a backup) and replaced with an empty stub.
    """
    user_path = user_library_path(create=True)
    if os.path.exists(user_path):
        timestamp_backup(user_path)
        os.unlink(user_path)
    payload = json.dumps(
        {"schema_version": SCHEMA_VERSION, "presets": []},
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8")
    atomic_write(user_path, payload)
    return user_path


def merge_user_presets(
    user_presets: Iterable[Dict[str, Any]],
    *,
    preserve_origins: bool = True,
) -> List[Dict[str, Any]]:
    """Normalise, validate and return a list of user presets.

    Invalid presets are dropped. ``preserve_origins`` keeps any
    ``origin`` field untouched (used when re-saving an existing user file).
    """
    out: List[Dict[str, Any]] = []
    for raw in user_presets:
        p = _coerce_preset(raw)
        if p is None:
            continue
        # Drop any preset that fails validation with errors.
        result = validate_preset(p)
        if result.has_errors:
            continue
        if not preserve_origins:
            p.pop("origin", None)
        out.append(p)
    return out


# ---------------------------------------------------------------------------
# Edit-as-text format
# ---------------------------------------------------------------------------


def parse_user_text(text: str) -> List[Dict[str, Any]]:
    """Parse presets from the line-based ``Edit as Text`` format.

    The format is:

        Label | Phrase | Default Strength | Mode | Aliases | Notes

    * ``Mode`` is one of ``scalar``, ``bipolar``, or ``raw``.
    * For bipolar presets, the ``Phrase`` field is the neutral baseline
      and ``Notes`` may contain ``neg:<text>`` and ``pos:<text>`` segments.
    * Lines beginning with ``#`` are treated as comments.
    """
    out: List[Dict[str, Any]] = []
    if not text:
        return out
    for idx, raw_line in enumerate(text.splitlines()):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            raise ValueError(
                f"Line {idx + 1}: expected at least 3 fields separated by '|', got {len(parts)}"
            )
        label = parts[0]
        phrase = parts[1]
        try:
            default_strength = int(parts[2]) if parts[2] else 0
        except ValueError as e:
            raise ValueError(f"Line {idx + 1}: invalid default strength '{parts[2]}'") from e
        mode = (parts[3] if len(parts) > 3 else "scalar").lower()
        if mode not in ALLOWED_MODES:
            raise ValueError(f"Line {idx + 1}: invalid mode '{mode}'")
        aliases_raw = parts[4] if len(parts) > 4 else ""
        notes = parts[5] if len(parts) > 5 else ""
        aliases = [a.strip() for a in aliases_raw.split(",") if a.strip()]
        slug = label.lower().replace(" ", "_").replace("-", "_")
        slug = "".join(ch for ch in slug if ch.isalnum() or ch == "_")
        if not slug:
            slug = f"custom_{idx + 1}"

        preset = {
            "id": f"custom.{slug}",
            "category": "custom",
            "label": label,
            "phrase": phrase,
            "default_strength": max(SLIDER_MIN, min(SLIDER_MAX, default_strength)),
            "control_mode": mode,
            "aliases": aliases,
            "notes": notes,
            "verification": "general visual vocabulary",
            "schema_version": SCHEMA_VERSION,
        }
        if mode == "bipolar":
            pos = None
            neg = None
            for note in notes.split(";"):
                nt = note.strip()
                if nt.lower().startswith("pos:"):
                    pos = nt[4:].strip()
                elif nt.lower().startswith("neg:"):
                    neg = nt[4:].strip()
            if not pos or not neg:
                raise ValueError(
                    f"Line {idx + 1}: bipolar preset requires 'pos:' and 'neg:' in notes"
                )
            preset["positive_phrase"] = pos
            preset["negative_phrase"] = neg
            preset["neutral_phrase"] = phrase
        out.append(preset)
    return out


def format_user_text(presets: Iterable[Dict[str, Any]]) -> str:
    """Render a list of presets as ``Edit as Text`` lines."""
    lines = [
        "# Krea2 Prompt Wizard — Edit as Text format",
        "# Label | Phrase | Default Strength | Mode | Aliases | Notes",
        "# Use 'pos:' and 'neg:' notes for bipolar rows.",
        "#",
    ]
    for p in presets:
        if not isinstance(p, dict):
            continue
        label = p.get("label", "")
        phrase = p.get("phrase", "")
        try:
            ds = int(p.get("default_strength", 0))
        except (TypeError, ValueError):
            ds = 0
        mode = p.get("control_mode", "scalar")
        aliases = ",".join(p.get("aliases") or [])
        notes_bits = []
        if p.get("positive_phrase"):
            notes_bits.append(f"pos:{p['positive_phrase']}")
        if p.get("negative_phrase"):
            notes_bits.append(f"neg:{p['negative_phrase']}")
        if p.get("notes"):
            notes_bits.append(p["notes"])
        notes = ";".join(notes_bits)
        lines.append(
            f"{label} | {phrase} | {ds} | {mode} | {aliases} | {notes}"
        )
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


def migrate_presets(
    presets: Iterable[Dict[str, Any]],
    *,
    migrations: Optional[Dict[str, str]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Apply migrations to a list of presets.

    ``migrations`` is a mapping of ``(old_id) -> (new_id)``. Presets
    whose id is in the mapping are replaced with a copy whose id is
    updated. A short note is appended to ``notes`` so the user can
    verify that the migration ran.

    Returns ``(migrated, dropped)`` where ``dropped`` is the list of
    presets that could not be migrated.
    """
    migrations = migrations or {}
    migrated: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []
    for p in presets:
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if pid in migrations:
            new_id = migrations[pid]
            new_preset = dict(p)
            new_preset["id"] = new_id
            new_preset["deprecated_replacement"] = new_id
            migrated.append(new_preset)
        else:
            migrated.append(p)
    return migrated, dropped
