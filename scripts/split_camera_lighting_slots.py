"""Move the legacy camera/style presets onto the split slots.

Old camera presets were one ``camera`` slot; they are all framing presets.
Color-grade style presets become their own ``color_grade`` slot so they can
be randomized independently of the film-stock/genre style slot.

Run from the repo root:

    python scripts/split_camera_lighting_slots.py
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO_DIR = os.path.join(ROOT, "presets", "studio")


def load(filename: str) -> dict:
    with open(os.path.join(STUDIO_DIR, filename), "r", encoding="utf-8") as handle:
        return json.load(handle)


def save(filename: str, payload: dict) -> None:
    with open(os.path.join(STUDIO_DIR, filename), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> None:
    camera = load("camera.json")
    changed = 0
    for entry in camera.get("presets", []):
        if entry.get("exclusive_group") == "camera":
            entry["exclusive_group"] = "framing"
            entry.setdefault("collection", "Framing")
            changed += 1
    save("camera.json", camera)
    print(f"camera.json: {changed} moved to framing")

    style = load("style.json")
    changed = 0
    for entry in style.get("presets", []):
        if entry.get("collection") == "Color Grade":
            if entry.get("exclusive_group") != "color_grade":
                entry["exclusive_group"] = "color_grade"
                changed += 1
    save("style.json", style)
    print(f"style.json: {changed} moved to color_grade")

    lighting = load("lighting.json")
    changed = 0
    for entry in lighting.get("presets", []):
        if entry.get("collection") == "Direction":
            if entry.get("exclusive_group") != "lighting_direction":
                entry["exclusive_group"] = "lighting_direction"
                changed += 1
    save("lighting.json", lighting)
    print(f"lighting.json: {changed} moved to lighting_direction")


if __name__ == "__main__":
    main()
