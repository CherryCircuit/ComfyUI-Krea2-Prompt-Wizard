/**
 * Krea2 Prompt Wizard v2 ("Prompt Studio") — frontend entry point.
 *
 * Registers the node extension, builds the editor chrome (toolbar,
 * editor, footer) around the rich token editor, and handles workflow
 * serialization through the hidden `prompt_doc` STRING widget.
 *
 * Attachable categories (emotion, wardrobe) insert their presets as
 * sub-pills attached to a character token; prompts with several
 * characters ask which one via the host picker.
 *
 * Module imports carry a `?v=` cache-buster; bump it whenever any studio
 * frontend file changes (same discipline as the v1 wizard).
 */
import { app } from "../../scripts/app.js";

const VERSION = "v=26";
const { tokenRanges, hasFrames, compileFramedDocument, documentStats } =
  await import(`./studio/tokenizer.mjs?${VERSION}`);
const {
  presetStore,
  ATTACHABLE_CATEGORIES,
  categoryLabel,
  categoryIcon,
} = await import(`./studio/preset_store.mjs?${VERSION}`);
const { createStudioEditor } = await import(`./studio/editor.mjs?${VERSION}`);
const { createPresetChooser } = await import(`./studio/chooser.mjs?${VERSION}`);
const { createTokenPopup } = await import(`./studio/token_popup.mjs?${VERSION}`);
const { createHostPicker } = await import(`./studio/host_picker.mjs?${VERSION}`);
const { openPresetManager } = await import(`./studio/manager.mjs?${VERSION}`);
const { showPreviewModal } = await import(`./studio/preview.mjs?${VERSION}`);
const { createRandomizer } = await import(`./studio/randomizer.mjs?${VERSION}`);
const { openRecipePanel } = await import(`./studio/recipe_panel.mjs?${VERSION}`);
const { anchoredPanel, attachQuickTooltip, el } =
  await import(`./studio/ui.mjs?${VERSION}`);
const {
  RefinePanel,
  loadRefineSettings,
  openRefineSettings,
  refineButton,
  requestRefine,
} = await import(`./studio/refine.mjs?${VERSION}`);

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL(`./studio/studio.css?${VERSION}`, import.meta.url).href;
document.head.appendChild(stylesheet);

const TOOLBAR_CATEGORIES = [
  "character",
  "look",
  "wardrobe",
  "hair",
  "performance",
  "emotion",
  "state",
  "scene",
  "lighting",
  "camera",
  "style",
];

/** Symbols shown when the node is too narrow for the full labels. */
const FACET_CATEGORIES = [
  "hair_color",
  "hair_color_style",
  "garment_color",
  "garment_pattern",
];

const OUTPUT_NAMES = ["prompt", "negative", "raw_prompt", "last_prompt", "last_negative"];

const TOOLBAR_ICONS = {
  character: "👤",
  look: "🖼️",
  wardrobe: "👕",
  hair: "💇",
  performance: "🎭",
  emotion: "😊",
  state: "💧",
  scene: "🏞️",
  lighting: "💡",
  camera: "📷",
  style: "🎨",
  more: "⋯",
  randomize: "🎲",
  frames: "🎞️",
  presets: "📚",
  plain: "Aa",
  preview: "🔍",
  outputs: "👁️",
};

function setToolbarContent(button, icon, label) {
  button.replaceChildren(
    el("span", "kpw2-toolbar-icon", icon),
    el("span", "kpw2-toolbar-label", label)
  );
}

function setToolbarTip(button, tip) {
  button.title = tip;
  button.dataset.tip = tip;
  button.setAttribute("aria-label", tip);
}

function buildWidgetRoot(node) {
  const root = el("div", "kpw2-root");

  const toolbar = el("div", "kpw2-toolbar");
  const editorHost = el("div", "kpw2-editor-host");
  const refineHost = el("div", "kpw2-refine-host");
  const footer = el("div", "kpw2-footer");
  const stats = el("span", "kpw2-footer-stats");
  const runInfo = el("span", "kpw2-footer-run");
  const previewButton = el("button", "kpw2-toolbar-button kpw2-accent");
  previewButton.type = "button";
  setToolbarContent(previewButton, TOOLBAR_ICONS.preview, "Preview Expanded");
  setToolbarTip(previewButton, "Preview");
  attachQuickTooltip(previewButton, () => previewButton.dataset.tip);
  const outputsButton = el("button", "kpw2-toolbar-button");
  outputsButton.type = "button";
  setToolbarContent(outputsButton, TOOLBAR_ICONS.outputs, "Outputs");
  setToolbarTip(outputsButton, "Outputs");
  attachQuickTooltip(outputsButton, () => outputsButton.dataset.tip);
  footer.append(stats, runInfo, outputsButton, previewButton);

  root.append(toolbar, editorHost, refineHost, footer);

  // --- output dongles -------------------------------------------------------
  // ComfyUI reserves a row for every output at the top of the node. Users who
  // only need `prompt` can hide the rest; the setting is per node and saved
  // in workflow properties.
  function outputCount() {
    const stored = Number(node.properties?.kpw2_output_count);
    return Number.isFinite(stored) && stored >= 1 && stored <= OUTPUT_NAMES.length
      ? Math.floor(stored)
      : OUTPUT_NAMES.length;
  }

  function ensureOutputs() {
    while ((node.outputs || []).length < OUTPUT_NAMES.length) {
      const index = node.outputs.length;
      const name = OUTPUT_NAMES[index];
      if (typeof node.addOutput === "function") {
        node.addOutput(name, "STRING");
      } else {
        node.outputs.push({ name, type: "STRING", links: [] });
      }
    }
  }

  function applyOutputCount() {
    const requested = outputCount();
    ensureOutputs();
    // Only trailing outputs may be removed: removing a middle slot would
    // shift every later slot index and break existing links. Connected
    // outputs are always kept.
    let count = Math.max(1, Math.min(OUTPUT_NAMES.length, requested));
    for (let index = count; index < node.outputs.length; index += 1) {
      if (node.outputs[index]?.links?.length) count = index + 1;
    }
    if (node.outputs.length > count) node.outputs.splice(count);
    node.properties.kpw2_output_count = count;
    node.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
    scheduleFit();
  }

  function setOutputCount(count) {
    node.properties.kpw2_output_count = count;
    applyOutputCount();
  }

  // --- compact toolbar ------------------------------------------------------
  // The threshold is the node's own width, not the browser's. Below it the
  // toolbar keeps only the symbols; every symbol still carries a fast
  // hover label with the full action name.
  let compactObserver = null;
  function updateCompact() {
    const width = root.clientWidth;
    root.classList.toggle("kpw2-compact", width > 0 && width < 600);
  }
  if (typeof ResizeObserver !== "undefined") {
    compactObserver = new ResizeObserver(updateCompact);
    compactObserver.observe(root);
  }
  window.addEventListener("resize", updateCompact);
  setTimeout(updateCompact, 0);

  // The raw document widgets are the serialization surfaces; they stay
  // hidden - the DOM editor is the only visible editing surface, and the
  // refine panel is the only view of the LLM drafts.
  const docWidget = node.widgets?.find((widget) => widget.name === "prompt_doc");
  if (docWidget) {
    docWidget.hidden = true;
    docWidget.type = "hidden";
    docWidget.computeSize = () => [0, -4];
  }
  const refinedWidget = node.widgets?.find((widget) => widget.name === "refined_doc");
  if (refinedWidget) {
    refinedWidget.hidden = true;
    refinedWidget.type = "hidden";
    refinedWidget.computeSize = () => [0, -4];
  }
  const randomizerWidget = node.widgets?.find(
    (widget) => widget.name === "randomizer_doc"
  );
  if (randomizerWidget) {
    randomizerWidget.hidden = true;
    randomizerWidget.type = "hidden";
    randomizerWidget.computeSize = () => [0, -4];
  }

  // --- refiner state --------------------------------------------------------
  // Drafts live in the hidden `refined_doc` widget (workflow-serialized
  // JSON), never in the token document: the rewrite is a draft that can be
  // edited, toggled and reverted while the user's own text stays intact.
  let refinedState = {};
  function readRefinedState() {
    try {
      const parsed = JSON.parse(refinedWidget?.value || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  function persistRefined() {
    if (refinedWidget) refinedWidget.value = JSON.stringify(refinedState);
  }
  refinedState = readRefinedState();

  // --- randomizer pools -----------------------------------------------------
  // The pool JSON is workflow data: it lives in a hidden widget so the same
  // checked boxes come back when the workflow is reopened. Older nodes
  // without that widget keep their pools in node.properties.
  function readPools() {
    try {
      const parsed = JSON.parse(randomizerWidget?.value || "{}");
      if (parsed && typeof parsed === "object" && parsed.pools) {
        return parsed.pools;
      }
    } catch {
      // fall through to the properties copy
    }
    const fallback = node.properties?.kpw2_pools;
    return fallback && typeof fallback === "object" ? fallback : {};
  }
  function persistPools(pools) {
    const payload = JSON.stringify({ schema_version: 1, pools });
    if (randomizerWidget) randomizerWidget.value = payload;
    else node.properties.kpw2_pools = pools;
    scheduleCanvasRefresh();
  }

  // A workflow touched before the backend had the widget keeps its pools in
  // properties. Move them into the serialized widget on first load so the
  // server-side randomizer sees the same filter.
  if (randomizerWidget && !randomizerWidget.value && node.properties?.kpw2_pools) {
    randomizerWidget.value = JSON.stringify({
      schema_version: 1,
      pools: node.properties.kpw2_pools,
    });
  }

  let randomizer = null;

  const refinePanel = new RefinePanel({
    getState: () => refinedState,
    onCommit: () => {
      persistRefined();
      scheduleCanvasRefresh();
      scheduleFit();
    },
  });
  refineHost.append(refinePanel.root);

  // --- node fit -------------------------------------------------------------
  // DOM widgets do not resize the node themselves. Measured in graph units
  // (unscaled client pixels), so the node grows and shrinks with the refine
  // panel instead of leaving a blank tail or spilling past the frame.
  let fitTimer = null;
  function scheduleFit() {
    if (fitTimer) return;
    fitTimer = setTimeout(() => {
      fitTimer = null;
      fitNodeToContent();
    }, 80);
  }
  function fitNodeToContent() {
    const domWidget = node.promptStudio?.domWidget;
    if (!domWidget || node.flags?.collapsed) return;
    const scale = app?.canvas?.ds?.scale || 1;
    // The root stretches to the DOM widget's height, so scrollHeight is the
    // node's height, not the content's. Measure to the last child instead —
    // that is what actually shrinks when a refine draft is reverted.
    const rootRect = root.getBoundingClientRect();
    const last = root.lastElementChild;
    const content = last
      ? (last.getBoundingClientRect().bottom - rootRect.top) / scale + 8
      : root.scrollHeight;
    const current = root.clientHeight;
    if (!content || !current) return;
    const delta = content - current;
    if (Math.abs(delta) < 6) return;
    const maxHeight = (window.innerHeight - 120) / scale;
    const next = Math.min(maxHeight, Math.max(260, node.size[1] + delta));
    if (Math.abs(next - node.size[1]) < 2) return;
    node.setSize([node.size[0], next]);
  }

  function refreshStale() {
    let changed = false;
    const compiled = compileFramedDocument(editor.doc, (id) => presetStore.lookup(id));
    for (const [section, expanded] of [
      ["prompt", compiled.prompt],
      ["last_prompt", compiled.lastPrompt],
    ]) {
      const draft = refinedState[section];
      if (!draft) continue;
      const stale = draft.source !== (expanded ?? "");
      if (!!draft.stale !== stale) {
        draft.stale = stale;
        changed = true;
      }
    }
    if (changed) {
      refinePanel.render();
      scheduleFit();
    }
  }

  // --- editor core ---------------------------------------------------------
  const editor = createStudioEditor({
    onChange: (doc, info) => {
      if (docWidget && docWidget.value !== doc) docWidget.value = doc;
      updateStats(info);
      framesButton.classList.toggle("kpw2-active-toggle", hasFrames(doc));
      setToolbarTip(framesButton, hasFrames(doc) ? "Frames on" : "Frames");
      refreshStale();
      randomizer?.refresh();
      scheduleCanvasRefresh();
      scheduleFit();
    },
    onTokenPopup: (range, rect, span, options) => tokenPopup.open(range, rect, span, options),
    onOpenChooser: ({ anchorRect }) => {
      const rect = anchorRect ?? caretRect() ?? editorHost.getBoundingClientRect();
      chooser.open({ category: null, anchorRect: rect });
    },
    onModeChange: (mode) => {
      node.properties.kpw2_plain = mode === "plain";
    },
  });
  editorHost.append(editor.root);

  randomizer = createRandomizer({
    editor,
    getPools: readPools,
    setPools: persistPools,
    onOpenRecipes: () =>
      openRecipePanel({
        randomizer,
        onApplied: () => {
          editor.refreshTokens();
          updateStats(documentStats(editor.doc));
          scheduleCanvasRefresh();
          scheduleFit();
        },
      }),
  });

  // --- chooser / popup / host picker / manager ------------------------------
  let pendingAttachment = null; // preset awaiting a host pick

  function characterTokens() {
    return tokenRanges(editor.doc).filter((token) => {
      if (token.host) return false;
      const preset = presetStore.get(token.id);
      return preset && preset.category === "character" && preset.enabled;
    });
  }

  /**
   * Choosing the preset that is already in a slot removes it. This makes
   * the chooser a real toggle for the visible pills without changing the
   * token popup's explicit Remove action.
   */
  function removeIfPresent(preset, hostId = "") {
    const existing = tokenRanges(editor.doc).find((token) => {
      if (token.id !== preset.id) return false;
      return hostId ? token.host === hostId : !token.host;
    });
    if (!existing) return false;
    editor.deleteToken(existing);
    return true;
  }

  function handleInsert(preset) {
    if (ATTACHABLE_CATEGORIES.includes(preset.category)) {
      const characters = characterTokens();
      if (characters.length === 1) {
        if (removeIfPresent(preset, characters[0].id)) {
          editor.focus();
          return;
        }
        editor.attachToHost(
          { start: characters[0].start, end: characters[0].end, id: characters[0].id },
          preset
        );
        return;
      }
      if (characters.length > 1) {
        pendingAttachment = preset;
        hostPicker.open({
          anchorRect: editorHost.getBoundingClientRect(),
          hostCandidates: characters,
        });
        return;
      }
      // No character in the prompt: fall back to a standalone token.
    }
    if (removeIfPresent(preset)) {
      editor.focus();
      return;
    }
    editor.insertToken(preset);
    editor.focus();
  }

  const chooser = createPresetChooser({
    store: presetStore,
    onInsert: handleInsert,
    onManage: () => openManager(null, null),
    hiddenCategories: FACET_CATEGORIES,
  });

  const hostPicker = createHostPicker({
    onPick: (hostRange) => {
      const preset = pendingAttachment;
      pendingAttachment = null;
      if (!preset) return;
      if (hostRange) {
        if (removeIfPresent(preset, hostRange.id)) return;
        editor.attachToHost(hostRange, preset);
      } else {
        if (removeIfPresent(preset)) return;
        editor.insertToken(preset);
        editor.focus();
      }
    },
  });

  const tokenPopup = createTokenPopup({
    store: presetStore,
    onReplace: (range, preset) => {
      // Swapping a character must re-point its attachments at the new id.
      const current = presetStore.get(range.id);
      if (current?.category === "character") editor.replaceHost(range, preset);
      else editor.replaceToken(range, preset);
    },
    onDelete: (range) => editor.deleteToken(range),
    onEditPreset: (preset) => openManager(null, preset.id),
    onNewPreset: (category) => openManager(category, null),
    onToggleRandomize: (range) => editor.toggleRandomize(range),
    onAddFacet: (range, facet, rect) => {
      chooser.open({
        category: facet.category,
        anchorRect: rect,
        onInsert: (preset) => {
          if (removeIfPresent(preset, range.id)) {
            editor.focus();
            return;
          }
          editor.attachToHost(range, preset);
          editor.focus();
        },
      });
    },
  });

  function openManager(category, selectId) {
    openPresetManager({
      initialCategory: category,
      selectId,
      onChanged: () => editor.refreshTokens(),
    });
  }

  // --- toolbar buttons -----------------------------------------------------
  function categoryButton(category) {
    const name = category === "more" ? "More" : categoryLabel(category);
    const button = el("button", "kpw2-toolbar-button");
    button.type = "button";
    button.classList.add(`kpw2-cat-${category}`);
    setToolbarContent(button, categoryIcon(category), `+ ${name}`);
    setToolbarTip(button, name);
    attachQuickTooltip(button, () => button.dataset.tip);
    button.addEventListener("click", () => {
      const rect = button.getBoundingClientRect();
      chooser.open({
        category: category === "more" ? null : category,
        anchorRect: rect,
      });
    });
    return button;
  }

  for (const category of TOOLBAR_CATEGORIES) toolbar.append(categoryButton(category));
  toolbar.append(categoryButton("more"));

  const toolbarSpacer = el("span", "kpw2-toolbar-spacer");
  toolbar.append(toolbarSpacer);

  const framesButton = el("button", "kpw2-toolbar-button");
  framesButton.type = "button";
  setToolbarContent(framesButton, TOOLBAR_ICONS.frames, "Frames");
  setToolbarTip(framesButton, "Frames");
  attachQuickTooltip(framesButton, () => framesButton.dataset.tip);
  framesButton.addEventListener("click", () => {
    editor.toggleFrames();
  });

  const manageButton = el("button", "kpw2-toolbar-button");
  manageButton.type = "button";
  setToolbarContent(manageButton, TOOLBAR_ICONS.presets, "Presets");
  setToolbarTip(manageButton, "Presets");
  attachQuickTooltip(manageButton, () => manageButton.dataset.tip);
  manageButton.addEventListener("click", () => openManager(null, null));

  const plainButton = el("button", "kpw2-toolbar-button");
  plainButton.type = "button";
  setToolbarContent(plainButton, TOOLBAR_ICONS.plain, "Plain");
  setToolbarTip(plainButton, "Plain");
  attachQuickTooltip(plainButton, () => plainButton.dataset.tip);
  plainButton.addEventListener("click", () => {
    const next = editor.mode === "rich" ? "plain" : "rich";
    editor.setMode(next);
    setPlainLabel(next);
  });

  function setPlainLabel(mode) {
    const plainMode = mode === "plain";
    setToolbarContent(plainButton, TOOLBAR_ICONS.plain, plainMode ? "Rich" : "Plain");
    setToolbarTip(plainButton, plainMode ? "Rich" : "Plain");
  }

  // --- the refiner ----------------------------------------------------------
  async function runRefine({ onStage } = {}) {
    const doc = editor.doc;
    const compiled = compileFramedDocument(doc, (id) => presetStore.lookup(id));
    const targets = [{ section: "prompt", text: compiled.prompt }];
    if (compiled.hasFrames) targets.push({ section: "last_prompt", text: compiled.lastPrompt });
    const wanted = targets.filter((target) => (target.text || "").trim());
    if (!wanted.length) {
      refinePanel.fail("Nothing to refine — the expanded prompt is empty.");
      return;
    }
    for (const target of wanted) {
      onStage?.(
        wanted.length > 1
          ? `Refining ${target.section === "last_prompt" ? "last frame" : "prompt"}…`
          : "Refining…"
      );
      try {
        const result = await requestRefine({ doc, section: target.section });
        refinePanel.apply(result);
      } catch (error) {
        refinePanel.fail(String(error?.message || error));
        return;
      }
    }
    refreshStale();
  }

  const refineControl = refineButton({
    run: runRefine,
    onOpenSettings: (rect) => openRefineSettings({ anchorRect: rect, onChange: refreshStale }),
  });

  const randomizeButton = el("button", "kpw2-toolbar-button kpw2-rz-open");
  randomizeButton.type = "button";
  setToolbarContent(randomizeButton, TOOLBAR_ICONS.randomize, "Randomize");
  setToolbarTip(randomizeButton, "Randomize");
  attachQuickTooltip(randomizeButton, () => randomizeButton.dataset.tip);
  randomizeButton.addEventListener("click", () => randomizer.open());

  toolbar.append(randomizeButton, refineControl, framesButton, manageButton, plainButton);

  previewButton.addEventListener("click", () => {
    showPreviewModal({ doc: editor.doc });
  });

  // --- footer stats --------------------------------------------------------
  function updateStats(info) {
    const missing = editor.compile().missingIds.length;
    stats.textContent = `${info.words} words · ${info.tokens} presets`;
    if (hasFrames(editor.doc)) stats.textContent += " · first/last frames";
    stats.classList.toggle("kpw2-missing-warning", missing > 0);
    if (missing > 0) {
      stats.textContent += ` · ${missing} missing`;
    }
  }

  function openOutputsPanel(anchorRect) {
    const body = el("div", "kpw2-token-popup");
    body.append(el("div", "kpw2-panel-title", "Visible outputs"));
    const list = el("div", "kpw2-popup-list");
    const current = outputCount();
    const choices = [
      [1, "Prompt only", "The output most workflows use."],
      [2, "Prompt + Negative", "Keep the negative prompt too."],
      [3, "First three", "Prompt, negative and raw view."],
      [OUTPUT_NAMES.length, "All outputs", "Include first/last-frame prompts."],
    ];
    for (const [count, label, hint] of choices) {
      const row = el("button", "kpw2-popup-row" + (current === count ? " kpw2-active" : ""));
      row.type = "button";
      row.append(
        el("span", "kpw2-popup-check", current === count ? "✓" : ""),
        el("span", "kpw2-popup-name", label)
      );
      row.title = hint;
      row.addEventListener("click", () => {
        setOutputCount(count);
        panel?.destroy();
      });
      list.append(row);
    }
    body.append(list);
    const panel = anchoredPanel("outputs", anchorRect, () => body, { width: 280 });
  }

  outputsButton.addEventListener("click", () =>
    openOutputsPanel(outputsButton.getBoundingClientRect())
  );

  function recordExecution(message) {
    let picks = [];
    try {
      const payload = message?.krea2_studio_picks;
      const raw = Array.isArray(payload) ? payload[0] : payload;
      picks = typeof raw === "string" ? JSON.parse(raw) : [];
    } catch {
      picks = [];
    }
    const docPayload = message?.krea2_studio_doc;
    const runtimeDoc = Array.isArray(docPayload) ? docPayload[0] : docPayload;
    if (typeof runtimeDoc === "string" && runtimeDoc.trim() && runtimeDoc !== editor.doc) {
      // Keep the dice flags: the next run still rerolls, but the node now
      // shows the presets that this run actually used.
      editor.setDoc(runtimeDoc, { recordHistory: true });
    }
    if (picks.length) {
      runInfo.textContent = `Last run: ${picks.length} randomized`;
      runInfo.title = picks
        .map((pick) => `${pick.token_id} → ${pick.chosen_name || pick.chosen_id}`)
        .join("\n");
    } else {
      runInfo.textContent = "";
      runInfo.title = "";
    }
  }

  let refreshTimer = null;
  function scheduleCanvasRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      app.canvas?.setDirty?.(true, true);
    }, 60);
  }

  function caretRect() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange();
      const rects = range.getClientRects();
      if (rects.length) return rects[0];
      const span = document.createElement("span");
      span.textContent = "\u200b";
      range.insertNode(span);
      const rect = span.getBoundingClientRect();
      span.remove();
      return rect;
    }
    return null;
  }

  return {
    root,
    editor,
    updateStats,
    refreshStale,
    recordExecution,
    applyOutputCount,
    fit: scheduleFit,
    destroy() {
      compactObserver?.disconnect();
      window.removeEventListener("resize", updateCompact);
      if (fitTimer) clearTimeout(fitTimer);
    },
    refreshRandomizer() {
      randomizer.refresh();
    },
    reloadRefined() {
      refinedState = readRefinedState();
      refinePanel.render();
      refreshStale();
    },
    setPlainMode(plainMode) {
      if (plainMode && editor.mode === "rich") {
        editor.setMode("plain");
        setPlainLabel("plain");
      }
    },
  };
}

app.registerExtension({
  name: "Krea2PromptWizardV2",

  async setup() {
    // Warm the preset store so the first node render has tokens ready, and
    // the refiner settings so the button's tooltip can name the model.
    await presetStore.ensureLoaded().catch(() => {});
    loadRefineSettings().catch(() => {});
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "Krea2PromptWizardV2") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      try {
        const studio = buildWidgetRoot(this);
        this.promptStudio = studio;

        presetStore.ensureLoaded().then(() => {
          studio.editor.refreshTokens();
          studio.refreshStale();
          studio.refreshRandomizer();
        });
        presetStore.subscribe(() => studio.editor.refreshTokens());

        const domWidget = this.addDOMWidget(
          "prompt_studio",
          "prompt_studio",
          studio.root,
          {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => 150,
          }
        );
        studio.domWidget = domWidget;
        this.resizable = true;
        studio.applyOutputCount();
        // A new node opens comfortably wide; a workflow that already has a
        // narrow size keeps it, so the compact toolbar can actually appear.
        const currentWidth = this.size?.[0] || 0;
        const width = currentWidth >= 360 ? currentWidth : 720;
        this.setSize([width, Math.max(this.size?.[1] || 0, 320)]);

        if (this.properties?.kpw2_plain) {
          studio.setPlainMode(true);
        }

        // Scroll-inside-the-widget should not zoom the canvas (same
        // forwarding pattern the v1 wizard uses).
        studio.root.addEventListener(
          "wheel",
          (event) => {
            const scrollable = event.target.closest(".kpw2-editor, .kpw2-editor-plain, .kpw2-chooser-list, .kpw2-popup-list, .kpw2-modal-body, .kpw2-manager-list, .kpw2-manager-formscroll");
            const atBoundary =
              !scrollable ||
              (scrollable.scrollTop === 0 && event.deltaY < 0) ||
              (scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight && event.deltaY > 0);
            if (atBoundary) {
              const canvasEl = app?.canvas?.canvas;
              if (canvasEl) {
                canvasEl.dispatchEvent(
                  new WheelEvent("wheel", {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    deltaX: event.deltaX,
                    deltaY: event.deltaY,
                    deltaZ: event.deltaZ,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    metaKey: event.metaKey,
                    bubbles: true,
                    cancelable: true,
                  })
                );
                event.preventDefault();
              }
            }
          },
          { passive: false }
        );

        studio.editor.setDoc(
          this.widgets?.find((widget) => widget.name === "prompt_doc")?.value ?? "",
          { resetHistory: true }
        );
        setTimeout(() => studio.fit(), 120);
        setTimeout(() => studio.fit(), 420);
      } catch (error) {
        console.error("[Krea2PromptWizardV2] widget creation failed", error);
      }
      return result;
    };

    const configure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
      const result = configure?.apply(this, arguments);
      try {
        if (this.promptStudio) {
          const docWidget = (this.widgets || []).find((w) => w.name === "prompt_doc");
          this.promptStudio.editor.setDoc(docWidget?.value ?? "", { resetHistory: true });
          this.promptStudio.reloadRefined();
          this.promptStudio.refreshRandomizer();
          this.promptStudio.applyOutputCount();
          this.promptStudio.fit();
          setTimeout(() => this.promptStudio?.fit?.(), 180);
          if (this.properties?.kpw2_plain) {
            this.promptStudio.setPlainMode(true);
          }
        }
      } catch (error) {
        console.error("[Krea2PromptWizardV2] configure failed", error);
      }
      return result;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const result = onExecuted?.apply(this, arguments);
      try {
        this.promptStudio?.recordExecution?.(message);
      } catch (error) {
        console.warn("[Krea2PromptWizardV2] last-run update failed", error);
      }
      return result;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      try {
        this.promptStudio?.destroy?.();
      } catch (error) {
        console.warn("[Krea2PromptWizardV2] cleanup failed", error);
      }
      return onRemoved?.apply(this, arguments);
    };
  },
});
