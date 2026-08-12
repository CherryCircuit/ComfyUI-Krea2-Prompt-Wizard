import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryPayload = JSON.parse(
  readFileSync(path.join(rootDir, "presets", "default_library.json"), "utf-8"),
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
    this.textContent = "";
    this.parentNode = null;
    this.listeners = {};
    this._innerHTML = "";
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === "") this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
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
globalThis.fetch = (url) => {
  const apiPath = String(url).replace(/^.*\/krea2_prompt_wizard/, "/krea2_prompt_wizard");
  if (apiPath === "/krea2_prompt_wizard/library") {
    return Promise.resolve({ ok: true, json: async () => libraryPayload });
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

if (!wizard || wizard.root.children.length < 2 || !stateWidget.hidden) {
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

function switchTab(tabId) {
  wizard.setTab(tabId);
}

/* --- v2.0 B2 compact shell is the primary surface by default ------------ */
if (!(wizard.root.className || "").split(/\s+/).includes("krea2-wizard-compact")) {
  throw new Error("The wizard must open in the compact B2 shell by default.");
}
if (findByClass(wizard.root, "krea2-b2-shell").length !== 1
    || findByClass(wizard.root, "krea2-b2-title-name").length !== 1
    || findByClass(wizard.root, "krea2-b2-prompt-text").length !== 1
    || findByClass(wizard.root, "krea2-b2-prompt-copy").length !== 1
    || findByClass(wizard.root, "krea2-b2-scene-row").length !== 1
    || findByClass(wizard.root, "krea2-b2-cast-heading").length !== 1
    || findByClass(wizard.root, "krea2-b2-lora-row").length !== 1
    || findByClass(wizard.root, "krea2-b2-expand-wizard").length !== 1) {
  throw new Error("The compact B2 shell must render title, prompt preview with copy, scene/shot row, cast heading, LoRA row and an expand control.");
}
if (!textOf(findByClass(wizard.root, "krea2-b2-prompt-text")[0]).includes("joy")) {
  throw new Error("The compact prompt preview must show the compiled prompt.");
}
if (findByClass(wizard.root, "krea2-wizard-tab").length !== 0
    || findByClass(wizard.root, "krea2-wizard-category").length !== 0
    || findByClass(wizard.root, "krea2-footer-toggle").length !== 0
    || findByClass(wizard.root, "krea2-wizard-base").length !== 0) {
  throw new Error("Compact mode must not render tabs, concept groups, the footer preview or the giant prompt textarea.");
}
const shellAddCharacter = findByClass(wizard.root, "krea2-b2-add-character")[0];
if (!shellAddCharacter) {
  throw new Error("The compact cast heading must expose an add-character control.");
}
shellAddCharacter.listeners.click({});
const shellCharacter = JSON.parse(stateWidget.value).characters[0];
if (!shellCharacter || shellCharacter.expanded !== false) {
  throw new Error("New characters must default to collapsed.");
}
if (findByClass(wizard.root, "krea2-b2-cast-row").length !== 1) {
  throw new Error("The compact shell must list cast members as collapsed rows.");
}
findByClass(wizard.root, "krea2-b2-expand-wizard")[0].listeners.click({});
const expandedRootClasses = (wizard.root.className || "").split(/\s+/);
if (JSON.parse(stateWidget.value).wizard_expanded !== true
    || !expandedRootClasses.includes("krea2-wizard-expanded")
    || findByClass(wizard.root, "krea2-b2-expanded").length !== 1
    || findByClass(wizard.root, "krea2-b2-final-preview").length !== 1
    || findByClass(wizard.root, "krea2-b2-scene-rows").length !== 1
    || findByClass(wizard.root, "krea2-b2-cast-card").length !== 1) {
  throw new Error("Expanding the wizard must reveal the expanded B2 shell and persist the flag.");
}
if (findByClass(wizard.root, "krea2-wizard-tab").length !== 0
    || findByClass(wizard.root, "krea2-footer-toggle").length !== 0) {
  throw new Error("Expanded B2 must not expose the legacy tab chrome or footer as its surface.");
}
const b2Collapse = findByClass(wizard.root, "krea2-b2-collapse")[0];
if (!b2Collapse) {
  throw new Error("The expanded B2 title header must expose a Collapse editor control.");
}
b2Collapse.listeners.click({});
const collapsedRootClasses = (wizard.root.className || "").split(/\s+/);
if (JSON.parse(stateWidget.value).wizard_expanded !== false
    || !collapsedRootClasses.includes("krea2-wizard-compact")
    || collapsedRootClasses.includes("krea2-wizard-expanded")
    || findByClass(wizard.root, "krea2-b2-expand-wizard").length !== 1
    || findByClass(wizard.root, "krea2-b2-final-preview").length !== 0) {
  throw new Error("Collapsing the editor must return to the compact B2 shell.");
}
findByClass(wizard.root, "krea2-b2-expand-wizard")[0].listeners.click({});
if (JSON.parse(stateWidget.value).wizard_expanded !== true) {
  throw new Error("Re-expanding must work after a collapse.");
}

if (findByClass(wizard.root, "krea2-wizard-tab").length !== 0) {
  throw new Error("Expanded B2 must not expose the legacy Cast and Scene tab chrome.");
}
const sceneTypeRow = findByClass(wizard.root, "krea2-b2-field-type")[0];
if (!sceneTypeRow || findByClass(sceneTypeRow, "krea2-wizard-creative-option").length !== 2) {
  throw new Error("The Scene + Shot Type row must expose the Photography/Artwork toggle.");
}
if (findByClass(wizard.root, "krea2-b2-cast-card").length !== 1
    || findByClass(wizard.root, "krea2-character-card").length !== 1) {
  throw new Error("The expanded B2 cast section must render the character cards.");
}
if (findByClass(wizard.root, "krea2-wizard-saved").length !== 1) {
  throw new Error("The full-prompt preset control must live in the top bar.");
}

const promptInput = findByClass(wizard.root, "krea2-wizard-base")[0];
wizard.setState({ schema_version: 1, base_prompt: "restored prompt", rows: [], wizard_expanded: true });
switchTab("scene");
const restoredInput = findByClass(wizard.root, "krea2-wizard-base")[0];
restoredInput.listeners.input({ target: { value: "updated prompt" } });
if (JSON.parse(stateWidget.value).base_prompt !== "updated prompt") {
  throw new Error("Main prompt edits must persist after state restoration.");
}

wizard.setState({
  schema_version: 1,
  base_prompt: "portrait",
  wizard_expanded: true,
  show_concepts_tab: true,
  rows: [{
    id: "row_smoke",
    category: "framing",
    preset_id: "framing.close_up",
    label: "Close-up",
    phrase: "close-up framing",
    control_mode: "scalar",
    intensity: 42,
    strength: -1.25,
    enabled: true,
    aliases: [],
    verification: "general visual vocabulary",
  }],
});
if (findByClass(wizard.root, "krea2-wizard-tab").length !== 0) {
  throw new Error("The retired Concepts tab must stay hidden even when old workflows carry show_concepts_tab.");
}
switchTab("scene");
const sliders = findByClass(wizard.root, "krea2-row-intensity");
if (sliders.length !== 1 || sliders[0].min !== "-3" || sliders[0].max !== "3") {
  throw new Error("Scene concept cards must expose the compact -3 to +3 strength control.");
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
  throw new Error("The Scene tab must absorb the five global concept groups including Subject & Expression.");
}
if (findByClass(wizard.root, "krea2-wizard-random-controls").length !== 5) {
  throw new Error("Each scene concept group must keep its dice and shuffle controls.");
}
if (findByClass(wizard.root, "krea2-shuffle").length < 5) {
  throw new Error("Group each-job flags must use the shuffle icon.");
}
if (findByClass(wizard.root, "krea2-wizard-category-load").length !== 0) {
  throw new Error("Group presets must load automatically without a Load button.");
}

/* --- Global Subject & Expression section is visible and explicit ----- */
const sceneSections = findByClass(wizard.root, "krea2-wizard-category");
const subjectSection = sceneSections.find((section) => {
  const titles = findByClass(section, "krea2-wizard-category-title");
  return titles.length && textOf(titles[0]).includes("Subject & Expression");
});
if (!subjectSection) {
  throw new Error("The global Subject & Expression section must render on the Scene tab.");
}
if (findByClass(subjectSection, "krea2-wizard-category-random").length !== 1
    || findByClass(subjectSection, "krea2-shuffle").length !== 1
    || findByClass(subjectSection, "krea2-wizard-category-count").length !== 1
    || findByClass(subjectSection, "krea2-wizard-category-add").length !== 1
    || findByClass(subjectSection, "krea2-wizard-category-save").length !== 1) {
  throw new Error("Subject & Expression must expose count, dice, each-job, add, and save-preset controls.");
}

/* --- Scene group each-job toggles work without Shift ----------------- */
const cameraSection = sceneSections.find((section) => {
  const titles = findByClass(section, "krea2-wizard-category-title");
  return titles.length && textOf(titles[0]).includes("Camera & Film");
});
const cameraEachJob = findByClass(cameraSection, "krea2-shuffle")[0];
cameraEachJob.listeners.click({ stopPropagation() {} });
if (!JSON.parse(stateWidget.value).randomize_on_job.camera_film) {
  throw new Error("Clicking a scene group each-job toggle must persist the flag without Shift.");
}
cameraEachJob.listeners.click({ stopPropagation() {} });
if (JSON.parse(stateWidget.value).randomize_on_job.camera_film) {
  throw new Error("Clicking an active scene group each-job toggle must turn it off.");
}

/* Final Prompt Preview: the single expanded-mode preview surface */
switchTab("cast");
if (findByClass(wizard.root, "krea2-footer-toggle").length !== 0) {
  throw new Error("Expanded B2 must not render the legacy collapsible footer.");
}
if (findByClass(wizard.root, "krea2-b2-final-preview").length !== 1
    || findByClass(wizard.root, "krea2-wizard-preview-host").length !== 1
    || findByClass(wizard.root, "krea2-preview-pretty").length !== 1
    || findByClass(wizard.root, "krea2-wizard-preview").length !== 1) {
  throw new Error("The B2 final prompt preview must render readable and prompt-code views.");
}
if (findByClass(wizard.root, "krea2-preview-tab").length !== 0) {
  throw new Error("The preview must be stacked, not hidden behind Pretty/Code tabs.");
}
if (findByClass(wizard.root, "krea2-motion-section").length !== 0) {
  throw new Error("The video motion prompt must be hidden by default.");
}
/* Enable it via Node settings */
function clickNode(node) {
  node.listeners.click({ stopPropagation() {} });
}
const moreBtn = findByClass(wizard.root, "krea2-wizard-overflow")
  .flatMap((wrap) => findByClass(wrap, "krea2-wizard-btn"))
  .find((btn) => textOf(btn) === "···");
clickNode(moreBtn);
const settingsMenuItem = findByClass(wizard.root, "krea2-wizard-overflow-menu")
  .flatMap((menu) => findByClass(menu, "krea2-wizard-btn"))
  .find((btn) => textOf(btn).includes("Node settings"));
clickNode(settingsMenuItem);
const motionToggle = findByClass(wizard.root, "krea2-inline-check")
  .find((label) => textOf(label).includes("video motion prompt"));
if (!motionToggle) {
  throw new Error("Node settings must offer the video motion prompt toggle.");
}
const motionCheckbox = motionToggle.children[0];
motionCheckbox.listeners.change({ target: { checked: true } });
if (findByClass(wizard.root, "krea2-motion-section").length !== 1
    || findByClass(wizard.root, "krea2-motion-prompt").length !== 1) {
  throw new Error("Enabling the motion section in settings must reveal the video motion prompt editor.");
}

const structuredState = {
  schema_version: 1,
  base_prompt: "team portrait",
  wizard_expanded: true,
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
switchTab("cast");
if (findByClass(wizard.root, "krea2-avatar").length !== 2
    || findByClass(wizard.root, "krea2-b2-character-card").length !== 2
    || findByClass(wizard.root, "krea2-save-character").length !== 2
    || findByClass(wizard.root, "krea2-quick-directions").length !== 2
    || findByClass(wizard.root, "krea2-b2-lora-controls").length !== 2
    || findByClass(wizard.root, "krea2-lora-strength").length !== 2) {
  throw new Error("Each cast member must render as a compact B2 card with quick directions and a LoRA select + strength slider.");
}
const compactComboboxes = findByClass(wizard.root, "krea2-combobox");
if (compactComboboxes.length !== 8) {
  throw new Error("Compact cast cards must expose exactly the four appearance fields per character (8 comboboxes total).");
}
for (const field of ["Hair", "Eyes", "Build", "Fit"]) {
  if (compactComboboxes.filter((input) => input["aria-label"] === field).length !== 2) {
    throw new Error("Each compact cast card must expose exactly one " + field + " field.");
  }
}
if (findByClass(wizard.root, "krea2-character-columns").length !== 0
    || findByClass(wizard.root, "krea2-subcard").length !== 0
    || findByClass(wizard.root, "krea2-character-category").length !== 0
    || findByClass(wizard.root, "krea2-lora-section").length !== 0
    || findByClass(wizard.root, "krea2-field-random").length !== 0) {
  throw new Error("The expanded B2 cast must not render the legacy full appearance wall, direction sections or LoRA sections.");
}
if (findByClass(wizard.root, "krea2-character-tab").length !== 0) {
  throw new Error("Cast members must be stacked sections, not click-to-switch tabs.");
}
if (findByClass(wizard.root, "krea2-icon-btn").length < 8) {
  throw new Error("Randomization controls must use compact dice buttons.");
}

const firstHeaderEachJob = findByClass(wizard.root, "krea2-character-random-each-job")[0];
if (!firstHeaderEachJob) {
  throw new Error("Every compact cast card must expose an each-job appearance toggle.");
}
firstHeaderEachJob.listeners.click({});
const eachJobPersisted = JSON.parse(stateWidget.value).characters
  .find((item) => item.id === "a");
if (!eachJobPersisted.randomize_fields
    || !eachJobPersisted.randomize_fields.hair_style
    || !eachJobPersisted.randomize_fields.eyes
    || !eachJobPersisted.randomize_fields.body_type
    || !eachJobPersisted.randomize_fields.fitness) {
  throw new Error("Clicking a compact card each-job toggle must flag the four visible appearance fields.");
}
if (findByClass(wizard.root, "krea2-character-random-each-job")
  .filter((btn) => btn.className.includes("is-active")).length !== 1) {
  throw new Error("A compact card with each-run appearance enabled must render its each-job toggle active.");
}

/* --- Compact cards keep quick directions + chips, not full sections --- */
if (!findByClass(wizard.root, "krea2-b2-character-card")
  .every((card) => findByClass(card, "krea2-emotion-chip").length >= 10)
  || !findByClass(wizard.root, "krea2-b2-character-card")
  .every((card) => findByClass(card, "krea2-character-chips").length === 1)) {
  throw new Error("Every compact card must render quick-direction chips and the concept chip row.");
}
if (findByClass(wizard.root, "krea2-character-category").length !== 0) {
  throw new Error("Compact cards must not render Concepts-style direction sections.");
}

/* --- Avatar art layer -------------------------------------------------- */
if (findByClass(wizard.root, "krea2-avatar-art").length !== 2) {
  throw new Error("Each avatar must render its art inside the scalable art layer.");
}

/* --- Legacy clothing migrates into the editable ensemble field --------- */
const legacyState = {
  schema_version: 1,
  base_prompt: "test",
  rows: [],
  characters: [
    { id: "lg", name: "Old", enabled: true, clothing: "elegant formal dress", expression: "calm confidence" },
  ],
};
const migrated = window.KREA2.helpers.coerceState(JSON.parse(JSON.stringify(legacyState)));
if (migrated.characters[0].ensemble !== "elegant formal dress" || migrated.characters[0].clothing) {
  throw new Error("Legacy clothing must migrate into the editable ensemble field.");
}
const legacyPreview = window.KREA2.helpers.compilePreview(migrated).final_prompt;
if (!legacyPreview.includes("costume: elegant formal dress")
    || legacyPreview.includes("clothing and armour")) {
  throw new Error("Migrated legacy clothing must compile as the costume field only.");
}

/* --- Compact appearance fields edit the real state keys -------------- */
const hairInput = findByClass(wizard.root, "krea2-combobox")
  .find((input) => input["aria-label"] === "Hair");
hairInput.listeners.input({ target: { value: "wavy" } });
const afterHair = JSON.parse(stateWidget.value).characters.find((item) => item.id === "a");
if (afterHair.hair_style !== "wavy") {
  throw new Error("Typing in a compact appearance field must persist to its state key.");
}

const directedState = {
  schema_version: 1,
  base_prompt: "a rainy street",
  wizard_expanded: true,
  rows: [],
  characters: [
    {
      id: "d1",
      name: "Mara",
      enabled: true,
      sex: "female",
      position: "standing on the left side of the frame",
      rows: [{
        id: "dr1",
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
      face_guidance: "(sparkling bright eyes:1.4)",
    },
    {
      id: "d2",
      name: "Alex",
      enabled: true,
      sex: "male",
      position: "standing on the right side of the frame",
      rows: [{
        id: "dr2",
        category: "emotion",
        preset_id: "emotion.sadness",
        label: "Sadness",
        phrase: "sadness",
        control_mode: "scalar",
        intensity: 0,
        strength: 1.5,
        enabled: true,
        aliases: [],
      }],
      interaction: "avoiding eye contact",
    },
  ],
  motion_prompt_enabled: true,
};
wizard.setState(directedState);
const directedPreview = window.KREA2.helpers.compilePreview(directedState);
if (!directedPreview.final_prompt.includes("Character Mara (standing on the left side of the frame)")
    || !directedPreview.final_prompt.includes("(joy:1.5)")
    || !directedPreview.final_prompt.includes("Character Alex (standing on the right side of the frame)")
    || !directedPreview.final_prompt.includes("(sadness:1.5)")
    || !directedPreview.final_prompt.includes("(sparkling bright eyes:1.4)")
    || !directedPreview.final_prompt.includes("avoiding eye contact")) {
  throw new Error("Directed cast members must compile with separate emotions, positions, and face guidance.");
}
const maraIndex = directedPreview.final_prompt.indexOf("Mara");
const alexIndex = directedPreview.final_prompt.indexOf("Alex");
if (directedPreview.final_prompt.slice(maraIndex, alexIndex).includes("sadness")) {
  throw new Error("One cast member's emotion must not leak into the other's block.");
}
if (!directedPreview.motion_prompt_draft.includes("beams with joy")
    || !directedPreview.motion_prompt_draft.includes("looks sad")) {
  throw new Error("The cast draft must produce per-character motion lines.");
}
switchTab("cast");
await new Promise((resolve) => setTimeout(resolve, 25));
const quickChips = findByClass(wizard.root, "krea2-emotion-chip");
if (quickChips.length < 30
    || findByClass(wizard.root, "krea2-b2-character-card").length !== 2
    || quickChips.filter((chip) => (chip.className || "").split(/\s+/).includes("is-active")).length < 1) {
  throw new Error("Cast cards must render quick-direction chips for every member, with active directions highlighted.");
}

/* --- Quick direction applies multiple concepts at once -------------- */
function textOf(element) {
  if (!element) return "";
  if (element.tagName === "#text") return element.textContent || "";
  return (element.children || []).map((child) => textOf(child)).join("");
}
const quickMara = quickChips.find((chip) => textOf(chip) === "Triumphant");
quickMara.listeners.click({});
const quickState = JSON.parse(stateWidget.value);
const quickMaraCharacter = quickState.characters.find((item) => item.id === "d1");
const quickIds = new Set((quickMaraCharacter.rows || []).map((row) => row.preset_id));
if (!quickIds.has("emotion.elation") || !quickIds.has("mouth.broad_smile") || !quickIds.has("body.shoulders_pulled_back")) {
  throw new Error("A quick direction must add several related concepts at once.");
}
quickMara.listeners.click({});
const removedState = JSON.parse(stateWidget.value);
const removedIds = new Set((removedState.characters.find((item) => item.id === "d1").rows || []).map((row) => row.preset_id));
if (removedIds.has("mouth.broad_smile") || removedIds.has("body.shoulders_pulled_back")) {
  throw new Error("Clicking an active quick direction must remove its whole set.");
}

/* --- Resolved-state merge must preserve the active tab -------------- */
wizard.setTab("cast");
const resolvedProbe = JSON.parse(JSON.stringify(directedState));
resolvedProbe.active_tab = "scene";
resolvedProbe.characters[0].hair_color = "blonde";
wizard.applyResolvedState(resolvedProbe);
if (findByClass(wizard.root, "krea2-b2-expanded").length !== 1
    || findByClass(wizard.root, "krea2-character-card").length !== 2) {
  throw new Error("Applying a resolved state must keep the expanded B2 shell and the cast visible.");
}
const resolvedPersisted = JSON.parse(stateWidget.value);
if (resolvedPersisted.characters[0].hair_color !== "blonde") {
  throw new Error("Resolved content (e.g. randomized values) must still be applied.");
}

/* --- Each-run field randomization contract ------------------------ */
const eachRunState = JSON.parse(JSON.stringify(directedState));
eachRunState.characters[0].randomize_fields = {
  hair_style: ["straight", "wavy"],
  eyes: ["brown eyes", "green eyes"],
  body_type: ["slim build", "athletic build"],
  fitness: ["fit", "toned physique"],
};
if (!window.KREA2.helpers.compilePreview) throw new Error("compilePreview must exist");
wizard.setState(eachRunState);
switchTab("cast");
await new Promise((resolve) => setTimeout(resolve, 25));
const rollButtons = findByClass(wizard.root, "krea2-character-random-look");
const eachJobButtons = findByClass(wizard.root, "krea2-character-random-each-job");
if (rollButtons.length !== 2 || eachJobButtons.length !== 2) {
  throw new Error("Each compact cast card must expose the header roll-once and each-job controls.");
}
if (eachJobButtons.filter((btn) => btn.className.includes("is-active")).length !== 1) {
  throw new Error("A compact card with every visible field flagged for each-run randomization must render its each-job toggle active.");
}
rollButtons[0].listeners.click({});
const rolledState = JSON.parse(stateWidget.value);
const rolledCharacter = rolledState.characters.find((item) => item.id === "d1");
if (!rolledCharacter.hair_style || !rolledCharacter.eyes
    || !rolledCharacter.body_type || !rolledCharacter.fitness) {
  throw new Error("The compact card dice must randomize the four visible appearance fields.");
}
/* The dice re-rolls every field (including sex); pin it back so the
 * later avatar identity assertions stay deterministic. */
rolledCharacter.sex = "female";
wizard.setState(rolledState);

/* --- Compact LoRA select + strength stay functional ---------------- */
const loraSelects = findByClass(wizard.root, "krea2-compact-select")
  .filter((select) => String(select["aria-label"] || "").startsWith("LoRA for"));
if (loraSelects.length !== 2) {
  throw new Error("Every compact cast card must expose a LoRA select.");
}
loraSelects[0].listeners.change({ target: { value: "mecha-char v2.safetensors" } });
const loraPersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (loraPersisted.lora_name !== "mecha-char v2.safetensors") {
  throw new Error("Choosing a LoRA in a compact card must persist the name.");
}
const strengthSliders = findByClass(wizard.root, "krea2-lora-strength");
if (strengthSliders.length !== 2) {
  throw new Error("Every compact cast card must expose a LoRA strength slider.");
}
strengthSliders[0].listeners.input({ target: { value: "1.25" } });
const strengthPersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (strengthPersisted.lora_strength !== 1.25) {
  throw new Error("Moving the compact LoRA strength slider must persist the value.");
}

/* --- Position survives; no position select row on compact cards ----- */
if (findByClass(wizard.root, "krea2-direction-position").length !== 0) {
  throw new Error("The position select row must not render on compact cast cards.");
}
const positionPersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (positionPersisted.position !== "standing on the left side of the frame") {
  throw new Error("Compact cards must not clear the character's position field.");
}

/* --- Avatar art carries identity modifier classes ------------------ */
const avatars = findByClass(wizard.root, "krea2-avatar");
if (avatars.length !== 2) {
  throw new Error("Each cast member must render an avatar.");
}
const maraAvatar = avatars.find((avatar) => (avatar.className || "").split(/\s+/).includes("is-female"));
const alexAvatar = avatars.find((avatar) => (avatar.className || "").split(/\s+/).includes("is-male"));
if (!maraAvatar || !alexAvatar) {
  throw new Error("Avatars must paint sex-based modifier classes from identity fields.");
}
const maraArt = findByClass(maraAvatar, "krea2-avatar-art")[0];
if (!maraArt
    || !findByClass(maraArt, "krea2-avatar-head").length
    || !findByClass(maraArt, "krea2-avatar-hair-back").length
    || !findByClass(maraArt, "krea2-avatar-hair-front").length) {
  throw new Error("The avatar art layer must contain head and hair pieces with modifier classes.");
}

/* --- Character preset overwrite confirmation ---------------------- */
const confirmed = [];
const originalConfirm = window.confirm;
window.confirm = (message) => {
  confirmed.push(message);
  return true;
};
const saveButtons = findByClass(wizard.root, "krea2-save-character");
const firstSave = saveButtons[0];
firstSave.listeners.click({});
await new Promise((resolve) => setTimeout(resolve, 10));
const saveButtonsAfter = findByClass(wizard.root, "krea2-save-character");
if (saveButtonsAfter.length !== 2) {
  throw new Error("Saving must not re-render away the cast.");
}
const posts = [];
const originalFetch = window.fetch;
window.fetch = (url, options) => {
  const apiPath = String(url).replace(/^.*\/krea2_prompt_wizard/, "/krea2_prompt_wizard");
  if (apiPath === "/krea2_prompt_wizard/saved_presets" && options && options.method === "POST") {
    posts.push(options.body || "");
    return Promise.resolve({
      ok: true,
      json: async () => ({ presets: JSON.parse(options.body || "{}").presets || [] }),
    });
  }
  return originalFetch(url, options);
};
findByClass(wizard.root, "krea2-save-character")[0].listeners.click({});
await new Promise((resolve) => setTimeout(resolve, 10));
findByClass(wizard.root, "krea2-save-character")[0].listeners.click({});
await new Promise((resolve) => setTimeout(resolve, 10));
if (confirmed.length < 1) {
  throw new Error("Saving a character with an existing name must ask before overwriting.");
}
const lastPayload = JSON.parse(posts[posts.length - 1]);
const characterPresets = lastPayload.presets.filter((preset) => preset.scope === "character");
if (characterPresets.length !== 1) {
  throw new Error("Overwriting a character preset must replace it, not duplicate it.");
}
window.confirm = originalConfirm;
window.fetch = originalFetch;

/* --- Expanded B2 scene + shot card --------------------------------------- */
switchTab("scene");
const sceneCards = findByClass(wizard.root, "krea2-b2-scene-card");
if (sceneCards.length !== 1) {
  throw new Error("Expanded B2 must render the Scene + Shot card.");
}
const sceneFieldRows = findByClass(sceneCards[0], "krea2-b2-field-row");
if (sceneFieldRows.length < 3) {
  throw new Error("The Scene + Shot card must expose editable Type, Setting and Shot rows.");
}
const sceneExpandBtn = findByClass(sceneCards[0], "krea2-b2-scene-expand")[0];
if (!sceneExpandBtn || sceneExpandBtn["aria-expanded"] !== "false") {
  throw new Error("The Scene + Shot card must expose a scene-detail expand control.");
}
sceneExpandBtn.listeners.click({});
const expandedSceneCard = findByClass(wizard.root, "krea2-b2-scene-card")[0];
if (JSON.parse(stateWidget.value).scene_collapsed !== false
    || findByClass(expandedSceneCard, "krea2-b2-scene-detail")[0].className
      .split(/\s+/).includes("is-hidden")
    || findByClass(expandedSceneCard, "krea2-scene-description").length !== 1) {
  throw new Error("Expanding the scene detail must reveal the description editor and persist the flag.");
}

switchTab("cast");
if (findByClass(wizard.root, "krea2-cast-random-all").length !== 1) {
  throw new Error("The cast header must keep a cast-level randomization control.");
}
if (findByClass(wizard.root, "krea2-subcard").length !== 0
    || findByClass(wizard.root, "krea2-character-columns").length !== 0
    || findByClass(wizard.root, "krea2-lora-section").length !== 0) {
  throw new Error("Expanded cast members must stay compact: no legacy subcards, appearance columns or LoRA sections.");
}

const collapsedState = JSON.parse(JSON.stringify(eachRunState));
collapsedState.characters[0].lora_name = "mecha-char v2.safetensors";
wizard.setState(collapsedState);
switchTab("cast");
const cardExpand = findByClass(wizard.root, "krea2-character-expand")[0];
cardExpand.listeners.click({});
const collapsedCards = findByClass(wizard.root, "krea2-b2-character-card");
if ((collapsedCards[0].className || "").split(/\s+/).includes("is-expanded")
    || findByClass(collapsedCards[0], "krea2-b2-appearance-grid").length !== 0
    || findByClass(collapsedCards[0], "krea2-character-chips").length !== 1) {
  throw new Error("Collapsed compact cards must hide the appearance grid and render direction chips.");
}
const chipsHost = findByClass(collapsedCards[0], "krea2-character-chips")[0];
if (findByClass(chipsHost, "krea2-character-chip").length < 2
    || !textOf(chipsHost).includes("LoRA")) {
  throw new Error("Collapsed chips must summarize direction groups and the LoRA without hovering.");
}
cardExpand.listeners.click({});
const expandedAgain = findByClass(wizard.root, "krea2-b2-character-card")[0];
if (!(expandedAgain.className || "").split(/\s+/).includes("is-expanded")
    || findByClass(expandedAgain, "krea2-b2-appearance-grid").length !== 1) {
  throw new Error("Expanding a compact card must reveal the four-field appearance grid.");
}

wizard.recordExecution("first prompt");
wizard.recordExecution("second prompt");
if (wizard.getExecutionHistory().join("|") !== "first prompt|second prompt"
    || wizard.root.dataset.krea2ExecutionCount !== "2"
    || JSON.parse(wizard.root.dataset.krea2ExecutionHistory).length !== 2
    || wizard.root.dataset.krea2LastOutput !== "second prompt") {
  throw new Error("Live execution evidence must retain recent prompt outputs.");
}

/* --- Compact contraction timing: the node must shrink after collapse -------
 * The first measurement runs while the host widget is still sized to the
 * previous expanded height, so scrollHeight reports the stale content height.
 * syncNodeHeight must re-measure after the layout settles and then call
 * node.setSize with the compact shell's real ~296px content height. */
const rafQueue = [];
const originalRaf = window.requestAnimationFrame;
window.requestAnimationFrame = (callback) => { rafQueue.push(callback); return rafQueue.length; };
const flushRaf = () => { while (rafQueue.length) rafQueue.shift()(); };
const contractSizes = [];
let hostStillExpanded = true;
wizard.root.isConnected = true;
wizard.root.offsetWidth = 900;
wizard.root.offsetHeight = 1854;
wizard.root.scrollWidth = 900;
wizard.root.scrollHeight = 1752;
node.setSize = (size) => {
  contractSizes.push([...size]);
  node.size = size;
  if (hostStillExpanded) {
    hostStillExpanded = false;
    wizard.root.scrollHeight = 296;
  }
};
findByClass(wizard.root, "krea2-b2-collapse")[0].listeners.click({});
flushRaf();
const finalContractSize = node.size;
window.requestAnimationFrame = originalRaf;
if (!finalContractSize || finalContractSize[1] > 340 || finalContractSize[1] < 100) {
  throw new Error("Collapsing the wizard must contract the node to the compact shell height (~320px), got " + JSON.stringify(finalContractSize) + ".");
}
if (contractSizes.length < 2) {
  throw new Error("Contracting must re-measure after the layout settles instead of trusting the first stale frame.");
}
