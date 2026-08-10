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
    # ── Subject & Expression: character-direction looks ──────────────
    {
        "id": "group.heartbroken",
        "label": "Heartbroken",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_hb_1", "category": "emotion", "preset_id": "emotion.grief", "phrase": "grief", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_hb_2", "category": "face", "preset_id": "face.tear_filled_eyes", "phrase": "tear-filled eyes", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_hb_3", "category": "mouth", "preset_id": "mouth.sobbing", "phrase": "sobbing", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_hb_4", "category": "body", "preset_id": "body.hunched_shoulders", "phrase": "hunched shoulders", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.furious_rage",
        "label": "Furious Rage",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_fr_1", "category": "emotion", "preset_id": "emotion.rage", "phrase": "rage", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_fr_2", "category": "face", "preset_id": "face.upper_lip_raiser", "phrase": "raised upper lip in a snarl", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_fr_3", "category": "mouth", "preset_id": "mouth.shouting", "phrase": "shouting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_fr_4", "category": "body", "preset_id": "body.clenched_fists", "phrase": "clenched fists", "intensity": 70, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.playful_flirt",
        "label": "Playful Flirt",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_pf_1", "category": "emotion", "preset_id": "emotion.amusement", "phrase": "amusement", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_pf_2", "category": "mouth", "preset_id": "mouth.smirk", "phrase": "smirk", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_pf_3", "category": "gaze", "preset_id": "gaze.looking_toward_another_subject", "phrase": "looking toward another subject", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_pf_4", "category": "body", "preset_id": "body.leaning_forward", "phrase": "leaning forward", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.nervous_first_date",
        "label": "Nervous First Date",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_nf_1", "category": "emotion", "preset_id": "emotion.nervousness", "phrase": "nervousness", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_nf_2", "category": "mouth", "preset_id": "mouth.biting_lower_lip", "phrase": "biting lower lip", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_nf_3", "category": "gaze", "preset_id": "gaze.avoiding_eye_contact", "phrase": "avoiding eye contact", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_nf_4", "category": "body", "preset_id": "body.tense_posture", "phrase": "tense posture", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.triumphant_victory",
        "label": "Triumphant Victory",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_tv_1", "category": "emotion", "preset_id": "emotion.elation", "phrase": "elation", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_tv_2", "category": "mouth", "preset_id": "mouth.broad_smile", "phrase": "broad smile", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_tv_3", "category": "body", "preset_id": "body.shoulders_pulled_back", "phrase": "shoulders pulled back", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_tv_4", "category": "gaze", "preset_id": "gaze.looking_upward", "phrase": "looking upward", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.terrified_frozen",
        "label": "Terrified & Frozen",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_tf_1", "category": "emotion", "preset_id": "emotion.terror", "phrase": "terror", "intensity": 80, "control_mode": "scalar", "enabled": True},
            {"id": "p_tf_2", "category": "face", "preset_id": "face.upper_eyelid_raiser", "phrase": "raised upper eyelids", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_tf_3", "category": "mouth", "preset_id": "mouth.gasping", "phrase": "gasping", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_tf_4", "category": "body", "preset_id": "body.standing_rigidly", "phrase": "standing rigidly", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.exhausted_soldier",
        "label": "Exhausted Soldier",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_es_1", "category": "emotion", "preset_id": "emotion.fatigue", "phrase": "fatigue", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_es_2", "category": "body", "preset_id": "body.exhausted_posture", "phrase": "exhausted posture", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_es_3", "category": "gaze", "preset_id": "gaze.eyes_half_closed", "phrase": "eyes half closed", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_es_4", "category": "mouth", "preset_id": "mouth.parted_lips", "phrase": "parted lips", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.commanding_presence",
        "label": "Commanding Presence",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_cp_1", "category": "emotion", "preset_id": "emotion.determination", "phrase": "determination", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_cp_2", "category": "body", "preset_id": "body.confident_stance", "phrase": "confident stance", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_cp_3", "category": "gaze", "preset_id": "gaze.fixed_intense_stare", "phrase": "fixed intense stare", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_cp_4", "category": "body", "preset_id": "body.shoulders_pulled_back", "phrase": "shoulders pulled back", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.shy_admission",
        "label": "Shy Admission",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_sa_1", "category": "emotion", "preset_id": "emotion.embarrassment", "phrase": "embarrassment", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sa_2", "category": "gaze", "preset_id": "gaze.avoiding_eye_contact", "phrase": "avoiding eye contact", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sa_3", "category": "mouth", "preset_id": "mouth.biting_lower_lip", "phrase": "biting lower lip", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_sa_4", "category": "body", "preset_id": "body.tense_posture", "phrase": "tense posture", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.radiant_joy",
        "label": "Radiant Joy",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_rj_1", "category": "emotion", "preset_id": "emotion.joy", "phrase": "joy", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_rj_2", "category": "mouth", "preset_id": "mouth.gentle_smile", "phrase": "gentle smile", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_rj_3", "category": "face", "preset_id": "face.cheek_raiser", "phrase": "cheek raiser", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_rj_4", "category": "body", "preset_id": "body.open_posture", "phrase": "open posture", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.sneaky_plotting",
        "label": "Sneaky Plotting",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_sp_1", "category": "emotion", "preset_id": "emotion.suspicion", "phrase": "suspicion", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sp_2", "category": "gaze", "preset_id": "gaze.side_glance", "phrase": "side glance", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sp_3", "category": "mouth", "preset_id": "mouth.smirk", "phrase": "smirk", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sp_4", "category": "body", "preset_id": "body.hunched_shoulders", "phrase": "hunched shoulders", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.guilty_secret",
        "label": "Guilty Secret",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_gs_1", "category": "emotion", "preset_id": "emotion.guilt", "phrase": "guilt", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_gs_2", "category": "gaze", "preset_id": "gaze.avoiding_eye_contact", "phrase": "avoiding eye contact", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_gs_3", "category": "mouth", "preset_id": "mouth.pursed_lips", "phrase": "pursed lips", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_gs_4", "category": "body", "preset_id": "body.tense_posture", "phrase": "tense posture", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.heart_pounding_fear",
        "label": "Heart-Pounding Fear",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_hf_1", "category": "emotion", "preset_id": "emotion.panic", "phrase": "panic", "intensity": 75, "control_mode": "scalar", "enabled": True},
            {"id": "p_hf_2", "category": "face", "preset_id": "face.upper_eyelid_raiser", "phrase": "raised upper eyelids", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_hf_3", "category": "mouth", "preset_id": "mouth.gasping", "phrase": "gasping", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_hf_4", "category": "body", "preset_id": "body.recoiling", "phrase": "recoiling", "intensity": 65, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.wistful_memory",
        "label": "Wistful Memory",
        "scope": "group",
        "group": "subject_expression",
        "base_prompt": "",
        "rows": [
            {"id": "p_wm_1", "category": "emotion", "preset_id": "emotion.melancholy", "phrase": "melancholy", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_wm_2", "category": "gaze", "preset_id": "gaze.looking_into_the_distance", "phrase": "looking into the distance", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_wm_3", "category": "face", "preset_id": "face.inner_brow_raiser", "phrase": "inner brow raiser", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_wm_4", "category": "body", "preset_id": "body.relaxed_posture", "phrase": "relaxed posture", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    # ── Camera & Film: more shots ────────────────────────────────────
    {
        "id": "group.duo_close_ups",
        "label": "Duo Close-Ups",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_dcu_1", "category": "framing", "preset_id": "framing.two_shot", "phrase": "two-shot", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_dcu_2", "category": "framing", "preset_id": "framing.close_up", "phrase": "close-up", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_dcu_3", "category": "lens", "preset_id": "lens.85mm_portrait", "phrase": "85mm portrait", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_dcu_4", "category": "aperture", "preset_id": "aperture.shallow_depth_of_field", "phrase": "shallow depth of field", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.one_point_wide",
        "label": "One-Point Wide",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_opw_1", "category": "framing", "preset_id": "framing.wide_shot", "phrase": "wide shot", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_opw_2", "category": "perspective", "preset_id": "perspective.forced_perspective", "phrase": "forced perspective", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_opw_3", "category": "lens", "preset_id": "lens.28mm_wide", "phrase": "28mm wide", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_opw_4", "category": "composition", "preset_id": "composition.leading_lines", "phrase": "leading lines", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_opw_5", "category": "aperture", "preset_id": "aperture.deep_focus", "phrase": "deep focus", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.whip_pan_action",
        "label": "Whip-Pan Action",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_wpa_1", "category": "camera_movement", "preset_id": "camera_movement.whip_pan", "phrase": "whip pan", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_wpa_2", "category": "camera_movement", "preset_id": "camera_movement.handheld_camera", "phrase": "handheld camera", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_wpa_3", "category": "framing", "preset_id": "framing.close_up", "phrase": "close-up", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_wpa_4", "category": "lens", "preset_id": "lens.24mm_wide", "phrase": "24mm wide", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.static_observational",
        "label": "Static Observational",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_so_1", "category": "camera_movement", "preset_id": "camera_movement.locked_off_camera", "phrase": "locked-off camera", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_so_2", "category": "framing", "preset_id": "framing.medium_shot", "phrase": "medium shot", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_so_3", "category": "lens", "preset_id": "lens.35mm_documentary", "phrase": "35mm documentary", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_so_4", "category": "perspective", "preset_id": "perspective.observational_camera_distance", "phrase": "observational camera distance", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.shallow_telephoto_bokeh",
        "label": "Shallow Telephoto Bokeh",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_stb_1", "category": "framing", "preset_id": "framing.close_up", "phrase": "close-up", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_stb_2", "category": "lens", "preset_id": "lens.135mm_telephoto_portrait", "phrase": "135mm telephoto portrait", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_stb_3", "category": "aperture", "preset_id": "aperture.creamy_bokeh", "phrase": "creamy bokeh", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_stb_4", "category": "aperture", "preset_id": "aperture.background_bokeh", "phrase": "background bokeh", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.anamorphic_cinema",
        "label": "Anamorphic Cinema",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_ac_1", "category": "framing", "preset_id": "framing.wide_shot", "phrase": "wide shot", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_ac_2", "category": "lens_family", "preset_id": "lens_family.atlas_orion_anamorphic", "phrase": "Atlas Orion anamorphic", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_ac_3", "category": "lens_family", "preset_id": "lens_family.panavision_c_series_anamorphic", "phrase": "Panavision C Series anamorphic", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_ac_4", "category": "film_color", "preset_id": "film_color.muted_cinematic_palette", "phrase": "muted cinematic palette", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.fisheye_energy",
        "label": "Fisheye Energy",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_fe_1", "category": "framing", "preset_id": "framing.extreme_wide_shot", "phrase": "extreme wide shot", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_fe_2", "category": "lens", "preset_id": "lens.8mm_fisheye", "phrase": "8mm fisheye", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_fe_3", "category": "angle", "preset_id": "angle.low_angle", "phrase": "low angle", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_fe_4", "category": "composition", "preset_id": "composition.diagonal_composition", "phrase": "diagonal composition", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.top_down_surveillance",
        "label": "Top-Down Surveillance",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_tds_1", "category": "angle", "preset_id": "angle.top_down", "phrase": "top-down", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_tds_2", "category": "framing", "preset_id": "framing.medium_shot", "phrase": "medium shot", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_tds_3", "category": "camera_movement", "preset_id": "camera_movement.pedestal_up", "phrase": "pedestal up", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_tds_4", "category": "composition", "preset_id": "composition.symmetrical_composition", "phrase": "symmetrical composition", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.crane_sweep",
        "label": "Crane Sweep",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_cs_1", "category": "camera_movement", "preset_id": "camera_movement.crane_movement", "phrase": "crane movement", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_cs_2", "category": "framing", "preset_id": "framing.wide_shot", "phrase": "wide shot", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cs_3", "category": "angle", "preset_id": "angle.high_angle", "phrase": "high angle", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_cs_4", "category": "lens", "preset_id": "lens.21mm_wide", "phrase": "21mm wide", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.pov_immersion",
        "label": "POV Immersion",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_pov_1", "category": "framing", "preset_id": "framing.point_of_view_shot", "phrase": "point-of-view shot", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_pov_2", "category": "perspective", "preset_id": "perspective.camera_inside_the_action", "phrase": "camera inside the action", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_pov_3", "category": "camera_movement", "preset_id": "camera_movement.pov_movement", "phrase": "POV movement", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_pov_4", "category": "lens", "preset_id": "lens.24mm_wide", "phrase": "24mm wide", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.macro_intimacy",
        "label": "Macro Intimacy",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_mi_1", "category": "framing", "preset_id": "framing.macro_close_up", "phrase": "macro close-up", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_mi_2", "category": "lens", "preset_id": "lens.105mm_macro", "phrase": "105mm macro", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_mi_3", "category": "aperture", "preset_id": "aperture.foreground_bokeh", "phrase": "foreground bokeh", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_mi_4", "category": "aperture", "preset_id": "aperture.creamy_bokeh", "phrase": "creamy bokeh", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.clean_product_hero",
        "label": "Clean Product Hero",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_cph_1", "category": "framing", "preset_id": "framing.medium_close_up", "phrase": "medium close-up", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cph_2", "category": "lens", "preset_id": "lens.100mm_portrait", "phrase": "100mm portrait", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_cph_3", "category": "aperture", "preset_id": "aperture.moderate_depth_of_field", "phrase": "moderate depth of field", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_cph_4", "category": "composition", "preset_id": "composition.centered_composition", "phrase": "centered composition", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cph_5", "category": "camera_body", "preset_id": "camera_body.phase_one_xf", "phrase": "Phase One XF", "intensity": 40, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.war_zone_zoom",
        "label": "War-Zone Zoom",
        "scope": "group",
        "group": "camera_film",
        "base_prompt": "",
        "rows": [
            {"id": "p_wzz_1", "category": "lens", "preset_id": "lens.300mm_long_telephoto", "phrase": "300mm long telephoto", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_wzz_2", "category": "framing", "preset_id": "framing.medium_shot", "phrase": "medium shot", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_wzz_3", "category": "camera_movement", "preset_id": "camera_movement.snap_zoom", "phrase": "snap zoom", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_wzz_4", "category": "aperture", "preset_id": "aperture.deep_focus", "phrase": "deep focus", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_wzz_5", "category": "camera_movement", "preset_id": "camera_movement.handheld_camera", "phrase": "handheld camera", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    # ── Lighting: more looks ─────────────────────────────────────────
    {
        "id": "group.morning_window",
        "label": "Morning Window",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_mw_1", "category": "lighting_setup", "preset_id": "lighting_setup.window_lighting", "phrase": "window lighting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_mw_2", "category": "lighting_direction", "preset_id": "lighting_direction.side_lighting", "phrase": "side lighting", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_mw_3", "category": "lighting_effect", "preset_id": "lighting_effect.soft_feathered_shadows", "phrase": "soft feathered shadows", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.harsh_noon",
        "label": "Harsh Noon",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_hn_1", "category": "lighting_setup", "preset_id": "lighting_setup.midday_sunlight", "phrase": "midday sunlight", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_hn_2", "category": "lighting_direction", "preset_id": "lighting_direction.top_lighting", "phrase": "top lighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_hn_3", "category": "lighting_effect", "preset_id": "lighting_effect.hard_graphic_shadows", "phrase": "hard graphic shadows", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.blue_hour_dusk",
        "label": "Blue Hour Dusk",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_bhd_1", "category": "lighting_setup", "preset_id": "lighting_setup.blue_hour_lighting", "phrase": "blue-hour lighting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_bhd_2", "category": "lighting_direction", "preset_id": "lighting_direction.rim_lighting", "phrase": "rim lighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_bhd_3", "category": "lighting_effect", "preset_id": "lighting_effect.chromatic_flare", "phrase": "chromatic flare", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.single_candle",
        "label": "Single Candle",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_sc_1", "category": "lighting_setup", "preset_id": "lighting_setup.candlelight", "phrase": "candlelight", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_sc_2", "category": "lighting_direction", "preset_id": "lighting_direction.light_from_below", "phrase": "light from below", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_sc_3", "category": "lighting_effect", "preset_id": "lighting_effect.flickering_firelight", "phrase": "flickering firelight", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.campfire_warmth",
        "label": "Campfire Warmth",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_cw_1", "category": "lighting_setup", "preset_id": "lighting_setup.firelight", "phrase": "firelight", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_cw_2", "category": "lighting_effect", "preset_id": "lighting_effect.flickering_firelight", "phrase": "flickering firelight", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cw_3", "category": "lighting_direction", "preset_id": "lighting_direction.light_from_above_and_behind", "phrase": "light from above and behind", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.clinical_flat",
        "label": "Clinical Flat",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_cf_1", "category": "lighting_setup", "preset_id": "lighting_setup.fluorescent_lighting", "phrase": "fluorescent lighting", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_cf_2", "category": "lighting_effect", "preset_id": "lighting_effect.overexposed_highlights", "phrase": "overexposed highlights", "intensity": 45, "control_mode": "scalar", "enabled": True},
            {"id": "p_cf_3", "category": "lighting_direction", "preset_id": "lighting_direction.front_lighting", "phrase": "front lighting", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.spotlight_drama",
        "label": "Spotlight Drama",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_sd_1", "category": "lighting_setup", "preset_id": "lighting_setup.stage_spotlight", "phrase": "stage spotlight", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sd_2", "category": "lighting_direction", "preset_id": "lighting_direction.underlighting", "phrase": "underlighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_sd_3", "category": "lighting_effect", "preset_id": "lighting_effect.hard_graphic_shadows", "phrase": "hard graphic shadows", "intensity": 60, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.full_silhouette",
        "label": "Full Silhouette",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_fs_1", "category": "lighting_direction", "preset_id": "lighting_direction.silhouette_lighting", "phrase": "silhouette lighting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_fs_2", "category": "lighting_direction", "preset_id": "lighting_direction.strong_backlighting", "phrase": "strong backlighting", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_fs_3", "category": "lighting_setup", "preset_id": "lighting_setup.hard_directional_lighting", "phrase": "hard directional lighting", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.beauty_studio",
        "label": "Beauty Studio",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_bs_1", "category": "lighting_setup", "preset_id": "lighting_setup.beauty_dish_lighting", "phrase": "beauty-dish lighting", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_bs_2", "category": "lighting_setup", "preset_id": "lighting_setup.ring_light_illumination", "phrase": "ring-light illumination", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_bs_3", "category": "lighting_setup", "preset_id": "lighting_setup.large_softbox_lighting", "phrase": "large softbox lighting", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.nightmare_underlight",
        "label": "Nightmare Underlight",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_nu_1", "category": "lighting_direction", "preset_id": "lighting_direction.underlighting", "phrase": "underlighting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_nu_2", "category": "lighting_setup", "preset_id": "lighting_setup.low_key_lighting", "phrase": "low-key lighting", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_nu_3", "category": "lighting_effect", "preset_id": "lighting_effect.underexposed_shadows", "phrase": "underexposed shadows", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.high_key_bright",
        "label": "High-Key Bright",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_hkb_1", "category": "lighting_setup", "preset_id": "lighting_setup.high_key_lighting", "phrase": "high-key lighting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_hkb_2", "category": "lighting_setup", "preset_id": "lighting_setup.large_softbox_lighting", "phrase": "large softbox lighting", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_hkb_3", "category": "lighting_effect", "preset_id": "lighting_effect.soft_bloom", "phrase": "soft bloom", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.sea_caustics",
        "label": "Sea Caustics",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_sct_1", "category": "lighting_effect", "preset_id": "lighting_effect.caustic_reflections", "phrase": "caustic reflections", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_sct_2", "category": "lighting_setup", "preset_id": "lighting_setup.underwater_caustic_lighting", "phrase": "underwater caustic lighting", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sct_3", "category": "lighting_direction", "preset_id": "lighting_direction.light_from_above_and_behind", "phrase": "light from above and behind", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.halation_glow",
        "label": "Halation Glow",
        "scope": "group",
        "group": "lighting",
        "base_prompt": "",
        "rows": [
            {"id": "p_hg_1", "category": "lighting_effect", "preset_id": "lighting_effect.pronounced_halation", "phrase": "pronounced halation", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_hg_2", "category": "lighting_effect", "preset_id": "lighting_effect.light_leaks", "phrase": "light leaks", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_hg_3", "category": "lighting_setup", "preset_id": "lighting_setup.mixed_colour_practical_lighting", "phrase": "mixed-colour practical lighting", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    # ── Environment: more atmospheres ────────────────────────────────
    {
        "id": "group.autumn_leaf_storm",
        "label": "Autumn Leaf Storm",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_als_1", "category": "environment_movement", "preset_id": "environment_movement.leaves_moving_through_air", "phrase": "leaves moving through air", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_als_2", "category": "atmosphere", "preset_id": "atmosphere.wind", "phrase": "wind", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_als_3", "category": "environment_movement", "preset_id": "environment_movement.gentle_breeze", "phrase": "gentle breeze", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.dust_bowl",
        "label": "Dust Bowl",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_db_1", "category": "atmosphere", "preset_id": "atmosphere.dust", "phrase": "dust", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_db_2", "category": "environment_movement", "preset_id": "environment_movement.dust_moving_through_air", "phrase": "dust moving through air", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_db_3", "category": "atmosphere", "preset_id": "atmosphere.dry_desert_air", "phrase": "dry desert air", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.quiet_snowfall",
        "label": "Quiet Snowfall",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_qs_1", "category": "atmosphere", "preset_id": "atmosphere.heavy_snowfall", "phrase": "heavy snowfall", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_qs_2", "category": "environment_movement", "preset_id": "environment_movement.snow_blowing", "phrase": "snow blowing", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_qs_3", "category": "atmosphere", "preset_id": "atmosphere.snowfall", "phrase": "snowfall", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.mist_forest",
        "label": "Mist Forest",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_mf_1", "category": "atmosphere", "preset_id": "atmosphere.mist", "phrase": "mist", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_mf_2", "category": "atmosphere", "preset_id": "atmosphere.dense_haze", "phrase": "dense haze", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_mf_3", "category": "environment_movement", "preset_id": "environment_movement.fog_swirling", "phrase": "fog swirling", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.storm_front",
        "label": "Storm Front",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_sf_1", "category": "atmosphere", "preset_id": "atmosphere.billowing_storm_clouds", "phrase": "billowing storm clouds", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_sf_2", "category": "atmosphere", "preset_id": "atmosphere.thunderstorm", "phrase": "thunderstorm", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sf_3", "category": "atmosphere", "preset_id": "atmosphere.strong_wind", "phrase": "strong wind", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.ember_night",
        "label": "Ember Night",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_en_1", "category": "atmosphere", "preset_id": "atmosphere.embers", "phrase": "embers", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_en_2", "category": "environment_movement", "preset_id": "environment_movement.embers_floating", "phrase": "embers floating", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_en_3", "category": "atmosphere", "preset_id": "atmosphere.smoke", "phrase": "smoke", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.hanging_debris",
        "label": "Hanging Debris",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_hd_1", "category": "environment_movement", "preset_id": "environment_movement.debris_suspended_in_air", "phrase": "debris suspended in air", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_hd_2", "category": "atmosphere", "preset_id": "atmosphere.dust", "phrase": "dust", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_hd_3", "category": "atmosphere", "preset_id": "atmosphere.smoke", "phrase": "smoke", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.ashfall_wasteland",
        "label": "Ashfall Wasteland",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_aw_1", "category": "atmosphere", "preset_id": "atmosphere.ash", "phrase": "ash", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_aw_2", "category": "environment_movement", "preset_id": "environment_movement.dust_moving_through_air", "phrase": "dust moving through air", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_aw_3", "category": "atmosphere", "preset_id": "atmosphere.smoke", "phrase": "smoke", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.drenching_rain",
        "label": "Drenching Rain",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_dr_1", "category": "atmosphere", "preset_id": "atmosphere.heavy_rain", "phrase": "heavy rain", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_dr_2", "category": "environment_movement", "preset_id": "environment_movement.rain_driven_sideways", "phrase": "rain driven sideways", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_dr_3", "category": "atmosphere", "preset_id": "atmosphere.storm", "phrase": "storm", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.golden_pollen",
        "label": "Golden Pollen",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_gp_1", "category": "atmosphere", "preset_id": "atmosphere.pollen", "phrase": "pollen", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_gp_2", "category": "atmosphere", "preset_id": "atmosphere.sunbeams_through_clouds", "phrase": "sunbeams through clouds", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_gp_3", "category": "atmosphere", "preset_id": "atmosphere.light_haze", "phrase": "light haze", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.ocean_storm",
        "label": "Ocean Storm",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_os_1", "category": "environment_movement", "preset_id": "environment_movement.waves_crashing", "phrase": "waves crashing", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_os_2", "category": "atmosphere", "preset_id": "atmosphere.storm", "phrase": "storm", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_os_3", "category": "atmosphere", "preset_id": "atmosphere.strong_wind", "phrase": "strong wind", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.twilight_ground_fog",
        "label": "Twilight Ground Fog",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_tgf_1", "category": "atmosphere", "preset_id": "atmosphere.ground_fog", "phrase": "ground fog", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_tgf_2", "category": "atmosphere", "preset_id": "atmosphere.light_haze", "phrase": "light haze", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_tgf_3", "category": "atmosphere", "preset_id": "atmosphere.sunbeams_through_clouds", "phrase": "sunbeams through clouds", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.arctic_blizzard",
        "label": "Arctic Blizzard",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_ab_1", "category": "atmosphere", "preset_id": "atmosphere.blizzard", "phrase": "blizzard", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_ab_2", "category": "atmosphere", "preset_id": "atmosphere.heavy_snowfall", "phrase": "heavy snowfall", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_ab_3", "category": "environment_movement", "preset_id": "environment_movement.snow_blowing", "phrase": "snow blowing", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.volcanic_haze",
        "label": "Volcanic Haze",
        "scope": "group",
        "group": "environment",
        "base_prompt": "",
        "rows": [
            {"id": "p_vh_1", "category": "atmosphere", "preset_id": "atmosphere.ash", "phrase": "ash", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_vh_2", "category": "atmosphere", "preset_id": "atmosphere.smoke", "phrase": "smoke", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_vh_3", "category": "atmosphere", "preset_id": "atmosphere.dust", "phrase": "dust", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    # ── Style & Finish: more looks ───────────────────────────────────
    {
        "id": "group.analog_warmth",
        "label": "Analog Warmth",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_anw_1", "category": "style", "preset_id": "style.analog_35mm_photography", "phrase": "analog 35mm photography", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_anw_2", "category": "texture", "preset_id": "texture.fine_film_grain", "phrase": "fine film grain", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_anw_3", "category": "detail", "preset_id": "detail.moderate_detail", "phrase": "moderate detail", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.instant_casual",
        "label": "Instant Casual",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_ic_1", "category": "style", "preset_id": "style.instant_film_photography", "phrase": "instant-film photography", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_ic_2", "category": "texture", "preset_id": "texture.smooth_clean_digital_texture", "phrase": "smooth clean digital texture", "intensity": 45, "control_mode": "scalar", "enabled": True},
            {"id": "p_ic_3", "category": "detail", "preset_id": "detail.moderate_detail", "phrase": "moderate detail", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.matte_painting_epic",
        "label": "Matte Painting Epic",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_mpe_1", "category": "style", "preset_id": "style.matte_painting", "phrase": "matte painting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_mpe_2", "category": "detail", "preset_id": "detail.dense_layered_detail", "phrase": "dense layered detail", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_mpe_3", "category": "texture", "preset_id": "texture.canvas_texture", "phrase": "canvas texture", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.anime_clean",
        "label": "Anime Clean",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_anc_1", "category": "style", "preset_id": "style.anime_illustration", "phrase": "anime illustration", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_anc_2", "category": "texture", "preset_id": "texture.smooth_clean_digital_texture", "phrase": "smooth clean digital texture", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_anc_3", "category": "detail", "preset_id": "detail.intricate_detail", "phrase": "intricate detail", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.cel_shaded",
        "label": "Cel-Shaded",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_cel_1", "category": "style", "preset_id": "style.cel_animation", "phrase": "cel animation", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_cel_2", "category": "style", "preset_id": "style.comic_book_art", "phrase": "comic-book art", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_cel_3", "category": "detail", "preset_id": "detail.minimal_detail", "phrase": "minimal detail", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.comic_halftone",
        "label": "Comic Halftone",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_ch_1", "category": "style", "preset_id": "style.comic_book_art", "phrase": "comic-book art", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_ch_2", "category": "texture", "preset_id": "texture.halftone_dots", "phrase": "halftone dots", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_ch_3", "category": "style", "preset_id": "style.pen_and_ink_illustration", "phrase": "pen-and-ink illustration", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.watercolor_soft",
        "label": "Watercolour Soft",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_ws_1", "category": "style", "preset_id": "style.watercolour_painting", "phrase": "watercolour painting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_ws_2", "category": "texture", "preset_id": "texture.paper_grain", "phrase": "paper grain", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_ws_3", "category": "texture", "preset_id": "texture.visible_brushstrokes", "phrase": "visible brushstrokes", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.oil_classic",
        "label": "Oil Classic",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_oc_1", "category": "style", "preset_id": "style.oil_painting", "phrase": "oil painting", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_oc_2", "category": "texture", "preset_id": "texture.impasto_texture", "phrase": "impasto texture", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_oc_3", "category": "texture", "preset_id": "texture.canvas_texture", "phrase": "canvas texture", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.photoreal_3d",
        "label": "Photoreal 3D",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_p3d_1", "category": "style", "preset_id": "style.photorealistic_3d_render", "phrase": "photorealistic 3D render", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_p3d_2", "category": "texture", "preset_id": "texture.smooth_clean_digital_texture", "phrase": "smooth clean digital texture", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_p3d_3", "category": "detail", "preset_id": "detail.intricate_detail", "phrase": "intricate detail", "intensity": 55, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.film_noir_grain",
        "label": "Film Noir Grain",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_fng_1", "category": "style", "preset_id": "style.cinematic_film_still", "phrase": "cinematic film still", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_fng_2", "category": "texture", "preset_id": "texture.heavy_film_grain", "phrase": "heavy film grain", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_fng_3", "category": "detail", "preset_id": "detail.uncluttered_environment", "phrase": "uncluttered environment", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.screenprint_artdeco",
        "label": "Screen-Print Art Deco",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_sad_1", "category": "style", "preset_id": "style.screen_print", "phrase": "screen print", "intensity": 60, "control_mode": "scalar", "enabled": True},
            {"id": "p_sad_2", "category": "texture", "preset_id": "texture.halftone_dots", "phrase": "halftone dots", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_sad_3", "category": "style", "preset_id": "style.graphic_novel_illustration", "phrase": "graphic-novel illustration", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.pixel_retro",
        "label": "Pixel Retro",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_pr_1", "category": "style", "preset_id": "style.pixel_art", "phrase": "pixel art", "intensity": 70, "control_mode": "scalar", "enabled": True},
            {"id": "p_pr_2", "category": "detail", "preset_id": "detail.minimal_detail", "phrase": "minimal detail", "intensity": 55, "control_mode": "scalar", "enabled": True},
            {"id": "p_pr_3", "category": "style", "preset_id": "style.low_poly_render", "phrase": "low-poly render", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.documentary_grit",
        "label": "Documentary Grit",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_dg_1", "category": "style", "preset_id": "style.documentary_photography", "phrase": "documentary photography", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_dg_2", "category": "texture", "preset_id": "texture.heavy_film_grain", "phrase": "heavy film grain", "intensity": 50, "control_mode": "scalar", "enabled": True},
            {"id": "p_dg_3", "category": "detail", "preset_id": "detail.uncluttered_environment", "phrase": "uncluttered environment", "intensity": 50, "control_mode": "scalar", "enabled": True}
        ]
    },
    {
        "id": "group.sports_energy",
        "label": "Sports Energy",
        "scope": "group",
        "group": "style_finish",
        "base_prompt": "",
        "rows": [
            {"id": "p_se_1", "category": "style", "preset_id": "style.sports_photography", "phrase": "sports photography", "intensity": 65, "control_mode": "scalar", "enabled": True},
            {"id": "p_se_2", "category": "texture", "preset_id": "texture.fine_film_grain", "phrase": "fine film grain", "intensity": 45, "control_mode": "scalar", "enabled": True},
            {"id": "p_se_3", "category": "detail", "preset_id": "detail.intricate_detail", "phrase": "intricate detail", "intensity": 45, "control_mode": "scalar", "enabled": True}
        ]
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
