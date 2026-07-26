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

const stateWidget = { name: "wizard_state_json", value: "" };
const node = { widgets: [stateWidget], setDirtyCanvas() {} };
const wizard = window.KREA2.createWizardWidget(node);

if (!wizard || wizard.root.children.length < 5 || !stateWidget.hidden) {
  throw new Error("Wizard DOM failed to initialize");
}
