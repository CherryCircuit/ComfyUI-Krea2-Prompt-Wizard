"""Build the bundled randomizer recipes.

A recipe is a set of checkbox pools plus a pair of mode flags. The shipped
recipes are generated from collection names so their ids stay valid if the
universal library is regenerated.

Run from the repo root:

    python scripts/build_studio_recipes.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.studio.presets import load_store  # noqa: E402

OUT = os.path.join(ROOT, "presets", "studio", "recipes.json")


def slot(category: str, group: str) -> str:
    return f"{category}|{group}"


FACET_DEFAULTS = {
    slot("hair_color", "hair_color"): ("Blonde", "Brunette", "Red", "Black", "Fashion", "Fantasy"),
    slot("hair_color_style", "hair_color_style"): ("Technique",),
    slot("garment_color", "garment_color"): ("Neutrals", "Warm", "Cool", "Jewel", "Metallic"),
    slot("garment_pattern", "garment_pattern"): ("Pattern", "Texture"),
}

RECIPES = [
    {
        "id": "recipe_cozy_fantasy",
        "name": "Cozy Fantasy",
        "description": "Warm inns, soft practical light and storybook clothing. Good for calm character beats and tavern scenes.",
        "slots": {
            slot("scene", "scene"): ("Medieval", "Fantasy", "Nature", "Interior"),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Cinematic",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Genre", "Film Stock"),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Long", "Updo", "Fantasy", "Historical"),
            slot("wardrobe", "wardrobe_full"): ("Fantasy", "Historical", "Casual"),
            slot("emotion", "emotion"): ("Positive", "Complex"),
        },
    },
    {
        "id": "recipe_neon_noir",
        "name": "Neon Noir",
        "description": "Rain, neon, hard side light and streetwear. Built for tense night scenes and cyberpunk portraits.",
        "slots": {
            slot("scene", "scene"): ("Sci-Fi", "Urban", "Modern"),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Cinematic",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Genre",),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Short", "Colored"),
            slot("wardrobe", "wardrobe_outer"): ("Outerwear", "Streetwear"),
            slot("wardrobe", "wardrobe_mid"): ("Midlayer", "Streetwear"),
            slot("wardrobe", "wardrobe_base"): ("Baselayer", "Casual"),
            slot("wardrobe", "wardrobe_bottom"): ("Streetwear", "Casual"),
            slot("emotion", "emotion"): ("Complex", "Negative"),
        },
    },
    {
        "id": "recipe_school_drama",
        "name": "School Drama",
        "description": "Halls, classrooms, uniforms and natural daylight. A clean starting point for grounded teen stories.",
        "slots": {
            slot("scene", "scene"): ("School",),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Studio",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Genre",),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Short", "Medium"),
            slot("wardrobe", "wardrobe_full"): ("Uniform", "Casual"),
            slot("emotion", "emotion"): ("Complex", "Positive"),
        },
    },
    {
        "id": "recipe_sunlit_nature",
        "name": "Sunlit Nature",
        "description": "Golden light, open landscapes and outdoor clothing. Ideal for calm portraits and travel frames.",
        "slots": {
            slot("scene", "scene"): ("Nature", "Coastal"),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Studio",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Film Stock",),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Medium", "Long"),
            slot("wardrobe", "wardrobe_full"): ("Outdoors", "Casual"),
            slot("emotion", "emotion"): ("Positive",),
        },
    },
    {
        "id": "recipe_grim_horror",
        "name": "Grim Horror",
        "description": "Abandoned places, hard contrast and practical darkness. Use it for dread, decay and unstable frames.",
        "slots": {
            slot("scene", "scene"): ("Horror", "Industrial"),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Dramatic",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Genre",),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Short", "Medium"),
            slot("wardrobe", "wardrobe_full"): ("Workwear", "Post-Apocalyptic", "Historical"),
            slot("emotion", "emotion"): ("Negative", "Complex"),
        },
    },
    {
        "id": "recipe_historical_drama",
        "name": "Historical Drama",
        "description": "Period rooms, formal clothing, warm practical light and restrained camera work.",
        "slots": {
            slot("scene", "scene"): ("Historical", "Medieval"),
            slot("lighting", "lighting_time"): ("Natural",),
            slot("lighting", "lighting_source"): ("Practical",),
            slot("lighting", "lighting_quality"): ("Cinematic",),
            slot("lighting", "lighting_direction"): ("Direction",),
            slot("camera", "framing"): ("Framing",),
            slot("camera", "angle"): ("Angle",),
            slot("camera", "lens"): ("Lens",),
            slot("camera", "movement"): ("Movement",),
            slot("style", "style"): ("Genre", "Era"),
            slot("style", "color_grade"): ("Color Grade",),
            slot("hair", "hair"): ("Historical", "Updo"),
            slot("wardrobe", "wardrobe_full"): ("Historical", "Formal"),
            slot("emotion", "emotion"): ("Complex", "Positive"),
        },
    },
]


def main() -> None:
    store = load_store()
    recipes = []
    for spec in RECIPES:
        pools = {}
        slots = dict(spec["slots"])
        slots.update(FACET_DEFAULTS)
        for key, collections in slots.items():
            category, group = key.split("|", 1)
            ids = [
                preset.id
                for preset in store.all()
                if preset.enabled
                and preset.origin == "bundled"
                and preset.category == category
                and preset.exclusive_group == group
                and preset.collection in collections
            ]
            if not ids:
                raise SystemExit(f"{spec['id']}: no presets for {key} in {collections}")
            pools[key] = ids
        recipes.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "description": spec["description"],
                "randomize": True,
                "pools": pools,
                "picks": {},
            }
        )
    payload = {"schema_version": 1, "recipes": recipes}
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"wrote recipes.json: {len(recipes)} recipes")


if __name__ == "__main__":
    main()
