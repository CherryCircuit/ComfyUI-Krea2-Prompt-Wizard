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
  contains(target) { return target === this || this.children.includes(target); }
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
window.app = { api: { apiURL: (url) => url }, extensionManager: { toast: { add() {} } } };
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
const versionChip = findByClass(wizard.root, "krea2-wizard-version")[0];
if (!versionChip || !/^v\d+\.\d+\.\d+/.test(textOf(versionChip))) {
  throw new Error("The top bar must show the wizard build version indicator.");
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
    || !seededIds.has("body.open_posture")) {
  throw new Error("Fresh characters must seed the three real library concept rows.");
}

/* --- Appearance wall: 14 dropdowns + colour pop-ups + per-field dice ----- */
const comboboxes = findByClass(wizard.root, "krea2-combobox");
if (comboboxes.length !== 14) {
  throw new Error("Each cast card must expose fourteen appearance dropdowns, got " + comboboxes.length);
}
for (const field of ["Age", "Ethnicity", "Hair", "Hair length", "Makeup", "Eye Shape", "Nose", "Mouth", "Chin", "Face shape", "Build", "Top", "Bottom", "Ensemble (full costume)"]) {
  if (comboboxes.filter((input) => input["aria-label"] === field).length !== 1) {
    throw new Error("Each cast card must expose exactly one " + field + " field.");
  }
}
if (comboboxes.some((input) => ["Sex", "Physique", "Height & Frame"].includes(input["aria-label"]))) {
  throw new Error("Sex, Physique and Height & Frame must be removed (Build absorbs them, gender has pills).");
}
if (findByClass(wizard.root, "krea2-v2-color-btn").length !== 3) {
  throw new Error("Hair, eye and skin colour must render as colour pop-up buttons.");
}
if (findByClass(wizard.root, "krea2-field-random").length < 14
    || findByClass(wizard.root, "krea2-field-each-job").length < 14) {
  throw new Error("Every appearance field must carry its own dice and each-job shuffle.");
}
/* The Mii avatar is removed. */
if (findByClass(wizard.root, "krea2-avatar").length !== 0) {
  throw new Error("The Mii avatar must be removed entirely.");
}
/* No identity text box. */
if (findByClass(wizard.root, "krea2-character-identity").length !== 0) {
  throw new Error("The identity text box must be removed.");
}
/* LOAD icon opens the character preset popup. */
if (!findByClass(wizard.root, "krea2-character-load").length) {
  throw new Error("The character preset row must be a LOAD icon button.");
}
/* Clear buttons on every field. */
if (findByClass(wizard.root, "krea2-field-clear").length !== 14) {
  throw new Error("Every dropdown must expose a clear × button.");
}
/* Age keeps youngest-to-oldest ordering, not alphabetical. */
const ageCombobox = comboboxes.find((input) => input["aria-label"] === "Age");
const ageOptions = [];
for (const input of comboboxes) {
  if (input["aria-label"] === "Age") {
    const listId = input["list"];
    const datalists = [];
    const collect = (node) => {
      if (node.tagName === "datalist" && node.id === listId) datalists.push(node);
      for (const child of node.children || []) collect(child);
    };
    collect(wizard.root);
    for (const dl of datalists) {
      for (const child of dl.children || []) {
        if (child.tagName === "option" && child.value) ageOptions.push(child.value);
      }
    }
  }
}
if (ageOptions.join("|") !== "child|teenager|young adult|adult|middle aged|elderly") {
  throw new Error("Age must run youngest to oldest, got " + ageOptions.join("|"));
}

/* --- Gender pills: three single-select buttons ---------------------------- */
const genderPills = findByClass(wizard.root, "krea2-v2-gender-pill");
if (genderPills.length !== 3) {
  throw new Error("Gender must render as three pills (female / male / unspecified).");
}
const femalePill = genderPills.find((pill) => textOf(pill) === "Female");
femalePill.listeners.click({});
if (JSON.parse(stateWidget.value).characters[0].sex !== "female") {
  throw new Error("Clicking a gender pill must set the sex.");
}
genderPills.find((pill) => textOf(pill) === "Male").listeners.click({});
const afterMale = JSON.parse(stateWidget.value).characters[0].sex;
if (afterMale !== "male") {
  throw new Error("Gender pills must be single-select (picking one replaces the other).");
}

/* --- Quick Directions removed; Direction = 3 columns with dice ------------ */
if (findByClass(wizard.root, "krea2-emotion-chip").length !== 0) {
  throw new Error("Quick Directions must be removed.");
}
const directionSections = findByClass(wizard.root, "krea2-wizard-category");
if (directionSections.length !== 3) {
  throw new Error("The Direction block must render three concept sections, got " + directionSections.length);
}
if (!findByClass(wizard.root, "krea2-direction-columns").length) {
  throw new Error("Emotion / Face / Body must sit in three side-by-side columns.");
}
if (findByClass(wizard.root, "krea2-wizard-category-random").length !== 3
    || findByClass(wizard.root, "krea2-wizard-category-add").length !== 3
    || findByClass(wizard.root, "krea2-wizard-category-save").length !== 3) {
  throw new Error("Each direction section must keep its dice, add and save controls.");
}
if (findByClass(wizard.root, "krea2-direction-position").length !== 0) {
  throw new Error("Placement and the position row must be removed.");
}

/* --- LoRA is fully removed ------------------------------------------------ */
if (findByClass(wizard.root, "krea2-v2-lora-block").length !== 0
    || findByClass(wizard.root, "krea2-v2-add-lora-select").length !== 0
    || findByClass(wizard.root, "krea2-v2-lora-row").length !== 0) {
  throw new Error("The LoRA feature must be removed entirely from the CAST tab.");
}

/* --- The sticky PROMPT chip near the top is gone ------------------------- */
if (findByClass(wizard.root, "krea2-prompt-chip").length !== 0) {
  throw new Error("The sticky PROMPT summary chip near the top must be removed.");
}

/* --- Concept rows: [−] [value] [+] steppers ---------------------------- */
if (findByClass(wizard.root, "krea2-row-step-minus").length !== 3
    || findByClass(wizard.root, "krea2-row-step-plus").length !== 3
    || findByClass(wizard.root, "krea2-row-value").length !== 3) {
  throw new Error("The concepts block must render [-] [value] [+] steppers per row.");
}
const minusBtn = findByClass(wizard.root, "krea2-row-step-minus")[0];
if (!String(minusBtn.title || "").includes("Decrease")) {
  throw new Error("The step-minus control must read as a decrease control (minus, not delete).");
}
const firstValue = findByClass(wizard.root, "krea2-row-value")[0];
if (textOf(firstValue) !== "+1.5") {
  throw new Error("The seeded joy row must display +1.5, got " + textOf(firstValue));
}
const plusBtn = findByClass(wizard.root, "krea2-row-step-plus")[0];
plusBtn.listeners.mousedown({ button: 0, preventDefault() {} });
(document._listeners.mouseup || []).forEach((listener) => listener({}));
const steppedState = JSON.parse(stateWidget.value);
if (!steppedState.characters[0].rows.some((row) => row.strength === 2)) {
  throw new Error("Clicking [+] must raise the concept strength by 0.5.");
}
if (textOf(findByClass(wizard.root, "krea2-row-value")[0]) !== "+2") {
  throw new Error("The [+] step must update the displayed value.");
}

/* --- Click the value to type an exact strength --------------------------- */
const editValue = findByClass(wizard.root, "krea2-row-value")[0];
const editedRowWrap = editValue;
let editRowId = null;
let walker = editValue.parentNode;
while (walker) {
  if (walker.dataset && walker.dataset.rowId) { editRowId = walker.dataset.rowId; break; }
  walker = walker.parentNode;
}
editValue.listeners.click({});
const editInput = findByClass(editValue, "krea2-row-value-input")[0];
if (!editInput) {
  throw new Error("Clicking the value must open an inline exact-value editor.");
}
editInput.value = "2.5";
editInput.listeners.keydown({ key: "Enter", stopPropagation() {} });
const typedState = JSON.parse(stateWidget.value);
const typedRow = typedState.characters[0].rows.find((row) => row.id === editRowId);
if (!typedRow || typedRow.strength !== 2.5) {
  throw new Error("Typing an exact value must commit it to the concept row.");
}
if (textOf(findByClass(wizard.root, "krea2-row-value")[0]) !== "+2.5") {
  throw new Error("The typed value must update the displayed value.");
}

/* --- + Add Concept buttons on the direction sections ---------------------- */
if (findByClass(wizard.root, "krea2-v2-add-concept").length !== 0
    && !findByClass(wizard.root, "krea2-wizard-category-add").length) {
  throw new Error("The direction sections must keep their add controls.");
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
    || findByClass(collapsedCard, "krea2-character-columns").length !== 0) {
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
if (castPreview[0].className.includes("is-open")) {
  throw new Error("The Final Prompt Preview must be collapsed by default.");
}
const previewHeader = castPreview[0].children.find((child) => child.className.includes("krea2-v2-block-head"));
previewHeader.listeners.click({ target: previewHeader });
const previewCode = findByClass(wizard.root, "krea2-wizard-preview");
if (!previewCode.length) {
  throw new Error("Expanding the Final Prompt Preview must render the plain code area.");
}
if (!JSON.parse(stateWidget.value).final_preview_open) {
  throw new Error("Clicking the preview header must persist the open flag.");
}
previewHeader.listeners.click({ target: previewHeader });

/* --- SCENE tab ----------------------------------------------------------- */
switchTab("scene");
if (findByClass(wizard.root, "krea2-v2-tab").find((tab) => textOf(tab).includes("Scene")).className.includes("is-active")) {
  // expected
} else {
  throw new Error("Switching tabs must activate the SCENE tab.");
}
const settingSection = findByClass(wizard.root, "krea2-v2-setting-section");
if (!settingSection.length) {
  throw new Error("The SCENE tab must render the Setting section (Type / Setting / Style).");
}
if (findByClass(settingSection[0], "krea2-wizard-creative-option").length !== 1) {
  throw new Error("The Type control must offer Photography only (Artwork removed).");
}
if (!findByClass(wizard.root, "krea2-scene-select").length
    || !findByClass(wizard.root, "krea2-shuffle").length) {
  throw new Error("The Setting section must keep dice and shuffle capabilities.");
}
if (!findByClass(wizard.root, "krea2-scene-clear").length) {
  throw new Error("The Setting select must have a clear (x) button.");
}
if (!findByClass(wizard.root, "krea2-v2-setting-actions").length
    || textOf(findByClass(wizard.root, "krea2-v2-setting-actions")[0]).indexOf("Clear scene concepts") === -1) {
  throw new Error("The Setting section must offer a Reset/Clear scene concepts action.");
}
if (!findByClass(wizard.root, "krea2-v2-chip-row")[0]
      || findByClass(findByClass(wizard.root, "krea2-v2-chip-row")[0], "krea2-field-clear").length === 0) {
  throw new Error("Every chip row must have a clear (x) button removing that category.");
}
for (const sub of ["camera", "lighting", "environment"]) {
  if (!findByClass(wizard.root, "krea2-v2-subsection-" + sub).length) {
    throw new Error("The SCENE tab must render the " + sub + " subsection.");
  }
}
if (findByClass(wizard.root, "krea2-v2-subsection-style").length !== 0) {
  throw new Error("The standalone Style subsection must be removed (style lives in the Style/Shot dropdown).");
}
if (findByClass(wizard.root, "krea2-v2-scene-grid").length !== 1) {
  throw new Error("Camera and Lighting must share a side-by-side row.");
}
const cameraChips = findByClass(wizard.root, "krea2-v2-chip");
if (cameraChips.length !== 17) {
  throw new Error("Framing (4) + angle (4) + aperture (5) + setup (4) chips must render, got " + cameraChips.length);
}
if (!findByClass(wizard.root, "krea2-v2-compass").length) {
  throw new Error("The Lighting subsection must render the compass rose.");
}
if (!findByClass(wizard.root, "krea2-v2-lens-slider").length) {
  throw new Error("The Camera subsection must render the lens slider.");
}
/* Environment behaves like the CAST concept groups. */
const envSub = findByClass(wizard.root, "krea2-v2-subsection-environment")[0];
if (findByClass(envSub, "krea2-wizard-category").length !== 1
    || findByClass(envSub, "krea2-wizard-category-add").length !== 1
    || findByClass(envSub, "krea2-wizard-category-random").length !== 1
    || findByClass(envSub, "krea2-wizard-category-save").length !== 1
    || findByClass(envSub, "krea2-shuffle").length !== 1) {
  throw new Error("The Environment subsection must behave like the concept groups (add, dice, shuffle, save).");
}
const envAdd = findByClass(envSub, "krea2-wizard-category-add")[0];
envAdd.listeners.click({});
const envGroupChips = findByClass(document.body, "krea2-searchable-chip");
if (!envGroupChips.some((chip) => textOf(chip).includes("Environment"))) {
  throw new Error("The environment picker must be scoped to atmosphere and environmental movement.");
}
let envItems = findByClass(document.body, "krea2-searchable-item");
const fogItem = envItems.find((item) => textOf(item).includes("Fog"));
if (!fogItem) throw new Error("The environment picker must offer atmosphere concepts.");
fogItem.listeners.click({});
envItems = findByClass(document.body, "krea2-searchable-item");
const smokeItem = envItems.find((item) => textOf(item).includes("Smoke"));
smokeItem.listeners.click({});
findByClass(document.body, "krea2-searchable-close")[0].listeners.click({});
let atmosphereRows = JSON.parse(stateWidget.value).rows.filter((row) => row.category === "atmosphere");
if (!atmosphereRows.some((row) => row.preset_id === "atmosphere.fog")
    || !atmosphereRows.some((row) => row.preset_id === "atmosphere.smoke")) {
  throw new Error("Environment must allow multiple concepts (fog AND smoke) with per-concept steppers.");
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

/* --- Lens slider commits on release, not mid-drag ------------------------ */
const lensSlider = findByClass(wizard.root, "krea2-v2-lens-slider")[0];
lensSlider.listeners.input({ target: { value: "85" } });
if (JSON.parse(stateWidget.value).rows.some((row) => row.category === "lens")) {
  throw new Error("Dragging the lens slider must not commit the prompt row mid-drag.");
}
lensSlider.listeners.change({ target: { value: "85" } });
const lensRow = JSON.parse(stateWidget.value).rows.find((row) => row.category === "lens");
if (!lensRow || !String(lensRow.preset_id).startsWith("lens.85")) {
  throw new Error("Releasing the lens slider must snap to the 85mm lens preset.");
}

/* --- Lighting setups drive the multi-light plane --------------------------- */
const threePointChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "Three-point");
threePointChip.listeners.click({});
let lightsState = JSON.parse(stateWidget.value);
if (!Array.isArray(lightsState.scene_sections.lights) || lightsState.scene_sections.lights.length !== 3) {
  throw new Error("Three-point lighting must seed exactly three lights on the compass.");
}
if (!lightsState.rows.some((row) => row.category === "lighting_direction" && String(row.preset_id).startsWith("custom.light_"))) {
  throw new Error("Each compass light must compile into a lighting_direction prompt row.");
}
if (findByClass(wizard.root, "krea2-v2-light-row").length !== 3
    || !findByClass(wizard.root, "krea2-v2-add-light").length) {
  throw new Error("Each light must list its own controls with an Add Light button.");
}
/* Per-light: angle stepper (degrees) + colour swatches. */
const lightRow = findByClass(wizard.root, "krea2-v2-light-row")[0];
const lightAngles = findByClass(lightRow, "krea2-row-value");
if (lightAngles.length !== 2 || textOf(lightAngles[0]) !== "45°") {
  throw new Error("Each light must expose an angle stepper in degrees and an intensity stepper, got " + lightAngles.map((v) => textOf(v)).join(","));
}
if (!findByClass(lightRow, "krea2-v2-color-btn").length) {
  throw new Error("Each light must expose a colour pop-up button.");
}
const softChip = findByClass(wizard.root, "krea2-v2-chip")
  .find((chip) => textOf(chip) === "Soft");
softChip.listeners.click({});
lightsState = JSON.parse(stateWidget.value);
if (!Array.isArray(lightsState.scene_sections.lights) || lightsState.scene_sections.lights.length !== 1) {
  throw new Error("Soft lighting must reset the plane to a single front light.");
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
const scenePreview = findByClass(wizard.root, "krea2-v2-final-preview")[0];
const scenePreviewHeader = scenePreview.children.find((child) => child.className.includes("krea2-v2-block-head"));
if (!scenePreview.className.includes("is-open")) {
  scenePreviewHeader.listeners.click({ target: scenePreviewHeader });
}
const previewCodeEl = findByClass(wizard.root, "krea2-wizard-preview")[0];
if (!previewCodeEl || previewCodeEl.style.display === "none") {
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

/* --- Conflict-aware cascading inside the character emotion picker -------- */
const addConceptBtn = findByClass(wizard.root, "krea2-wizard-category-add")[0];
addConceptBtn.listeners.click({});
const overlayItems = findByClass(document.body, "krea2-searchable-item");
if (overlayItems.some((item) => textOf(item).includes("Grief"))) {
  throw new Error("The emotion picker must filter out conflicting emotions (grief with joy applied).");
}
if (!overlayItems.some((item) => textOf(item).includes("Joy"))) {
  throw new Error("The emotion picker must keep compatible emotions (joy).");
}
/* Items are alphabetical within each category. */
const emotionItems = overlayItems.filter((item) => {
  const groups = findByClass(item, "krea2-searchable-group");
  return groups.length && textOf(groups[0]) === "Emotion";
});
if (!emotionItems.length || !textOf(emotionItems[0]).includes("Affection")) {
  throw new Error("Picker items must be alphabetical within each category (first emotion: Affection).");
}
/* The character picker must be scoped to subject & expression only. */
const groupChips = findByClass(document.body, "krea2-searchable-chip");
if (groupChips.some((chip) => textOf(chip).includes("Camera"))
    || groupChips.some((chip) => textOf(chip).includes("Lighting"))
    || groupChips.some((chip) => textOf(chip).includes("Environment"))
    || groupChips.some((chip) => textOf(chip).includes("Style"))) {
  throw new Error("The character concept picker must not offer camera/lighting/environment/style groups.");
}
if (!groupChips.some((chip) => textOf(chip).includes("Subject"))) {
  throw new Error("The character concept picker must offer the Subject & Expression group.");
}
findByClass(document.body, "krea2-searchable-close")[0].listeners.click({});

/* --- Per-character LoRAs fully removed ----------------------------------- */
wizard.setState({
  schema_version: 1,
  characters: [{
    id: "c1",
    name: "Mara",
    enabled: true,
    rows: [],
  }],
});
if (findByClass(wizard.root, "krea2-v2-lora-row").length !== 0) {
  throw new Error("LoRA rows must be removed from the CAST tab.");
}
const compiledClean = window.KREA2.helpers.compilePreview(JSON.parse(stateWidget.value)).final_prompt;
if (compiledClean.includes("<lora:")) {
  throw new Error("The compiled prompt must never contain <lora:> tokens.");
}

/* --- Cast header actions still present ------------------------------------- */
if (findByClass(wizard.root, "krea2-cast-random-all").length !== 0) {
  throw new Error("The cast-level dice must be removed (each character has its own).");
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

/* --- Visual Character Creator (opt-in) -------------------------------------- */
const visualProbe = JSON.parse(stateWidget.value);
visualProbe.character_creator = "visual";
wizard.setState(visualProbe);
if (!findByClass(wizard.root, "krea2-visual-creator").length) {
  throw new Error("The Visual Character Creator must render when enabled in settings.");
}
if (findByClass(wizard.root, "krea2-character-columns").length !== 0) {
  throw new Error("The Visual Creator must replace the dropdown appearance wall.");
}
if (findByClass(wizard.root, "krea2-avatar").length !== 0) {
  throw new Error("The Mii avatar must be gone everywhere, including the Visual Creator.");
}
if (findByClass(wizard.root, "krea2-visual-category").length !== 15) {
  throw new Error("The Visual Creator must expose all fifteen category buttons.");
}
const firstCategoryBtn = findByClass(wizard.root, "krea2-visual-category")[0];
firstCategoryBtn.listeners.click({});
const creatorState = JSON.parse(stateWidget.value);
if (!creatorState.characters[0].visual_category) {
  throw new Error("Clicking a Visual Creator category must select it.");
}
visualProbe.character_creator = "legacy";
wizard.setState(visualProbe);
if (findByClass(wizard.root, "krea2-visual-creator").length !== 0
    || findByClass(wizard.root, "krea2-character-columns").length !== 1) {
  throw new Error("Switching back to Legacy must restore the dropdown appearance wall.");
}

console.log("frontend smoke: v2 tabbed editor checks passed");
