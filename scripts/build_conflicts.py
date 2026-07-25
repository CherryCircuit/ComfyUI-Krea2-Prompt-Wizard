"""Generate the bundled conflicts reference file.

The runtime conflict detector lives in ``src/conflicts.py``. The bundled
``preset/conflicts.json`` file is a documentation-friendly copy that
ships with the project so users can inspect the rules from the Library
editor or the docs site.
"""
from __future__ import annotations

import json
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)


CONFLICTS = [
    {
        "id": "shot_size.extreme_close_up_vs_establishing",
        "description": "Extreme close-up conflicts with wide establishing shot.",
        "tags": ["shot_size", "framing"],
    },
    {
        "id": "shot_size.establishing_vs_macro",
        "description": "Wide establishing shot conflicts with macro close-up.",
        "tags": ["shot_size", "framing"],
    },
    {
        "id": "depth_of_field.shallow_vs_deep",
        "description": "Shallow depth of field conflicts with deep focus.",
        "tags": ["depth_of_field"],
    },
    {
        "id": "camera_movement.locked_vs_aggressive",
        "description": "Locked-off camera conflicts with aggressive camera movement.",
        "tags": ["camera_movement"],
    },
    {
        "id": "movement.frozen_action_vs_motion_blur",
        "description": "Frozen action conflicts with strong motion blur.",
        "tags": ["subject_movement"],
    },
    {
        "id": "composition.symmetric_vs_asymmetry",
        "description": "Symmetrical composition conflicts with strong asymmetry.",
        "tags": ["composition"],
    },
    {
        "id": "lighting.front_vs_back",
        "description": "Front lighting conflicts with extreme backlighting.",
        "tags": ["lighting"],
    },
    {
        "id": "lighting.soft_vs_chiaroscuro",
        "description": "Soft flat lighting conflicts with hard chiaroscuro.",
        "tags": ["lighting"],
    },
    {
        "id": "composition.minimal_vs_dense",
        "description": "Minimal background conflicts with dense environmental complexity.",
        "tags": ["composition", "detail"],
    },
    {
        "id": "perspective.macro_vs_distant",
        "description": "Macro perspective conflicts with distant establishing shot.",
        "tags": ["perspective"],
    },
    {
        "id": "emotion.competing_maximum",
        "description": "Several competing emotions at maximum strength.",
        "tags": ["emotion"],
    },
    {
        "id": "lens.multiple_focal_lengths",
        "description": "Multiple camera focal lengths selected.",
        "tags": ["lens"],
    },
    {
        "id": "aperture.contradictory",
        "description": "Multiple contradictory apertures selected.",
        "tags": ["aperture"],
    },
    {
        "id": "weights.too_many_high",
        "description": "More than 5 concepts have weight > 2.0.",
        "tags": ["weights"],
    },
    {
        "id": "weights.too_many_hard",
        "description": "More than 2 concepts have weight > 2.7.",
        "tags": ["weights"],
    },
    {
        "id": "weights.absolute_max_exceeded",
        "description": "A weight exceeds the documented 3.0 ceiling.",
        "tags": ["weights"],
    },
]


def main() -> None:
    out_path = os.path.join(ROOT, "presets", "conflicts.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"schema_version": 1, "conflicts": CONFLICTS}, f, indent=2)
    print(f"Wrote {len(CONFLICTS)} conflict rules to {out_path}")


if __name__ == "__main__":
    main()
