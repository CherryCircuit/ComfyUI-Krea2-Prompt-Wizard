/**
 * Randomizer recipes: a named set of slot pools (and, optionally, the picks
 * that were in those slots when the recipe was saved).
 *
 * Bundled recipes ship in presets/studio/recipes.json; user recipes live in
 * the pack's user directory. This module is a tiny shared cache for the
 * recipe panel and the randomizer board.
 */
import { readableName } from "./preset_store.mjs?v=26";

function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const pools = {};
  if (raw.pools && typeof raw.pools === "object") {
    for (const [key, ids] of Object.entries(raw.pools)) {
      if (!Array.isArray(ids)) continue;
      const clean = ids.map(String).filter(Boolean);
      if (clean.length) pools[key] = clean;
    }
  }
  const picks = {};
  if (raw.picks && typeof raw.picks === "object") {
    for (const [key, preset] of Object.entries(raw.picks)) {
      if (typeof preset === "string" && preset.trim()) picks[key] = preset.trim();
    }
  }
  if (!Object.keys(pools).length && !Object.keys(picks).length) return null;
  return {
    id,
    name: readableName(String(raw.name ?? "").trim() || id),
    description: String(raw.description ?? "").trim(),
    randomize: raw.randomize !== false,
    pools,
    picks,
    origin: raw.origin === "user" ? "user" : "bundled",
  };
}

class RecipeStore {
  constructor() {
    this.recipes = [];
    this.listeners = new Set();
    this._loaded = null;
    this.lastError = "";
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
        console.warn("[Krea2Studio] recipe listener failed", error);
      }
    }
  }

  _absorb(recipes) {
    this.recipes = recipes.map(normalizeRecipe).filter(Boolean);
    this._notify();
  }

  async ensureLoaded({ force = false } = {}) {
    if (!force && this._loaded) return this._loaded;
    if (!this._loading) {
      this._loading = fetch("/krea2_prompt_studio/recipes")
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          this.lastError = "";
          this._absorb(payload?.recipes ?? []);
          this._loaded = true;
        })
        .catch((error) => {
          console.warn("[Krea2Studio] could not load recipes", error);
          this.lastError =
            "Recipes need the updated backend — restart ComfyUI once.";
          this._absorb([]);
          this._loaded = true;
        })
        .finally(() => {
          this._loading = null;
        });
    }
    return this._loading;
  }

  get(id) {
    return this.recipes.find((recipe) => recipe.id === id) ?? null;
  }

  async saveRecipe(recipe) {
    const response = await fetch("/krea2_prompt_studio/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || "Could not save the recipe.");
    }
    this.lastError = "";
    this._absorb(body.recipes ?? []);
    this._loaded = true;
    return body.recipes ?? [];
  }

  async deleteRecipe(id) {
    const response = await fetch("/krea2_prompt_studio/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || "Could not delete the recipe.");
    }
    this.lastError = "";
    this._absorb(body.recipes ?? []);
    this._loaded = true;
    return body.recipes ?? [];
  }
}

export const recipeStore = new RecipeStore();
