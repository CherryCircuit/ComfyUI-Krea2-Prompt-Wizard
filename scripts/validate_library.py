"""Validate the bundled library, master presets, and conflicts file.

Run from the project root:

    python3 scripts/validate_library.py

Exits non-zero if any validation issue stops the build.
"""
from __future__ import annotations

import json
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)

from src.validation import (
    validate_presets,
    validate_state,
    validate_user_library,
)
from src.schemas import CATEGORIES, SCHEMA_VERSION
from src.wizard import (
    coerce_state,
    add_row,
    empty_state,
    rows_to_snapshot,
)


def _load(path: str):
    if not os.path.exists(path):
        sys.exit(f"missing file: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _validate_default_library() -> None:
    data = _load(os.path.join(ROOT, "presets", "default_library.json"))
    if isinstance(data, dict):
        presets = data.get("presets", [])
    else:
        presets = data
    result = validate_presets(presets)
    print(f"default_library.json: {len(presets)} presets, {len(result.issues)} issues")
    by_cat = {}
    for p in presets:
        by_cat.setdefault(p.get("category", "?"), 0)
        by_cat[p.get("category", "?")] += 1
    for cat in CATEGORIES:
        print(f"  {cat}: {by_cat.get(cat, 0)}")
    for i in result.errors:
        print(f"  ERROR {i.code}: {i.message} ({i.path})")
    for w in result.warnings:
        print(f"  WARN  {w.code}: {w.message} ({w.path})")
    if result.has_errors:
        sys.exit("default_library.json contains errors")


def _validate_master_presets() -> None:
    data = _load(os.path.join(ROOT, "presets", "master_presets.json"))
    masters = data.get("master_presets", [])
    library_data = _load(os.path.join(ROOT, "presets", "default_library.json"))
    library_presets = (
        library_data.get("presets", [])
        if isinstance(library_data, dict)
        else library_data
    )
    library_ids = {p["id"] for p in library_presets if isinstance(p, dict)}
    for master in masters:
        print(f"master preset {master['id']}: {len(master.get('rows', []))} rows")
        for row in master.get("rows", []):
            pid = row.get("preset_id")
            if pid not in library_ids:
                print(f"  ERROR {master['id']} references missing preset {pid}")
                sys.exit(1)
    print(f"master_presets.json: {len(masters)} presets validated")


def _validate_conflicts() -> None:
    data = _load(os.path.join(ROOT, "presets", "conflicts.json"))
    rules = data.get("conflicts", [])
    seen = set()
    for r in rules:
        if r["id"] in seen:
            sys.exit(f"duplicate conflict id {r['id']}")
        seen.add(r["id"])
    print(f"conflicts.json: {len(rules)} rules")


def _sanity_compile_sample() -> None:
    """Compile a 4-row sample wizard state to make sure the code paths work."""
    data = _load(os.path.join(ROOT, "presets", "default_library.json"))
    library_presets = (
        data.get("presets", []) if isinstance(data, dict) else data
    )
    by_id = {p["id"]: p for p in library_presets if isinstance(p, dict)}
    state = empty_state()
    state["base_prompt"] = "A studio portrait"
    for pid in (
        "emotion.shock",
        "framing.close_up",
        "lighting_setup.rembrandt_lighting",
        "film_color.kodak_portra_400",
    ):
        if pid in by_id:
            add_row(state, by_id[pid])

    from src.compiler import compile_state
    from src.library import load_library

    library = load_library()
    result = compile_state(state, library)
    print(f"sample compile: rows={len(state['rows'])} final_prompt={len(result.final_prompt)}ch")
    if not result.final_prompt:
        sys.exit("sample compile produced empty prompt")
    if "(shocked expression:" not in result.final_prompt:
        sys.exit("sample compile did not include the shocked expression fragment")


def main() -> None:
    print(f"validating library at {ROOT}")
    print(f"schema version: {SCHEMA_VERSION}")
    _validate_default_library()
    _validate_master_presets()
    _validate_conflicts()
    _sanity_compile_sample()
    print("ok")


if __name__ == "__main__":
    main()
