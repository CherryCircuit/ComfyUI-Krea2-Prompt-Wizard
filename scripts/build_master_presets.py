"""Generate the bundled master presets file.

Master presets are starting-point recipes for the wizard. Applying a
master preset adds one row per preset it references. Master presets
*add* rows; they do not replace the wizard state.

Each row's ``intensity`` honours the preset's ``default_strength`` so the
user can inspect and adjust immediately.
"""
from __future__ import annotations

import json
import os
import sys

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)

from src.schemas import SCHEMA_VERSION


# ---------------------------------------------------------------------------
# Master recipes
# ---------------------------------------------------------------------------

MASTER_PRESETS = [
    {
        "id": "master.cinematic_portrait",
        "label": "Cinematic Portrait",
        "description": "Classic cinematic close-up with Rembrandt lighting.",
        "rows": [
            {"preset_id": "framing.close_up", "intensity": 70},
            {"preset_id": "lighting_setup.rembrandt_lighting", "intensity": 60},
            {"preset_id": "face.upper_eyelid_raiser", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 75},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "film_color.kodak_vision3_250d", "intensity": 50},
            {"preset_id": "composition.symmetrical_composition", "intensity": 50},
        ],
    },
    {
        "id": "master.dynamic_action",
        "label": "Dynamic Action",
        "description": "Wide establishing freeze-frame with motion blur.",
        "rows": [
            {"preset_id": "framing.wide_establishing_shot", "intensity": 60},
            {"preset_id": "subject_movement.frozen_action", "intensity": 70},
            {"preset_id": "subject_movement.strong_motion_blur", "intensity": 60},
            {"preset_id": "camera_movement.handheld_camera", "intensity": 50},
            {"preset_id": "aperture.deep_focus", "intensity": 55},
            {"preset_id": "lens.24mm_wide", "intensity": 50},
            {"preset_id": "composition.diagonal_composition", "intensity": 55},
        ],
    },
    {
        "id": "master.fashion_editorial",
        "label": "Fashion Editorial",
        "description": "Studio beauty shot with flash and saturated grade.",
        "rows": [
            {"preset_id": "framing.medium_close_up", "intensity": 65},
            {"preset_id": "lighting_setup.direct_frontal_flash", "intensity": 65},
            {"preset_id": "lighting_setup.beauty_dish_lighting", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 60},
            {"preset_id": "film_color.rich_saturated_palette", "intensity": 55},
            {"preset_id": "style.fashion_editorial", "intensity": 65},
            {"preset_id": "gaze.looking_directly_into_the_camera", "intensity": 60},
        ],
    },
    {
        "id": "master.quiet_documentary",
        "label": "Quiet Documentary",
        "description": "Soft natural light, observational distance.",
        "rows": [
            {"preset_id": "framing.medium_shot", "intensity": 60},
            {"preset_id": "lighting_setup.window_lighting", "intensity": 60},
            {"preset_id": "lighting_setup.overcast_natural_lighting", "intensity": 55},
            {"preset_id": "lens.35mm_documentary", "intensity": 60},
            {"preset_id": "film_color.kodak_portra_400", "intensity": 55},
            {"preset_id": "style.documentary_photography", "intensity": 60},
            {"preset_id": "gaze.looking_slightly_off_camera", "intensity": 50},
        ],
    },
    {
        "id": "master.direct_flash_snapshot",
        "label": "Direct-Flash Snapshot",
        "description": "Disposable-camera look with hard direct flash.",
        "rows": [
            {"preset_id": "framing.medium_close_up", "intensity": 60},
            {"preset_id": "lighting_setup.direct_frontal_flash", "intensity": 75},
            {"preset_id": "lighting_setup.on_camera_flash", "intensity": 50},
            {"preset_id": "lens.28mm_wide", "intensity": 55},
            {"preset_id": "film_color.faded_vintage_colour", "intensity": 55},
            {"preset_id": "style.direct_flash_snapshot", "intensity": 70},
            {"preset_id": "camera_body.disposable_35mm_camera", "intensity": 50},
        ],
    },
    {
        "id": "master.luminous_fantasy",
        "label": "Luminous Fantasy",
        "description": "Volumetric, glowing fantasy atmosphere.",
        "rows": [
            {"preset_id": "lighting_effect.volumetric_light", "intensity": 70},
            {"preset_id": "lighting_effect.god_rays", "intensity": 65},
            {"preset_id": "lighting_effect.cinematic_light_halation", "intensity": 60},
            {"preset_id": "atmosphere.dense_cinematic_fog", "intensity": 60},
            {"preset_id": "lighting_setup.soft_diffused_lighting", "intensity": 55},
            {"preset_id": "style.matte_painting", "intensity": 55},
        ],
    },
    {
        "id": "master.moody_film_still",
        "label": "Moody Film Still",
        "description": "Low-key dramatic middle shot reminiscent of a 70s film.",
        "rows": [
            {"preset_id": "framing.medium_shot", "intensity": 60},
            {"preset_id": "lighting_setup.low_key_lighting", "intensity": 65},
            {"preset_id": "lighting_setup.chiaroscuro", "intensity": 60},
            {"preset_id": "lighting_direction.rim_lighting", "intensity": 55},
            {"preset_id": "film_color.kodak_vision3_500t", "intensity": 55},
            {"preset_id": "film_color.bleach_bypass", "intensity": 55},
            {"preset_id": "style.cinematic_film_still", "intensity": 65},
        ],
    },
    {
        "id": "master.product_hero",
        "label": "Product Hero",
        "description": "Clean commercial product presentation.",
        "rows": [
            {"preset_id": "framing.medium_close_up", "intensity": 65},
            {"preset_id": "lighting_setup.large_softbox_lighting", "intensity": 65},
            {"preset_id": "lighting_setup.three_point_lighting", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 55},
            {"preset_id": "composition.centered_composition", "intensity": 55},
            {"preset_id": "texture.smooth_clean_digital_texture", "intensity": 55},
            {"preset_id": "style.commercial_product_photography", "intensity": 65},
        ],
    },
    {
        "id": "master.atmospheric_landscape",
        "label": "Atmospheric Landscape",
        "description": "Wide shot with golden-hour haze and backlight.",
        "rows": [
            {"preset_id": "framing.extreme_wide_shot", "intensity": 65},
            {"preset_id": "lighting_setup.golden_hour_lighting", "intensity": 70},
            {"preset_id": "lighting_direction.strong_backlighting", "intensity": 65},
            {"preset_id": "lighting_direction.rim_lighting", "intensity": 55},
            {"preset_id": "atmosphere.light_haze", "intensity": 55},
            {"preset_id": "lens.21mm_wide", "intensity": 55},
            {"preset_id": "composition.dense_edge_to_edge_composition", "intensity": 55},
        ],
    },
    {
        "id": "master.dense_fantasy_environment",
        "label": "Dense Fantasy Environment",
        "description": "Painterly fantasy scene with rich detail.",
        "rows": [
            {"preset_id": "composition.dense_edge_to_edge_composition", "intensity": 65},
            {"preset_id": "detail.intricate_detail", "intensity": 65},
            {"preset_id": "lighting_setup.mixed_colour_practical_lighting", "intensity": 55},
            {"preset_id": "lighting_effect.glowing_practical_lights", "intensity": 55},
            {"preset_id": "style.matte_painting", "intensity": 55},
            {"preset_id": "style.concept_art", "intensity": 55},
        ],
    },
    {
        "id": "master.analog_street_photography",
        "label": "Analog Street Photography",
        "description": "Candid street scene with grain and warm tone.",
        "rows": [
            {"preset_id": "framing.medium_shot", "intensity": 60},
            {"preset_id": "lens.35mm_documentary", "intensity": 60},
            {"preset_id": "film_color.kodak_portra_400", "intensity": 55},
            {"preset_id": "texture.fine_film_grain", "intensity": 55},
            {"preset_id": "style.street_photography", "intensity": 65},
            {"preset_id": "style.analog_35mm_photography", "intensity": 55},
            {"preset_id": "camera_movement.handheld_camera", "intensity": 50},
        ],
    },
    {
        "id": "master.dramatic_low_angle_character",
        "label": "Dramatic Low-Angle Character",
        "description": "Heroic low-angle with rim lighting.",
        "rows": [
            {"preset_id": "angle.low_angle", "intensity": 60},
            {"preset_id": "angle.extreme_low_angle", "intensity": 65},
            {"preset_id": "lighting_direction.rim_lighting", "intensity": 60},
            {"preset_id": "lighting_setup.low_key_lighting", "intensity": 55},
            {"preset_id": "body.shoulders_pulled_back", "intensity": 55},
            {"preset_id": "gaze.looking_directly_into_the_camera", "intensity": 60},
            {"preset_id": "composition.dense_edge_to_edge_composition", "intensity": 55},
        ],
    },
    {
        "id": "master.macro_nature",
        "label": "Macro Nature",
        "description": "Extreme close-up nature photography.",
        "rows": [
            {"preset_id": "framing.macro_close_up", "intensity": 70},
            {"preset_id": "lens.105mm_macro", "intensity": 60},
            {"preset_id": "aperture.foreground_bokeh", "intensity": 65},
            {"preset_id": "aperture.creamy_bokeh", "intensity": 55},
            {"preset_id": "lighting_direction.dappled_light_through_leaves", "intensity": 60},
            {"preset_id": "lighting_direction.light_from_above_and_behind", "intensity": 55},
            {"preset_id": "style.macro_photography", "intensity": 60},
        ],
    },
    {
        "id": "master.horror_chiaroscuro",
        "label": "Horror Chiaroscuro",
        "description": "Hard shadows, low key, distressed atmosphere.",
        "rows": [
            {"preset_id": "lighting_setup.chiaroscuro", "intensity": 75},
            {"preset_id": "lighting_setup.hard_directional_lighting", "intensity": 60},
            {"preset_id": "lighting_direction.underlighting", "intensity": 65},
            {"preset_id": "lighting_effect.hard_graphic_shadows", "intensity": 60},
            {"preset_id": "lighting_effect.underexposed_shadows", "intensity": 55},
            {"preset_id": "film_color.high_contrast_black_and_white", "intensity": 60},
            {"preset_id": "atmosphere.dense_cinematic_fog", "intensity": 55},
        ],
    },
    {
        "id": "master.soft_romantic_portrait",
        "label": "Soft Romantic Portrait",
        "description": "Soft warm portrait with vintage character.",
        "rows": [
            {"preset_id": "framing.close_up", "intensity": 65},
            {"preset_id": "lighting_setup.soft_diffused_lighting", "intensity": 65},
            {"preset_id": "lighting_setup.window_lighting", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 60},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "film_color.warm_golden_palette", "intensity": 55},
            {"preset_id": "lens_family.soft_focus_portrait_lens", "intensity": 50},
        ],
    },
    {
        "id": "master.over_the_shoulder",
        "label": "Over-the-Shoulder Dialogue",
        "description": "Classic OTS shot for two-character conversation.",
        "setting": {
            "name": "Dim cafe booth",
            "description": "a cozy cafe booth with warm practical lamps and a window to a rainy street",
        },
        "rows": [
            {"preset_id": "framing.over_the_shoulder_shot", "intensity": 60},
            {"preset_id": "angle.shoulder_level_camera", "intensity": 55},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 60},
            {"preset_id": "lighting_setup.three_point_lighting", "intensity": 50},
            {"preset_id": "lighting_effect.cinematic_light_halation", "intensity": 50},
            {"preset_id": "atmosphere.light_haze", "intensity": 40},
            {"preset_id": "film_color.kodak_vision3_500t", "intensity": 45},
            {"preset_id": "style.cinematic_film_still", "intensity": 55},
        ],
    },
    {
        "id": "master.two_character_conversation",
        "label": "Two-Character Conversation",
        "description": "Balanced two-shot for an exchange between two characters.",
        "setting": {
            "name": "Apartment living room",
            "description": "a lived-in evening apartment living room with soft practical lighting and city-window views",
        },
        "rows": [
            {"preset_id": "framing.two_shot", "intensity": 60},
            {"preset_id": "composition.subject_on_left", "intensity": 50},
            {"preset_id": "composition.subject_on_right", "intensity": 50},
            {"preset_id": "lens.50mm_normal", "intensity": 50},
            {"preset_id": "aperture.moderate_depth_of_field", "intensity": 55},
            {"preset_id": "lighting_setup.mixed_colour_practical_lighting", "intensity": 55},
            {"preset_id": "lighting_effect.glowing_practical_lights", "intensity": 50},
            {"preset_id": "camera_movement.locked_off_camera", "intensity": 50},
        ],
    },
    {
        "id": "master.reaction_close_up",
        "label": "Reaction Close-Up",
        "description": "Tight close-up that isolates one character's face.",
        "setting": {
            "name": "Interrogation room",
            "description": "a stark institutional room with a single overhead light and bare walls",
        },
        "rows": [
            {"preset_id": "framing.close_up", "intensity": 65},
            {"preset_id": "angle.eye_level", "intensity": 50},
            {"preset_id": "lens.100mm_portrait", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 60},
            {"preset_id": "lighting_setup.low_key_lighting", "intensity": 55},
            {"preset_id": "lighting_direction.top_lighting", "intensity": 50},
            {"preset_id": "film_color.kodak_vision3_250d", "intensity": 50},
            {"preset_id": "composition.centered_composition", "intensity": 50},
        ],
    },
    {
        "id": "master.reverse_shot",
        "label": "Reverse Shot",
        "description": "Mirrored medium shot looking back at the first speaker.",
        "setting": {
            "name": "Dim cafe booth",
            "description": "a cozy cafe booth with warm practical lamps and a window to a rainy street",
        },
        "rows": [
            {"preset_id": "framing.medium_close_up", "intensity": 60},
            {"preset_id": "angle.shoulder_level_camera", "intensity": 55},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 60},
            {"preset_id": "lighting_setup.low_key_lighting", "intensity": 55},
            {"preset_id": "film_color.kodak_vision3_500t", "intensity": 50},
            {"preset_id": "composition.subject_on_left", "intensity": 55},
        ],
    },
    {
        "id": "master.establishing_duo",
        "label": "Establishing Duo",
        "description": "Wide establishing shot placing two characters in a location.",
        "setting": {
            "name": "Grand central station",
            "description": "a monumental railway concourse with a vaulted ceiling, departure boards, streams of travellers, and shafts of daylight",
        },
        "rows": [
            {"preset_id": "framing.wide_shot", "intensity": 60},
            {"preset_id": "framing.two_shot", "intensity": 50},
            {"preset_id": "lens.35mm_documentary", "intensity": 55},
            {"preset_id": "aperture.moderate_depth_of_field", "intensity": 55},
            {"preset_id": "composition.layered_foreground_midground_and_background", "intensity": 55},
            {"preset_id": "lighting_setup.window_lighting", "intensity": 50},
            {"preset_id": "atmosphere.sunbeams_through_clouds", "intensity": 55},
            {"preset_id": "camera_movement.locked_off_camera", "intensity": 50},
        ],
    },
    {
        "id": "master.intimate_two_shot",
        "label": "Intimate Two-Shot",
        "description": "Close two-shot for an emotional beat between characters.",
        "setting": {
            "name": "Rainy night street",
            "description": "a rain-soaked downtown street at night with glowing storefronts and neon reflections",
        },
        "rows": [
            {"preset_id": "framing.two_shot", "intensity": 60},
            {"preset_id": "framing.close_up", "intensity": 45},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 65},
            {"preset_id": "lighting_setup.neon_lighting", "intensity": 55},
            {"preset_id": "lighting_direction.rim_lighting", "intensity": 50},
            {"preset_id": "atmosphere.light_rain", "intensity": 50},
            {"preset_id": "film_color.warm_golden_palette", "intensity": 50},
        ],
    },
    {
        "id": "master.dolly_in_duo",
        "label": "Dolly-In Reveal",
        "description": "Slow push-in on two characters as the scene's stakes rise.",
        "setting": {
            "name": "Underground bunker",
            "description": "a reinforced underground bunker with concrete corridors, heavy doors, utility pipes, and stark emergency lighting",
        },
        "rows": [
            {"preset_id": "framing.medium_shot", "intensity": 55},
            {"preset_id": "camera_movement.dolly_in", "intensity": 60},
            {"preset_id": "lens.40mm_natural_wide", "intensity": 50},
            {"preset_id": "aperture.moderate_depth_of_field", "intensity": 55},
            {"preset_id": "lighting_setup.hard_directional_lighting", "intensity": 55},
            {"preset_id": "lighting_effect.underexposed_shadows", "intensity": 50},
            {"preset_id": "composition.leading_lines", "intensity": 55},
            {"preset_id": "film_color.desaturated_palette", "intensity": 50},
        ],
    },
    {
        "id": "master.high_angle_duo",
        "label": "High-Angle Overlook",
        "description": "Looking down at two characters to read their relative power.",
        "setting": {
            "name": "Museum gallery",
            "description": "a quiet contemporary museum gallery with large artworks, polished floors, and controlled exhibition lighting",
        },
        "rows": [
            {"preset_id": "framing.two_shot", "intensity": 55},
            {"preset_id": "angle.high_angle", "intensity": 60},
            {"preset_id": "lens.35mm_documentary", "intensity": 55},
            {"preset_id": "aperture.deep_focus", "intensity": 60},
            {"preset_id": "lighting_setup.soft_diffused_lighting", "intensity": 55},
            {"preset_id": "composition.symmetrical_composition", "intensity": 50},
            {"preset_id": "atmosphere.clear_air", "intensity": 45},
        ],
    },
    {
        "id": "master.pov_conversation",
        "label": "POV Conversation",
        "description": "See the scene through one character's eyes.",
        "setting": {
            "name": "Cozy coffee shop",
            "description": "an intimate independent coffee shop with wood tables, warm lamps, plants, and street-facing windows",
        },
        "rows": [
            {"preset_id": "framing.point_of_view_shot", "intensity": 65},
            {"preset_id": "perspective.intimate_camera_distance", "intensity": 60},
            {"preset_id": "lens.50mm_normal", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 55},
            {"preset_id": "lighting_setup.window_lighting", "intensity": 55},
            {"preset_id": "lighting_effect.cinematic_light_halation", "intensity": 45},
            {"preset_id": "film_color.kodak_portra_400", "intensity": 50},
        ],
    },
    {
        "id": "master.exterior_duel",
        "label": "Exterior Standoff",
        "description": "Two characters facing off in a wide exterior frame.",
        "setting": {
            "name": "Desert",
            "description": "a vast cinematic desert with layered dunes, heat haze, wind-shaped sand, and distant terrain",
        },
        "rows": [
            {"preset_id": "framing.wide_shot", "intensity": 65},
            {"preset_id": "framing.two_shot", "intensity": 55},
            {"preset_id": "angle.low_angle", "intensity": 55},
            {"preset_id": "lens.28mm_wide", "intensity": 55},
            {"preset_id": "aperture.deep_focus", "intensity": 60},
            {"preset_id": "lighting_setup.golden_hour_lighting", "intensity": 65},
            {"preset_id": "lighting_direction.strong_backlighting", "intensity": 55},
            {"preset_id": "atmosphere.heat_shimmer", "intensity": 55},
            {"preset_id": "composition.diagonal_composition", "intensity": 55},
            {"preset_id": "film_color.warm_golden_palette", "intensity": 55},
        ],
    },
    {
        "id": "master.closet_scene",
        "label": "Closet Scene",
        "description": "Extreme close-ups cut against a two-shot for a tense exchange.",
        "setting": {
            "name": "Back alley",
            "description": "a narrow cinematic back alley with service doors, fire escapes, wet pavement, and motivated practical lights",
        },
        "rows": [
            {"preset_id": "framing.extreme_close_up", "intensity": 60},
            {"preset_id": "framing.two_shot", "intensity": 50},
            {"preset_id": "lens.85mm_portrait", "intensity": 55},
            {"preset_id": "aperture.shallow_depth_of_field", "intensity": 65},
            {"preset_id": "lighting_setup.low_key_lighting", "intensity": 60},
            {"preset_id": "lighting_direction.side_lighting", "intensity": 55},
            {"preset_id": "lighting_effect.hard_graphic_shadows", "intensity": 55},
            {"preset_id": "atmosphere.dense_cinematic_fog", "intensity": 50},
            {"preset_id": "film_color.high_contrast_black_and_white", "intensity": 50},
        ],
    },
    {
        "id": "master.sunrise_window_two_shot",
        "label": "Sunrise Window Two-Shot",
        "description": "Soft morning window light on two characters seated together.",
        "setting": {
            "name": "Suburban house — kitchen",
            "description": "a warm suburban family kitchen with an island, cupboards, and natural daylight",
        },
        "rows": [
            {"preset_id": "framing.medium_shot", "intensity": 60},
            {"preset_id": "framing.two_shot", "intensity": 55},
            {"preset_id": "lens.50mm_normal", "intensity": 55},
            {"preset_id": "aperture.moderate_depth_of_field", "intensity": 55},
            {"preset_id": "lighting_setup.window_lighting", "intensity": 70},
            {"preset_id": "lighting_setup.overcast_natural_lighting", "intensity": 50},
            {"preset_id": "film_color.kodak_portra_400", "intensity": 55},
            {"preset_id": "style.documentary_photography", "intensity": 50},
        ],
    },
]


def main() -> None:
    output = {
        "schema_version": SCHEMA_VERSION,
        "master_presets": MASTER_PRESETS,
    }
    out_path = os.path.join(ROOT, "presets", "master_presets.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(MASTER_PRESETS)} master presets to {out_path}")


if __name__ == "__main__":
    main()
