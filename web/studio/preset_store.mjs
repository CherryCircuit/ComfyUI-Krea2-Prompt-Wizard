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
  "props",
  "other",
];

export const CATEGORY_LABELS = {
  character: "Character",
  look: "Look",
  performance: "Performance",
  state: "State",
  scene: "Scene",
  lighting: "Lighting",
  camera: "Camera",
  style: "Style",
  continuity: "Continuity",
  emotion: "Emotion",
  wardrobe: "Wardrobe",
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
  "lighting",
  "style",
  "scene",
  "emotion",
  "look",
  "performance",
  "wardrobe_full",
  "wardrobe_top",
  "wardrobe_bottom",
];

export const EXCLUSIVE_GROUP_LABELS = {
  "": "None (can stack freely)",
  camera: "Camera (one per prompt)",
  lighting: "Lighting (one per prompt)",
  style: "Style (one per prompt)",
  scene: "Scene (one per prompt)",
  emotion: "Emotion (one per character)",
  look: "Look (one per character)",
  performance: "Performance (one per character)",
  wardrobe_full: "Full outfit (one per character)",
  wardrobe_top: "Upper body (one per character)",
  wardrobe_bottom: "Lower body (one per character)",
};

/** Sensible member categories for the bundle editor, per bundle type. */
export const BUNDLE_MEMBER_CATEGORIES = {
  look: ["wardrobe", "look", "props"],
  performance: ["emotion", "performance"],
};

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}

export function exclusiveGroupLabel(group) {
  return EXCLUSIVE_GROUP_LABELS[group] || group || EXCLUSIVE_GROUP_LABELS[""];
}

/** Compute derived fields for one preset dict from the backend. */
function normalizePreset(raw) {
  const preset = {
    id: String(raw?.id ?? "").trim(),
    name: String(raw?.name ?? "").trim() || "Unnamed",
    category: CATEGORY_LABELS[raw?.category] ? raw.category : "other",
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
