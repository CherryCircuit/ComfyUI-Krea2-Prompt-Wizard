"""Move old ``wardrobe_top`` presets onto the layered wardrobe slots.

Outerwear, mid-layers and base layers can now coexist on one character.
Run from the repo root:

    python scripts/split_wardrobe_layers.py
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO_DIR = os.path.join(ROOT, "presets", "studio")

OUTER = {
    "u_wardrobe_leather_jacket",
    "u_wardrobe_cropped_armor_vest",
    "u_wardrobe_technical_jacket",
    "wardrobe_top_sport_coat_tshirt",
    "wardrobe_top_classic_denim_jacket",
    "wardrobe_top_leather_biker_jacket",
}
MID = {
    "u_wardrobe_knit_sweater",
    "u_wardrobe_waistcoat_and_shirt",
    "wardrobe_top_oversized_hoodie",
    "wardrobe_top_flannel_shirt",
}
BASE = {
    "u_wardrobe_plain_white_shirt",
    "u_wardrobe_silk_blouse",
    "u_wardrobe_football_jersey",
    "wardrobe_top_casual_crop_top",
    "wardrobe_top_fitted_turtleneck",
    "wardrobe_top_silk_blouse",
    "wardrobe_top_fitted_tank_top",
    "wardrobe_top_medieval_linen_tunic",
}


def main() -> None:
    mapping = {
        **{pid: "wardrobe_outer" for pid in OUTER},
        **{pid: "wardrobe_mid" for pid in MID},
        **{pid: "wardrobe_base" for pid in BASE},
    }
    for filename in ("wardrobe_tops.json", "universal_wardrobe.json"):
        path = os.path.join(STUDIO_DIR, filename)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        changed = 0
        for entry in payload.get("presets", []):
            if entry.get("exclusive_group") != "wardrobe_top":
                continue
            group = mapping.get(entry["id"])
            if group:
                entry["exclusive_group"] = group
                changed += 1
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        print(f"{filename}: {changed} tops moved")


if __name__ == "__main__":
    main()
