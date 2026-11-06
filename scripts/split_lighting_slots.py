"""Split the single lighting slot into additive lighting facets.

Lighting is not one decision: time of day, physical source and quality are
independent and can coexist. This migration assigns the bundled lighting
presets to ``lighting_time``, ``lighting_source``, ``lighting_quality`` or
``lighting_direction``. The old ``lighting`` group stays in the schema for
user presets and old workflows.

Run from the repo root:

    python scripts/split_lighting_slots.py
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDIO_DIR = os.path.join(ROOT, "presets", "studio")

TIME = {
    "lighting_golden_hour",
    "lighting_moonlit_night",
    "lighting_soft_overcast",
    "u_lighting_golden_hour",
    "u_lighting_blue_hour",
    "u_lighting_overcast_daylight",
    "u_lighting_harsh_midday_sun",
    "u_lighting_window_light",
}
SOURCE = {
    "lighting_candlelight",
    "lighting_torchlight",
    "u_lighting_candlelight",
    "u_lighting_firelight",
    "u_lighting_desk_lamp",
    "u_lighting_streetlight",
    "u_lighting_neon_practicals",
}
QUALITY = {
    "u_lighting_rembrandt_lighting",
    "u_lighting_three_point_setup",
    "u_lighting_low_key_drama",
    "u_lighting_high_key_soft",
    "u_lighting_rim_light",
    "u_lighting_softbox_studio",
    "u_lighting_beauty_dish",
    "u_lighting_colored_gels",
    "u_lighting_chiaroscuro",
    "u_lighting_silhouette",
    "u_lighting_god_rays",
    "u_lighting_underlight",
}


def main() -> None:
    mapping = {**{pid: "lighting_time" for pid in TIME},
               **{pid: "lighting_source" for pid in SOURCE},
               **{pid: "lighting_quality" for pid in QUALITY}}
    for filename in ("lighting.json", "universal_lighting.json"):
        path = os.path.join(STUDIO_DIR, filename)
        if not os.path.isfile(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        changed = 0
        for entry in payload.get("presets", []):
            group = mapping.get(entry["id"])
            if group and entry.get("exclusive_group") != group:
                entry["exclusive_group"] = group
                changed += 1
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        print(f"{filename}: {changed} presets split")


if __name__ == "__main__":
    main()
