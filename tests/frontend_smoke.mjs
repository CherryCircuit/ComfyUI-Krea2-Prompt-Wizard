import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined) {
      if (this.values.has(value)) { this.values.delete(value); return false; }
      this.values.add(value);
      return true;
    }
    force ? this.values.add(value) : this.values.delete(value);
    return force;
  }
}

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList();
    this.value = "";
    this.textContent = "";
    this.parentNode = null;
    this.listeners = {};
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element("#text"), { textContent: text }),
  head: new Element("head"),
  body: new Element("body"),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = globalThis;
window.KREA2 = {};
window.app = { api: { apiURL: (url) => url }, extensionManager: { toast: { add() {} } } };
globalThis.fetch = () => new Promise(() => {});
globalThis.confirm = () => true;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
  "state.mjs",
  "searchable_selector.mjs",
  "preset_row.mjs",
  "library_editor.mjs",
  "materialize.mjs",
  "inspector.mjs",
  "wizard_widget.mjs",
];
for (const moduleName of modules) {
  await import(pathToFileURL(path.join(root, "web", "js", moduleName)));
}

const stateWidget = {
  name: "wizard_state_json",
  value: JSON.stringify({
    schema_version: 1,
    base_prompt: "portrait",
    interface_mode: "simple",
    rows: [{
      id: "row_smoke",
      category: "emotion",
      preset_id: "emotion.joy",
      label: "Joy",
      phrase: "joy",
      control_mode: "scalar",
      intensity: 42,
      strength: -1.25,
      enabled: true,
      aliases: [],
      verification: "general visual vocabulary",
    }],
  }),
};
const node = { widgets: [stateWidget], setDirtyCanvas() {} };
const wizard = window.KREA2.createWizardWidget(node);

if (!wizard || wizard.root.children.length < 4 || !stateWidget.hidden) {
  throw new Error("Wizard DOM failed to initialize");
}

function findByClass(element, className) {
  const matches = [];
  if ((element.className || "").split(/\s+/).includes(className)) matches.push(element);
  for (const child of element.children || []) {
    matches.push(...findByClass(child, className));
  }
  return matches;
}

const sliders = findByClass(wizard.root, "krea2-row-intensity");
if (sliders.length !== 1 || sliders[0].min !== "-3" || sliders[0].max !== "3") {
  throw new Error("Concept cards must expose the compact -3 to +3 strength control.");
}
if (sliders[0].step !== "0.25" || sliders[0].value !== "-1.25") {
  throw new Error("Concept strength must be stored and displayed as exact quarter steps.");
}
if (findByClass(wizard.root, "krea2-row-visibility").length !== 1
    || findByClass(wizard.root, "krea2-row-enabled-control").length !== 0) {
  throw new Error("Concept cards must use the compact eye visibility control.");
}
if (findByClass(wizard.root, "krea2-row-preview").length !== 0
    || findByClass(wizard.root, "krea2-row-weight").length !== 0
    || findByClass(wizard.root, "krea2-row-group").length !== 0) {
  throw new Error("Compact concept cards must not render legacy detail controls.");
}
if (findByClass(wizard.root, "krea2-wizard-category").length !== 5) {
  throw new Error("All five concept groups must be visible from the start.");
}
if (findByClass(wizard.root, "krea2-wizard-preview-host").length !== 1
    || findByClass(wizard.root, "krea2-preview-pretty").length !== 1
    || findByClass(wizard.root, "krea2-wizard-preview").length !== 1) {
  throw new Error("Live Preview must render both readable and prompt-code views.");
}
if (findByClass(wizard.root, "krea2-wizard-creative-option").length !== 2
    || findByClass(wizard.root, "krea2-wizard-random-controls").length !== 5) {
  throw new Error("The creative mode and related random controls must be visible.");
}
if (findByClass(wizard.root, "krea2-structured-section").length !== 2) {
  throw new Error("Character and setting editors must be visible.");
}

const promptInput = findByClass(wizard.root, "krea2-wizard-base")[0];
wizard.setState({ schema_version: 1, base_prompt: "restored prompt", rows: [] });
promptInput.listeners.input({ target: { value: "updated prompt" } });
if (JSON.parse(stateWidget.value).base_prompt !== "updated prompt") {
  throw new Error("Main prompt edits must persist after state restoration.");
}

const structuredState = {
  schema_version: 1,
  base_prompt: "team portrait",
  rows: [],
  characters: [
    { id: "a", name: "Mara", enabled: true, identity: "veteran pilot", clothing: "sci-fi flight suit" },
    { id: "b", name: "Ivo", enabled: true, expression: "focused determination" },
  ],
  setting: { enabled: true, name: "Spaceship bridge", description: "working command deck" },
};
wizard.setState(structuredState);
const structuredPrompt = window.KREA2.helpers.compilePreview(structuredState).final_prompt;
if (!structuredPrompt.includes("Character Mara") || !structuredPrompt.includes("Character Ivo")
    || !structuredPrompt.includes("Setting Spaceship bridge")) {
  throw new Error("Multiple characters and the active setting must compile into the prompt preview.");
}
if (findByClass(wizard.root, "krea2-avatar").length !== 1
    || findByClass(wizard.root, "krea2-character-details").length !== 1
    || findByClass(wizard.root, "krea2-save-character").length !== 1) {
  throw new Error("The compact character editor must keep its avatar, details, and preset save control.");
}
if (findByClass(wizard.root, "krea2-icon-btn").length < 8) {
  throw new Error("Randomization controls must use compact dice buttons.");
}

wizard.recordExecution("first prompt");
wizard.recordExecution("second prompt");
if (wizard.getExecutionHistory().join("|") !== "first prompt|second prompt"
    || wizard.root.dataset.krea2ExecutionCount !== "2"
    || JSON.parse(wizard.root.dataset.krea2ExecutionHistory).length !== 2
    || wizard.root.dataset.krea2LastOutput !== "second prompt") {
  throw new Error("Live execution evidence must retain recent prompt outputs.");
}
