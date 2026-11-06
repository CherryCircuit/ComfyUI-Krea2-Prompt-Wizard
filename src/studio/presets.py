"""Preset schema and storage for the Prompt Studio.

Presets are the hidden expansions behind the editor's visible tokens.
Storage has two layers:

* Bundled presets ship with the pack in ``presets/studio/*.json``.
* User presets live in ``<user_directory>/Krea2PromptWizard/studio_presets.json``.
  User entries override bundled entries with the same id, and may mark a
  bundled preset as deleted.

Every layer is loaded defensively: a malformed file or a malformed preset
is skipped with a logged warning instead of preventing ComfyUI from
starting.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .package_paths import BUNDLED_STUDIO_DIR, studio_user_presets_path

logger = logging.getLogger("krea2.studio.presets")

SCHEMA_VERSION = 1

#: Recognized token categories. Unknown categories are preserved as-is and
#: rendered with the neutral "other" styling by the frontend.
CATEGORIES = (
    "character",
    "look",
    "performance",
    "state",
    "scene",
    "lighting",
    "camera",
    "style",
    "continuity",
    "emotion",
    "wardrobe",
    "hair",
    "hair_color",
    "hair_color_style",
    "garment_color",
    "garment_pattern",
    "props",
    "other",
)

DEFAULT_CATEGORY = "other"

#: Categories whose presets are bundles of other presets (their expansion
#: inlines the members' expansions, with cycle detection).
BUNDLE_CATEGORIES = ("look", "performance")

#: Known exclusive groups. Presets sharing a group cannot coexist in a
#: prompt: inserting one replaces the other (per host for attachments).
#: "camera", "lighting", "style" and "scene" are global singletons;
#: "emotion", "look" and "performance" are per character. Wardrobe slots
#: are per character. Custom group strings are allowed for user presets.
EXCLUSIVE_GROUPS = (
    "camera",
    "framing",
    "angle",
    "lens",
    "movement",
    "lighting",
    "lighting_time",
    "lighting_source",
    "lighting_quality",
    "lighting_direction",
    "color_grade",
    "style",
    "scene",
    "emotion",
    "look",
    "performance",
    "wardrobe_full",
    "wardrobe_top",
    "wardrobe_bottom",
    "wardrobe_outer",
    "wardrobe_mid",
    "wardrobe_base",
    "wardrobe_accessory",
    "wardrobe_legwear",
    "hair",
    "hair_color",
    "hair_color_style",
    "garment_color",
    "garment_pattern",
)

_REQUIRED_STRING_FIELDS = ("id", "prompt")

#: Words kept lowercase inside a title-cased name, unless first or last.
_SMALL_WORDS = frozenset(
    {
        "a", "an", "and", "as", "at", "but", "by", "for", "from", "in",
        "into", "nor", "of", "on", "onto", "or", "over", "per", "the",
        "to", "up", "via", "vs", "with",
    }
)

#: Initialisms that should stay uppercase rather than becoming "Vhs".
_ACRONYMS = frozenset(
    {"3D", "4K", "8K", "AI", "CCTV", "DSLR", "FPV", "HDR", "IMAX", "LED",
     "POV", "RPG", "SLR", "TV", "UV", "VHS", "VR"}
)


def readable_name(value: object) -> str:
    """Title-case all-caps authored names, leave deliberate mixed case alone.

    ``SEASIDE COTTAGE`` becomes ``Seaside Cottage``; ``iPhone`` and
    ``McDonald's`` keep their author's casing.
    """
    text = " ".join(str(value or "").split())
    if not text:
        return ""
    if any(character.islower() for character in text):
        return text
    return title_case_name(text)


def title_case_name(value: object) -> str:
    """A preset name in title case, preserving acronyms and numbers.

    ``SEASIDE COTTAGE`` -> ``Seaside Cottage``;
    ``CALM / CONTENT`` -> ``Calm / Content``;
    ``1920S JAZZ CLUB`` -> ``1920s Jazz Club``;
    ``VHS`` -> ``VHS``.
    """
    text = " ".join(str(value or "").split())
    if not text:
        return ""
    words = text.split(" ")
    out = []
    for index, word in enumerate(words):
        match = re.match(r"^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$", word)
        if not match:
            out.append(word)
            continue
        lead, core, trail = match.groups()
        if not core:
            out.append(word)
            continue
        if core.upper() in _ACRONYMS:
            cleaned = core.upper()
        elif re.fullmatch(r"\d+[A-Za-z]?", core):
            cleaned = core.lower()
        elif 0 < index < len(words) - 1 and core.lower() in _SMALL_WORDS:
            cleaned = core.lower()
        else:
            cleaned = re.sub(
                r"(^|[-/])([a-z])",
                lambda m: m.group(1) + m.group(2).upper(),
                core.lower(),
            )
        out.append(lead + cleaned + trail)
    return " ".join(out)


@dataclass
class Preset:
    """One reusable prompt expansion.

    ``included_presets`` turns the preset into a bundle (a Look or a
    Performance): at compile time the members' expansions are inlined in
    order, with cycle detection. ``preview_image`` is a manual visual
    reference (a filename inside the user's previews folder or a URL)
    used by the visual preset browser.
    """

    id: str
    name: str
    category: str = DEFAULT_CATEGORY
    #: User-facing group inside the category ("Medieval", "Sci-Fi",
    #: "School"). Drives the chooser headers and randomizer pool tree.
    collection: str = ""
    prompt: str = ""
    negative: str = ""
    description: str = ""
    tags: List[str] = field(default_factory=list)
    notes: str = ""
    enabled: bool = True
    exclusive_group: str = ""
    included_presets: List[str] = field(default_factory=list)
    preview_image: str = ""
    reference_images: List[Any] = field(default_factory=list)
    origin: str = "bundled"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "collection": self.collection,
            "prompt": self.prompt,
            "negative": self.negative,
            "description": self.description,
            "tags": list(self.tags),
            "notes": self.notes,
            "enabled": self.enabled,
            "exclusive_group": self.exclusive_group,
            "included_presets": list(self.included_presets),
            "preview_image": self.preview_image,
            "reference_images": list(self.reference_images),
            "origin": self.origin,
        }


def _coerce_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _coerce_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if isinstance(item, (str, int, float))]
    if isinstance(value, str) and value.strip():
        # Tolerate comma-separated strings authored by hand in JSON.
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _coerce_id_list(value: Any) -> List[str]:
    """Included-preset ids: strictly a list of non-empty strings."""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if isinstance(item, str) and item.strip()]


def _coerce_exclusive_group(value: Any) -> str:
    """Normalize an exclusive-group string to a lowercase slug."""
    if not isinstance(value, str):
        return ""
    slug = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")
    return slug[:60]


def preset_from_dict(data: Any, origin: str) -> Optional[Preset]:
    """Build a Preset from parsed JSON, or return None if unusable."""
    if not isinstance(data, dict):
        return None
    preset_id = str(data.get("id", "")).strip()
    prompt = data.get("prompt", "")
    if not preset_id:
        logger.warning("studio preset skipped: missing id (%r)", data)
        return None
    if not isinstance(prompt, str):
        logger.warning("studio preset %s skipped: prompt must be a string", preset_id)
        return None
    category = str(data.get("category", DEFAULT_CATEGORY)).strip().lower() or DEFAULT_CATEGORY
    name = str(data.get("name", "")).strip() or preset_id
    if data.get("name"):
        name = readable_name(name)
    collection = data.get("collection", "")
    collection = str(collection).strip()[:80] if isinstance(collection, str) else ""
    return Preset(
        id=preset_id,
        name=name,
        category=category if category in CATEGORIES else DEFAULT_CATEGORY,
        collection=collection,
        prompt=prompt,
        negative=data.get("negative", "") if isinstance(data.get("negative", ""), str) else "",
        description=data.get("description", "") if isinstance(data.get("description", ""), str) else "",
        tags=_coerce_string_list(data.get("tags")),
        notes=data.get("notes", "") if isinstance(data.get("notes", ""), str) else "",
        enabled=_coerce_bool(data.get("enabled"), True),
        exclusive_group=_coerce_exclusive_group(data.get("exclusive_group", "")),
        included_presets=_coerce_id_list(data.get("included_presets")),
        preview_image=data.get("preview_image", "") if isinstance(data.get("preview_image", ""), str) else "",
        reference_images=data.get("reference_images") if isinstance(data.get("reference_images"), list) else [],
        origin=origin,
    )


def _load_preset_file(path: str, origin: str) -> List[Dict[str, Any]]:
    """Read one preset JSON file, returning raw dicts (possibly 'deleted' tombstones)."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio preset file unreadable (%s): %s", path, exc)
        return []
    entries: Any = payload
    if isinstance(payload, dict):
        entries = payload.get("presets", [])
    if not isinstance(entries, list):
        logger.warning("studio preset file has no preset list (%s)", path)
        return []
    cleaned: List[Dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict) or not str(entry.get("id", "")).strip():
            logger.warning("studio preset entry skipped in %s: missing id", path)
            continue
        entry = dict(entry)
        entry["origin"] = origin
        cleaned.append(entry)
    return cleaned


def _bundled_files() -> List[str]:
    if not os.path.isdir(BUNDLED_STUDIO_DIR):
        return []
    files: List[str] = []
    for name in sorted(os.listdir(BUNDLED_STUDIO_DIR)):
        if name.endswith(".json"):
            files.append(os.path.join(BUNDLED_STUDIO_DIR, name))
    return files


class PresetStore:
    """Merged view over bundled + user presets with id lookup."""

    def __init__(self, presets: Optional[List[Preset]] = None) -> None:
        self._by_id: Dict[str, Preset] = {}
        self._order: List[str] = []
        for preset in presets or []:
            self._insert(preset)

    def _insert(self, preset: Preset) -> None:
        if preset.id in self._by_id:
            # Later sources (user) override earlier ones (bundled) but keep
            # the original insertion order for stable listing.
            self._by_id[preset.id] = preset
            return
        self._by_id[preset.id] = preset
        self._order.append(preset.id)

    # -- lookups ------------------------------------------------------------

    def get(self, preset_id: str) -> Optional[Preset]:
        return self._by_id.get(preset_id)

    def usable(self, preset_id: str) -> bool:
        preset = self._by_id.get(preset_id)
        return bool(preset and preset.enabled)

    def all(self) -> List[Preset]:
        return [self._by_id[preset_id] for preset_id in self._order]

    def by_category(self, category: str) -> List[Preset]:
        return [preset for preset in self.all() if preset.category == category]

    def label_of(self, preset_id: str) -> Optional[str]:
        preset = self._by_id.get(preset_id)
        return preset.name if preset and preset.enabled else None


def load_store() -> PresetStore:
    """Load and merge bundled + user presets into a fresh store."""
    entries: List[Dict[str, Any]] = []
    for path in _bundled_files():
        entries.extend(_load_preset_file(path, "bundled"))
    user_path = studio_user_presets_path()
    if os.path.isfile(user_path):
        entries.extend(_load_preset_file(user_path, "user"))

    presets: List[Preset] = []
    tombstones = set()
    for entry in entries:
        if entry.get("deleted") is True:
            tombstones.add(str(entry["id"]).strip())
            continue
        preset = preset_from_dict(entry, str(entry.get("origin", "bundled")))
        if preset is not None:
            presets.append(preset)
    if tombstones:
        presets = [preset for preset in presets if preset.id not in tombstones]
    return PresetStore(presets)


# ---------------------------------------------------------------------------
# Cached singleton (the node compiles on every execution; avoid re-reading)
# ---------------------------------------------------------------------------

_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {"store": None}


def get_store() -> PresetStore:
    with _LOCK:
        if _CACHE["store"] is None:
            _CACHE["store"] = load_store()
        return _CACHE["store"]


def reload_store() -> PresetStore:
    with _LOCK:
        _CACHE["store"] = load_store()
        return _CACHE["store"]


# ---------------------------------------------------------------------------
# User preset persistence
# ---------------------------------------------------------------------------


def load_user_payload() -> Dict[str, Any]:
    """Return the raw user preset payload (for round-tripping through the UI)."""
    path = studio_user_presets_path()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict) and isinstance(payload.get("presets"), list):
            return payload
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio user presets unreadable (%s): %s", path, exc)
    return {"schema_version": SCHEMA_VERSION, "presets": []}


def save_user_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Validate and write the user preset payload. Returns issue list."""
    from ..user_paths import atomic_write  # package-level, avoids cycles in tests

    issues: List[Dict[str, Any]] = []
    presets = payload.get("presets") if isinstance(payload, dict) else None
    if not isinstance(presets, list):
        return [{"code": "presets.invalid_payload", "severity": "error",
                 "message": "Payload must contain a 'presets' list."}]

    seen = set()
    cleaned: List[Dict[str, Any]] = []
    for index, entry in enumerate(presets):
        if not isinstance(entry, dict):
            issues.append({"code": "presets.entry_invalid", "severity": "error",
                           "index": index, "message": "Preset entry must be an object."})
            continue
        preset_id = str(entry.get("id", "")).strip()
        if entry.get("deleted") is True:
            if not preset_id:
                issues.append({"code": "presets.entry_invalid", "severity": "error",
                               "index": index, "message": "Tombstone entry needs an id."})
                continue
            cleaned.append({"id": preset_id, "deleted": True})
            continue
        if not preset_id:
            issues.append({"code": "presets.missing_id", "severity": "error",
                           "index": index, "message": "Preset is missing an id."})
            continue
        if preset_id in seen:
            issues.append({"code": "presets.duplicate_id", "severity": "error",
                           "index": index, "id": preset_id,
                           "message": f"Duplicate preset id '{preset_id}'."})
            continue
        if not _REQUIRED_STRING_FIELDS or not isinstance(entry.get("prompt"), str):
            issues.append({"code": "presets.missing_prompt", "severity": "error",
                           "index": index, "id": preset_id,
                           "message": f"Preset '{preset_id}' needs a prompt string."})
            continue
        preset = preset_from_dict(entry, "user")
        if preset is None:
            issues.append({"code": "presets.entry_invalid", "severity": "error",
                           "index": index, "id": preset_id,
                           "message": f"Preset '{preset_id}' could not be parsed."})
            continue
        seen.add(preset_id)
        data = preset.to_dict()
        data.pop("origin", None)
        cleaned.append(data)

    if any(issue["severity"] == "error" for issue in issues):
        return issues

    body = {"schema_version": SCHEMA_VERSION, "presets": cleaned}
    path = studio_user_presets_path()
    try:
        atomic_write(path, json.dumps(body, indent=2, ensure_ascii=False).encode("utf-8"))
    except OSError as exc:
        return [{"code": "presets.save_failed", "severity": "error",
                 "message": f"Could not write presets: {exc}"}]
    reload_store()
    return issues
