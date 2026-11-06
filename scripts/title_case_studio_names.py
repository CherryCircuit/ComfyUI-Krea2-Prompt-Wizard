"""Normalize bundled studio preset names to title case.

The early studio library was authored in ALL CAPS. This one-time migration
rewrites the shipped JSON so the data itself is readable; the backend and
frontend still title-case user-authored names at load/save time.

Run from the repo root:

    python scripts/title_case_studio_names.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.studio.presets import title_case_name  # noqa: E402

STUDIO_DIR = os.path.join(ROOT, "presets", "studio")


def main() -> None:
    changed = 0
    for filename in sorted(os.listdir(STUDIO_DIR)):
        if not filename.endswith(".json") or filename == "recipes.json":
            continue
        path = os.path.join(STUDIO_DIR, filename)
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        count = 0
        for entry in payload.get("presets", []):
            name = entry.get("name")
            if not isinstance(name, str):
                continue
            clean = title_case_name(name)
            if clean and clean != name:
                entry["name"] = clean
                count += 1
        if count:
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
            changed += count
        print(f"{filename}: {count} names updated")
    print(f"total: {changed} names updated")


if __name__ == "__main__":
    main()
