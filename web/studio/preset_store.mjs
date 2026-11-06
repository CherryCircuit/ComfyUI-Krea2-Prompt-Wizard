/**
 * Preset store for the Prompt Studio: fetches the merged preset list from
 * the backend, exposes category metadata (labels/colors), and persists
 * user edits via the /krea2_prompt_studio/presets routes.
 *
 * The store is a per-page singleton shared by every wizard v2 node.
 */

export const CATEGORY_ORDER = [
  "character",
  "look",
  "performance",
  "state",
  "scene",
  "lighting",
  "camera",
  "style",
  "continuity",
  "emotion",
  "wardrobe",
  "hair",
  "hair_color",
  "hair_color_style",
  "garment_color",
  "garment_pattern",
  "props",
  "other",
];

/** Symbols used in pills and the compact toolbar. */
export const CATEGORY_ICONS = {
  character: "👤",
  more: "⋯",
  look: "🖼️",
  performance: "🎭",
  state: "💧",
  scene: "🏞️",
  lighting: "💡",
  camera: "📷",
  style: "🎨",
  continuity: "🔗",
  emotion: "😊",
  wardrobe: "👕",
  hair: "💇",
  hair_color: "🖌️",
  hair_color_style: "✨",
  garment_color: "🎨",
  garment_pattern: "🧵",
  props: "🎒",
  other: "✦",
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.other;
}

/** Nested option groups that hang underneath a hair/garment token. */
export const FACET_DEFINITIONS = {
  hair: [
    { id: "hair_color", label: "Color", category: "hair_color", group: "hair_color" },
    { id: "hair_color_style", label: "Color Style", category: "hair_color_style", group: "hair_color_style" },
  ],
};

for (const group of [
  "wardrobe_full",
  "wardrobe_outer",
  "wardrobe_mid",
  "wardrobe_base",
  "wardrobe_bottom",
]) {
  FACET_DEFINITIONS[group] = [
    { id: "garment_color", label: "Color", category: "garment_color", group: "garment_color" },
    { id: "garment_pattern", label: "Pattern", category: "garment_pattern", group: "garment_pattern" },
  ];
}

export const CATEGORY_LABELS = {
  character: "Character",
  look: "Look",
  performance: "Performance",
  state: "State",
  scene: "Environment",
  lighting: "Lighting",
  camera: "Camera",
  style: "Style",
  continuity: "Continuity",
  emotion: "Emotion",
  wardrobe: "Wardrobe",
  hair: "Hair",
  hair_color: "Hair Color",
  hair_color_style: "Color Style",
  garment_color: "Garment Color",
  garment_pattern: "Garment Pattern",
  props: "Props",
  other: "Other",
};

/**
 * Categories whose presets are bundles (their expansion inlines members).
 * Mirror of src/studio/presets.py BUNDLE_CATEGORIES.
 */
export const BUNDLE_CATEGORIES = ["look", "performance"];

/** Toolbar shows these; "More" holds the remainder. */
export const TOOLBAR_CATEGORIES = [
  "character",
  "look",
  "performance",
  "emotion",
  "state",
  "scene",
  "lighting",
  "camera",
  "style",
];

/**
 * Categories whose presets attach to a character token in the prompt
 * (looks, performances, states, outfits, emotions). Inserting one asks
 * which character it belongs to when the prompt has several.
 */
export const ATTACHABLE_CATEGORIES = [
  "emotion",
  "wardrobe",
  "hair",
  "look",
  "performance",
  "state",
];

/**
 * Known exclusive groups (mirror of src/studio/presets.py). Presets
 * sharing a group cannot coexist: inserting one replaces the other.
 * Global groups scope to the whole prompt; per-host groups scope to one
 * character's attachments.
 */
export const EXCLUSIVE_GROUPS = [
  "camera",
  "framing",
  "angle",
  "lens",
  "movement",
  "lighting",
  "lighting_time",
  "lighting_source",
  "lighting_quality",
  "lighting_direction",
  "color_grade",
  "style",
  "scene",
  "emotion",
  "look",
  "performance",
  "wardrobe_full",
  "wardrobe_top",
  "wardrobe_bottom",
  "wardrobe_outer",
  "wardrobe_mid",
  "wardrobe_base",
  "wardrobe_accessory",
  "wardrobe_legwear",
  "hair",
  "hair_color",
  "hair_color_style",
  "garment_color",
  "garment_pattern",
];

export const EXCLUSIVE_GROUP_LABELS = {
  "": "None (can stack freely)",
  camera: "Camera (legacy full setup)",
  framing: "Framing (one per prompt)",
  angle: "Angle (one per prompt)",
  lens: "Lens (one per prompt)",
  movement: "Movement (one per prompt)",
  lighting: "Lighting (legacy combined setup)",
  lighting_time: "Time of day (one per prompt)",
  lighting_source: "Light source (one per prompt)",
  lighting_quality: "Light quality (one per prompt)",
  lighting_direction: "Light direction (one per prompt)",
  color_grade: "Color grade (one per prompt)",
  style: "Style (one per prompt)",
  scene: "Scene (one per prompt)",
  emotion: "Emotion (one per character)",
  look: "Look (one per character)",
  performance: "Performance (one per character)",
  wardrobe_full: "Full outfit (one per character)",
  wardrobe_top: "Upper body (one per character)",
  wardrobe_bottom: "Lower body (one per character)",
  wardrobe_outer: "Outer layer (one per character)",
  wardrobe_mid: "Mid layer (one per character)",
  wardrobe_base: "Base layer (one per character)",
  wardrobe_accessory: "Accessory (one per character)",
  wardrobe_legwear: "Legwear (one per character)",
  hair: "Hair (one per character)",
  hair_color: "Hair color (one per hair style)",
  hair_color_style: "Color treatment (one per hair style)",
  garment_color: "Garment color (one per garment)",
  garment_pattern: "Garment pattern (one per garment)",
};

/** Sensible member categories for the bundle editor, per bundle type. */
export const BUNDLE_MEMBER_CATEGORIES = {
  look: ["wardrobe", "look", "props"],
  performance: ["emotion", "performance"],
};

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in",
  "into", "nor", "of", "on", "onto", "or", "over", "per", "the",
  "to", "up", "via", "vs", "with",
]);

const ACRONYMS = new Set([
  "3D", "4K", "8K", "AI", "CCTV", "DSLR", "FPV", "HDR", "IMAX", "LED",
  "POV", "RPG", "SLR", "TV", "UV", "VHS", "VR",
]);

/**
 * Title-case one preset name, keeping acronyms and numeric decades sane.
 * Mirrors src/studio/presets.py::title_case_name.
 */
export function titleCaseName(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const words = text.split(" ");
  return words
    .map((word, index) => {
      const match = word.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
      if (!match) return word;
      const [, lead, core, trail] = match;
      if (!core) return word;
      let cleaned;
      if (ACRONYMS.has(core.toUpperCase())) {
        cleaned = core.toUpperCase();
      } else if (/^\d+[A-Za-z]?$/.test(core)) {
        cleaned = core.toLowerCase();
      } else if (index > 0 && index < words.length - 1 && SMALL_WORDS.has(core.toLowerCase())) {
        cleaned = core.toLowerCase();
      } else {
        cleaned = core
          .toLowerCase()
          .replace(/(^|[-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
      }
      return lead + cleaned + trail;
    })
    .join(" ");
}

/** Title-case only all-caps names; preserve deliberate mixed casing. */
export function readableName(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/[a-z]/.test(text)) return text;
  return titleCaseName(text);
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}

/**
 * Group presets into the collections the user sees in the chooser and the
 * randomizer pool tree. Unfiled presets land in "General"; groups keep the
 * store's order so a category reads the same everywhere.
 */
export function groupByCollection(presets) {
  const groups = new Map();
  for (const preset of presets) {
    const key = preset.collection || "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(preset);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

export function exclusiveGroupLabel(group) {
  return EXCLUSIVE_GROUP_LABELS[group] || group || EXCLUSIVE_GROUP_LABELS[""];
}

/** The same label without the "one per character" explanation. */
export function exclusiveGroupShortLabel(group) {
  const label = EXCLUSIVE_GROUP_LABELS[group];
  if (label) return label.replace(/\s*\(.*\)$/, "");
  return titleCaseName(String(group || "").replace(/_/g, " "));
}

/** Compute derived fields for one preset dict from the backend. */
function normalizePreset(raw) {
  const preset = {
    id: String(raw?.id ?? "").trim(),
    name: readableName(String(raw?.name ?? "").trim() || "Unnamed"),
    category: CATEGORY_LABELS[raw?.category] ? raw.category : "other",
    collection: String(raw?.collection ?? "").trim(),
    prompt: String(raw?.prompt ?? ""),
    negative: String(raw?.negative ?? ""),
    description: String(raw?.description ?? ""),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : [],
    notes: String(raw?.notes ?? ""),
    enabled: raw?.enabled !== false,
    exclusive_group: String(raw?.exclusive_group ?? "").trim(),
    included_presets: Array.isArray(raw?.included_presets)
      ? raw.included_presets.map(String).filter(Boolean)
      : [],
    preview_image: String(raw?.preview_image ?? "").trim(),
    reference_images: Array.isArray(raw?.reference_images) ? raw.reference_images : [],
    origin: raw?.origin === "user" ? "user" : "bundled",
  };
  if (!preset.id) return null;
  return preset;
}

/** Resolve a preset's preview image to a servable URL, or null. */
export function previewImageUrl(preset) {
  const value = String(preset?.preview_image ?? "").trim();
  if (!value) return null;
  if (/^(https?:|data:|\/)/i.test(value)) return value;
  // Bare filename: served from the user's previews folder.
  return `/krea2_prompt_studio/previews/${encodeURIComponent(value)}`;
}

class PresetStore {
  constructor() {
    this.presets = [];
    this.byId = new Map();
    this.favorites = [];
    this.recent = [];
    this.listeners = new Set();
    this._loaded = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (error) {
        console.warn("[Krea2Studio] preset listener failed", error);
      }
    }
  }

  _absorb(presets) {
    this.presets = presets;
    this.byId = new Map(presets.map((preset) => [preset.id, preset]));
    this._notify();
  }

  async ensureLoaded() {
    if (this._loaded) return this._loaded;
    if (!this._loading) {
      const presetsPromise = fetch("/krea2_prompt_studio/presets")
        .then((response) => (response.ok ? response.json() : { presets: [] }))
        .then((payload) => {
          const presets = (payload?.presets ?? [])
            .map(normalizePreset)
            .filter(Boolean);
          this._absorb(presets);
        });
      const prefsPromise = fetch("/krea2_prompt_studio/prefs")
        .then((response) => (response.ok ? response.json() : null))
        .then((prefs) => {
          if (prefs) {
            this.favorites = Array.isArray(prefs.favorites) ? prefs.favorites : [];
            this.recent = Array.isArray(prefs.recent) ? prefs.recent : [];
          }
        })
        .catch(() => {});
      this._loading = Promise.all([presetsPromise, prefsPromise])
        .then(() => {
          this._loaded = true;
          this._notify();
        })
        .catch((error) => {
          console.warn("[Krea2Studio] could not load presets", error);
          this._absorb([]);
          this._loaded = true; // avoid retry loops; manager can force refresh
        })
        .finally(() => {
          this._loading = null;
        });
    }
    return this._loading;
  }

  // -- favorites / recents -------------------------------------------------

  isFavorite(id) {
    return this.favorites.includes(id);
  }

  async toggleFavorite(id) {
    this.favorites = this.isFavorite(id)
      ? this.favorites.filter((entry) => entry !== id)
      : [id, ...this.favorites];
    this._notify();
    await this._persistPrefs();
  }

  async pushRecent(id) {
    this.recent = [id, ...this.recent.filter((entry) => entry !== id)].slice(0, 30);
    await this._persistPrefs();
  }

  async _persistPrefs() {
    try {
      await fetch("/krea2_prompt_studio/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: this.favorites, recent: this.recent }),
      });
    } catch (error) {
      console.warn("[Krea2Studio] could not save prefs", error);
    }
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  lookup(id) {
    const preset = this.byId.get(id);
    if (!preset || !preset.enabled) return null;
    return preset;
  }

  labelOf(id) {
    const preset = this.byId.get(id);
    return preset && preset.enabled ? preset.name : null;
  }

  byCategory(category) {
    return this.presets.filter((preset) => preset.category === category);
  }

  /** Display label for a token (stored hint if the preset is missing). */
  displayLabel(id, fallbackLabel) {
    const preset = this.byId.get(id);
    if (preset && preset.enabled) return preset.name;
    return null;
  }

  /**
   * Persist user preset changes.
   * @param {Array<{preset: object, deleted?: boolean}>} changes
   *   Each change upserts a preset copy into the user payload (or marks a
   *   bundled preset deleted with `deleted: true`).
   */
  async saveChanges(changes) {
    const payload = await fetch("/krea2_prompt_studio/user_payload")
      .then((response) => (response.ok ? response.json() : { presets: [] }))
      .catch(() => ({ presets: [] }));
    const userPresets = Array.isArray(payload?.presets) ? [...payload.presets] : [];

    for (const change of changes) {
      const targetId = String(change?.preset?.id ?? "").trim();
      if (!targetId) continue;
      const index = userPresets.findIndex(
        (entry) => entry && entry.id === targetId && entry.deleted !== true
      );
      if (change.deleted) {
        if (index >= 0) userPresets.splice(index, 1);
        userPresets.push({ id: targetId, deleted: true });
        continue;
      }
      const entry = { ...change.preset };
      delete entry.origin;
      if (index >= 0) userPresets[index] = entry;
      else userPresets.push(entry);
    }

    const response = await fetch("/krea2_prompt_studio/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: 1, presets: userPresets }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const issue = result?.issues?.[0];
      throw new Error(issue?.message || "Could not save presets.");
    }
    // Server returns the fresh merged list.
    const presets = (result?.presets ?? []).map(normalizePreset).filter(Boolean);
    this._absorb(presets);
    this._loaded = true;
    return result;
  }
}

export const presetStore = new PresetStore();

/** Build the hover tooltip text for a token. */
export function tokenTooltip(preset) {
  if (!preset) return "";
  const lines = [preset.name, categoryLabel(preset.category)];
  if (preset.collection) lines.push(preset.collection);
  if (preset.description) lines.push("", preset.description);
  if (preset.included_presets?.length) {
    lines.push("", "Bundle contains:");
    for (const memberId of preset.included_presets) {
      const member = presetStore.get(memberId);
      lines.push(`· ${member ? member.name : memberId}`);
    }
  } else if (preset.prompt) {
    const excerpt = preset.prompt.length > 220 ? `${preset.prompt.slice(0, 220)}…` : preset.prompt;
    lines.push("", `Expanded prompt:`, excerpt);
  }
  return lines.join("\n");
}
