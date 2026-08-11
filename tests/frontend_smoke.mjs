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

if (findByClass(wizard.root, "krea2-wizard-tab").length !== 2) {
  throw new Error("The wizard must expose Cast and Scene tabs (Concepts hidden by default).");
}
if (findByClass(wizard.root, "krea2-wizard-creative-option").length !== 2) {
  throw new Error("The creative mode toggle must remain visible in the header.");
}
if (!findByClass(wizard.root, "krea2-structured-section").length) {
  throw new Error("The Cast tab must render the character editor by default.");
}
if (findByClass(wizard.root, "krea2-wizard-saved").length !== 1) {
  throw new Error("The full-prompt preset control must live in the top bar.");
}

const promptInput = findByClass(wizard.root, "krea2-wizard-base")[0];
wizard.setState({ schema_version: 1, base_prompt: "restored prompt", rows: [] });
switchTab("scene");
const restoredInput = findByClass(wizard.root, "krea2-wizard-base")[0];
restoredInput.listeners.input({ target: { value: "updated prompt" } });
if (JSON.parse(stateWidget.value).base_prompt !== "updated prompt") {
  throw new Error("Main prompt edits must persist after state restoration.");
}

wizard.setState({
  schema_version: 1,
  base_prompt: "portrait",
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
if (findByClass(wizard.root, "krea2-wizard-tab").length !== 2) {
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

/* Footer: collapsible prompt section on every tab */
switchTab("cast");
if (findByClass(wizard.root, "krea2-footer-toggle").length !== 1) {
  throw new Error("A collapsible Prompt footer must exist on every tab.");
}
findByClass(wizard.root, "krea2-footer-toggle")[0].listeners.click({});
if (findByClass(wizard.root, "krea2-wizard-preview-host").length !== 1
    || findByClass(wizard.root, "krea2-preview-pretty").length !== 1
    || findByClass(wizard.root, "krea2-wizard-preview").length !== 1) {
  throw new Error("The Prompt footer must render both readable and prompt-code preview views.");
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
    || findByClass(wizard.root, "krea2-character-card").length !== 2
    || findByClass(wizard.root, "krea2-save-character").length !== 2
    || findByClass(wizard.root, "krea2-character-columns").length !== 2
    || findByClass(wizard.root, "krea2-combobox").length < 20
    || findByClass(wizard.root, "krea2-field-random").length < 20
    || findByClass(wizard.root, "krea2-field-each-job").length < 20
    || findByClass(wizard.root, "krea2-lora-section").length !== 2
    || findByClass(wizard.root, "krea2-quick-directions").length !== 2
    || findByClass(wizard.root, "krea2-character-category").length < 6) {
  throw new Error("Each cast member must render as an expandable card with appearance comboboxes, explicit random controls, quick directions, direction sections, and a LoRA section.");
}
if (findByClass(wizard.root, "krea2-character-tab").length !== 0) {
  throw new Error("Cast members must be stacked sections, not click-to-switch tabs.");
}
if (findByClass(wizard.root, "krea2-icon-btn").length < 8) {
  throw new Error("Randomization controls must use compact dice buttons.");
}

const firstAppearanceEachJob = findByClass(wizard.root, "krea2-field-each-job")[0];
firstAppearanceEachJob.listeners.click({});
if (findByClass(wizard.root, "krea2-field-each-job").filter((btn) => btn.className.includes("is-active")).length < 1) {
  throw new Error("Clicking an appearance each-job icon must toggle each-run mode without Shift.");
}
const sexFields = findByClass(wizard.root, "krea2-combobox").filter((input) => input["aria-label"] === "Sex");
if (sexFields.length !== 2) {
  throw new Error("Each cast member must expose a Sex field.");
}
const ethnicityFields = findByClass(wizard.root, "krea2-combobox").filter((input) => input["aria-label"] === "Ethnicity");
if (ethnicityFields.length !== 2) {
  throw new Error("Each cast member must expose an Ethnicity field.");
}

/* --- Direction sections carry the full Concepts-tab action set --------- */
const directionSections = findByClass(wizard.root, "krea2-character-category");
if (directionSections.length < 6) {
  throw new Error("Each cast member must render Concepts-style direction sections.");
}
function insideEach(sectionClass, childClass) {
  return findByClass(wizard.root, sectionClass)
    .every((section) => findByClass(section, childClass).length >= 1);
}
if (!insideEach("krea2-character-category", "krea2-wizard-category-count")
    || !insideEach("krea2-character-category", "krea2-wizard-category-random")
    || !insideEach("krea2-character-category", "krea2-wizard-category-save")
    || !insideEach("krea2-character-category", "krea2-wizard-category-add")) {
  throw new Error("Direction sections must expose count, dice, save-preset, and add controls like the Concepts tab.");
}
if (!insideEach("krea2-character-category", "krea2-shuffle")) {
  throw new Error("Every direction group must expose its own visible each-job toggle.");
}
if (findByClass(wizard.root, "krea2-character-category")
  .some((section) => {
    const buttons = findByClass(section, "button");
    return buttons.some((btn) => /Shift-click|shiftKey/i.test(btn.title || btn["aria-label"] || ""));
  })) {
  throw new Error("Direction randomization controls must not require Shift.");
}

/* --- Direction each-job toggles work without Shift ------------------ */
const firstDirectionSection = findByClass(wizard.root, "krea2-character-category")[0];
const firstDirectionEachJob = findByClass(firstDirectionSection, "krea2-shuffle")[0];
const firstDirectionCardId = findByClass(wizard.root, "krea2-character-card")[0].dataset.characterId;
firstDirectionEachJob.listeners.click({ stopPropagation() {} });
const directionPersisted = JSON.parse(stateWidget.value).characters
  .find((item) => item.id === firstDirectionCardId);
if (!directionPersisted.randomize_direction_groups
    || !directionPersisted.randomize_direction_groups.emotion) {
  throw new Error("Clicking a direction each-job toggle must persist the flag without Shift.");
}
firstDirectionEachJob.listeners.click({ stopPropagation() {} });
const directionPersistedOff = JSON.parse(stateWidget.value).characters
  .find((item) => item.id === firstDirectionCardId);
if (directionPersistedOff.randomize_direction_groups.emotion) {
  throw new Error("Clicking an active direction each-job toggle must turn it off.");
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

/* --- Ensemble / separates exclusivity ------------------------------ */
const ensembleInput = findByClass(wizard.root, "krea2-combobox")
  .find((input) => input["aria-label"] === "Ensemble (full costume)");
const topInput = findByClass(wizard.root, "krea2-combobox")
  .find((input) => input["aria-label"] === "Top");
if (!ensembleInput || !topInput) {
  throw new Error("Ensemble and Top comboboxes must exist.");
}
function currentCastMember() {
  const persisted = JSON.parse(stateWidget.value);
  return persisted.characters.find((item) => item.id === "d1") || persisted.characters[0];
}
ensembleInput.listeners.input({ target: { value: "western cowboy outfit" } });
const afterEnsemble = currentCastMember();
if (afterEnsemble.ensemble !== "western cowboy outfit"
    || afterEnsemble.clothing_top !== "" || afterEnsemble.clothing_bottom !== "") {
  throw new Error("Choosing an ensemble must clear the separates.");
}
const topAfterEnsemble = findByClass(wizard.root, "krea2-combobox")
  .find((input) => input["aria-label"] === "Top");
topAfterEnsemble.listeners.input({ target: { value: "flannel shirt" } });
const afterTop = currentCastMember();
if (afterTop.ensemble !== "" || afterTop.clothing_top !== "flannel shirt") {
  throw new Error("Using separates must clear the ensemble.");
}

const directedState = {
  schema_version: 1,
  base_prompt: "a rainy street",
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
    || findByClass(wizard.root, "krea2-character-category").length < 6
    || quickChips.filter((chip) => (chip.className || "").split(/\s+/).includes("is-active")).length < 1) {
  throw new Error("Cast direction must render quick-direction chips and scoped direction sections for every member.");
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
const activeTabs = findByClass(wizard.root, "krea2-wizard-tab")
  .filter((tab) => (tab.className || "").split(/\s+/).includes("is-active"));
if (activeTabs.length !== 1) {
  throw new Error("Exactly one tab must be active after applying a resolved state.");
}
const activeTabText = textOf(activeTabs[0]);
if (!activeTabText.includes("Cast")) {
  throw new Error("Applying a resolved state must not yank the user off the Cast tab.");
}
const resolvedPersisted = JSON.parse(stateWidget.value);
if (resolvedPersisted.characters[0].hair_color !== "blonde") {
  throw new Error("Resolved content (e.g. randomized values) must still be applied.");
}

/* --- Each-run field randomization contract ------------------------ */
const eachRunState = JSON.parse(JSON.stringify(directedState));
eachRunState.characters[0].randomize_fields = {
  hair_color: ["red", "blonde", "black"],
  age: ["young adult", "middle aged"],
};
if (!window.KREA2.helpers.compilePreview) throw new Error("compilePreview must exist");
wizard.setState(eachRunState);
switchTab("cast");
await new Promise((resolve) => setTimeout(resolve, 25));
const rollButtons = findByClass(wizard.root, "krea2-field-random");
const eachJobButtons = findByClass(wizard.root, "krea2-field-each-job");
if (rollButtons.length < 25 || eachJobButtons.length < 25) {
  throw new Error("Each appearance field must expose separate roll-once and each-job controls.");
}
if (eachJobButtons.filter((btn) => btn.className.includes("is-active")).length < 2) {
  throw new Error("Fields flagged for each-run randomization must render as active each-job icons.");
}
if (rollButtons.some((btn) => /Shift-click/i.test(btn.title || ""))
    || eachJobButtons.some((btn) => /Shift-click/i.test(btn.title || ""))) {
  throw new Error("Appearance randomization controls must not require Shift-click.");
}

/* --- LoRA trigger words have one-shot and each-job controls ---------- */
const loraEachJobButtons = findByClass(wizard.root, "krea2-lora-each-job");
if (loraEachJobButtons.length !== 2) {
  throw new Error("Every cast member's LoRA section must expose a trigger-word each-job control.");
}
const firstLoraEachJob = loraEachJobButtons[0];
firstLoraEachJob.listeners.click({});
const loraPersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (!loraPersisted.randomize_fields
    || !Array.isArray(loraPersisted.randomize_fields.lora_triggers)
    || !loraPersisted.randomize_fields.lora_triggers.length) {
  throw new Error("Enabling LoRA each-job must snapshot the trigger-word pool into state.");
}
if (findByClass(wizard.root, "krea2-lora-each-job")
  .filter((btn) => btn.className.includes("is-active")).length !== 1) {
  throw new Error("Enabling LoRA each-job must render the toggle active.");
}
firstLoraEachJob.listeners.click({});
if (JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1").randomize_fields.lora_triggers) {
  throw new Error("Disabling LoRA each-job must drop the snapshot pool.");
}

/* --- Direction sections collapse per character -------------------- */
const collapseSections = findByClass(wizard.root, "krea2-character-category");
const emotionSection = collapseSections.find((section) => {
  const titles = findByClass(section, "krea2-wizard-category-title");
  return titles.length && textOf(titles[0]) === "Emotion";
});
if (!emotionSection) {
  throw new Error("Each cast member must render an Emotion direction section.");
}
const emotionHeader = findByClass(emotionSection, "krea2-wizard-category-header")[0];
const emotionActions = findByClass(emotionSection, "krea2-wizard-category-actions")[0];
const emotionContent = findByClass(emotionSection, "krea2-wizard-category-content")[0];
if ((emotionSection.className || "").split(/\s+/).includes("is-collapsed")) {
  throw new Error("Direction sections must start expanded on first render.");
}
emotionHeader.listeners.click({ target: {} });
if (!(emotionSection.className || "").split(/\s+/).includes("is-collapsed")
    || emotionActions.style.display !== "none"
    || emotionContent.style.display !== "none") {
  throw new Error("Clicking a direction header must collapse its content and actions.");
}
const collapsePersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (!collapsePersisted.collapsed_direction || collapsePersisted.collapsed_direction.emotion !== true) {
  throw new Error("Direction collapse state must persist per character.");
}
emotionHeader.listeners.click({ target: {} });
if ((emotionSection.className || "").split(/\s+/).includes("is-collapsed")) {
  throw new Error("Clicking a collapsed header must expand it again.");
}

/* --- The useless "or type a position" row is gone ------------------ */
if (findByClass(wizard.root, "krea2-direction-position").length !== 0) {
  throw new Error("The position select row must not render on cast members.");
}
const positionPersisted = JSON.parse(stateWidget.value).characters.find((item) => item.id === "d1");
if (positionPersisted.position !== "standing on the left side of the frame") {
  throw new Error("Removing the position row must not clear the character's position field.");
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

/* --- v1.5 compact prompt-craft surface ---------------------------------- */
switchTab("scene");
const sceneEditors = findByClass(wizard.root, "krea2-scene-editor");
if (sceneEditors.length !== 1) {
  throw new Error("The Scene tab must render the scene editor card.");
}
if (!(sceneEditors[0].className || "").split(/\s+/).includes("is-compact")) {
  throw new Error("The scene editor must open as a one-line compact card by default.");
}
const sceneExpandBtn = findByClass(wizard.root, "krea2-scene-expand")[0];
if (!sceneExpandBtn || sceneExpandBtn["aria-expanded"] !== "false") {
  throw new Error("The compact scene card must expose an explicit expand control.");
}
sceneExpandBtn.listeners.click({});
if (JSON.parse(stateWidget.value).scene_collapsed !== false
    || findByClass(wizard.root, "krea2-scene-description").length !== 1) {
  throw new Error("Expanding the scene must reveal the full scene editor and persist the flag.");
}

switchTab("cast");
if (findByClass(wizard.root, "krea2-cast-random-all").length !== 1) {
  throw new Error("The cast header must keep a cast-level randomization control.");
}
if (findByClass(wizard.root, "krea2-subcard").length < 6) {
  throw new Error("Expanded cast members must render Identity, Appearance and Direction subcards.");
}

const collapsedState = JSON.parse(JSON.stringify(eachRunState));
collapsedState.characters[0].lora_name = "mecha-char v2.safetensors";
wizard.setState(collapsedState);
switchTab("cast");
const cardExpand = findByClass(wizard.root, "krea2-character-expand")[0];
cardExpand.listeners.click({});
const collapsedCards = findByClass(wizard.root, "krea2-character-card");
if ((collapsedCards[0].className || "").split(/\s+/).includes("is-expanded")
    || findByClass(wizard.root, "krea2-character-chips").length !== 1) {
  throw new Error("Collapsed cast members must stay identity-first and render direction chips.");
}
const chipsHost = findByClass(wizard.root, "krea2-character-chips")[0];
if (findByClass(chipsHost, "krea2-character-chip").length < 2
    || !textOf(chipsHost).includes("LoRA")) {
  throw new Error("Collapsed chips must summarize direction groups and the LoRA without hovering.");
}
cardExpand.listeners.click({});
if (findByClass(wizard.root, "krea2-character-chips").length !== 0) {
  throw new Error("Expanding a cast member must reveal its subcards instead of the chips.");
}

wizard.recordExecution("first prompt");
wizard.recordExecution("second prompt");
if (wizard.getExecutionHistory().join("|") !== "first prompt|second prompt"
    || wizard.root.dataset.krea2ExecutionCount !== "2"
    || JSON.parse(wizard.root.dataset.krea2ExecutionHistory).length !== 2
    || wizard.root.dataset.krea2LastOutput !== "second prompt") {
  throw new Error("Live execution evidence must retain recent prompt outputs.");
}
