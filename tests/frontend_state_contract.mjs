import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

globalThis.window = globalThis;
window.KREA2 = {};
window.app = { api: { apiURL: (url) => "/api" + url } };

let request = null;
globalThis.fetch = async (url, options) => {
  request = { url, options };
  return {
    ok: true,
    json: async () => ({ final_prompt: "portrait", plain_prompt: "portrait", fragments: [], warnings: [] }),
  };
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(path.join(root, "web", "js", "state.mjs")));

const state = window.KREA2.helpers.emptyState();
if (!state.collapsed || Object.keys(state.collapsed).length !== 0) {
  throw new Error("New wizard states must retain an empty collapse map.");
}

if (state.pretty_preview !== false) {
  throw new Error("Pretty Prompt Preview must default to OFF.");
}
if (state.final_preview_open !== false) {
  throw new Error("The Final Prompt Preview must default to collapsed.");
}
const v2Probe = window.KREA2.helpers.coerceState({
  rows: [],
  pretty_preview: true,
  final_preview_open: false,
  scene_sections: { camera: false },
});
if (v2Probe.pretty_preview !== true
    || v2Probe.final_preview_open !== false
    || v2Probe.scene_sections.camera !== false) {
  throw new Error("v2 UI flags must survive workflow restoration.");
}

const restored = window.KREA2.helpers.coerceState({
  rows: [],
  collapsed: { emotion: true },
});
if (!restored.collapsed.emotion) {
  throw new Error("Collapsed category state must survive workflow restoration.");
}

if (state.wizard_expanded !== true) {
  throw new Error("New wizard states must default to the full tabbed editor.");
}
const expandedProbe = window.KREA2.helpers.coerceState({
  rows: [],
  wizard_expanded: true,
});
if (expandedProbe.wizard_expanded !== true) {
  throw new Error("wizard_expanded must survive workflow restoration.");
}
const collapsedProbe = window.KREA2.helpers.coerceState({
  rows: [],
  wizard_expanded: "yes",
});
if (collapsedProbe.wizard_expanded !== true || typeof collapsedProbe.wizard_expanded !== "boolean") {
  throw new Error("wizard_expanded must always coerce to true (the compact card is hidden).");
}
const tidyProbe = window.KREA2.helpers.coerceState({
  rows: [],
  wizard_expanded: false,
});
if (tidyProbe.wizard_expanded !== true) {
  throw new Error("wizard_expanded: false (legacy) must still open the full editor.");
}

/* Stale leftovers from older wizard versions must be dropped on load. */
const staleProbe = window.KREA2.helpers.coerceState({
  rows: [
    { id: "a", category: "lighting_direction", preset_id: "custom.light_ghost", phrase: "light from the left at 1.5m", control_mode: "scalar", intensity: 0, strength: 1.5, enabled: true },
    { id: "b", category: "lighting_direction", preset_id: "custom.light_light_1", phrase: "light from the left at 1.5m", control_mode: "scalar", intensity: 0, strength: 1.5, enabled: true },
    { id: "c", category: "framing", preset_id: "framing.wide_shot", phrase: "wide shot", control_mode: "scalar", intensity: 55, enabled: true },
    { id: "d", category: "composition", preset_id: "composition.subject_left", phrase: "", control_mode: "scalar", intensity: 50, enabled: true },
    { id: "e", category: "lighting_direction", preset_id: "hello", phrase: "light from the left at 1.5m", control_mode: "scalar", intensity: 0, strength: 1.5, enabled: true },
  ],
  scene_sections: {
    lights: [
      { id: "light_1", angleDeg: 0, distanceM: 1.5, heightDeg: 25, strength: 1.5, color: "" },
    ],
  },
});
const staleIds = staleProbe.rows.map((row) => row.id);
if (staleIds.includes("a")) {
  throw new Error("Stale light rows must be pruned when the light no longer exists.");
}
if (staleIds.includes("d")) {
  throw new Error("Rows without a phrase must be pruned.");
}
if (staleIds.includes("e")) {
  throw new Error("Legacy phrase-styled light rows must be pruned.");
}
if (!staleIds.includes("b") || !staleIds.includes("c")) {
  throw new Error("Live light rows and kept concepts must survive the stale-row prune.");
}

const expandedRoundTrip = window.KREA2.helpers.coerceState({
  rows: [],
  wizard_expanded: true,
  scene_collapsed: false,
  footer_open: true,
  active_tab: "scene",
});
if (expandedRoundTrip.wizard_expanded !== true
    || expandedRoundTrip.scene_collapsed !== false
    || expandedRoundTrip.footer_open !== true
    || expandedRoundTrip.active_tab !== "scene") {
  throw new Error("Expanded-mode UI flags must survive workflow restoration.");
}

const preview = await window.KREA2.helpers.fetchCompiledPreview({ rows: [] });
if (preview.final_prompt !== "portrait") {
  throw new Error("The authoritative preview response was not returned.");
}
if (request.url !== "/api/krea2_prompt_wizard/preview" || request.options.method !== "POST") {
  throw new Error("The authoritative preview must use the local preview endpoint.");
}
