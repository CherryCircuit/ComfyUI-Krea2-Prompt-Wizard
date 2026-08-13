/* Krea2 Prompt Wizard — schema, helpers, and shared utilities
 * Used by wizard_widget.js, preset_row.js, searchable_selector.js, etc.
 *
 * The state is a JSON object embedded in the wizard_state_json STRING
 * widget. The widget renders the visual builder; the backend compiles
 * the same state when the graph runs.
 */
(function () {
  "use strict";

  const KREA2 = window.KREA2 = window.KREA2 || {};

  const SLIDER_MIN = -100;
  const SLIDER_MAX = 100;
  const SLIDER_DEFAULT = 0;
  const SCHEMA_VERSION = 1;

  const MODES = Object.freeze({
    SCALAR: "scalar",
    BIPOLAR: "bipolar",
    RAW: "raw",
  });

  const VERIFICATIONS = Object.freeze({
    GENERAL: "general visual vocabulary",
    COMMUNITY: "community reported",
    LOCAL: "locally tested",
    KREA_TURBO: "krea2_turbo verified",
    KREA_RAW: "krea2_raw verified",
    UNRELIABLE: "unreliable",
    DEPRECATED: "deprecated",
  });

  const CATEGORIES = Object.freeze([
    "body",
    "emotion",
    "emotion_trigger",
    "face",
    "face_trigger",
    "gaze",
    "mouth",
    "position",
    "lora_trigger",
    "framing",
    "angle",
    "perspective",
    "lens",
    "aperture",
    "camera_body",
    "composition",
    "lighting_setup",
    "lighting_direction",
    "lighting_effect",
    "subject_movement",
    "camera_movement",
    "environment_movement",
    "atmosphere",
    "style",
    "film_color",
    "texture",
    "detail",
    "lens_family",
    "custom",
  ]);

  const CATEGORY_LABELS = Object.freeze({
    body: "Body Language & Pose",
    emotion: "Emotion",
    emotion_trigger: "Emotion Trigger",
    face: "Facial Action",
    face_trigger: "Face Trigger",
    gaze: "Gaze",
    mouth: "Mouth & Vocal Action",
    position: "Position & Placement",
    lora_trigger: "LoRA Trigger Words",
    framing: "Camera Framing",
    angle: "Camera Angle",
    perspective: "Camera Position & Perspective",
    lens: "Focal Length & Lens",
    aperture: "Aperture & Depth of Field",
    camera_body: "Camera Body & Format",
    composition: "Composition",
    lighting_setup: "Lighting Setup",
    lighting_direction: "Lighting Direction",
    lighting_effect: "Lighting Effect",
    subject_movement: "Subject Movement",
    camera_movement: "Camera Movement",
    environment_movement: "Environmental Movement",
    atmosphere: "Weather & Atmosphere",
    style: "Style & Medium",
    film_color: "Film & Colour Character",
    texture: "Texture",
    detail: "Detail & Complexity",
    lens_family: "Lens Family",
    custom: "Custom",
  });

  const GROUPS = Object.freeze([
    "subject_expression",
    "camera_film",
    "lighting",
    "environment",
    "style_finish",
  ]);

  const GROUP_LABELS = Object.freeze({
    subject_expression: "Subject & Expression",
    camera_film: "Camera & Film",
    lighting: "Lighting",
    environment: "Environment",
    style_finish: "Style & Finish",
  });

  const GROUP_CATEGORIES = Object.freeze({
    subject_expression: Object.freeze([
      "body", "subject_movement", "emotion", "emotion_trigger",
      "gaze", "mouth", "face", "face_trigger", "position", "lora_trigger",
    ]),
    camera_film: Object.freeze([
      "framing", "angle", "perspective", "lens", "aperture",
      "camera_body", "composition", "camera_movement", "lens_family",
      "film_color",
    ]),
    lighting: Object.freeze([
      "lighting_setup", "lighting_direction", "lighting_effect",
    ]),
    environment: Object.freeze(["environment_movement", "atmosphere"]),
    style_finish: Object.freeze(["style", "texture", "detail", "custom"]),
  });

  const RANDOM_GROUP_CATEGORIES = Object.freeze({
    subject_expression: Object.freeze([
      "body", "subject_movement", "emotion", "emotion_trigger",
      "face", "face_trigger", "gaze", "mouth", "position",
    ]),
    camera_film: Object.freeze([
      "framing", "angle", "perspective", "lens", "aperture",
      "camera_body", "composition", "camera_movement", "lens_family",
      "film_color",
    ]),
    lighting: Object.freeze(["lighting_setup", "lighting_direction", "lighting_effect"]),
    environment: Object.freeze(["atmosphere", "environment_movement"]),
    style_finish: Object.freeze(["style", "texture", "detail", "custom"]),
  });

  const CATEGORY_GROUPS = Object.freeze(
    GROUPS.reduce(function (mapping, group) {
      for (const category of GROUP_CATEGORIES[group]) mapping[category] = group;
      return mapping;
    }, {}),
  );

  function groupForCategory(category) {
    return CATEGORY_GROUPS[category] || "style_finish";
  }

  const PROFILES = Object.freeze({
    GENERIC: "generic",
    KREA_TURBO: "krea2_turbo",
    KREA_RAW: "krea2_raw",
  });

  function newRowId() {
    return "row_" + Math.random().toString(16).slice(2, 12);
  }

  function emptyState() {
    return {
      schema_version: SCHEMA_VERSION,
      base_prompt: "",
      model_profile: PROFILES.GENERIC,
      interface_mode: "simple",
      show_work: false,
      rows: [],
      master_preset_id: null,
      selected_category: "emotion",
      collapsed: {},
      randomize_on_job: {},
      random_strength_min: 0,
      random_strength_max: 3,
      settings_open: false,
      embed_prompt_metadata: true,
      prompt_metadata_override: false,
      creative_mode: "photo",
      concept_colors: {},
      loaded_preset_id: null,
      loaded_preset_label: null,
      loaded_group_presets: {},
      characters: [],
      selected_character_id: null,
      character_presets: [],
      setting: { enabled: false, name: "", description: "" },
      setting_presets: [],
      setting_random_pool: [],
      motion_prompt: "",
      motion_prompt_enabled: false,
      active_tab: "cast",
      footer_open: false,
      show_face_guidance: false,
      show_concepts_tab: false,
      show_motion_prompt: false,
      // v1.5.0: the Scene editor opens as a one-line summary card and
      // expands to the full field set. The flag is pure UI state and is
      // preserved across workflow saves/restores and job executions.
      scene_collapsed: true,
      // v2.0 B2 shell: the wizard opens as a compact glass overview card.
      // The flag is pure UI state and is preserved across workflow
      // saves/restores and job executions.
      wizard_expanded: false,
      // v2 redesign: tabbed editor state.
      pretty_preview: false,
      final_preview_open: true,
      scene_sections: {},
    };
  }

  function coerceState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== "object") return base;
    for (const key of [
      "schema_version",
      "base_prompt",
      "model_profile",
      "interface_mode",
      "show_work",
      "master_preset_id",
      "selected_category",
      "collapsed",
      "randomize_on_job",
      "random_strength_min",
      "random_strength_max",
      "settings_open",
      "embed_prompt_metadata",
      "prompt_metadata_override",
      "creative_mode",
      "concept_colors",
      "loaded_preset_id",
      "loaded_preset_label",
      "loaded_group_presets",
      "characters",
      "selected_character_id",
      "character_presets",
      "setting",
      "setting_presets",
      "setting_random_pool",
      "motion_prompt",
      "motion_prompt_enabled",
      "active_tab",
      "footer_open",
      "show_face_guidance",
      "show_concepts_tab",
      "show_motion_prompt",
      "scene_collapsed",
      "wizard_expanded",
      "pretty_preview",
      "final_preview_open",
      "scene_sections",
    ]) {
      if (key in raw) base[key] = raw[key];
    }
    if (Array.isArray(raw.rows)) {
      base.rows = raw.rows.filter((r) => r && typeof r === "object").map(function (row) {
        if (!Number.isFinite(Number(row.strength))) {
          row.strength = Math.round(
            Math.max(-3, Math.min(3, (Number(row.intensity) || 0) / 20)) * 4,
          ) / 4;
        }
        return row;
      });
    }
    if (!Array.isArray(base.characters)) base.characters = [];
    base.characters = base.characters.filter(function (item) {
      return item && typeof item === "object";
    });
    for (const character of base.characters) {
      if (!Array.isArray(character.rows)) character.rows = [];
      character.rows = character.rows.filter(function (r) {
        return r && typeof r === "object";
      });
      if (character.position === undefined) character.position = "";
      if (character.face_guidance === undefined) character.face_guidance = "";
      if (character.interaction === undefined) character.interaction = "";
      if (character.character_ref === undefined) character.character_ref = "";
      if (character.lora_triggers === undefined) character.lora_triggers = "";
      if (character.lora_name === undefined) character.lora_name = "";
      if (character.additional_info === undefined) character.additional_info = "";
      if (character.ethnicity === undefined) character.ethnicity = "";
      if (character.eye_color === undefined) character.eye_color = "";
      if (character.skin_color === undefined) character.skin_color = "";
      // Legacy characters (pre-1.2.0) carry their look in `clothing`, which
      // is no longer editable in the UI. Migrate it into the ensemble field
      // so users can see and clear it; it then compiles as "costume: …".
      if (character.clothing && !character.ensemble && !character.clothing_top && !character.clothing_bottom) {
        character.ensemble = character.clothing;
      }
      if (character.ensemble || character.clothing_top || character.clothing_bottom) {
        delete character.clothing;
      }
      if (!character.randomize_direction_groups || typeof character.randomize_direction_groups !== "object") {
        character.randomize_direction_groups = {};
      }
      if (!Number.isFinite(Number(character.lora_strength))) character.lora_strength = 0.8;
      character.lora_strength = Math.max(0, Math.min(2, Math.round(Number(character.lora_strength) * 20) / 20));
      if (character.sex === undefined) character.sex = "";
      if (character.age === undefined) character.age = "";
      if (character.ensemble === undefined) character.ensemble = "";
      if (character.clothing_top === undefined) character.clothing_top = "";
      if (character.clothing_bottom === undefined) character.clothing_bottom = "";
      if (!character.randomize_fields || typeof character.randomize_fields !== "object") {
        character.randomize_fields = {};
      }
      // v2 redesign: header-click toggles and the per-character LoRA list.
      if (character.expanded === undefined) character.expanded = true;
      if (character.concepts_open === undefined) character.concepts_open = true;
      if (character.loras_open === undefined) character.loras_open = true;
      if (character.quick_open === undefined) character.quick_open = true;
      if (!Array.isArray(character.loras)) character.loras = [];
      character.loras = character.loras.filter(function (lora) {
        return lora && typeof lora === "object" && String(lora.filename || "").trim();
      });
    }
    if (!Array.isArray(base.character_presets)) base.character_presets = [];
    if (!base.setting || typeof base.setting !== "object" || Array.isArray(base.setting)) {
      base.setting = { enabled: false, name: "", description: "" };
    }
    if (!Array.isArray(base.setting_presets)) base.setting_presets = [];
    if (!Array.isArray(base.setting_random_pool)) base.setting_random_pool = [];
    base.random_strength_min = Number.isFinite(Number(base.random_strength_min))
      ? Math.max(-3, Math.min(3, Math.round(Number(base.random_strength_min) * 4) / 4))
      : 0;
    base.random_strength_max = Number.isFinite(Number(base.random_strength_max))
      ? Math.max(-3, Math.min(3, Math.round(Number(base.random_strength_max) * 4) / 4))
      : 3;
    if (base.random_strength_min > base.random_strength_max) {
      const swap = base.random_strength_min;
      base.random_strength_min = base.random_strength_max;
      base.random_strength_max = swap;
    }
    base.settings_open = !!base.settings_open;
    base.wizard_expanded = !!base.wizard_expanded;
    base.embed_prompt_metadata = base.embed_prompt_metadata !== false;
    return base;
  }

  function clampSlider(value) {
    let v = parseInt(value, 10);
    if (Number.isNaN(v)) v = SLIDER_DEFAULT;
    if (v < SLIDER_MIN) v = SLIDER_MIN;
    if (v > SLIDER_MAX) v = SLIDER_MAX;
    return v;
  }

  function uniqueRowId(state) {
    let id;
    const ids = new Set(state.rows.map((r) => r.id));
    do {
      id = newRowId();
    } while (ids.has(id));
    return id;
  }

  function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, severity) {
    if (typeof window !== "undefined" && window.app && window.app.extensionManager) {
      try {
        window.app.extensionManager.toast.add({
          severity: severity || "info",
          summary: message,
          life: 3500,
        });
        return;
      } catch (e) {
        // fall through
      }
    }
    if (typeof console !== "undefined") {
      console[severity === "error" ? "error" : "log"]("[Krea2PromptWizard]", message);
    }
  }

  /* ------------------- Weight math (mirrors src/weight_mapping.py) ---- */
  function sliderToWeightScalar(intensity) {
    if (intensity === 0) return 1.0;
    if (intensity > 0) {
      const norm = intensity / 100.0;
      return 1.0 + 2.0 * Math.pow(norm, 1.35);
    } else {
      const norm = Math.abs(intensity) / 100.0;
      return 1.0 - 0.9 * Math.pow(norm, 1.1);
    }
  }

  function sliderToWeightRaw(intensity) {
    return -3.0 + (intensity - SLIDER_MIN) * 6.0 / (SLIDER_MAX - SLIDER_MIN);
  }

  function sliderToWeightBipolar(intensity) {
    if (intensity === 0) return 1.0;
    const mag = Math.abs(intensity) / 100.0;
    return 1.0 + 2.0 * Math.pow(mag, 1.35);
  }

  function formatWeight(weight) {
    const rounded = Math.round(weight * 100) / 100;
    if (rounded === 0) return "0";
    return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function formatPhrase(phrase, weight) {
    const text = (phrase || "").trim();
    if (!text) return "";
    if (!isFinite(weight)) return text;
    return "(" + text + ":" + formatWeight(weight) + ")";
  }

  function defaultWeightForRow(row) {
    if (Number.isFinite(Number(row.strength))) {
      return Math.max(-3, Math.min(3, Number(row.strength)));
    }
    if (row.control_mode === MODES.RAW) return sliderToWeightRaw(row.intensity);
    if (row.control_mode === MODES.BIPOLAR) return sliderToWeightBipolar(row.intensity);
    return sliderToWeightScalar(row.intensity);
  }

  function phraseForRow(row) {
    if (row.control_mode === MODES.BIPOLAR) {
      const direction = Number.isFinite(Number(row.strength)) ? Number(row.strength) : row.intensity;
      if (direction > 0) return row.positive_phrase || row.phrase || "";
      if (direction < 0) return row.negative_phrase || row.phrase || "";
      return row.neutral_phrase || "";
    }
    return stripWeighting(row.phrase || "");
  }

  function stripWeighting(text) {
    if (!text) return "";
    const s = String(text).trim();
    if (!s.endsWith(")")) return s;
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i];
      if (ch === ")") depth++;
      else if (ch === "(") {
        depth--;
        if (depth === 0) {
          const inside = s.slice(i + 1, -1);
          if (inside.includes(":")) {
            const parts = inside.split(":");
            const tail = parts[parts.length - 1].trim();
            const num = Number(tail);
            if (!isNaN(num) && tail !== "" && parts.slice(0, -1).join(":").trim()) {
              return parts.slice(0, -1).join(":").trim();
            }
          }
          return s;
        }
      }
    }
    return s;
  }

  function isAlreadyWeighted(text) {
    if (!text) return false;
    const s = String(text).trim();
    if (!s.endsWith(")")) return false;
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i];
      if (ch === ")") depth++;
      else if (ch === "(") {
        depth--;
        if (depth === 0) {
          const inside = s.slice(i + 1, -1);
          if (inside.includes(":")) {
            const parts = inside.split(":");
            const tail = parts[parts.length - 1].trim();
            const num = Number(tail);
            if (!isNaN(num) && tail !== "" && parts.slice(0, -1).join(":").trim()) {
              return true;
            }
          }
          return false;
        }
      }
    }
    return false;
  }

  /* ------------------- DOM helpers ----------------------------------- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") {
          node.className = value;
        } else if (key === "dataset") {
          for (const dk of Object.keys(value)) {
            node.dataset[dk] = value[dk];
          }
        } else if (key === "style" && typeof value === "object") {
          Object.assign(node.style, value);
        } else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "value" || key === "checked" || key === "disabled") {
          node[key] = value;
        } else {
          node.setAttribute(key, value);
        }
      }
    }
    if (children !== undefined) {
      const list = Array.isArray(children) ? children : [children];
      for (const child of list) {
        if (child == null || child === false) continue;
        if (typeof child === "string" || typeof child === "number") {
          node.appendChild(document.createTextNode(String(child)));
        } else {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, delay);
    };
  }

  /* ------------------- SVG iconography ---------------------------------
   * All wizard icons are inline SVG so their active/inactive colour is
   * fully controllable via currentColor. No emojis anywhere in the UI. */
  const ICON_SPECS = Object.freeze({
    dice: [
      ["rect", { x: "2.5", y: "2.5", width: "11", height: "11", rx: "2.2" }],
      ["circle", { cx: "5.8", cy: "5.8", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.2", cy: "5.8", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "8", cy: "8", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "5.8", cy: "10.2", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.2", cy: "10.2", r: "0.9", fill: "currentColor", stroke: "none" }],
    ],
    shuffle: [
      ["path", { d: "M2 4.5h2.6c1.9 0 2.9 1.5 4 3.5s2.1 3.5 4 3.5H14" }],
      ["path", { d: "M11 3l3 1.5L11 6" }],
      ["path", { d: "M14 11.5h-2.6c-1.9 0-2.9-1.5-4-3.5s-2.1-3.5-4-3.5H2" }],
      ["path", { d: "M5 13L2 11.5L5 10" }],
    ],
    chevron_down: [["path", { d: "M3.5 6l4.5 4.5L12.5 6" }]],
    chevron_right: [["path", { d: "M6 3.5l4.5 4.5L6 12.5" }]],
    minus: [["path", { d: "M3 8h10" }]],
    plus: [["path", { d: "M8 3v10M3 8h10" }]],
    close: [["path", { d: "M4 4l8 8M12 4l-8 8" }]],
    file: [
      ["path", { d: "M3.5 2.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" }],
      ["path", { d: "M9.5 2.5v3h3" }],
    ],
    copy: [
      ["rect", { x: "2.5", y: "5", width: "8.5", height: "8.5", rx: "1.3" }],
      ["path", { d: "M5 2.5h6.5A2 2 0 0 1 13.5 4.5V11" }],
    ],
    sliders: [
      ["path", { d: "M2 4.5h12M2 8h12M2 11.5h12" }],
      ["circle", { cx: "5.5", cy: "4.5", r: "1.4" }],
      ["circle", { cx: "10.5", cy: "8", r: "1.4" }],
      ["circle", { cx: "6.5", cy: "11.5", r: "1.4" }],
    ],
    camera: [
      ["path", { d: "M2.5 5.5h2l1-2h5l1 2h2A1.5 1.5 0 0 1 15 7v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5V7a1.5 1.5 0 0 1 1.5-1.5z" }],
      ["circle", { cx: "8", cy: "9", r: "2.3" }],
    ],
    clapper: [
      ["path", { d: "M2 4.5h12v8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" }],
      ["path", { d: "M2.5 7h11" }],
      ["path", { d: "M2.5 4.5L4 7M6 4.5L7.5 7M9.5 4.5L11 7M13 4.5L14 7" }],
    ],
    users: [
      ["circle", { cx: "6", cy: "5.2", r: "2.2" }],
      ["path", { d: "M2.6 13.2c0-2.1 1.5-3.4 3.4-3.4s3.4 1.3 3.4 3.4" }],
      ["circle", { cx: "11.6", cy: "6.6", r: "1.7" }],
      ["path", { d: "M10.4 10.2c1.5-.4 3 .7 3 3" }],
    ],
    sparkle: [
      ["path", { d: "M8 2.2l1.4 3.1 3.1 1.4-3.1 1.4L8 11.2l-1.4-3.1-3.1-1.4 3.1-1.4z" }],
      ["path", { d: "M12.6 10l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" }],
    ],
    star: [["path", { d: "M8 2.4l1.75 3.55 3.9.57-2.82 2.75.67 3.88L8 11.35l-3.5 1.84.67-3.88L2.35 6.56l3.9-.57z", fill: "currentColor", stroke: "none" }]],
    eye: [
      ["path", { d: "M1.7 8C3 5.1 5.3 3.6 8 3.6s5 1.5 6.3 4.4C13 10.9 10.7 12.4 8 12.4S3 10.9 1.7 8z" }],
      ["circle", { cx: "8", cy: "8", r: "1.7" }],
    ],
    grip: [
      ["circle", { cx: "5.2", cy: "4", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "8", cy: "4", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.8", cy: "4", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "5.2", cy: "8", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "8", cy: "8", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.8", cy: "8", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "5.2", cy: "12", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "8", cy: "12", r: "0.7", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.8", cy: "12", r: "0.7", fill: "currentColor", stroke: "none" }],
    ],
    bolt: [["path", { d: "M9 1.6L3.6 9h3.2l-.9 5.4L10.9 7H7.6z" }]],
    compass: [
      ["circle", { cx: "8", cy: "8", r: "6" }],
      ["path", { d: "M8 4.2l1.7 4.6-4.6 1.7z", fill: "currentColor", stroke: "none" }],
    ],
    bulb: [
      ["path", { d: "M8 1.8a4.6 4.6 0 0 0-2.7 8.3c.8.6 1.2 1.2 1.2 1.9h3c0-.7.4-1.3 1.2-1.9A4.6 4.6 0 0 0 8 1.8z" }],
      ["path", { d: "M6.4 13.4h3.2M7 15.2h2" }],
    ],
    globe: [
      ["circle", { cx: "8", cy: "8", r: "6" }],
      ["path", { d: "M2 8h12" }],
      ["path", { d: "M8 2c2.4 2.2 2.4 9.8 0 12M8 2c-2.4 2.2-2.4 9.8 0 12" }],
    ],
    palette: [
      ["path", { d: "M8 2a6 6 0 1 0 0 12c.9 0 1.2-.7.8-1.3-.4-.6-.1-1.2.8-1.2h1.3A3.1 3.1 0 0 0 14 8.4C14 4.4 11.3 2 8 2z" }],
      ["circle", { cx: "5.2", cy: "6.4", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "8", cy: "5", r: "0.9", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "10.8", cy: "6.4", r: "0.9", fill: "currentColor", stroke: "none" }],
    ],
    check: [["path", { d: "M3 8.5l3.5 3.5L13 4.5" }]],
    dot: [["circle", { cx: "8", cy: "8", r: "5" }]],
    trash: [
      ["path", { d: "M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.4a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-8.4" }],
      ["path", { d: "M6.8 7v4M9.2 7v4" }],
    ],
    save: [
      ["path", { d: "M3.5 2.5h8l1 1v9.5a0.5 0.5 0 0 1-0.5 0.5h-9a0.5 0.5 0 0 1-0.5-0.5v-9.5z" }],
      ["path", { d: "M5.5 13.5v-4h5v4" }],
      ["path", { d: "M5.5 2.5v3.5h5V2.5" }],
    ],
    refresh: [
      ["path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9" }],
      ["path", { d: "M13.5 1.5V5h-3.5" }],
    ],
    download: [
      ["path", { d: "M8 2.5V11M4.5 7.5L8 11l3.5-3.5" }],
      ["path", { d: "M2.5 13.5h11" }],
    ],
    upload: [
      ["path", { d: "M8 11V2.5M4.5 6L8 2.5L11.5 6" }],
      ["path", { d: "M2.5 13.5h11" }],
    ],
  });

  function icon(name, attrs) {
    attrs = attrs || {};
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc) return null;
    const mk = typeof doc.createElementNS === "function"
      ? function (tag) { return doc.createElementNS("http://www.w3.org/2000/svg", tag); }
      : function (tag) { return doc.createElement(tag); };
    const svg = mk("svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const key of Object.keys(attrs)) {
      svg.setAttribute(key, attrs[key]);
    }
    const spec = ICON_SPECS[name];
    if (spec) {
      for (const entry of spec) {
        const node = mk(entry[0]);
        const a = entry[1];
        for (const key of Object.keys(a)) node.setAttribute(key, a[key]);
        svg.appendChild(node);
      }
    }
    return svg;
  }

  /* Concept row strength helpers: default_strength is stored 0-100 in the
   * library; the UI shows -3 to +3 (divide by 20). */
  function displayStrength(row) {
    if (Number.isFinite(Number(row.strength))) return Number(row.strength);
    return Math.max(-3, Math.min(3, (Number(row.intensity) || 0) / 20));
  }

  function storedStrength(value) {
    return Math.round(Math.max(-3, Math.min(3, Number(value) || 0)) * 2) / 2;
  }

  function formatStepValue(value) {
    const number = Math.round(Number(value) * 10) / 10;
    if (number === 0) return "0";
    return (number > 0 ? "+" : "") + String(number);
  }

  /* Colour palettes for hair / eye / skin / light colour pickers. Each
   * swatch maps to a model-friendly colour word. */
  const PALETTE_COLORS = Object.freeze([
    ["black", "#1a1a1e"],
    ["white", "#f5f5f5"],
    ["grey", "#9aa0a6"],
    ["silver", "#c8ccd2"],
    ["brown", "#6b4423"],
    ["dark brown", "#3d2b1f"],
    ["blonde", "#e3c98a"],
    ["auburn", "#a0522d"],
    ["red", "#d64545"],
    ["orange", "#e8803a"],
    ["amber", "#d9a441"],
    ["yellow", "#e8cf4d"],
    ["green", "#4c9e5a"],
    ["teal", "#2a9d8f"],
    ["cyan", "#4cc9d6"],
    ["blue", "#3b6fd6"],
    ["navy", "#26386b"],
    ["purple", "#7a5fb8"],
    ["magenta", "#b84a9e"],
    ["pink", "#e07a9e"],
  ]);

  /* Light colour palette: light tints only — no hair words like blonde. */
  const LIGHT_PALETTE = Object.freeze([
    ["white", "#ffffff"],
    ["red", "#ff5b5b"],
    ["orange", "#ff9d4d"],
    ["yellow", "#ffe066"],
    ["green", "#5dd07a"],
    ["teal", "#4fd1c5"],
    ["cyan", "#5fd6f0"],
    ["blue", "#5b9dff"],
    ["purple", "#a88bff"],
    ["magenta", "#ff7ae0"],
    ["pink", "#ff9ec7"],
  ]);

  function paletteNearestName(hex, palette) {
    const colors = palette && palette.length ? palette : PALETTE_COLORS;
    const raw = String(hex || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return "";
    const full = raw.length === 3
      ? raw.split("").map(function (c) { return c + c; }).join("")
      : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    let best = "";
    let bestDistance = Infinity;
    for (const entry of colors) {
      const sr = parseInt(entry[1].slice(1, 3), 16);
      const sg = parseInt(entry[1].slice(3, 5), 16);
      const sb = parseInt(entry[1].slice(5, 7), 16);
      const distance = Math.pow(r - sr, 2) + Math.pow(g - sg, 2) + Math.pow(b - sb, 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry[0];
      }
    }
    return best;
  }

  function sortedOptions(options) {
    return (options || []).slice().sort(function (a, b) {
      return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
    });
  }

  /* ------------------- Library client -------------------------------- */
  async function fetchLibrary() {
    if (KREA2._library) return KREA2._library;
    try {
      const api = (window.app && window.app.api) || null;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/library"))
        || "/krea2_prompt_wizard/library";
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("library HTTP " + resp.status);
      const data = await resp.json();
      KREA2._library = Array.isArray(data.presets) ? data.presets : [];
      return KREA2._library;
    } catch (e) {
      KREA2._library = KREA2._library || [];
      return KREA2._library;
    }
  }

  async function fetchMasterPresets() {
    try {
      const api = (window.app && window.app.api) || null;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/master_presets"))
        || "/krea2_prompt_wizard/master_presets";
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("master presets HTTP " + resp.status);
      const data = await resp.json();
      return Array.isArray(data.master_presets) ? data.master_presets : [];
    } catch (e) {
      return [];
    }
  }

  async function fetchSavedPresets() {
    try {
      const api = (window.app && window.app.api) || null;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/saved_presets"))
        || "/krea2_prompt_wizard/saved_presets";
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("saved presets HTTP " + resp.status);
      const data = await resp.json();
      return Array.isArray(data.presets) ? data.presets : [];
    } catch (e) {
      return [];
    }
  }

  async function saveSavedPresets(presets) {
    const api = (window.app && window.app.api) || null;
    const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/saved_presets"))
      || "/krea2_prompt_wizard/saved_presets";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presets: presets }),
    });
    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error((payload.error && payload.error.message) || "Could not save presets.");
    }
    return Array.isArray(payload.presets) ? payload.presets : [];
  }

  async function fetchConceptColors() {
    const response = await fetch("/krea2_prompt_wizard/concept_colors");
    const payload = await response.json();
    return payload && typeof payload.colors === "object" ? payload.colors : {};
  }

  async function saveConceptColors(colors) {
    await fetch("/krea2_prompt_wizard/concept_colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colors: colors || {} }),
    });
  }

  async function fetchLoras() {
    try {
      const api = (window.app && window.app.api) || null;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/loras"))
        || "/krea2_prompt_wizard/loras";
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("loras HTTP " + resp.status);
      const data = await resp.json();
      return Array.isArray(data.loras) ? data.loras : [];
    } catch (e) {
      return [];
    }
  }

  async function fetchConflicts() {
    try {
      const api = (window.app && window.app.api) || null;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/conflicts"))
        || "/krea2_prompt_wizard/conflicts";
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("conflicts HTTP " + resp.status);
      const data = await resp.json();
      return Array.isArray(data.conflicts) ? data.conflicts : [];
    } catch (e) {
      return [];
    }
  }

  async function fetchCompiledPreview(state) {
    const api = (window.app && window.app.api) || null;
    const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/preview"))
      || "/krea2_prompt_wizard/preview";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state, expert: false }),
    });
    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error((payload.warnings && payload.warnings[0] && payload.warnings[0].message)
        || "Preview could not be compiled.");
    }
    return payload;
  }

  /* ------------------- Compile helpers (frontend previews) ----------- */
  const CATEGORY_ORDER = Object.freeze([
    "body",
    "emotion",
    "emotion_trigger",
    "face",
    "face_trigger",
    "gaze",
    "mouth",
    "position",
    "framing",
    "angle",
    "perspective",
    "lens",
    "aperture",
    "camera_body",
    "composition",
    "lighting_setup",
    "lighting_direction",
    "lighting_effect",
    "subject_movement",
    "camera_movement",
    "environment_movement",
    "atmosphere",
    "style",
    "film_color",
    "texture",
    "detail",
    "lens_family",
    "custom",
  ]);

  const CHARACTER_FIELDS = Object.freeze([
    ["identity", "identity"], ["sex", "sex"], ["age", "age"],
    ["ethnicity", "ethnicity"],
    ["subject", "subject"], ["expression", "expression"],
    ["clothing", "clothing and armour"],
    ["ensemble", "costume"], ["clothing_top", "top"], ["clothing_bottom", "bottom"],
    ["hair_style", "hair style"],
    ["hair_length", "hair length"], ["hair_color", "hair colour"], ["makeup", "makeup"],
    ["eyes", "eyes"], ["eye_color", "eye colour"], ["skin_color", "skin colour"],
    ["nose", "nose"], ["mouth", "mouth"], ["chin", "chin"],
    ["face_shape", "face shape"],     ["body_type", "body type"], ["fitness", "fitness"],
    ["proportions", "proportions"], ["additional_info", "additional characteristics"],
    ["adult_description", "adult body description"],
  ]);

  const MOTION_VERBS = Object.freeze([
    [["joy", "happi", "elat", "glee", "delight", "radian", "amuse", "entertain", "content"], "beams with joy"],
    [["excit", "thrill", "energ", "enthusias", "eager", "pump"], "moves energetically"],
    [["seren", "calm", "tranqu", "peace", "relief", "relax"], "stays calm"],
    [["affection", "love", "tender", "warmth", "romantic", "soft-hearted"], "behaves warmly"],
    [["pride", "proud", "accomplish", "dignif"], "holds their head high"],
    [["hope", "hopeful", "optimis", "brighten"], "brightens with hope"],
    [["wonder", "awe", "amaz", "awestruck", "breathless"], "gazes in awe"],
    [["surpris", "shock", "startl", "astonish", "caught off guard"], "reacts in surprise"],
    [["confus", "puzzl", "baffl"], "hesitates in confusion"],
    [["curious", "interest", "intrigu", "fascin", "inquisit"], "leans in curiously"],
    [["skeptic", "doubt", "wary", "suspic", "distrust", "tentative", "unsure"], "eyes warily"],
    [["anxi", "nerv", "on edge", "skittish", "worr"], "fidgets nervously"],
    [["fear", "afraid", "scared", "terrif", "terror", "horr", "dread", "panic", "hysteric"], "flinches in fear"],
    [["sad", "melanchol", "grief", "mourn", "despair", "hopeless", "lonel", "isolat", "sorrow", "pensiv", "wistful"], "looks sad"],
    [["disappoint", "let down", "sigh"], "slumps in disappointment"],
    [["embarrass", "flustered", "awkward", "shy", "shame", "humiliat", "guilt", "remorse"], "looks embarrassed"],
    [["anger", "mad", "irritat", "annoy", "frustrat", "exasper", "fury", "furious", "enrag", "rage", "raging", "incandesc"], "glowers in anger"],
    [["defian", "rebell", "stubborn"], "stands defiant"],
    [["determin", "resolute", "resolve", "assert"], "stands resolute"],
    [["disgust", "repuls", "contempt", "scorn", "sneer", "disdain"], "sneers with contempt"],
    [["bored", "apathetic", "numb", "hollow"], "looks bored"],
    [["fatigue", "exhaust", "weary", "tired", "drained"], "slumps tiredly"],
  ]);

  function characterHasDirection(character) {
    if (!character) return false;
    if (Array.isArray(character.rows) && character.rows.length) return true;
    if (String(character.face_guidance || "").trim()) return true;
    if (String(character.interaction || "").trim()) return true;
    return false;
  }

  function faceGuidanceLines(guidance) {
    return String(guidance || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  /* LoRA file name without its extension (the <lora:...> token name). */
  function loraFileName(name) {
    return String(name || "").replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
  }

  function formatLoraStrength(value) {
    const number = Math.round(Number(value) * 100) / 100;
    if (number === Math.round(number)) return String(Math.round(number));
    return String(number);
  }

  /* A1111-style LoRA application tokens, one per assigned LoRA. Mirrors
   * src/compiler.py::_lora_tokens — the backend is the source of truth. */
  function compileLoraTokens(character) {
    const tokens = [];
    const loras = Array.isArray(character.loras) ? character.loras : [];
    for (const lora of loras) {
      const filename = String((lora && lora.filename) || "").trim();
      if (!filename) continue;
      const strength = Number.isFinite(Number(lora && lora.strength))
        ? Number(lora.strength)
        : 0.8;
      tokens.push("<lora:" + loraFileName(filename) + ":" + formatLoraStrength(strength) + ">");
    }
    if (!tokens.length) {
      const name = String(character.lora_name || "").trim();
      if (name) {
        tokens.push(
          "<lora:" + loraFileName(name) + ":" + formatLoraStrength(Number(character.lora_strength) || 0.8) + ">"
        );
      }
    }
    return tokens;
  }

  function dedupePreservingOrder(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = String(item).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function compileCharacterRows(character) {
    const categoryOrder = {};
    CATEGORY_ORDER.forEach(function (cat, index) {
      categoryOrder[cat] = index;
    });
    const rows = (character.rows || []).filter(function (row) {
      return row && typeof row === "object";
    }).sort(function (a, b) {
      const ac = categoryOrder[a.category] === undefined ? 99 : categoryOrder[a.category];
      const bc = categoryOrder[b.category] === undefined ? 99 : categoryOrder[b.category];
      return ac - bc;
    });
    const fragments = [];
    for (const row of rows) {
      if (!row.enabled) continue;
      if (row.verbatim) {
        const raw = String(row.phrase || "").trim();
        if (raw) fragments.push(raw);
        continue;
      }
      const phrase = phraseForRow(row);
      if (!phrase) continue;
      const weight = defaultWeightForRow(row);
      fragments.push(formatPhrase(phrase, weight));
    }
    return dedupePreservingOrder(fragments);
  }

  function compileCharacterClause(character, index) {
    const name = String(character.name || "Character " + (index + 1)).trim();
    const position = String(character.position || "").trim();
    const directed = characterHasDirection(character);
    const ensemble = String(character.ensemble || "").trim();
    const useEnsemble = Boolean(ensemble);
    const useSeparates = Boolean(
      String(character.clothing_top || "").trim()
      || String(character.clothing_bottom || "").trim(),
    );
    const fields = CHARACTER_FIELDS.map(function (entry) {
      if (directed && entry[0] === "expression") return "";
      if (entry[0] === "ensemble" && !useEnsemble) return "";
      if ((entry[0] === "clothing_top" || entry[0] === "clothing_bottom") && useEnsemble) return "";
      if (entry[0] === "clothing" && (useEnsemble || useSeparates)) return "";
      const value = String(character[entry[0]] || "").trim();
      return value ? entry[1] + ": " + value : "";
    }).filter(Boolean);
    const fragments = compileCharacterRows(character);
    const guidance = faceGuidanceLines(character.face_guidance);
    for (const line of guidance) fragments.push(line);
    const loraLines = faceGuidanceLines(character.lora_triggers);
    for (const line of loraLines) fragments.push(line);
    const loraTokens = compileLoraTokens(character);
    for (const token of loraTokens) fragments.push(token);
    /* Krea2 follows natural-language descriptions (official prompting
     * guide), so skin and ethnicity also get weighted visual phrases —
     * "blue skin" reads far better to the Qwen3-VL encoder than
     * "skin colour: blue". */
    const skin = String(character.skin_color || "").trim();
    if (skin && /^[a-z ]+$/i.test(skin)) fragments.push("(" + skin + " skin:1.5)");
    const ethnicity = String(character.ethnicity || "").trim();
    if (ethnicity && !/[:()]/.test(ethnicity)) fragments.push("(" + ethnicity + ":1.3)");
    const interaction = String(character.interaction || "").trim();
    if (interaction) fragments.push(interaction);
    const head = position ? name + " (" + position + ")" : name;
    const parts = [];
    if (fields.length && fragments.length) {
      parts.push("Character " + head + ": " + fields.join("; ") + ", " + fragments.join(", "));
    } else if (fields.length) {
      parts.push("Character " + head + ": " + fields.join("; "));
    } else if (fragments.length) {
      parts.push("Character " + head + ", " + fragments.join(", "));
    } else {
      parts.push("Character " + head);
    }
    return parts.join("");
  }

  function motionVerbForRow(row) {
    const haystack = [
      row.label,
      row.phrase,
      ...(row.aliases || []),
    ].join(" ").toLowerCase();
    for (const entry of MOTION_VERBS) {
      if (entry[0].some(function (keyword) { return haystack.includes(keyword); })) {
        return entry[1];
      }
    }
    return "reacts";
  }

  function draftMotionLine(character, index) {
    const name = String(character.name || "Character " + (index + 1)).trim();
    const position = String(character.position || "").trim();
    const rows = (character.rows || []).filter(function (row) {
      return row && typeof row === "object" && row.enabled !== false;
    });
    if (!rows.length && !String(character.interaction || "").trim()) return "";
    const emotionRows = rows.filter(function (row) { return row.category === "emotion"; });
    const bodyRows = rows.filter(function (row) { return row.category === "body"; });
    let strongest = null;
    for (const row of emotionRows) {
      if (!strongest || Math.abs(Number(defaultWeightForRow(row))) > Math.abs(Number(defaultWeightForRow(strongest)))) {
        strongest = row;
      }
    }
    const verb = strongest ? motionVerbForRow(strongest) : "stands";
    const head = position ? name + " (" + position + ")" : name;
    const bits = [head + " " + verb];
    if (bodyRows.length) {
      const phrase = stripWeighting(String(bodyRows[0].phrase || "")).trim();
      if (phrase) bits.push(phrase);
    }
    const interaction = String(character.interaction || "").trim();
    if (interaction) bits.push(interaction);
    return bits.join(", ").trim();
  }

  function structuredPromptParts(state) {
    const parts = [];
    (state.characters || []).forEach(function (character, index) {
      if (!character || character.enabled === false) return;
      parts.push(compileCharacterClause(character, index));
    });
    const setting = state.setting;
    if (setting && setting.enabled) {
      const name = String(setting.name || "Scene").trim();
      const description = String(setting.description || "").trim();
      parts.push(description ? "Setting " + name + ": " + description : "Setting: " + name);
    }
    return parts;
  }

  function draftMotionPrompt(state) {
    if (!state) return "";
    return (state.characters || []).map(function (character, index) {
      return draftMotionLine(character, index);
    }).filter(Boolean).join("\n");
  }

  function compilePreview(state) {
    if (!state) state = emptyState();
    const byCat = {};
    for (const c of CATEGORY_ORDER) byCat[c] = [];
    const plain = {};
    for (const c of CATEGORY_ORDER) plain[c] = [];
    const seeFragments = [];
    for (const row of state.rows) {
      if (!row.enabled) continue;
      const phrase = phraseForRow(row);
      if (!phrase) continue;
      const weight = defaultWeightForRow(row);
      const fragment = formatPhrase(phrase, weight);
      const cat = row.category || "custom";
      if (!(cat in byCat)) byCat[cat] = [];
      if (!(cat in plain)) plain[cat] = [];
      seeFragments.push({
        category: cat,
        row_id: row.id,
        preset_id: row.preset_id,
        label: row.label,
        phrase,
        weight,
        mode: row.control_mode,
        fragment,
      });
      byCat[cat].push(fragment);
      plain[cat].push(phrase);
    }
    const structured = structuredPromptParts(state);
    const body = [];
    if (state.base_prompt && state.base_prompt.trim()) body.push(state.base_prompt.trim());
    body.push(...structured);
    for (const c of CATEGORY_ORDER) {
      const text = byCat[c].join(" ").trim();
      if (text) body.push(text);
    }
    const final = body.join(", ").replace(/\s+/g, " ").trim();
    const plainBody = [];
    if (state.base_prompt && state.base_prompt.trim()) plainBody.push(state.base_prompt.trim());
    plainBody.push(...structured);
    for (const c of CATEGORY_ORDER) {
      const t = plain[c].join(" ").trim();
      if (t) plainBody.push(t);
    }
    const plainPrompt = plainBody.join(", ").replace(/\s+/g, " ").trim();
    return {
      final_prompt: final,
      plain_prompt: plainPrompt,
      category_prompts: byCat,
      fragments: seeFragments,
      motion_prompt_draft: draftMotionPrompt(state),
    };
  }

  /* ------------------- Idempotent extension id ------------------------ */
  KREA2.constants = {
    SLIDER_MIN,
    SLIDER_MAX,
    SLIDER_DEFAULT,
    SCHEMA_VERSION,
    MODES,
    VERIFICATIONS,
    CATEGORIES,
    CATEGORY_LABELS,
    GROUPS,
    GROUP_LABELS,
    GROUP_CATEGORIES,
    RANDOM_GROUP_CATEGORIES,
    CATEGORY_GROUPS,
    PROFILES,
    PALETTE_COLORS,
    LIGHT_PALETTE,
  };
  KREA2.helpers = {
    newRowId,
    uniqueRowId,
    emptyState,
    coerceState,
    clampSlider,
    clone,
    escapeHtml,
    showToast,
    el,
    debounce,
    icon,
    displayStrength,
    storedStrength,
    formatStepValue,
    paletteNearestName,
    sortedOptions,
    sliderToWeightScalar,
    sliderToWeightRaw,
    sliderToWeightBipolar,
    defaultWeightForRow,
    phraseForRow,
    formatPhrase,
    formatWeight,
    stripWeighting,
    isAlreadyWeighted,
    groupForCategory,
    fetchLibrary,
    fetchMasterPresets,
    fetchSavedPresets,
    fetchLoras,
    fetchConflicts,
    saveSavedPresets,
    fetchConceptColors,
    saveConceptColors,
    fetchCompiledPreview,
    compilePreview,
    draftMotionPrompt,
    draftMotionLine,
    compileCharacterClause,
    compileCharacterRows,
    compileLoraTokens,
    loraFileName,
    characterHasDirection,
    faceGuidanceLines,
  };
})();
