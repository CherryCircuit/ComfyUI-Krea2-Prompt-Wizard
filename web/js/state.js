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
    "face",
    "gaze",
    "mouth",
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
    face: "Facial Action",
    gaze: "Gaze",
    mouth: "Mouth & Vocal Action",
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
    ]) {
      if (key in raw) base[key] = raw[key];
    }
    if (Array.isArray(raw.rows)) {
      base.rows = raw.rows.filter((r) => r && typeof r === "object");
    }
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
    if (weight === 1.0) return text;
    return "(" + text + ":" + formatWeight(weight) + ")";
  }

  function defaultWeightForRow(row) {
    if (row.control_mode === MODES.RAW) return sliderToWeightRaw(row.intensity);
    if (row.control_mode === MODES.BIPOLAR) return sliderToWeightBipolar(row.intensity);
    return sliderToWeightScalar(row.intensity);
  }

  function phraseForRow(row) {
    if (row.control_mode === MODES.BIPOLAR) {
      if (row.intensity > 0) return row.positive_phrase || row.phrase || "";
      if (row.intensity < 0) return row.negative_phrase || row.phrase || "";
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

  /* ------------------- Compile helpers (frontend previews) ----------- */
  function compilePreview(state) {
    if (!state) state = emptyState();
    const CATEGORY_ORDER = [
      "body",
      "emotion",
      "face",
      "gaze",
      "mouth",
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
    ];
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
    const body = [];
    if (state.base_prompt && state.base_prompt.trim()) body.push(state.base_prompt.trim());
    for (const c of CATEGORY_ORDER) {
      const text = byCat[c].join(" ").trim();
      if (text) body.push(text);
    }
    const final = body.join(", ").replace(/\s+/g, " ").trim();
    const plainBody = [];
    if (state.base_prompt && state.base_prompt.trim()) plainBody.push(state.base_prompt.trim());
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
    PROFILES,
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
    sliderToWeightScalar,
    sliderToWeightRaw,
    sliderToWeightBipolar,
    defaultWeightForRow,
    phraseForRow,
    formatPhrase,
    formatWeight,
    stripWeighting,
    isAlreadyWeighted,
    fetchLibrary,
    fetchMasterPresets,
    compilePreview,
  };
})();
