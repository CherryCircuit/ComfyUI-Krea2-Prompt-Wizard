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

const VERSION = "v=2";
const { tokenRanges } = await import(`./studio/tokenizer.mjs?${VERSION}`);
const {
  presetStore,
  ATTACHABLE_CATEGORIES,
  categoryLabel,
} = await import(`./studio/preset_store.mjs?${VERSION}`);
const { createStudioEditor } = await import(`./studio/editor.mjs?${VERSION}`);
const { createPresetChooser } = await import(`./studio/chooser.mjs?${VERSION}`);
const { createTokenPopup } = await import(`./studio/token_popup.mjs?${VERSION}`);
const { createHostPicker } = await import(`./studio/host_picker.mjs?${VERSION}`);
const { openPresetManager } = await import(`./studio/manager.mjs?${VERSION}`);
const { showPreviewModal } = await import(`./studio/preview.mjs?${VERSION}`);
const { el } = await import(`./studio/ui.mjs?${VERSION}`);

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL(`./studio/studio.css?${VERSION}`, import.meta.url).href;
document.head.appendChild(stylesheet);

const TOOLBAR_CATEGORIES = [
  "character",
  "scene",
  "lighting",
  "camera",
  "style",
  "continuity",
  "emotion",
  "wardrobe",
];

function buildWidgetRoot(node) {
  const root = el("div", "kpw2-root");

  const toolbar = el("div", "kpw2-toolbar");
  const editorHost = el("div", "kpw2-editor-host");
  const footer = el("div", "kpw2-footer");
  const stats = el("span", "kpw2-footer-stats");
  const previewButton = el("button", "kpw2-toolbar-button kpw2-accent", "Preview Expanded");
  previewButton.type = "button";
  footer.append(stats, previewButton);

  root.append(toolbar, editorHost, footer);

  // The raw document widget is the serialization surface; it stays hidden —
  // the DOM editor is the only visible editing surface.
  const docWidget = node.widgets?.find((widget) => widget.name === "prompt_doc");
  if (docWidget) {
    docWidget.hidden = true;
    docWidget.type = "hidden";
    docWidget.computeSize = () => [0, -4];
  }

  // --- editor core ---------------------------------------------------------
  const editor = createStudioEditor({
    onChange: (doc, info) => {
      if (docWidget && docWidget.value !== doc) docWidget.value = doc;
      updateStats(info);
      scheduleCanvasRefresh();
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

  // --- chooser / popup / host picker / manager ------------------------------
  let pendingAttachment = null; // preset awaiting a host pick

  function characterTokens() {
    return tokenRanges(editor.doc).filter((token) => {
      if (token.host) return false;
      const preset = presetStore.get(token.id);
      return preset && preset.category === "character" && preset.enabled;
    });
  }

  function handleInsert(preset) {
    if (ATTACHABLE_CATEGORIES.includes(preset.category)) {
      const characters = characterTokens();
      if (characters.length === 1) {
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
    editor.insertToken(preset);
    editor.focus();
  }

  const chooser = createPresetChooser({
    store: presetStore,
    onInsert: handleInsert,
    onManage: () => openManager(null, null),
  });

  const hostPicker = createHostPicker({
    onPick: (hostRange) => {
      const preset = pendingAttachment;
      pendingAttachment = null;
      if (!preset) return;
      if (hostRange) {
        editor.attachToHost(hostRange, preset);
      } else {
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
    const label = category === "more" ? "+ More" : `+ ${categoryLabel(category)}`;
    const button = el("button", "kpw2-toolbar-button", label);
    button.type = "button";
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

  const manageButton = el("button", "kpw2-toolbar-button", "Presets");
  manageButton.type = "button";
  manageButton.title = "Open the Preset Manager";
  manageButton.addEventListener("click", () => openManager(null, null));

  const plainButton = el("button", "kpw2-toolbar-button", "Plain");
  plainButton.type = "button";
  plainButton.title = "Toggle between the token editor and the raw marker text";
  plainButton.addEventListener("click", () => {
    const next = editor.mode === "rich" ? "plain" : "rich";
    editor.setMode(next);
    plainButton.textContent = next === "rich" ? "Plain" : "Rich";
  });

  toolbar.append(manageButton, plainButton);

  previewButton.addEventListener("click", () => {
    showPreviewModal({ doc: editor.doc });
  });

  // --- footer stats --------------------------------------------------------
  function updateStats(info) {
    const missing = editor.compile().missingIds.length;
    stats.textContent = `${info.words} words · ${info.tokens} presets`;
    stats.classList.toggle("kpw2-missing-warning", missing > 0);
    if (missing > 0) {
      stats.textContent += ` · ${missing} missing`;
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
    setPlainMode(plainMode) {
      if (plainMode && editor.mode === "rich") {
        editor.setMode("plain");
        plainButton.textContent = "Rich";
      }
    },
  };
}

app.registerExtension({
  name: "Krea2PromptWizardV2",

  async setup() {
    // Warm the preset store so the first node render has tokens ready.
    await presetStore.ensureLoaded().catch(() => {});
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
        this.setSize([
          Math.max(this.size?.[0] || 0, 720),
          Math.max(this.size?.[1] || 0, 340),
        ]);

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
          node.widgets?.find((widget) => widget.name === "prompt_doc")?.value ?? "",
          { resetHistory: true }
        );
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
          if (this.properties?.kpw2_plain) {
            this.promptStudio.setPlainMode(true);
          }
        }
      } catch (error) {
        console.error("[Krea2PromptWizardV2] configure failed", error);
      }
      return result;
    };
  },
});
