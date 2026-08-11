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

const restored = window.KREA2.helpers.coerceState({
  rows: [],
  collapsed: { emotion: true },
});
if (!restored.collapsed.emotion) {
  throw new Error("Collapsed category state must survive workflow restoration.");
}

const randomized = window.KREA2.helpers.coerceState({
  rows: [],
  characters: [
    {
      id: "c1",
      name: "Mara",
      randomize_fields: {
        hair_color: ["red", "blonde"],
        lora_triggers: ["trigger alpha", "trigger beta"],
      },
      randomize_direction_groups: { emotion: true },
    },
  ],
  randomize_on_job: { subject_expression: true, camera_film: true },
});
const mara = randomized.characters[0];
if (mara.randomize_fields.lora_triggers.join("|") !== "trigger alpha|trigger beta"
    || mara.randomize_fields.hair_color.join("|") !== "red|blonde"
    || mara.randomize_direction_groups.emotion !== true
    || randomized.randomize_on_job.subject_expression !== true
    || randomized.randomize_on_job.camera_film !== true) {
  throw new Error("Each-job randomization flags and snapshot pools must survive restoration.");
}

const preview = await window.KREA2.helpers.fetchCompiledPreview({ rows: [] });
if (preview.final_prompt !== "portrait") {
  throw new Error("The authoritative preview response was not returned.");
}
if (request.url !== "/api/krea2_prompt_wizard/preview" || request.options.method !== "POST") {
  throw new Error("The authoritative preview must use the local preview endpoint.");
}
