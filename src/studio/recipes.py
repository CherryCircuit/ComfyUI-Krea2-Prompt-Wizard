"""Randomizer recipes: a named slot selection plus its checkbox pools.

A recipe is what the Randomizer board is looking at: which presets are
currently in each slot and which options each slot is allowed to draw from.
Applying one either restores the saved picks or rerolls every covered slot
inside the saved pools.

Bundled recipes live in ``presets/studio/recipes.json``; user recipes live
in ``<user>/Krea2PromptWizard/studio_recipes.json``. A user recipe with the
same id overrides a bundled one, and a ``{"id": ..., "deleted": true}``
tombstone hides it.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional

from .package_paths import BUNDLED_STUDIO_DIR, studio_user_recipes_path
from .presets import readable_name

logger = logging.getLogger("krea2.studio.recipes")

SCHEMA_VERSION = 1
MAX_RECIPES = 200
MAX_POOL_IDS = 300
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _clean_pools(raw: Any) -> Dict[str, List[str]]:
    pools: Dict[str, List[str]] = {}
    if not isinstance(raw, dict):
        return pools
    for key, ids in raw.items():
        if not isinstance(key, str) or not isinstance(ids, list):
            continue
        seen = []
        for item in ids[:MAX_POOL_IDS]:
            if isinstance(item, str):
                item = item.strip()
                if item and item not in seen:
                    seen.append(item)
        if seen:
            pools[key[:120]] = seen
    return pools


def _clean_picks(raw: Any) -> Dict[str, str]:
    picks: Dict[str, str] = {}
    if not isinstance(raw, dict):
        return picks
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        value = value.strip()
        if value:
            picks[key[:120]] = value
    return picks


def normalize_recipe(raw: Any, origin: str = "user") -> Optional[Dict[str, Any]]:
    """Any payload -> a complete recipe dict, or None when unusable."""
    if not isinstance(raw, dict):
        return None
    recipe_id = str(raw.get("id", "")).strip()
    if not _ID_RE.fullmatch(recipe_id):
        return None
    name = readable_name(str(raw.get("name", "")).strip() or recipe_id) or recipe_id
    description = raw.get("description", "")
    description = str(description).strip()[:500] if isinstance(description, str) else ""
    pools = _clean_pools(raw.get("pools"))
    picks = _clean_picks(raw.get("picks"))
    if not pools and not picks:
        return None
    return {
        "id": recipe_id,
        "name": name,
        "description": description,
        "randomize": raw.get("randomize") is not False,
        "pools": pools,
        "picks": picks,
        "origin": "user" if origin == "user" else "bundled",
    }


def _load_file(path: str, origin: str) -> List[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio recipe file unreadable (%s): %s", path, exc)
        return []
    entries = payload.get("recipes", []) if isinstance(payload, dict) else []
    if not isinstance(entries, list):
        return []
    return [entry for entry in entries if isinstance(entry, dict)]


def _user_payload() -> Dict[str, Any]:
    path = studio_user_recipes_path()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict) and isinstance(payload.get("recipes"), list):
            return payload
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("studio recipes unreadable (%s): %s", path, exc)
    return {"schema_version": SCHEMA_VERSION, "recipes": []}


def _write_user(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    from ..user_paths import atomic_write

    path = studio_user_recipes_path()
    try:
        atomic_write(
            path,
            json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8"),
        )
    except OSError as exc:
        return [{"code": "recipes.save_failed", "severity": "error",
                 "message": f"Could not write recipes: {exc}"}]
    return []


def load_recipes() -> List[Dict[str, Any]]:
    """Bundled + user recipes, user overrides winning, tombstones applied."""
    entries: List[Dict[str, Any]] = []
    for entry in _load_file(os.path.join(BUNDLED_STUDIO_DIR, "recipes.json"), "bundled"):
        recipe = normalize_recipe(entry, "bundled")
        if recipe:
            entries.append(recipe)
    tombstones = set()
    for entry in _user_payload().get("recipes", []):
        if not isinstance(entry, dict):
            continue
        if entry.get("deleted") is True:
            rid = str(entry.get("id", "")).strip()
            if rid:
                tombstones.add(rid)
            continue
        recipe = normalize_recipe(entry, "user")
        if recipe:
            entries.append(recipe)
    # Last write wins for a duplicate id; user files are loaded after bundled.
    by_id: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for recipe in entries:
        if recipe["id"] not in by_id:
            order.append(recipe["id"])
        by_id[recipe["id"]] = recipe
    return [by_id[rid] for rid in order if rid not in tombstones]


_LOCK = threading.Lock()


def save_recipe(raw: Any) -> Dict[str, Any]:
    """Upsert one user recipe; returns the merged recipe list."""
    recipe = normalize_recipe(raw, "user")
    if recipe is None:
        raise ValueError("recipe needs an id, a name, and at least one pool or pick")
    with _LOCK:
        payload = _user_payload()
        entries = [
            entry for entry in payload.get("recipes", [])
            if isinstance(entry, dict) and str(entry.get("id", "")).strip() != recipe["id"]
        ]
        entries.append({key: recipe[key] for key in
                        ("id", "name", "description", "randomize", "pools", "picks")})
        if len(entries) > MAX_RECIPES:
            raise ValueError(f"at most {MAX_RECIPES} recipes are supported")
        issues = _write_user({"schema_version": SCHEMA_VERSION, "recipes": entries})
        if issues:
            raise ValueError(issues[0]["message"])
    return load_recipes()


def delete_recipe(recipe_id: str) -> List[Dict[str, Any]]:
    """Hide a bundled recipe or remove a user recipe."""
    recipe_id = str(recipe_id or "").strip()
    if not _ID_RE.fullmatch(recipe_id):
        raise ValueError("invalid recipe id")
    with _LOCK:
        payload = _user_payload()
        entries = [
            entry for entry in payload.get("recipes", [])
            if not (isinstance(entry, dict) and str(entry.get("id", "")).strip() == recipe_id)
        ]
        entries.append({"id": recipe_id, "deleted": True})
        issues = _write_user({"schema_version": SCHEMA_VERSION, "recipes": entries})
        if issues:
            raise ValueError(issues[0]["message"])
    return load_recipes()
