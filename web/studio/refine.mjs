/**
 * The refiner: the brain button, its settings, and the panel the rewrite lands in.
 *
 * No image model reads a four-word request the way Krea 2's guide says a
 * prompt should be written. Expanding what the user built — tokens, scene
 * text and all — into the long, flowing description Krea 2 wants is what a
 * small local LLM is for, and `refine_api.py` is the half of this that
 * talks to it (in-process text encoder, or an OpenAI-compatible server).
 *
 * The rewrite is fetched on a click and stored in the node's `refined_doc`
 * widget — never spliced into the token document. It is a draft: it can be
 * corrected in the panel, switched off without being thrown away, and
 * reverted to the prompt the user actually wrote. Structure and security
 * model inspired by roadmaus/ComfyUI-Continuity (MIT).
 */

import { el, anchoredPanel } from "./ui.mjs?v=4";

// ---- settings ---------------------------------------------------------------
//
// Machine-level, on the server: which text encoder is on this disk is a fact
// about this computer, and putting it in the workflow would ship it to whoever
// opens the file next. The remote endpoint and its key live server-side too;
// the browser learns whether a key is set, never the key itself.

const DEFAULTS = {
  backend: "local",
  model: "",
  remoteModel: "",
  temperature: 0.3,
  seed: -1,
  maxTokens: 2048,
};

let settingsCache = null;
let remoteCache = null;

export async function loadRefineSettings({ force = false } = {}) {
  if (!force && settingsCache) return settingsCache;
  try {
    const response = await apiFetch("/krea2_prompt_studio/refine/settings");
    const body = await response.json();
    settingsCache = { ...DEFAULTS, ...(body.settings || {}) };
    remoteCache = body.remote || { url: "", key_set: false };
  } catch {
    settingsCache = { ...DEFAULTS };
  }
  return settingsCache;
}

export function refineSettings() {
  return settingsCache ? { ...settingsCache } : { ...DEFAULTS };
}

/** Write a patch. Paints the cache first, persists after; returns the merge. */
export function saveRefineSettings(patch, { url, key } = {}) {
  settingsCache = { ...refineSettings(), ...patch };
  const payload = { ...settingsCache };
  if (url !== undefined) payload.url = url;
  if (key !== undefined) payload.key = key;
  apiFetch("/krea2_prompt_studio/refine/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((body) => {
      if (body.settings) settingsCache = { ...DEFAULTS, ...body.settings };
      if (body.remote) remoteCache = body.remote;
    })
    .catch(() => {});
  return settingsCache;
}

function apiFetch(path, options) {
  // Plain fetch, same as every other studio module: same-origin by default.
  return fetch(path, options);
}

// ---- model listings ----------------------------------------------------------

let localModelCache = { at: 0, names: [] };

export async function listLocalModels({ force = false } = {}) {
  if (!force && Date.now() - localModelCache.at < 20000) return localModelCache.names;
  try {
    const response = await apiFetch("/krea2_prompt_studio/refine/models");
    const body = await response.json();
    localModelCache = { at: Date.now(), names: body.models ?? [] };
  } catch {
    localModelCache = { at: Date.now(), names: [] };
  }
  return localModelCache.names;
}

export function remoteStatus() {
  return remoteCache || { url: "", key_set: false };
}

let remoteModelCache = { at: 0, names: [], error: "" };

export async function listRemoteModels({ force = false } = {}) {
  if (!force && Date.now() - remoteModelCache.at < 20000) return remoteModelCache;
  try {
    const response = await apiFetch("/krea2_prompt_studio/refine/remote/models");
    const body = await response.json().catch(() => ({}));
    remoteModelCache = {
      at: Date.now(),
      names: body.models ?? [],
      error: response.ok ? "" : (body.error || "the server could not be reached"),
    };
  } catch {
    remoteModelCache = { at: Date.now(), names: [], error: "the server could not be reached" };
  }
  return remoteModelCache;
}

export async function probeLocalServers() {
  try {
    const response = await apiFetch("/krea2_prompt_studio/refine/remote/probe");
    const body = await response.json();
    return body.servers ?? [];
  } catch {
    return [];
  }
}

/** Which model the active backend would use — what the panel names as author. */
export function chosenModel(current = refineSettings()) {
  return (current.backend === "remote" ? current.remoteModel : current.model) || "";
}

// ---- the server call ---------------------------------------------------------

/**
 * Ask for a rewrite of one section.
 *
 * `doc` is the raw token document; the server compiles it with the preset
 * store so the model sees exactly what the node would queue.
 *
 * @returns {Promise<{section, body, source, model, backend, problems}>}
 */
export async function requestRefine({ doc, section }) {
  const current = refineSettings();
  const payload = {
    backend: current.backend,
    doc,
    section,
    temperature: current.temperature,
    seed: current.seed,
    max_tokens: current.maxTokens,
  };
  if (current.backend === "remote") payload.model = current.remoteModel;
  const response = await apiFetch("/krea2_prompt_studio/refine/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "the refine request failed");
  return body.result;
}

// ---- the brain button --------------------------------------------------------

const BRAIN_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.55A3.5 3.5 0 0 0 4.5 8.4a3.5 3.5 0 0 0-1.4 5.6A3.5 3.5 0 0 0 5 19.4c.3 1.5 1.6 2.6 3.2 2.6h.8a2 2 0 0 0 2-2V4.5A2.5 2.5 0 0 0 9.5 2Z"/>' +
  '<path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.55a3.5 3.5 0 0 1 2.5 3.35 3.5 3.5 0 0 1 1.4 5.6A3.5 3.5 0 0 1 19 19.4c-.3 1.5-1.6 2.6-3.2 2.6h-.8a2 2 0 0 1-2-2V4.5A2.5 2.5 0 0 1 14.5 2Z"/>' +
  "</svg>";

export function brainIcon() {
  const span = el("span", "kpw2-refine-icon");
  span.innerHTML = BRAIN_SVG;
  return span;
}

/**
 * The Refine control: one press does the thing, a corner opens its settings.
 *
 * `run({ onStage })` does the work and reports back; this handles the two
 * states the button itself has — idle, and waiting on a model that may take
 * a minute. `onStage(label)` is told what is happening so a refine that is
 * second in line says so.
 */
export function refineButton({ run, onOpenSettings, title }) {
  let busy = false;
  const text = el("span", "kpw2-refine-label", "Refine");
  const button = el("button", "kpw2-toolbar-button kpw2-refine-run");
  button.type = "button";
  button.title =
    title ||
    "Rewrite the expanded prompt into the long, flowing description Krea 2 " +
      "was trained to read, keeping everything you wrote. A draft — you can " +
      "edit, toggle or revert it below.";
  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    button.classList.add("busy");
    try {
      await run({
        onStage: (label) => {
          text.textContent = label;
        },
      });
    } finally {
      busy = false;
      button.classList.remove("busy");
      text.textContent = "Refine";
    }
  });

  const more = el("button", "kpw2-toolbar-button kpw2-refine-more");
  more.type = "button";
  more.textContent = "⚙";
  more.title = chosenModel()
    ? `${chosenModel()} — click to change the model, backend or sampling`
    : "Choose a refiner model";
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    onOpenSettings(more.getBoundingClientRect());
  });

  const group = el("span", "kpw2-refine-group");
  group.append(brainIcon(), text);
  button.replaceChildren(group);

  const wrap = el("span", "kpw2-refine-wrap");
  wrap.append(button, more);
  return wrap;
}

// ---- the settings popover ----------------------------------------------------

const REMOTE_PRESETS = [
  ["LM Studio", "http://localhost:1234/v1"],
  ["Ollama", "http://localhost:11434/v1"],
];

function row(label) {
  const line = el("div", "kpw2-refine-row");
  line.append(el("div", "kpw2-refine-rowlabel", label));
  return line;
}

function select(options, value, onChange) {
  const selectEl = el("select", "kpw2-refine-select");
  for (const option of options) {
    const opt = el("option");
    opt.value = option.value;
    opt.textContent = option.label;
    selectEl.append(opt);
  }
  selectEl.value = value;
  selectEl.addEventListener("change", () => onChange(selectEl.value));
  return selectEl;
}

/**
 * The refiner's settings, beside the button that uses them.
 *
 * Backend on top: "In ComfyUI" lists the text encoders on disk; a server
 * backend offers the two loopback presets plus a free URL and a key box.
 * Sampling dials sit under the model.
 */
export function openRefineSettings({ anchorRect, onChange = () => {} }) {
  const current = refineSettings();
  const panel = anchoredPanel("refine", anchorRect, (root) => {
    const body = el("div", "kpw2-refine-settings");

    // -- backend ----------------------------------------------------------
    const backendRow = row("Model runs");
    backendRow.append(
      select(
        [
          { value: "local", label: "In ComfyUI (text encoder)" },
          { value: "remote", label: "On a local server (LM Studio…)" },
        ],
        current.backend,
        (value) => {
          saveRefineSettings({ backend: value });
          onChange();
          rebuild();
        }
      )
    );
    body.append(backendRow);

    const modelRow = row(current.backend === "local" ? "Text encoder" : "Server model");
    const modelSelect = el("select", "kpw2-refine-select");
    const modelStatus = el("div", "kpw2-refine-hint");
    modelRow.append(modelSelect, modelStatus);
    body.append(modelRow);

    const remoteBox = el("div", "kpw2-refine-remote");
    body.append(remoteBox);

    // -- sampling ---------------------------------------------------------
    const tempRow = row(`Temperature ${current.temperature.toFixed(2)}`);
    const temp = el("input", "kpw2-refine-range");
    temp.type = "range";
    temp.min = "0";
    temp.max = "1.2";
    temp.step = "0.05";
    temp.value = String(current.temperature);
    temp.addEventListener("input", () => {
      const value = Number(temp.value);
      tempRow.firstChild.textContent = `Temperature ${value.toFixed(2)}`;
      saveRefineSettings({ temperature: value });
    });
    tempRow.append(temp);
    body.append(tempRow);

    const seedRow = row("Seed");
    const seedInput = el("input", "kpw2-refine-input");
    seedInput.type = "text";
    seedInput.value = String(current.seed);
    seedInput.title = "-1 draws a new seed every refine";
    seedInput.addEventListener("change", () => {
      const value = Number.parseInt(seedInput.value, 10);
      saveRefineSettings({ seed: Number.isFinite(value) ? value : -1 });
      seedInput.value = String(refineSettings().seed);
    });
    seedRow.append(seedInput);
    body.append(seedRow);

    const tokensRow = row(`Reply length ${current.maxTokens} tokens`);
    const tokens = el("input", "kpw2-refine-range");
    tokens.type = "range";
    tokens.min = "512";
    tokens.max = "8192";
    tokens.step = "256";
    tokens.value = String(current.maxTokens);
    tokens.addEventListener("input", () => {
      const value = Number(tokens.value);
      tokensRow.firstChild.textContent = `Reply length ${value} tokens`;
      saveRefineSettings({ maxTokens: value });
    });
    tokensRow.append(tokens);
    body.append(tokensRow);

    root.append(body);

    // -- dynamic halves, rebuilt when the backend flips --------------------
    async function fillLocalModels() {
      modelStatus.textContent = "loading text encoders…";
      const names = await listLocalModels();
      modelSelect.replaceChildren();
      if (!names.length) {
        modelStatus.textContent =
          "No text encoders found in models/text_encoders — drop a Qwen3-VL or Qwen3.5 checkpoint there.";
        return;
      }
      for (const name of names) {
        const opt = el("option");
        opt.value = name;
        opt.textContent = name;
        modelSelect.append(opt);
      }
      const chosen = refineSettings().model;
      modelSelect.value = chosen && names.includes(chosen) ? chosen : names[0];
      saveRefineSettings({ model: modelSelect.value });
      modelStatus.textContent = "";
      onChange();
    }

    async function fillRemoteModels() {
      modelStatus.textContent = "asking the server…";
      const listing = await listRemoteModels();
      modelSelect.replaceChildren();
      if (listing.error) {
        modelStatus.textContent = listing.error;
        return;
      }
      if (!listing.names.length) {
        modelStatus.textContent = "The server is reachable but lists no models — load one in LM Studio or pull one in Ollama.";
        return;
      }
      for (const name of listing.names) {
        const opt = el("option");
        opt.value = name;
        opt.textContent = name;
        modelSelect.append(opt);
      }
      const chosen = refineSettings().remoteModel;
      modelSelect.value =
        chosen && listing.names.includes(chosen) ? chosen : listing.names[0];
      saveRefineSettings({ remoteModel: modelSelect.value });
      modelStatus.textContent = "";
      onChange();
    }

    function buildRemoteBox() {
      remoteBox.replaceChildren();
      if (refineSettings().backend !== "remote") return;
      const status = remoteStatus();
      const urlRow = row("Server URL");
      const urlInput = el("input", "kpw2-refine-input");
      urlInput.type = "text";
      urlInput.value = status.url || "";
      urlInput.placeholder = "http://localhost:1234/v1";
      urlInput.setAttribute("list", "kpw2-refine-servers");
      const serverList = el("datalist");
      serverList.id = "kpw2-refine-servers";
      for (const [name, url] of REMOTE_PRESETS) {
        const opt = el("option");
        opt.value = url;
        opt.label = name;
        serverList.append(opt);
      }
      urlRow.append(urlInput, serverList);
      const keyRow = row("API key (optional)");
      const keyInput = el("input", "kpw2-refine-input");
      keyInput.type = "password";
      keyInput.placeholder = status.key_set ? "a key is set — type to replace" : "";
      keyRow.append(keyInput);
      const saveButton = el("button", "kpw2-ghost-button", "Connect");
      saveButton.type = "button";
      saveButton.addEventListener("click", () => {
        saveRefineSettings({}, { url: urlInput.value, key: keyInput.value });
        remoteBox.replaceChildren(el("div", "kpw2-refine-hint", "Saved — loading models…"));
        setTimeout(() => {
          buildRemoteBox();
          fillRemoteModels();
        }, 400);
      });
      const probeButton = el("button", "kpw2-ghost-button", "Find running servers");
      probeButton.type = "button";
      probeButton.addEventListener("click", async () => {
        probeButton.textContent = "Looking…";
        const servers = await probeLocalServers();
        probeButton.textContent = "Find running servers";
        if (!servers.length) {
          remoteBox.append(el("div", "kpw2-refine-hint", "Neither LM Studio (port 1234) nor Ollama (port 11434) is answering."));
          return;
        }
        const found = servers.map((server) => `${server.name} — ${server.url}`).join(", ");
        const first = servers[0];
        urlInput.value = first.url;
        remoteBox.append(el("div", "kpw2-refine-hint", `Found: ${found}`));
      });
      const buttons = el("div", "kpw2-refine-buttons");
      buttons.append(saveButton, probeButton);
      remoteBox.append(urlRow, keyRow, buttons);
    }

    function rebuild() {
      modelRow.firstChild.textContent =
        refineSettings().backend === "local" ? "Text encoder" : "Server model";
      buildRemoteBox();
      if (refineSettings().backend === "local") fillLocalModels();
      else fillRemoteModels();
    }
    rebuild();
  });
  return panel;
}

// ---- the panel ---------------------------------------------------------------

/**
 * The drafts, where they can be read, edited, toggled and thrown away.
 *
 * Owns nothing: it is handed the state that holds the drafts and a commit
 * callback, like every other studio component. Built once and refreshed in
 * place, because the textareas in it are being typed into.
 */
export class RefinePanel {
  constructor({ getState, onCommit }) {
    this.getState = getState;
    this.onCommit = onCommit;
    // Per-section advisory lists, so refining the last frame does not erase
    // what was said about the prompt.
    this.sectionProblems = {};
    this.root = el("div", "kpw2-refine-panel");
    this.boxes = new Map();
    this.render();
  }

  drafts() {
    return this.getState() || {};
  }

  get problems() {
    return Object.values(this.sectionProblems).flat();
  }

  /** Take a server reply for one section. */
  apply(result) {
    const drafts = this.getState() || {};
    const previous = drafts[result.section];
    drafts[result.section] = {
      body: result.body,
      // What it was written from, so the panel can say when the prompt has
      // moved on underneath it. A rewrite of an older sentence is a stale
      // draft, not a broken one.
      source: result.source,
      model: result.model,
      enabled: previous ? previous.enabled !== false : true,
    };
    const where = result.section === "last_prompt" ? "last frame" : "prompt";
    delete this.sectionProblems._error;
    this.sectionProblems[result.section] = (result.problems || []).map(
      (problem) => `${where}: ${problem}`
    );
    this.render();
    this.onCommit?.();
  }

  fail(message) {
    this.sectionProblems = {};
    this.sectionProblems._error = [message];
    this.render();
  }

  /** Throw one draft away. */
  clear(section) {
    const drafts = this.getState() || {};
    delete drafts[section];
    delete this.sectionProblems[section];
    this.render();
    this.onCommit?.();
  }

  box(section, value) {
    if (!this.boxes.has(section)) {
      const made = el("textarea", "kpw2-refine-box");
      made.rows = "5";
      made.placeholder = "The rewritten prompt.";
      made.addEventListener("input", (event) => {
        // Resolve the state at call time: the state object can be replaced
        // wholesale when a workflow loads, and a setter captured at box
        // creation would then write into a dead object.
        const current = this.getState() || {};
        if (current[section]) current[section].body = event.target.value;
        this.onCommit?.();
      });
      made.addEventListener("pointerdown", (event) => event.stopPropagation());
      this.boxes.set(section, made);
    }
    const box = this.boxes.get(section);
    const next = value ?? "";
    if (box.value !== next) box.value = next;
    return box;
  }

  render() {
    const drafts = this.drafts();
    const sections = ["prompt", "last_prompt"].filter((section) => drafts[section]);
    // What the panel is made of, as against what is written in it: typing
    // moves the second and never the first, so box values ride the `fill`
    // path below and a render never rebuilds under the caret.
    const shape = JSON.stringify([
      sections,
      sections.map((s) => [
        drafts[s].enabled !== false,
        drafts[s].model,
        !!drafts[s].stale,
      ]),
      this.problems,
    ]);
    if (shape === this._shape) {
      for (const section of sections) this.fill(section);
      return;
    }
    this._shape = shape;

    if (!sections.length && !this.problems.length) {
      this.root.replaceChildren();
      this.boxes.clear();
      return;
    }

    const parts = [];
    const note = el("div", "kpw2-refine-note");
    note.textContent =
      "Refined drafts — queued instead of your token prompt, not alongside it. " +
      "Negatives still come from your presets.";
    parts.push(note);
    for (const section of sections) {
      const draft = drafts[section];
      const on = draft.enabled !== false;
      const label = section === "last_prompt" ? "last frame" : "prompt";
      const head = el("div", "kpw2-refine-head");
      const toggle = el("button", `kpw2-refine-toggle${on ? " on" : ""}`);
      toggle.type = "button";
      toggle.title = on
        ? "This draft is what the model will read. Click to queue your own prompt instead — the draft is kept."
        : "Your own prompt is what the model will read. Click to use the draft again.";
      toggle.append(
        el("span", "kpw2-refine-dot"),
        el("span", null, on ? label : `${label} (off)`)
      );
      toggle.addEventListener("click", () => {
        draft.enabled = !on;
        this.render();
        this.onCommit?.();
      });
      head.append(toggle);
      if (draft.model) head.append(el("span", "kpw2-refine-badge", draft.model));
      if (draft.stale) {
        const stale = el("span", "kpw2-refine-badge kpw2-refine-stale", "prompt edited since");
        stale.title =
          "Your prompt has changed since this draft was written. It still queues as it stands — refine again to fold the change in.";
        head.append(stale);
      }
      head.append(el("span", "kpw2-refine-spacer"));
      const revert = el("button", "kpw2-ghost-button", "Revert");
      revert.type = "button";
      revert.title = "Throw the draft away and go back to your own prompt.";
      revert.addEventListener("click", () => this.clear(section));
      head.append(revert);
      parts.push(head);
      parts.push(this.box(section, draft.body));
    }
    for (const problem of this.problems) {
      parts.push(el("div", "kpw2-refine-warn", problem));
    }
    this.root.replaceChildren(...parts);
  }

  /** Values into boxes already drawn, only where they differ (caret safety). */
  fill(section) {
    const draft = (this.getState() || {})[section];
    if (draft) this.box(section, draft.body, () => {});
  }
}
