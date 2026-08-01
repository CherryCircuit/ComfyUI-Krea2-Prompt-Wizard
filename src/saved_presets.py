"""Local persistence for user-created prompt, group, character, and setting presets."""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Iterable, List

from .schemas import SCHEMA_VERSION
from .user_paths import atomic_write, timestamp_backup, user_saved_presets_path


def _clean_preset(item: Any) -> Dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    preset_id = str(item.get("id") or "").strip()
    label = str(item.get("label") or "").strip()
    scope = str(item.get("scope") or "").strip()
    if not preset_id or not label or scope not in {"full", "group", "character", "setting"}:
        return None
    if scope == "character":
        character = item.get("character")
        if not isinstance(character, dict):
            return None
        return {
            "id": preset_id,
            "label": label,
            "scope": scope,
            "character": dict(character),
        }
    if scope == "setting":
        setting = item.get("setting")
        if not isinstance(setting, dict):
            return None
        return {
            "id": preset_id,
            "label": label,
            "scope": scope,
            "setting": dict(setting),
        }
    rows = item.get("rows")
    if not isinstance(rows, list):
        return None
    return {
        "id": preset_id,
        "label": label,
        "scope": scope,
        "group": str(item.get("group") or ""),
        "base_prompt": str(item.get("base_prompt") or ""),
        "randomize_on_job": dict(item.get("randomize_on_job") or {})
        if isinstance(item.get("randomize_on_job"), dict)
        else {},
        "creative_mode": str(item.get("creative_mode") or "photo"),
        "rows": [dict(row) for row in rows if isinstance(row, dict)],
    }


DEFAULT_GROUP_PRESETS = [
    # ── Subject & Expression ──────────────────────────────────────
    {
        "id": "group.cinematic_portrait_subject",
        "label": "Cinematic Portrait Subject",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_sub_1", "category": "body", "preset_id": "body.shoulders_pulled_back", "phrase": "shoulders pulled back", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sub_2", "category": "emotion", "preset_id": "emotion.pride", "phrase": "pride", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sub_3", "category": "gaze", "preset_id": "gaze.looking_directly_into_the_camera", "phrase": "looking directly into the camera", "intensity": 70, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.anger_explosion",
        "label": "Anger Explosion",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_ang_1", "category": "emotion", "preset_id": "emotion.anger", "phrase": "anger", "intensity": 85, "control_mode": "scalar", "enabled": True},
            {"id": "p_ang_2", "category": "face", "preset_id": "face.upper_lip_raiser", "phrase": "upper lip raised in snarl", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_ang_3", "category": "face", "preset_id": "face.brow_lowerer", "phrase": "brow lowerer", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_ang_4", "category": "gaze", "preset_id": "gaze.fixed_intense_stare", "phrase": "fixed intense stare", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_ang_5", "category": "body", "preset_id": "body.confident_stance", "phrase": "confident stance", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.joyful_laughter",
        "label": "Joyful Laughter",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_jol_1", "category": "emotion", "preset_id": "emotion.joy", "phrase": "joy", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_jol_2", "category": "mouth", "preset_id": "mouth.laughing", "phrase": "laughing with mouth open", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_jol_3", "category": "face", "preset_id": "face.cheek_raiser", "phrase": "cheeks raised in smile", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_jol_4", "category": "body", "preset_id": "body.relaxed_posture", "phrase": "relaxed posture", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.melancholy_mood",
        "label": "Melancholy Mood",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_mel_1", "category": "emotion", "preset_id": "emotion.sadness", "phrase": "sadness", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_mel_2", "category": "gaze", "preset_id": "gaze.looking_downward", "phrase": "looking downward", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_mel_3", "category": "body", "preset_id": "body.relaxed_posture", "phrase": "relaxed posture", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_mel_4", "category": "face", "preset_id": "face.inner_brow_raiser", "phrase": "inner brow raiser", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.suspenseful_stare",
        "label": "Suspenseful Stare",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_sus_1", "category": "gaze", "preset_id": "gaze.wide_open_eyes", "phrase": "wide open eyes", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_sus_2", "category": "emotion", "preset_id": "emotion.surprise", "phrase": "surprise", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_sus_3", "category": "body", "preset_id": "body.standing_rigidly", "phrase": "standing rigidly", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },

    # ── Camera & Film ────────────────────────────────────────────
    {
        "id": "group.cinematic_camera_film",
        "label": "Cinematic Camera & Film",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_cam_1", "category": "framing", "preset_id": "framing.close_up", "phrase": "close-up shot", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_cam_2", "category": "lens", "preset_id": "lens.85mm_portrait", "phrase": "85mm lens portrait", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cam_3", "category": "aperture", "preset_id": "aperture.shallow_depth_of_field", "phrase": "shallow depth of field", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_cam_4", "category": "film_color", "preset_id": "film_color.kodak_vision3_250d", "phrase": "Kodak Vision3 250D film stock", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.wide_epic_landscape",
        "label": "Wide Epic Landscape",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_epc_1", "category": "framing", "preset_id": "framing.wide_establishing_shot", "phrase": "wide establishing shot", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_epc_2", "category": "lens", "preset_id": "lens.14mm_ultra_wide", "phrase": "14mm ultra-wide", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_epc_3", "category": "aperture", "preset_id": "aperture.deep_focus", "phrase": "deep focus", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_epc_4", "category": "angle", "preset_id": "angle.low_angle", "phrase": "low angle", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_epc_5", "category": "composition", "preset_id": "composition.rule_of_thirds", "phrase": "rule of thirds composition", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.handheld_docudrama",
        "label": "Handheld Docudrama",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_doc_1", "category": "camera_movement", "preset_id": "camera_movement.handheld_camera", "phrase": "handheld camera", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_doc_2", "category": "framing", "preset_id": "framing.medium_shot", "phrase": "medium shot", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_doc_3", "category": "angle", "preset_id": "angle.eye_level", "phrase": "eye level", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_doc_4", "category": "film_color", "preset_id": "film_color.desaturated_palette", "phrase": "desaturated palette", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.dutch_angle_thriller",
        "label": "Dutch Angle Thriller",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_dut_1", "category": "angle", "preset_id": "angle.dutch_angle", "phrase": "dutch angle", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_dut_2", "category": "framing", "preset_id": "framing.extreme_close_up", "phrase": "extreme close-up", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_dut_3", "category": "composition", "preset_id": "composition.diagonal_composition", "phrase": "diagonal composition", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_dut_4", "category": "camera_movement", "preset_id": "camera_movement.slow_zoom", "phrase": "slow zoom", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.aerial_drone_shot",
        "label": "Aerial Drone Shot",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_aer_1", "category": "angle", "preset_id": "angle.birds_eye_view", "phrase": "bird's-eye view", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_aer_2", "category": "camera_movement", "preset_id": "camera_movement.crane_movement", "phrase": "crane movement", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_aer_3", "category": "lens", "preset_id": "lens.50mm_normal", "phrase": "50mm normal", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },

    # ── Lighting ─────────────────────────────────────────────────
    {
        "id": "group.rembrandt_lighting",
        "label": "Rembrandt Studio Lighting",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_lit_1", "category": "lighting_setup", "preset_id": "lighting_setup.rembrandt_lighting", "phrase": "Rembrandt lighting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_lit_2", "category": "lighting_direction", "preset_id": "lighting_direction.rim_lighting", "phrase": "rim lighting", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.backlit_dramatic",
        "label": "Backlit Dramatic",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_bkl_1", "category": "lighting_direction", "preset_id": "lighting_direction.backlighting", "phrase": "backlighting", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_bkl_2", "category": "lighting_effect", "preset_id": "lighting_effect.anamorphic_lens_flare", "phrase": "anamorphic lens flare", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_bkl_3", "category": "lighting_setup", "preset_id": "lighting_setup.high_key_lighting", "phrase": "high key background", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.moody_noir_chiaroscuro",
        "label": "Moody Noir Chiaroscuro",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_noi_1", "category": "lighting_setup", "preset_id": "lighting_setup.low_key_lighting", "phrase": "low key lighting", "intensity": 85, "control_mode": "scalar", "enabled": True},
            {"id": "p_noi_2", "category": "lighting_direction", "preset_id": "lighting_direction.side_lighting", "phrase": "side lighting", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_noi_3", "category": "lighting_effect", "preset_id": "lighting_effect.hard_graphic_shadows", "phrase": "hard graphic shadows", "intensity": 70, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.soft_diffused_beauty",
        "label": "Soft Diffused Beauty",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_sft_1", "category": "lighting_setup", "preset_id": "lighting_setup.soft_diffused_lighting", "phrase": "soft diffused lighting", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_sft_2", "category": "lighting_direction", "preset_id": "lighting_direction.front_lighting", "phrase": "front lighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_sft_3", "category": "lighting_effect", "preset_id": "lighting_effect.soft_feathered_shadows", "phrase": "soft feathered shadows", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.neon_cyberpunk_glow",
        "label": "Neon Cyberpunk Glow",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_nln_1", "category": "lighting_effect", "preset_id": "lighting_effect.pulsing_neon", "phrase": "pulsing neon", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_nln_2", "category": "lighting_setup", "preset_id": "lighting_setup.neon_lighting", "phrase": "neon lighting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_nln_3", "category": "lighting_setup", "preset_id": "lighting_setup.mixed_colour_practical_lighting", "phrase": "mixed-colour practical lighting", "intensity": 70, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.golden_hour_warmth",
        "label": "Golden Hour Warmth",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_ghw_1", "category": "lighting_setup", "preset_id": "lighting_setup.golden_hour_lighting", "phrase": "golden hour lighting", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_ghw_2", "category": "lighting_direction", "preset_id": "lighting_direction.backlighting", "phrase": "backlighting", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_ghw_3", "category": "lighting_effect", "preset_id": "lighting_effect.cinematic_light_halation", "phrase": "cinematic light halation", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    },

    # ── Environment ──────────────────────────────────────────────
    {
        "id": "group.golden_hour_atmosphere",
        "label": "Golden Hour Atmosphere",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_env_1", "category": "atmosphere", "preset_id": "atmosphere.light_haze", "phrase": "light atmospheric haze", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_env_2", "category": "atmosphere", "preset_id": "atmosphere.sunbeams_through_clouds", "phrase": "sunbeams through clouds", "intensity": 75, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.stormy_dramatic_sky",
        "label": "Stormy Dramatic Sky",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_stm_1", "category": "atmosphere", "preset_id": "atmosphere.billowing_storm_clouds", "phrase": "billowing storm clouds", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_stm_2", "category": "environment_movement", "preset_id": "environment_movement.leaves_moving_through_air", "phrase": "leaves moving through air", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_stm_3", "category": "atmosphere", "preset_id": "atmosphere.thunderstorm", "phrase": "thunderstorm", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.foggy_mysterious",
        "label": "Foggy Mysterious",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_fog_1", "category": "atmosphere", "preset_id": "atmosphere.dense_cinematic_fog", "phrase": "dense cinematic fog", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_fog_2", "category": "environment_movement", "preset_id": "environment_movement.smoke_drifting", "phrase": "smoke drifting slowly", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.rainy_neon_streets",
        "label": "Rainy Neon Streets",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_ran_1", "category": "atmosphere", "preset_id": "atmosphere.heavy_rain", "phrase": "heavy rain", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_ran_2", "category": "environment_movement", "preset_id": "environment_movement.rain_driven_sideways", "phrase": "rain driven sideways", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },

    # ── Style & Finish ──────────────────────────────────────────
    {
        "id": "group.fashion_editorial_style",
        "label": "Fashion Editorial Style",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_sty_1", "category": "style", "preset_id": "style.fashion_editorial", "phrase": "fashion editorial photograph", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_sty_2", "category": "texture", "preset_id": "texture.smooth_clean_digital_texture", "phrase": "smooth clean digital texture", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.cinematic_film_grain",
        "label": "Cinematic Film Grain",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_fgr_1", "category": "style", "preset_id": "style.cinematic_film_still", "phrase": "cinematic film still", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_fgr_2", "category": "texture", "preset_id": "texture.heavy_film_grain", "phrase": "heavy film grain texture", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_fgr_3", "category": "detail", "preset_id": "detail.intricate_detail", "phrase": "intricate detail", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.painting_impasto",
        "label": "Oil Painting Impasto",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_imp_1", "category": "style", "preset_id": "style.oil_painting", "phrase": "oil painting", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_imp_2", "category": "texture", "preset_id": "texture.impasto_texture", "phrase": "impasto texture", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_imp_3", "category": "texture", "preset_id": "texture.visible_brushstrokes", "phrase": "visible brushstrokes", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.vintage_analogue_warmth",
        "label": "Vintage Analogue Warmth",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_vnt_1", "category": "style", "preset_id": "style.analog_35mm_photography", "phrase": "analog 35mm photography", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_vnt_2", "category": "texture", "preset_id": "texture.fine_film_grain", "phrase": "fine film grain", "intensity": 45, "control_mode": "scalar", "enabled": True},
            {"id": "p_vnt_3", "category": "detail", "preset_id": "detail.moderate_detail", "phrase": "moderate detail", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    }
]

DEFAULT_GROUP_PRESETS += [
    {
        "id": "group.heroic_resolve",
        "label": "Heroic Resolve",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_hr_1", "category": "body", "preset_id": "body.shoulders_pulled_back", "phrase": "shoulders pulled back", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_hr_2", "category": "emotion", "preset_id": "emotion.pride", "phrase": "pride", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_hr_3", "category": "gaze", "preset_id": "gaze.looking_slightly_off_camera", "phrase": "looking slightly off camera", "intensity": 55, "control_mode": "scalar", "enabled": True},
        ],
    },
    {
        "id": "group.natural_dialogue_camera",
        "label": "Natural Dialogue Camera",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_ndc_1", "category": "framing", "preset_id": "framing.medium_close_up", "phrase": "medium close-up", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_ndc_2", "category": "lens", "preset_id": "lens.50mm_normal", "phrase": "50mm normal lens", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_ndc_3", "category": "composition", "preset_id": "composition.rule_of_thirds", "phrase": "rule of thirds", "intensity": 55, "control_mode": "scalar", "enabled": True},
        ],
    },
    {
        "id": "group.practical_night_interior",
        "label": "Practical Night Interior",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_pni_1", "category": "lighting_setup", "preset_id": "lighting_setup.mixed_colour_practical_lighting", "phrase": "mixed-colour practical lighting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_pni_2", "category": "lighting_direction", "preset_id": "lighting_direction.side_lighting", "phrase": "side lighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_pni_3", "category": "lighting_effect", "preset_id": "lighting_effect.glowing_practical_lights", "phrase": "glowing practical lights", "intensity": 60, "control_mode": "scalar", "enabled": True},
        ],
    },
    {
        "id": "group.misty_morning",
        "label": "Misty Morning",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_mm_1", "category": "atmosphere", "preset_id": "atmosphere.mist", "phrase": "mist", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_mm_2", "category": "environment_movement", "preset_id": "environment_movement.gentle_breeze", "phrase": "gentle breeze", "intensity": 45, "control_mode": "scalar", "enabled": True},
        ],
    },
    {
        "id": "group.watercolour_paper",
        "label": "Watercolour on Paper",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_wp_1", "category": "style", "preset_id": "style.watercolour_painting", "phrase": "watercolour painting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_wp_2", "category": "texture", "preset_id": "texture.paper_grain", "phrase": "paper grain", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_wp_3", "category": "detail", "preset_id": "detail.moderate_detail", "phrase": "moderate detail", "intensity": 50, "control_mode": "scalar", "enabled": True},
        ],
    },
]


def load_saved_presets(path: str | None = None) -> List[Dict[str, Any]]:
    """Load saved presets, dropping malformed entries without affecting ComfyUI."""
    using_default_path = path is None
    target = path or user_saved_presets_path(create=False)
    if not os.path.exists(target):
        if using_default_path:
            return [{**p, "builtin": True} for p in DEFAULT_GROUP_PRESETS]
        return []
    try:
        with open(target, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return []
    raw = payload.get("presets", []) if isinstance(payload, dict) else []
    loaded = [cleaned for item in raw if (cleaned := _clean_preset(item)) is not None]
    if using_default_path:
        # Built-ins are always present. User presets supplement them instead
        # of replacing an entire category menu.
        builtin_ids = {str(p.get("id") or "") for p in DEFAULT_GROUP_PRESETS}
        seen = set()
        user_presets = []
        for preset in loaded:
            preset_id = str(preset.get("id") or "")
            if preset_id in builtin_ids or preset_id in seen:
                continue
            seen.add(preset_id)
            user_presets.append(preset)
        return [{**p, "builtin": True} for p in DEFAULT_GROUP_PRESETS] + user_presets
    return loaded


def save_saved_presets(
    presets: Iterable[Dict[str, Any]],
    path: str | None = None,
) -> str:
    """Validate and atomically save user-created presets with a backup."""
    target = path or user_saved_presets_path(create=True)
    cleaned = [
        preset
        for item in presets
        if not bool(item.get("builtin"))
        if (preset := _clean_preset(item)) is not None
    ]
    if os.path.exists(target):
        timestamp_backup(target)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "presets": cleaned,
    }
    atomic_write(
        target,
        json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
    )
    return target
