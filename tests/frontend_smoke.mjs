import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryPayload = JSON.parse(
  readFileSync(path.join(rootDir, "presets", "default_library.json"), "utf-8"),
);
const conflictsPayload = JSON.parse(
  readFileSync(path.join(rootDir, "presets", "conflicts.json"), "utf-8"),
);

class ClassList {
  constructor(element) {
    this.element = element;
  }
  _classes() {
    return new Set(String(this.element.className || "").split(/\s+/).filter(Boolean));
  }
  _write(set) {
    this.element.className = Array.from(set).join(" ");
  }
  add(...values) {
    const set = this._classes();
    values.forEach((value) => { if (value) set.add(value); });
    this._write(set);
  }
  remove(...values) {
    const set = this._classes();
    values.forEach((value) => set.delete(value));
    this._write(set);
  }
  toggle(value, force) {
    const set = this._classes();
    let next;
    if (force === undefined) {
      if (set.has(value)) { set.delete(value); next = false; }
      else { set.add(value); next = true; }
    } else {
      force ? set.add(value) : set.delete(value);
      next = force;
    }
    this._write(set);
    return next;
  }
}

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList(this);
    this.value = "";
    this.parentNode = null;
    this.listeners = {};
    this._innerHTML = "";
    this._textContent = "";
    this.disabled = false;
    this.checked = false;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === "") this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set textContent(value) {
    this._textContent = String(value == null ? "" : value);
    const textNode = new Element("#text");
    textNode._textContent = this._textContent;
    textNode.children = [];
    this.children = [textNode];
  }
  get textContent() {
    return this._textContent;
  }
  appendChild(child) {
    if (!child || typeof child !== "object" || !child.tagName) {
      throw new Error("appendChild requires a DOM node (caught a non-node being appended).");
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child, sibling) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(sibling);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parentNode = this;
    return child;
  }
  setAttribute(name, value) {
    if (name === "class") this.className = String(value);
    else if (name === "value") this.value = String(value);
    else if (name === "checked") this.checked = value === "true" || value === true;
    else if (name === "disabled") this.disabled = value === "true" || value === true;
    else this[name] = value;
  }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  removeEventListener() {}
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }
  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      if (node !== this && this._matches(node, selector)) matches.push(node);
      for (const child of node.children || []) walk(child);
    };
    walk(this);
    return matches;
  }
  _matches(node, selector) {
    const sel = String(selector || "").trim();
    if (sel.startsWith(".")) {
      return (node.className || "").split(/\s+/).includes(sel.slice(1));
    }
    if (sel.includes(" ")) {
      const parts = sel.split(/\s+/).filter(Boolean);
      return parts.every((part) => this._matches(node, part));
    }
    return node.tagName === sel;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  scrollIntoView() {}
  focus() {}
  select() {}
  click() { if (typeof this.listeners.click === "function") this.listeners.click({}); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 24 }; }
}

const svgTags = new Set(["svg", "path", "circle", "rect", "line", "polygon"]);

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createElementNS: (ns, tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element("#text"), { textContent: text }),
  head: new Element("head"),
  body: new Element("body"),
  _listeners: {},
  addEventListener(name, listener) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(listener);
  },
  removeEventListener(name, listener) {
    if (!this._listeners[name]) return;
    this._listeners[name] = this._listeners[name].filter((l) => l !== listener);
  },
  querySelector() { return null; },
};
globalThis.window = globalThis;
window.KREA2 = {};
let savedPresetWrites = 0;
let savedPresetFixtures = [{ id: "legacy_performance", scope: "performance", label: "Legacy performance", rows: [{ category: "emotion", preset_id: "emotion.anger", phrase: "anger", intensity: 85, control_mode: "scalar" }] }];
const presetTestDirectory = mkdtempSync(path.join(os.tmpdir(), "krea2-frontend-presets-"));
const presetTestStore = path.join(presetTestDirectory, "presets.json");
process.on("exit", () => {
  if (path.dirname(presetTestDirectory) === path.resolve(os.tmpdir()) && path.basename(presetTestDirectory).startsWith("krea2-frontend-presets-")) rmSync(presetTestDirectory, { recursive: true, force: true });
});
writeFileSync(presetTestStore, JSON.stringify({ schema_version: 2, presets: savedPresetFixtures }));
const presetRequests = [];
const toasts = [];
let delayNextPresetResponse = false;
let releasePresetResponse = null;
window.prompt = () => { throw new Error("Native prompts must not be used by preset saving"); };
window.app = { api: { apiURL: (url) => url }, extensionManager: { toast: { add(message) { toasts.push(message); } } } };
globalThis.fetch = (url, options) => {
  const apiPath = String(url).replace(/^.*\/krea2_prompt_wizard/, "/krea2_prompt_wizard");
  if (apiPath.includes("/object_info/LoraLoader")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        LoraLoader: {
          input: {
            required: {
              lora_name: [
                [
                  "image_models/char_style.safetensors",
                  "image_models/utility/scale_helpers.safetensors",
                  "video_models/motion_v2.safetensors",
                  "root_level.safetensors",
                ],
                { image_upload: true },
              ],
            },
          },
        },
      }),
    });
  }
  if (apiPath === "/krea2_prompt_wizard/library") {
    return Promise.resolve({ ok: true, json: async () => libraryPayload });
  }
  if (apiPath === "/krea2_prompt_wizard/conflicts") {
    return Promise.resolve({ ok: true, json: async () => conflictsPayload });
  }
  if (apiPath === "/krea2_prompt_wizard/saved_presets") {
    if (options?.method === "POST") {
      const request = JSON.parse(options.body);
      presetRequests.push(request);
      const response = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json,sys; from src.saved_presets import persist_saved_presets,SavedPresetConflict; data=json.load(sys.stdin)\ntry:\n presets=persist_saved_presets(data['presets'],base_presets=data.get('base_presets'),path=sys.argv[1]); print(json.dumps({'status':200,'presets':presets}))\nexcept SavedPresetConflict as error:\n print(json.dumps({'status':409,'presets':error.latest,'conflict_ids':error.conflict_ids,'error':{'message':str(error)}}))", presetTestStore], { input: options.body, cwd: rootDir, encoding: "utf8" });
      if (response.status !== 0) throw new Error(response.stderr);
      const payload = JSON.parse(response.stdout);
      savedPresetFixtures = payload.presets;
      if (payload.status === 200) savedPresetWrites++;
      const result = { ok: payload.status === 200, status: payload.status, json: async () => payload };
      if (delayNextPresetResponse) { delayNextPresetResponse = false; return new Promise(resolve => { releasePresetResponse = () => resolve(result); }); }
      return Promise.resolve(result);
    }
    return Promise.resolve({ ok: true, json: async () => ({ presets: savedPresetFixtures }) });
  }
  if (apiPath === "/krea2_prompt_wizard/master_presets") {
    return Promise.resolve({ ok: true, json: async () => ({ master_presets: [] }) });
  }
  if (apiPath === "/krea2_prompt_wizard/concept_colors") {
    return Promise.resolve({ ok: true, json: async () => ({ colors: {} }) });
  }
  if (apiPath === "/krea2_prompt_wizard/preview") {
    return Promise.resolve({
      ok: true,
      json: async () => ({ final_prompt: "", plain_prompt: "", fragments: [], warnings: [] }),
    });
  }
  if (apiPath === "/krea2_prompt_wizard/loras") {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        loras: [
          "image_models/char_style.safetensors",
          "image_models/utility/scale_helpers.safetensors",
          "video_models/motion_v2.safetensors",
          "root_level.safetensors",
        ],
      }),
    });
  }
  return new Promise(() => {});
};
globalThis.confirm = () => true;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
  "state.mjs",
  "searchable_selector.mjs",
  "preset_row.mjs",
  "library_editor.mjs",
  "materialize.mjs",
  "inspector.mjs",
  "workspace.mjs",
  "lighting_scene.mjs",
  "wizard_widget.mjs",
];
for (const moduleName of modules) {
  await import(pathToFileURL(path.join(root, "web", "js", moduleName)));
}

const stateWidget = {
  name: "wizard_state_json",
  value: "",
};
const node = {
  widgets: [stateWidget],
  setDirtyCanvas() {},
  size: [760, 500],
  setSize(size) { this.size = size; },
};
const wizard = window.KREA2.createWizardWidget(node);

if (!wizard || !stateWidget.hidden) {
  throw new Error("Wizard DOM failed to initialize");
}

/* Let the library / conflicts / presets fetches resolve so the seeded rows
 * are enriched from the real library. */
await new Promise((resolve) => setTimeout(resolve, 0));

function findByClass(element, className) {
  const matches = [];
  if ((element.className || "").split(/\s+/).includes(className)) matches.push(element);
  for (const child of element.children || []) {
    matches.push(...findByClass(child, className));
  }
  return matches;
}

function textOf(element) {
  if (!element) return "";
  if (element.tagName === "#text") return element.textContent || "";
  return (element.children || []).map((child) => textOf(child)).join("");
}

function switchTab(tabId) {
  wizard.setTab(tabId);
}


function assert(value, message) { if (!value) throw new Error(message); }
function clickText(label, host = wizard.root) {
  const element = findByClass(host, "krea2-wizard-btn").find(button => textOf(button) === label);
  assert(element, "Missing action: " + label);
  return element.listeners.click({ currentTarget: element, stopPropagation() {}, preventDefault() {} });
}
function clickAria(label, host = wizard.root) {
  const element = field(label, host);
  assert(element, "Missing action: " + label);
  return element.listeners.click({ currentTarget: element, stopPropagation() {}, preventDefault() {} });
}
function section(id) { return findByClass(wizard.root, "krea2-workspace-section").find(item => item.dataset.sectionId === id); }
function expand(id) {
  const item = section(id);
  const head = findByClass(item, "krea2-workspace-heading")[0];
  if (head["aria-expanded"] !== "true") head.click();
}
function field(label, host = wizard.root) {
  const walk = item => item["aria-label"] === label ? item : item.children.map(walk).find(Boolean);
  return walk(host);
}
function edit(label, value) {
  const input = field(label);
  assert(input, "Missing editable field " + label);
  input.value = value;
  wizard.root.listeners.input({ target: input });
  input.listeners.input({ target: input });
}
assert(wizard.root.className.includes("krea2-workspace"), "Wizard renders a unified workspace");
assert(!findByClass(wizard.root, "krea2-wizard-tab").length, "The obsolete major tabs are removed");
for (const id of ["character", "performance", "lighting", "environment", "camera", "style", "random", "advanced", "inspector"]) assert(section(id), "Missing workspace section " + id);
assert(node.size[0] === 760 && node.size[1] === 500, "Rendering preserves the saved node size");
assert(wizard.getState().characters.length === 1, "Fresh node has one starter character");
assert(findByClass(wizard.root, "krea2-character-category").length === 3, "Selected-character fine performance controls remain accessible");
const original = wizard.getState();
expand("environment");
edit("Environment description", "A real authored environment");
assert(wizard.getState().setting.description === "A real authored environment", "Typing changes the actual persisted document");
assert(wizard.getState().document_revision > original.document_revision, "Edits advance revision");
edit("Environment description", "A real authored environment extended");
clickAria("Undo");
assert(wizard.getState().setting.description === original.setting.description, "Typing in one field is one meaningful undo transaction");
clickAria("Redo");
assert(wizard.getState().setting.description === "A real authored environment extended", "Redo restores the grouped edit");
const character = wizard.getState().characters[0];
character.position = "left";
character.rows.push({ id: "placement_test", category: "position", preset_id: "position.test", phrase: "seated left", strength: 1, enabled: true });
wizard.setState({ ...wizard.getState(), characters: [character] });
const performance = character.rows.filter(row => row.category !== "position");
wizard.applyPreset({ id: "identity_test", scope: "character", label: "Test identity", character: { name: "New identity", sex: "female", rows: [{ id: "unwanted", category: "emotion", phrase: "wrong performance", strength: 1, enabled: true }] } });
assert(wizard.getState().characters[0].name === "New identity", "Character identity preset applies");
assert(JSON.stringify(wizard.getState().characters[0].rows) === JSON.stringify(character.rows), "Identity load retains the current performance by default");
assert(wizard.getState().characters[0].position === "left", "Identity load preserves placement");
wizard.applyPreset({ id: "performance_test", scope: "performance", label: "Authored performance", rows: [{ id: "new", category: "emotion", preset_id: "missing.saved.emotion", phrase: "my custom saved emotional phrase", strength: 2.25, enabled: true }] });
let applied = wizard.getState().characters[0];
assert(applied.rows.some(row => row.id === "placement_test"), "Performance replace excludes placement");
assert(applied.rows.some(row => row.phrase === "my custom saved emotional phrase" && row.strength === 2.25), "Missing library entries preserve the authored snapshot and its weight");
assert(!applied.rows.some(row => performance.some(old => old.id === row.id)), "Performance replace removes previous performance rows");
wizard.applyPreset({ id: "combine_test", scope: "performance", label: "Combine", rows: [{ id: "new", category: "emotion", preset_id: "missing.saved.emotion", phrase: "updated saved phrase", strength: 0.5, enabled: true }, { id: "gaze", category: "gaze", preset_id: "gaze.missing", phrase: "custom gaze", strength: 1, enabled: true }] }, { combine: true });
applied = wizard.getState().characters[0];
assert(applied.rows.filter(row => row.preset_id === "missing.saved.emotion").length === 1 && applied.rows.find(row => row.preset_id === "missing.saved.emotion").strength === 0.5, "Performance combine updates matching weights instead of duplicating them");
assert(applied.rows.some(row => row.id === "placement_test") && applied.name === "New identity", "Combine preserves identity and placement");
wizard.applyPreset({ id: "group_test", scope: "group", group: "camera_film", label: "Snapshot", rows: [{ id: "missing_camera", category: "composition", preset_id: "deleted.custom.camera", label: "Saved custom camera", phrase: "authored camera phrase", strength: -0.25, enabled: true }] });
assert(wizard.getState().rows.some(row => row.phrase === "authored camera phrase" && row.strength === -0.25), "Group application is atomic and keeps missing custom snapshots");
assert(wizard.getState().rows.find(row => row.preset_id === "deleted.custom.camera").origin_action === "group_test", "Current group application records the applied preset source");
const shockPreset = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json; from src.saved_presets import DEFAULT_PERFORMANCE_PRESETS; print(json.dumps(next(preset for preset in DEFAULT_PERFORMANCE_PRESETS if preset['id']=='performance.shock')))"], { cwd: rootDir, encoding: "utf8" });
assert(shockPreset.status === 0, "The real coordinated Shock preset is available");
const beforeShock = JSON.stringify(wizard.getState());
wizard.applyPreset(JSON.parse(shockPreset.stdout));
const appliedShockState = wizard.getState();
const shockTrace = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json,sys; from src.compiler import compile_state_json; from src.library import load_library; from src.wizard import prepare_state; state=json.load(sys.stdin); library=load_library(); print(json.dumps(compile_state_json(prepare_state(state,library),library)))"], { input: JSON.stringify(appliedShockState), cwd: rootDir, encoding: "utf8" });
assert(shockTrace.status === 0, "The actual normalized Shock compiler trace executes");
const compiledShock = JSON.parse(shockTrace.stdout);
assert(compiledShock.trace.emitted_spans.some(span => span.text === "(shocked expression:3)" && span.origin === "preset" && span.origin_action === "performance.shock"), "New Shock application has actual preset provenance in the compiler inspector span");
const legacyProvenance = JSON.parse(JSON.stringify(appliedShockState));
for (const row of legacyProvenance.characters[0].rows) { delete row.origin; delete row.origin_action; }
const legacyTrace = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json,sys; from src.compiler import compile_state_json; from src.library import load_library; from src.wizard import prepare_state; state=json.load(sys.stdin); library=load_library(); print(json.dumps(compile_state_json(prepare_state(state,library),library)))"], { input: JSON.stringify(legacyProvenance), cwd: rootDir, encoding: "utf8" });
assert(legacyTrace.status === 0 && JSON.parse(legacyTrace.stdout).trace.emitted_spans.some(span => span.text === "(shocked expression:3)" && span.origin === "legacy_imported" && span.origin_action === "unknown"), "Legacy documents retain their existing provenance default: " + legacyTrace.stderr + (legacyTrace.stdout || ""));
wizard.setState(JSON.parse(beforeShock));
expand("advanced");
assert(!field("Phrase · Saved custom camera"), "Concept rows no longer embed phrase editors");
assert(findByClass(wizard.root, "krea2-pill").length > 0, "Concepts render as compact strength pills");
const nativeStrength = field("Native weighting strength");
assert(nativeStrength.type === "number" && nativeStrength.min === "0" && nativeStrength.max === "4", "Native strength numeric control uses the backend range");
edit("Native weighting strength", "4");
assert(wizard.getState().native_weighting_strength === 4, "Native strength four is accepted without lowering it to three");
edit("Native weighting strength", "0");
wizard.setState(wizard.getState());
assert(field("Native weighting strength").value === "0", "Zero native strength remains visible after rendering");
const liveRevision = wizard.getState().document_revision;
const liveSnapshot = JSON.stringify(wizard.getState());
assert(wizard.applyResolvedState({ ...wizard.getState(), base_prompt: "late queued job", document_revision: liveRevision - 1 }, [liveRevision - 1]) === false, "Late job results cannot overwrite a newer document");
assert(JSON.stringify(wizard.getState()) === liveSnapshot, "Stale result rejection preserves all current edits");
wizard.recordExecution("actual generated prompt", { krea2_resolved_revision: [liveRevision - 1], krea2_trace: [JSON.stringify({ native_weighting: { enabled: true, strength: 4, encoded_text: "actual clean encoded text", token_weights: [[2, 1, 6], [3, 1, 6]] } })], krea2_warnings: ["Test warning"] });
assert(wizard.getExecutionHistory()[0] === "actual generated prompt", "Actual generated prompt remains available despite stale result");
expand("inspector");
assert(textOf(section("inspector")).includes("Actual last run") && textOf(section("inspector")).includes("current document has changed"), "Inspector distinguishes current document and stale actual run");
assert(textOf(section("inspector")).includes("strength 4 · 2 matched token positions") && textOf(section("inspector")).includes("actual clean encoded text"), "Native run inspection exposes strength, token match count and actual encoded text in readable form");
assert(!textOf(section("inspector")).includes('"token_weights"'), "Native inspection avoids dumping raw diagnostic JSON");
let queued = 0;
window.app.queuePrompt = async (number, count) => { assert(number === 0 && count === 1, "Queue uses native whole-workflow arguments"); queued++; };
await clickText("Queue workflow");
assert(queued === 1, "Queue invokes the native ComfyUI queue once");
const host = new Element("div"); host.appendChild(wizard.root);
const documentBeforeFocus = JSON.stringify(wizard.getState());
wizard.focusEditor();
assert(wizard.root.parentNode.className === "krea2-workspace-focus-overlay", "Focus editor exists outside the canvas transform");
assert(JSON.stringify(wizard.getState()) === documentBeforeFocus, "Focused editor uses the same state without copying it");
wizard.focusEditor();
assert(wizard.root.parentNode === host, "Closing focused editor restores the same DOM widget");
let contained = false;
wizard.root.listeners.wheel({ stopPropagation() { contained = true; } });
assert(contained, "Workspace wheel events stay contained at scroll boundaries");
const revisionBeforeRestore = wizard.getState().document_revision;
expand("lighting");
const lightStage = () => findByClass(wizard.root, "krea2-v2-light-stage")[0];
const bustPoints = () => findByClass(wizard.root, "krea2-v2-lt-figure")[0].children[0].points;
const beforeWheel = bustPoints();
let preventedLightWheel = false;
let stoppedLightWheel = false;
lightStage().listeners.wheel({ deltaY: 100, altKey: false,
  preventDefault() { preventedLightWheel = true; }, stopPropagation() { stoppedLightWheel = true; } });
assert(!preventedLightWheel && !stoppedLightWheel && bustPoints() === beforeWheel, "Ordinary lighting wheel leaves workspace scrolling available and never zooms");
lightStage().listeners.wheel({ deltaY: 100, altKey: true,
  preventDefault() { preventedLightWheel = true; }, stopPropagation() { stoppedLightWheel = true; } });
assert(preventedLightWheel && stoppedLightWheel && bustPoints() !== beforeWheel, "Alt+wheel explicitly zooms the lighting view and consumes only that gesture");
assert(lightStage()["aria-label"].includes("Alt+wheel to zoom"), "Lighting zoom instruction describes the actual gesture");
const secondStateWidget = { name: "wizard_state_json", value: JSON.stringify(wizard.getState()) };
const secondWizard = window.KREA2.createWizardWidget({ widgets: [secondStateWidget], size: [760, 500], setDirtyCanvas() {}, setSize(size) { this.size = size; } });
const secondStage = findByClass(secondWizard.root, "krea2-v2-light-stage")[0];
const firstIds = new Set(lightStage().children[0].children.map(child => child.id));
const secondIds = new Set(secondStage.children[0].children.map(child => child.id));
assert(secondIds.size > 0 && [...secondIds].every(id => !firstIds.has(id)), "Multiple wizard lighting stages have independent SVG definition IDs");
const checkSvgReferences = (element, ids) => {
  for (const value of [element.fill, element.filter, typeof element.style === "string" ? element.style : ""]) {
    for (const match of String(value || "").matchAll(/url\(#([^)]+)\)/g)) assert(ids.has(match[1]), "Lighting SVG references resolve inside their own wizard");
  }
  for (const child of element.children || []) checkSvgReferences(child, ids);
};
checkSvgReferences(lightStage(), firstIds);
checkSvgReferences(secondStage, secondIds);
const colorButton = findByClass(secondWizard.root, "krea2-v2-lt-colour-btn")[0];
colorButton.listeners.click({ stopPropagation() {} });
assert(findByClass(document.body, "krea2-color-popup").length === 1, "Lighting color popup is open during removal");
await new Promise(resolve => setTimeout(resolve, 0));
secondWizard.dispose();
assert(findByClass(document.body, "krea2-color-popup").length === 0 && (document._listeners.click || []).length === 0, "Removing a wizard closes its popup and releases the outside-click listener");

const legacyIntensities = [85, 75, 70, 65, -75, 0];
const backendWeights = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json; from src.weight_mapping import slider_to_weight_scalar; print(json.dumps([slider_to_weight_scalar(value) for value in [85,75,70,65,-75,0]]))"], { cwd: rootDir, encoding: "utf8" });
assert(backendWeights.status === 0, "Backend weight mapping parity fixture executes");
const expectedWeights = JSON.parse(backendWeights.stdout);
for (const [index, intensity] of legacyIntensities.entries()) {
  const legacyRow = { id: "legacy-weight-" + index, preset_id: "emotion.anger", category: "emotion", phrase: "anger", control_mode: "scalar", intensity, enabled: true };
  const renderedRow = window.KREA2.presetRow.render(legacyRow, { library: libraryPayload.presets || libraryPayload, editRow() {}, removeRow() {}, markDirty() {}, onReorder() {} });
  const editorWeight = Number(findByClass(renderedRow, "krea2-row-value")[0]["aria-valuenow"]);
  assert(Math.abs(editorWeight - expectedWeights[index]) < 1e-12 && legacyRow.strength === undefined, "Legacy row editor shows the exact backend weight without mutating intensity");
  const reloadState = wizard.getState();
  reloadState.characters[0].rows = [legacyRow];
  wizard.setState(JSON.parse(JSON.stringify(reloadState)));
  expand("performance");
  const pillValue = Number(findByClass(section("performance"), "krea2-row-value")[0]["aria-valuenow"]);
  assert(Math.abs(pillValue - expectedWeights[index]) < 1e-12, "Serialized legacy performance pills show the compiled weight");
  window.KREA2.helpers.cleanupDOM(renderedRow);
}
const rawBackend = spawnSync(process.env.PYTHON || "python", ["-B", "-c", "import json; from src.weight_mapping import weight_for_row; print(json.dumps([weight_for_row({'control_mode':'raw','intensity':100}, expert=True),weight_for_row({'control_mode':'raw','intensity':-100}, expert=True),weight_for_row({'strength':4,'control_mode':'raw','intensity':100}, expert=True)]))"], { cwd: rootDir, encoding: "utf8" });
assert(rawBackend.status === 0, "Backend expert raw mapping fixture executes");
for (const [index, row] of [{ control_mode: "raw", intensity: 100 }, { control_mode: "raw", intensity: -100 }, { control_mode: "raw", intensity: 100, strength: 4 }].entries()) assert(window.KREA2.helpers.defaultWeightForRow(row, true) === JSON.parse(rawBackend.stdout)[index], "Expert raw legacy weights and clamped direct weights match backend");
wizard.applyPreset({ id: "legacy_performance", scope: "performance", label: "Legacy performance", rows: [{ category: "emotion", preset_id: "emotion.anger", phrase: "anger", intensity: 85, control_mode: "scalar" }] });
const normalizedPerformance = JSON.parse(JSON.stringify(wizard.getState()));
normalizedPerformance.characters[0].rows[0].label = "Anger";
normalizedPerformance.characters[0].rows[0].enabled = true;
normalizedPerformance.characters[0].rows[0].strength = expectedWeights[0];
wizard.setState(normalizedPerformance);
assert(textOf(section("performance")).includes("Legacy performance") && !textOf(section("performance")).includes("Modified"), "Normalization and serialization keep the semantic performance snapshot unmodified");
const retainedPerformance = wizard.getState().characters[0];
wizard.applyPreset({ id: "identity-without-performance", scope: "character", label: "New identity", character: { name: "New name", rows: [], loaded_performance_preset_id: "unwanted-old-performance", loaded_performance_snapshot: "wrong snapshot" } });
assert(wizard.getState().characters[0].loaded_performance_preset_id === retainedPerformance.loaded_performance_preset_id && wizard.getState().characters[0].loaded_performance_snapshot === retainedPerformance.loaded_performance_snapshot && JSON.stringify(wizard.getState().characters[0].rows) === JSON.stringify(retainedPerformance.rows), "Identity loading retains the performance source, modified baseline and concepts by default");
assert(textOf(section("performance")).includes("Legacy performance"), "Preserved performance keeps its named header after identity load");
const navigationState = wizard.getState();
navigationState.collapsed.workspace_advanced = true;
wizard.setState(navigationState);
expand("performance");
assert(findByClass(section("performance"), "krea2-workspace-row").length > 0 && wizard.getState().collapsed.workspace_advanced === true, "Performance concepts are directly editable in their primary section without opening Advanced");
const savePromise = clickAria("Save performance as preset", section("performance"));
const namingPanel = findByClass(document.body, "krea2-workspace-name-dialog")[0];
assert(namingPanel && namingPanel["aria-modal"] === "true", "Primary Save as opens an in-app naming dialog");
const nameInput = field("Preset name", namingPanel);
nameInput.value = "Saved from visible performance";
nameInput.listeners.input({ target: nameInput });
clickText("Save", namingPanel);
await savePromise;
assert(savedPresetWrites === 1 && savedPresetFixtures.some(preset => preset.label === "Saved from visible performance" && preset.scope === "performance" && Math.abs(window.KREA2.helpers.defaultWeightForRow(preset.rows[0]) - expectedWeights[0]) < 1e-12), "Save stores the current scoped performance and exact legacy weight: " + JSON.stringify({savedPresetWrites,toasts:toasts.slice(-2),presets:savedPresetFixtures.slice(-1)}));
for (const key of ["Escape", "Enter"]) {
  const dialog = window.KREA2.workspace.nameDialog({ title: "Keyboard naming test" });
  const panel = findByClass(document.body, "krea2-workspace-name-dialog")[0];
  field("Preset name", panel).value = "Keyboard name";
  document._listeners.keydown.at(-1)({ key, preventDefault() {}, stopImmediatePropagation() {} });
  assert(await dialog.result === (key === "Enter" ? "Keyboard name" : ""), "Naming dialog supports " + key);
}
const cancelDialog = window.KREA2.workspace.nameDialog({ title: "Cancel naming" });
clickText("Cancel", findByClass(document.body, "krea2-workspace-name-dialog")[0]);
assert(await cancelDialog.result === "", "Cancel closes the naming dialog without a value");
const makePresetEditor = () => window.KREA2.createWizardWidget({ widgets: [{ name: "wizard_state_json", value: JSON.stringify(wizard.getState()) }], size: [560, 680], setDirtyCanvas() {}, setSize(size) { this.size = size; } });
const editorA = makePresetEditor(), editorB = makePresetEditor();
await new Promise(resolve => setTimeout(resolve, 0));
const editorPerformance = editor => findByClass(editor.root, "krea2-workspace-section").find(item => item.dataset.sectionId === "performance");
async function saveNamedPerformance(editor, label) {
  const pending = clickAria("Save performance as preset", editorPerformance(editor));
  const panel = findByClass(document.body, "krea2-workspace-name-dialog")[0];
  field("Preset name", panel).value = label;
  clickText("Save", panel);
  return pending;
}
assert(await saveNamedPerformance(editorA, "First node preset") === true, "First node accepts its new saved preset");
assert(await saveNamedPerformance(editorB, "Second stale node preset") === true, "Stale second node accepts its independent saved preset");
assert(savedPresetFixtures.some(preset => preset.label === "First node preset") && savedPresetFixtures.some(preset => preset.label === "Second stale node preset"), "Stale two-node saves preserve both additions through the actual backend merge");
assert(presetRequests.at(-1).base_presets && !presetRequests.at(-1).base_presets.some(preset => preset.label === "First node preset"), "Second node submits its cloned last acknowledged baseline rather than claiming the new remote preset");
const requestsBeforeQueue = presetRequests.length;
delayNextPresetResponse = true;
const queuedFirst = saveNamedPerformance(editorA, "First pending preset");
await new Promise(resolve => setTimeout(resolve, 0));
const queuedSecond = saveNamedPerformance(editorA, "Second pending preset");
await new Promise(resolve => setTimeout(resolve, 0));
assert(presetRequests.length === requestsBeforeQueue + 1, "Pending writes are serialized until the previous server acknowledgment");
releasePresetResponse();
assert(await queuedFirst && await queuedSecond, "Both serialized preset writes are accepted");
assert(savedPresetFixtures.some(preset => preset.label === "First pending preset") && savedPresetFixtures.some(preset => preset.label === "Second pending preset"), "A late acknowledgment preserves newer local additions instead of overwriting them");
for (const [editor, strength] of [[editorA, 0.5], [editorB, 2]]) {
  editor.applyPreset(savedPresetFixtures.find(preset => preset.id === "legacy_performance"));
  const changed = editor.getState();
  changed.characters[0].rows[0].strength = strength;
  editor.setState(changed);
}
assert(await clickAria("Update saved performance from current controls", editorPerformance(editorA)) === true, "First update accepts the shared preset edit");
const beforeConflict = JSON.stringify(editorB.getState().characters[0].rows);
const toastCount = toasts.length;
assert(await clickAria("Update saved performance from current controls", editorPerformance(editorB)) === false, "Conflicting same-preset update reports failure");
assert(savedPresetFixtures.find(preset => preset.id === "legacy_performance").rows[0].strength === 0.5, "Conflict leaves the actual backend store unchanged");
assert(JSON.stringify(editorB.getState().characters[0].rows) === beforeConflict && textOf(editorPerformance(editorB)).includes("Modified"), "Conflict retains unsaved local performance and its modified status");
assert(toasts.slice(toastCount).some(toast => toast.severity === "error" && toast.summary.includes("kept")) && !toasts.slice(toastCount).some(toast => toast.severity === "info"), "Conflict displays a useful retained-changes error without a success toast");
editorA.dispose(); editorB.dispose();
const rowHost = new Element("div");
let reorderCommits = 0;
const draggedRow = window.KREA2.presetRow.render({ id: "drag-cleanup", category: "emotion", phrase: "test", strength: 1 }, { library: [], editRow() {}, removeRow() {}, markDirty() {}, onReorder() { reorderCommits++; } });
rowHost.appendChild(draggedRow);
const frames = new Map();
window.requestAnimationFrame = callback => { frames.set(1, callback); return 1; };
window.cancelAnimationFrame = id => frames.delete(id);
findByClass(draggedRow, "krea2-row-drag")[0].listeners.mousedown({ button: 0, clientX: 5, clientY: 5, preventDefault() {} });
document._listeners.mousemove.at(-1)({ clientX: 12, clientY: 12 });
assert(frames.size === 1, "Row reorder schedules an active frame");
window.KREA2.helpers.cleanupDOM(rowHost);
assert(frames.size === 0 && (document._listeners.mousemove || []).length === 0 && (document._listeners.mouseup || []).length === 0 && reorderCommits === 0, "Removal cancels row drag listeners and its frame without saving a reorder");
const tagButton = findByClass(draggedRow, "krea2-star-btn")[0];
tagButton.listeners.click({ currentTarget: tagButton, stopPropagation() {} });
window.KREA2.helpers.cleanupDOM(rowHost);
await new Promise(resolve => setTimeout(resolve, 0));
assert(findByClass(document.body, "krea2-color-picker-menu").length === 0 && (document._listeners.click || []).length === 0, "Immediate row removal cancels the delayed color-menu listener");
const replacement = { ...wizard.getState(), base_prompt: "current execution accepted" };
assert(wizard.applyResolvedState(replacement, wizard.getState().document_revision) === true, "Matching-revision result is accepted");
assert(wizard.getState().base_prompt === "current execution accepted", "Resolved document applies when no edit intervened");
const pendingSave = clickAria("Save performance as preset", section("performance"));
const writesBeforeRemoval = savedPresetWrites;
wizard.dispose();
await pendingSave;
assert(savedPresetWrites === writesBeforeRemoval && findByClass(document.body, "krea2-workspace-name-dialog").length === 0, "Removal cancels an open save dialog without storing a preset");
assert((document._listeners.keydown || []).length === 0, "Removal releases document keyboard listener");
console.log("frontend smoke: unified workspace behavior checks passed");
