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

if (state.wizard_expanded !== false) {
  throw new Error("New wizard states must default to the compact B2 shell.");
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
  throw new Error("wizard_expanded must be coerced to a boolean.");
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
