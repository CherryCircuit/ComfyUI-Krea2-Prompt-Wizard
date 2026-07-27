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
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener() {}
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
if (sliders.length !== 1 || sliders[0].min !== "-5" || sliders[0].max !== "5") {
  throw new Error("Concept cards must expose the compact -5 to +5 strength control.");
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
if (findByClass(wizard.root, "krea2-wizard-category").length !== 6) {
  throw new Error("All six concept groups must be visible from the start.");
}
if (findByClass(wizard.root, "krea2-preview-concept").length !== 1) {
  throw new Error("Live Preview concepts must render as navigable links.");
}
if (findByClass(wizard.root, "krea2-wizard-creative-option").length !== 2
    || findByClass(wizard.root, "krea2-wizard-random-controls").length !== 6) {
  throw new Error("The creative mode and related random controls must be visible.");
}
