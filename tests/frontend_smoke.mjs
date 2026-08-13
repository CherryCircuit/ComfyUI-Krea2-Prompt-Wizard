import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  setAttribute(name, value) {
    if (name === "class") this.className = String(value);
    else if (name === "value") this.value = String(value);
    else if (name === "checked") this.checked = value === "true" || value === true;
    else if (name === "disabled") this.disabled = value === "true" || value === true;
    else this[name] = value;
  }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(target) { return target === this || this.children.includes(target); }
  scrollIntoView() {}
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
window.app = { api: { apiURL: (url) => url }, extensionManager: { toast: { add() {} } } };
globalThis.fetch = (url, options) => {
  const apiPath = String(url).replace(/^.*\/krea2_prompt_wizard/, "/krea2_prompt_wizard");
  if (apiPath === "/krea2_prompt_wizard/library") {
    return Promise.resolve({ ok: true, json: async () => libraryPayload });
  }
  if (apiPath === "/krea2_prompt_wizard/conflicts") {
    return Promise.resolve({ ok: true, json: async () => conflictsPayload });
  }
  if (apiPath === "/krea2_prompt_wizard/saved_presets") {
    return Promise.resolve({ ok: true, json: async () => ({ presets: [] }) });
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
    return Promise.resolve({ ok: true, json: async () => ({ loras: [] }) });
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

/* --- v2: the wizard renders the tabbed editor by default ---------------- */
const rootClasses = (wizard.root.className || "").split(/\s+/);
if (!rootClasses.includes("krea2-wizard-expanded")) {
  throw new Error("The v2 wizard must render in its expanded tabbed editor.");
}
if (findByClass(wizard.root, "krea2-v2-tab").length !== 2) {
  throw new Error("The v2 wizard must render exactly two tabs: CAST and SCENE.");
}
const castTab = findByClass(wizard.root, "krea2-v2-tab")
  .find((tab) => textOf(tab).includes("Cast"));
const sceneTab = findByClass(wizard.root, "krea2-v2-tab")
  .find((tab) => textOf(tab).includes("Scene"));
if (!castTab || !sceneTab) {
  throw new Error("The tab bar must expose CAST and SCENE pills.");
}
if (!castTab.className.includes("is-active") || sceneTab.className.includes("is-active")) {
  throw new Error("The CAST tab must be active by default; SCENE inactive.");
}

/* --- Fresh node: one expanded character card with seeded concept rows ---- */
const freshState = JSON.parse(stateWidget.value);
if (freshState.characters.length !== 1) {
  throw new Error("A fresh node must start with exactly one character.");
}
const freshChar = freshState.characters[0];
if (freshChar.expanded !== true || freshChar.concepts_open !== true) {
  throw new Error("The fresh character card must start expanded with its concepts open.");
}
if (findByClass(wizard.root, "krea2-v2-character-card").length !== 1) {
  throw new Error("The CAST tab must render the character card.");
}
const seededRows = freshChar.rows || [];
const seededIds = new Set(seededRows.map((row) => row.preset_id));
if (seededRows.length < 3
    || !seededIds.has("emotion.joy")
    || !seededIds.has("emotion_trigger.radiant_joy")
    || !seededIds.has("style.natural_photographic_realism")) {
  throw new Error("Fresh characters must seed the three real library concept rows.");
}

/* --- Appearance row: Hair / Eyes / Build / Physique, one row each ------- */
const comboboxes = findByClass(wizard.root, "krea2-combobox");
if (comboboxes.length !== 4) {
  throw new Error("Each cast card must expose exactly four appearance dropdowns.");
}
for (const field of ["Hair", "Eyes", "Build", "Physique"]) {
  if (comboboxes.filter((input) => input["aria-label"] === field).length !== 1) {
    throw new Error("Each cast card must expose exactly one " + field + " field.");
  }
}

/* --- Identity chips: gender (purple), age (blue), ethnicity (teal) ------ */
const identityChips = findByClass(wizard.root, "krea2-v2-identity-chip");
if (identityChips.length !== 3
    || !identityChips.some((chip) => chip.className.includes("is-gender"))
    || !identityChips.some((chip) => chip.className.includes("is-age"))
    || !identityChips.some((chip) => chip.className.includes("is-ethnicity"))) {
  throw new Error("Identity chips must render gender, age and ethnicity pills.");
}

/* --- Concept rows: [−] [value] [+] steppers ---------------------------- */
if (findByClass(wizard.root, "krea2-row-step-minus").length !== 3
    || findByClass(wizard.root, "krea2-row-step-plus").length !== 3
    || findByClass(wizard.root, "krea2-row-value").length !== 3) {
  throw new Error("The concepts block must render [-] [value] [+] steppers per row.");
}
const firstValue = findByClass(wizard.root, "krea2-row-value")[0];
if (textOf(firstValue) !== "+1.5") {
  throw new Error("The seeded joy row must display +1.5, got " + textOf(firstValue));
}
const plusBtn = findByClass(wizard.root, "krea2-row-step-plus")[0];
plusBtn.listeners.mousedown({ button: 0, preventDefault() {} });
(document._listeners.mouseup || []).forEach((listener) => listener({}));
const steppedState = JSON.parse(stateWidget.value);
const steppedJoy = steppedState.characters[0].rows.find((row) => row.preset_id === "emotion.joy");
if (steppedJoy.strength !== 2) {
  throw new Error("Clicking [+] must raise the concept strength by 0.5.");
}
if (textOf(findByClass(wizard.root, "krea2-row-value")[0]) !== "+2") {
  throw new Error("The [+] step must update the displayed value.");
}

/* --- + Add Concept pill ------------------------------------------------- */
if (!findByClass(wizard.root, "krea2-v2-add-concept").length) {
  throw new Error("The concepts block must expose a + Add Concept pill.");
}

/* --- Quick directions rail ------------------------------------------------- */
const quickChips = findByClass(wizard.root, "krea2-emotion-chip");
if (quickChips.length !== 5) {
  throw new Error("The Quick Directions rail must expose exactly five chips.");
}
const triumphant = quickChips.find((chip) => textOf(chip) === "Triumphant");
triumphant.listeners.click({});
const afterQuick = JSON.parse(stateWidget.value).characters[0].rows.map((row) => row.preset_id);
if (!afterQuick.includes("emotion.elation") || !afterQuick.includes("mouth.broad_smile")) {
  throw new Error("Triumphant must apply emotion + face concepts together.");
}
triumphant.listeners.click({});
const afterRemoval = JSON.parse(stateWidget.value).characters[0].rows.map((row) => row.preset_id);
if (afterRemoval.includes("emotion.elation")) {
  throw new Error("Clicking an active quick direction must remove its whole set.");
}

/* --- Per-character LoRA block ------------------------------------------- */
if (!findByClass(wizard.root, "krea2-v2-lora-block").length
    || !findByClass(wizard.root, "krea2-v2-add-lora").length) {
  throw new Error("Each cast card must expose the per-character LoRA block with Add LoRA.");
}

/* --- Header-click toggles (no dedicated collapse buttons) ---------------- */
if (findByClass(wizard.root, "krea2-character-expand").length !== 0) {
  throw new Error("Cast cards must not render dedicated expand/collapse buttons.");
}
const cardHeader = findByClass(wizard.root, "krea2-character-card-header")[0];
cardHeader.listeners.click({ target: cardHeader });
if (JSON.parse(stateWidget.value).characters[0].expanded === true) {
  throw new Error("Clicking the card header must collapse the card.");
}
const collapsedCard = findByClass(wizard.root, "krea2-v2-character-card")[0];
if (collapsedCard.className.includes("is-expanded")
    || findByClass(collapsedCard, "krea2-v2-appearance-grid").length !== 0) {
  throw new Error("Collapsed cards must hide the appearance grid.");
}
cardHeader.listeners.click({ target: cardHeader });
if (JSON.parse(stateWidget.value).characters[0].expanded !== true) {
  throw new Error("Clicking the collapsed card header must expand the card again.");
}

/* --- Final Prompt Preview at the bottom of the CAST tab ------------------ */
const castPreview = findByClass(wizard.root, "krea2-v2-final-preview");
if (castPreview.length !== 1 || !textOf(castPreview[0]).includes("Final Prompt Preview")) {
  throw new Error("The CAST tab must render the Final Prompt Preview at the bottom.");
}
const previewCode = findByClass(wizard.root, "krea2-wizard-preview");
if (!previewCode.length) {
  throw new Error("The Final Prompt Preview must render the plain code area.");
}

/* --- SCENE tab ----------------------------------------------------------- */
switchTab("scene");
if (findByClass(wizard.root, "krea2-v2-tab").find((tab) => textOf(tab).includes("Scene")).className.includes("is-active")) {
  // expected
} else {
  throw new Error("Switching tabs must activate the SCENE tab.");
}
const sceneTopRow = findByClass(wizard.root, "krea2-v2-scene-top-row");
if (!sceneTopRow.length) {
  throw new Error("The SCENE tab must render the Type / Setting / Shot row.");
}
if (findByClass(sceneTopRow[0], "krea2-wizard-creative-option").length !== 2) {
  throw new Error("The Type control must offer Photography / Artwork.");
}
if (!findByClass(wizard.root, "krea2-v2-description-block").length) {
  throw new Error("The SCENE tab must render the Description block.");
}
for (const sub of ["camera", "lighting", "environment", "style"]) {
  if (!findByClass(wizard.root, "krea2-v2-subsection-" + sub).length) {
    throw new Error("The SCENE tab must render the " + sub + " subsection.");
  }
}
const cameraChips = findByClass(wizard.root, "krea2-v2-chip");
if (cameraChips.length !== 26) {
  throw new Error("Framing (4) + angle (4) + aperture (5) + setup (4) + atmosphere (5) + style (4) chips must render, got " + cameraChips.length);
}
if (!findByClass(wizard.root, "krea2-v2-compass").length) {
  throw new Error("The Lighting subsection must render the compass rose.");
}
if (!findByClass(wizard.root, "krea2-v2-lens-slider").length) {
  throw new Error("The Camera subsection must render the lens slider.");
}

/* --- Scene chips toggle real concept rows ------------------------------- */
const closeUpChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "Close-up");
closeUpChip.listeners.click({});
let chipState = JSON.parse(stateWidget.value);
if (!chipState.rows.some((row) => row.preset_id === "framing.close_up")) {
  throw new Error("Clicking a framing chip must add the framing concept row.");
}
const establishingChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "Establishing");
if (!establishingChip.disabled) {
  throw new Error("Establishing must be disabled while Close-up is active (conflict cascade).");
}
const lowAngleChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "Low");
lowAngleChip.listeners.click({});
const highAngleChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "High");
if (!highAngleChip.disabled) {
  throw new Error("High angle must be disabled while Low angle is active.");
}
chipState = JSON.parse(stateWidget.value);
if (!chipState.rows.some((row) => row.preset_id === "angle.low_angle")) {
  throw new Error("Clicking the Low angle chip must add the angle concept row.");
}

/* --- Subsection header toggles ------------------------------------------- */
const cameraHeader = findByClass(wizard.root, "krea2-v2-subsection-camera")[0]
  .children.find((child) => child.className.includes("krea2-v2-block-head"));
cameraHeader.listeners.click({ target: cameraHeader });
const collapsedCamera = findByClass(wizard.root, "krea2-v2-subsection-camera")[0];
if (collapsedCamera.className.includes("is-open")
    || findByClass(collapsedCamera, "krea2-v2-chip-row").length !== 0) {
  throw new Error("Clicking the Camera header must collapse the subsection.");
}
cameraHeader.listeners.click({ target: cameraHeader });
if (!findByClass(wizard.root, "krea2-v2-subsection-camera")[0].className.includes("is-open")) {
  throw new Error("Clicking the collapsed Camera header must reopen it.");
}

/* --- Lens slider writes a lens row --------------------------------------- */
const lensSlider = findByClass(wizard.root, "krea2-v2-lens-slider")[0];
lensSlider.listeners.input({ target: { value: "85" } });
const lensRow = JSON.parse(stateWidget.value).rows.find((row) => row.category === "lens");
if (!lensRow || !String(lensRow.preset_id).startsWith("lens.85")) {
  throw new Error("The lens slider must snap to the 85mm lens preset.");
}

/* --- SCENE tab also carries the Final Prompt Preview --------------------- */
if (findByClass(wizard.root, "krea2-v2-final-preview").length !== 1) {
  throw new Error("The SCENE tab must render the Final Prompt Preview too.");
}

/* --- Pretty Prompt Preview defaults OFF ----------------------------------- */
const initialPretty = JSON.parse(stateWidget.value).pretty_preview;
if (initialPretty !== false) {
  throw new Error("Pretty Prompt Preview must default to OFF.");
}
const previewCodeEl = findByClass(wizard.root, "krea2-wizard-preview")[0];
if (previewCodeEl.style.display === "none") {
  throw new Error("Plain code must be visible by default.");
}

/* --- Conflicts feed the character emotion picker -------------------------- */
switchTab("cast");
wizard.setState({
  schema_version: 1,
  characters: [{
    id: "c1",
    name: "Mara",
    enabled: true,
    rows: [{
      id: "r1",
      category: "emotion",
      preset_id: "emotion.joy",
      label: "Joy",
      phrase: "joy",
      control_mode: "scalar",
      intensity: 0,
      strength: 1.5,
      enabled: true,
      aliases: [],
    }],
  }],
});
const griefPreset = libraryPayload.presets.find((p) => p.id === "emotion.grief");
const joyPreset = libraryPayload.presets.find((p) => p.id === "emotion.joy");
if (!griefPreset || !joyPreset) {
  throw new Error("Test setup requires emotion.grief and emotion.joy in the library.");
}

/* --- Cast header actions still present ------------------------------------- */
if (!findByClass(wizard.root, "krea2-cast-random-all").length) {
  throw new Error("The cast header must keep a cast-level randomization control.");
}
if (!findByClass(wizard.root, "krea2-save-character").length) {
  throw new Error("Each cast card must keep its Save character preset control.");
}

/* --- Resolved-state merge must preserve v2 UI flags ------------------------ */
wizard.setTab("cast");
const mergeSource = JSON.parse(stateWidget.value);
mergeSource.scene_sections = { camera: false };
mergeSource.final_preview_open = false;
mergeSource.pretty_preview = true;
wizard.setState(mergeSource);
const resolvedProbe = JSON.parse(JSON.stringify(mergeSource));
resolvedProbe.scene_sections = { camera: true };
resolvedProbe.final_preview_open = true;
resolvedProbe.pretty_preview = false;
wizard.applyResolvedState(resolvedProbe);
const resolvedPersisted = JSON.parse(stateWidget.value);
if (resolvedPersisted.scene_sections.camera !== false
    || resolvedPersisted.final_preview_open !== false
    || resolvedPersisted.pretty_preview !== true) {
  throw new Error("v2 UI flags must survive resolved-state merges (preserving the current UI state).");
}

/* --- Execution evidence ----------------------------------------------------- */
wizard.recordExecution("first prompt");
wizard.recordExecution("second prompt");
if (wizard.getExecutionHistory().join("|") !== "first prompt|second prompt"
    || wizard.root.dataset.krea2ExecutionCount !== "2") {
  throw new Error("Live execution evidence must retain recent prompt outputs.");
}

console.log("frontend smoke: v2 tabbed editor checks passed");
