/* Krea2 Prompt Wizard widget
 *
 * The main frontend component. It renders the visual builder inside
 * the wizard node's DOM widget and exposes a controlled-state API.
 *
 * The widget is resilient: if the wizard extension fails to load, the
 * node still works through the wizard_state_json STRING input.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const {
    el,
    escapeHtml,
    debounce,
    CATEGORIES,
    CATEGORY_LABELS,
    PROFILES,
    MODES,
    emptyState,
    coerceState,
    uniqueRowId,
    defaultWeightForRow,
    phraseForRow,
    formatPhrase,
    formatWeight,
    compilePreview,
    fetchLibrary,
    fetchMasterPresets,
    showToast,
  } = K.helpers;
  const { renderRow } = K.presetRow;
  const { show: showSearchableSelector } = K.searchableSelector;
  const { open: openLibraryEditor } = K.libraryEditor;
  const { materialize: materializeToNodes, createSubgraph: createSubgraphFromWizard } = K.materialize;
  const { render: renderShowWork } = K.inspectorView;

  function createWizardWidget(node) {
    const valueWidget = (node.widgets || []).find(function (w) { return w.name === "wizard_state_json"; });
    if (!valueWidget) {
      console.warn("[Krea2PromptWizard] No wizard_state_json widget found");
      return null;
    }
    valueWidget.hidden = true;
    valueWidget.type = "hidden";
    valueWidget.computeSize = function () { return [0, -4]; };
    const stateString = valueWidget.value || "";
    let state = coerceState(parseState(stateString));
    if (!state.rows || state.rows.length === 0) {
      state.rows = [
        {
          id: uniqueRowId(state),
          category: "emotion",
          preset_id: "emotion.shock",
          label: "Shock",
          phrase: "shocked expression",
          control_mode: "scalar",
          intensity: 75,
          enabled: true,
          aliases: ["shocked"],
          verification: "general visual vocabulary",
        },
      ];
    }

    const library = [];
    let masterPresets = [];
    let dirty = false;
    let undoStack = [];
    let redoStack = [];

    fetchLibrary().then(function (presets) {
      library.splice(0, library.length, ...presets);
      render();
    }).catch(function () { render(); });
    fetchMasterPresets().then(function (presets) { masterPresets = presets; render(); });

    const root = el("div", { class: "krea2-wizard-root" });

    /* --- Top section: base prompt, mode, library button --- */
    const basePrompt = buildBasePrompt(state);
    const modeSwitch = buildModeSwitch(state);
    const livePreview = buildLivePreview();
    const showWorkToggle = buildShowWorkToggle(state);
    const libraryBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: openLibrary }, "Library");
    const materializeBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: materialize }, "Materialize");
    const subgraphBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: createSubgraph }, "Create Subgraph");
    const resetBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: resetAll }, "Reset All");

    const topBar = el("div", { class: "krea2-wizard-top" }, [
      modeSwitch,
      libraryBtn,
      materializeBtn,
      subgraphBtn,
      showWorkToggle,
      resetBtn,
    ]);

    /* --- Searchable add concept --- */
    const addConcept = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-wizard-add",
      onClick: function () {
        showSearchableSelector({
          anchor: addConcept,
          presets: library,
          onPick: function (preset) {
            const row = presetToRow(preset, state);
            state.rows.push(row);
            markDirty();
            render();
          },
        });
      },
    }, "+ Add Concept");

    /* --- Master presets --- */
    const masterSelect = buildMasterPresets();
    const quickStart = buildQuickStartPanel();

    /* --- Layout: collapsible categories --- */
    const categoryBody = el("div", { class: "krea2-wizard-categories" });
    const showWork = el("div", { class: "krea2-wizard-show-work-host" });

    root.appendChild(topBar);
    root.appendChild(basePrompt);
    root.appendChild(quickStart);
    root.appendChild(masterSelect);
    root.appendChild(addConcept);
    root.appendChild(categoryBody);
    root.appendChild(livePreview.root);
    root.appendChild(showWork);
    root.appendChild(el("div", { class: "krea2-wizard-footer" }, [
      el("small", null, "Every change is embedded in the workflow. Use the backend even if the widget fails to load."),
    ]));

    function parseState(text) {
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    function persist() {
      try {
        valueWidget.value = JSON.stringify(state);
        if (node.setDirtyCanvas) node.setDirtyCanvas(true);
      } catch (e) {
        console.warn("[Krea2PromptWizard] failed to persist state", e);
      }
    }

    function markDirty() {
      undoStack.push(JSON.stringify(state));
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      dirty = true;
      persist();
      renderLivePreview();
    }

    function persistUndo() {
      undoStack.push(JSON.stringify(state));
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
    }

    function undo() {
      if (undoStack.length === 0) return;
      redoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(undoStack.pop()));
      dirty = true;
      persist();
      render();
    }

    function redo() {
      if (redoStack.length === 0) return;
      undoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(redoStack.pop()));
      dirty = true;
      persist();
      render();
    }

    function presetToRow(preset, state) {
      return {
        id: uniqueRowId(state),
        category: preset.category || "custom",
        preset_id: preset.id || "",
        label: preset.label || "",
        phrase: preset.phrase || "",
        control_mode: preset.control_mode || "scalar",
        intensity: parseInt(preset.default_strength, 10) || 0,
        enabled: true,
        aliases: preset.aliases || [],
        verification: preset.verification || "general visual vocabulary",
        source: preset.source || "library",
        positive_phrase: preset.positive_phrase,
        negative_phrase: preset.negative_phrase,
        neutral_phrase: preset.neutral_phrase,
      };
    }

    function buildBasePrompt(state) {
      const ta = el("textarea", {
        class: "krea2-wizard-base",
        rows: "2",
        placeholder: "Describe the scene, subject, mood, lighting, camera, or style.",
        onInput: function (e) {
          state.base_prompt = e.target.value;
          markDirty();
        },
      }, state.base_prompt || "");
      return ta;
    }

    function buildModeSwitch(state) {
      const sel = el("select", {
        class: "krea2-wizard-mode",
        onChange: function (e) {
          state.interface_mode = e.target.value;
          render();
        },
      }, [
        el("option", { value: "simple" }, "Simple"),
        el("option", { value: "advanced" }, "Advanced"),
      ]);
      sel.value = state.interface_mode || "simple";
      return sel;
    }

    function buildShowWorkToggle(state) {
      const btn = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: function () {
          state.show_work = !state.show_work;
          render();
        },
      }, state.show_work ? "Hide Work" : "Show Work");
      return btn;
    }

    function buildMasterPresets() {
      const sel = el("select", {
        class: "krea2-wizard-master",
        onChange: function (e) {
          const id = e.target.value;
          if (!id) return;
          const master = masterPresets.find(function (m) { return m.id === id; });
          if (!master) return;
          for (const row of master.rows || []) {
            const preset = library.find(function (p) { return p.id === row.preset_id; });
            if (preset) {
              state.rows.push(presetToRow(preset, state));
              if (typeof row.intensity === "number") {
                state.rows[state.rows.length - 1].intensity = row.intensity;
              }
            }
          }
          state.master_preset_id = id;
          markDirty();
          render();
          e.target.value = "";
        },
      });
      sel.appendChild(el("option", { value: "" }, "Apply master preset..."));
      for (const m of masterPresets) {
        sel.appendChild(el("option", { value: m.id, title: m.description || "" }, m.label));
      }
      return sel;
    }

    function buildQuickStartPanel() {
      function addPresetChip(label, presetId, category) {
        return el("button", {
          type: "button",
          class: "krea2-wizard-chip",
          onClick: function () {
            const preset = library.find(function (p) { return p.id === presetId; });
            if (!preset) return;
            const row = presetToRow(preset, state);
            row.category = category;
            state.rows.push(row);
            state.selected_category = category;
            markDirty();
            render();
          },
        }, label);
      }

      return el("div", { class: "krea2-wizard-quickstart" }, [
        el("div", { class: "krea2-wizard-quickstart-title" }, "Quick start"),
        el("div", { class: "krea2-wizard-quickstart-text" },
          "Pick a starter concept, then use + Add or the Library to add more."),
        el("div", { class: "krea2-wizard-quickstart-buttons" }, [
          addPresetChip("Shock", "emotion.shock", "emotion"),
          addPresetChip("Sadness", "emotion.sadness", "emotion"),
          addPresetChip("Rim lighting", "lighting_direction.rim_lighting", "lighting_direction"),
          addPresetChip("24mm wide", "lens.24mm_wide", "lens"),
          addPresetChip("Dutch angle", "angle.dutch_angle", "angle"),
          addPresetChip("Cinematic still", "style.cinematic_film_still", "style"),
        ]),
      ]);
    }

    function buildLivePreview() {
      const text = el("pre", { class: "krea2-wizard-preview" }, "");
      const plain = el("pre", { class: "krea2-wizard-plain", hidden: true }, "");
      const buttons = el("div", { class: "krea2-wizard-preview-buttons" }, [
        el("button", { type: "button", onClick: function () { copy(text.textContent); } }, "Copy Final"),
        el("button", { type: "button", onClick: function () { copy(plain.textContent); } }, "Copy Plain"),
      ]);
      const header = el("h3", null, "Live Preview");
      const root = el("div", { class: "krea2-wizard-preview-host" }, [header, buttons, text, plain]);
      return { root: root, text: text, plain: plain };
    }

    function renderLivePreview() {
      const compiled = compilePreview(state);
      livePreview.text.textContent = compiled.final_prompt;
      livePreview.plain.textContent = compiled.plain_prompt;
      showWork.innerHTML = "";
      if (state.show_work) {
        showWork.appendChild(renderShowWork(state, compiled));
      }
    }

    function render() {
      categoryBody.innerHTML = "";
      for (const cat of CATEGORIES) {
        const rows = state.rows.filter(function (r) { return r.category === cat; });
        const section = el("section", { class: "krea2-wizard-category" });
        const header = el("div", { class: "krea2-wizard-category-header" }, [
          el("strong", { class: "krea2-wizard-category-title" }, CATEGORY_LABELS[cat] || cat),
          el("span", { class: "krea2-wizard-category-count" }, rows.length + " row(s)"),
        ]);
        const addBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-add",
          onClick: function () {
            showSearchableSelector({
              anchor: addBtn,
              presets: library,
              categories: [cat],
              onPick: function (preset) {
                const row = presetToRow(preset, state);
                row.category = cat;
                state.rows.push(row);
                markDirty();
                render();
              },
            });
          },
        }, "+ Add");
        const collapsed = cat in (state.collapsed || {});
        const content = el("div", { class: "krea2-wizard-category-content" });
        if (rows.length === 0) {
          content.appendChild(el("div", { class: "krea2-wizard-empty" }, "No rows. Click + Add to add a concept."));
        } else {
          for (const row of rows) {
            content.appendChild(renderRow(row, {
              presets: library,
              markDirty: markDirty,
              refresh: render,
              removeRow: function (id) {
                state.rows = state.rows.filter(function (r) { return r.id !== id; });
                markDirty();
                render();
              },
              duplicateRow: function (id) {
                const idx = state.rows.findIndex(function (r) { return r.id === id; });
                if (idx < 0) return;
                const copy = JSON.parse(JSON.stringify(state.rows[idx]));
                copy.id = uniqueRowId(state);
                state.rows.splice(idx + 1, 0, copy);
                markDirty();
                render();
              },
              onReorder: function (parent) {
                const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (el) { return el.dataset.rowId; });
                state.rows = ids.map(function (id) { return state.rows.find(function (r) { return r.id === id; }); }).filter(Boolean);
                markDirty();
              },
            }));
          }
        }
        header.addEventListener("click", function () {
          state.collapsed = state.collapsed || {};
          state.collapsed[cat] = !state.collapsed[cat];
          content.style.display = state.collapsed[cat] ? "none" : "block";
          addBtn.style.display = state.collapsed[cat] ? "none" : "";
        });
        if (collapsed) {
          content.style.display = "none";
          addBtn.style.display = "none";
        }
        section.appendChild(header);
        section.appendChild(addBtn);
        section.appendChild(content);
        categoryBody.appendChild(section);
      }
      renderLivePreview();
    }

    function copy(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text || "").then(function () { showToast("Copied", "info"); }, function () {});
      }
    }

    function openLibrary() {
      openLibraryEditor({
        library: library,
        markDirty: function () { markDirty(); render(); },
        close: function () { render(); },
        saveUser: function () { saveUserLibrary(); },
      });
    }

    function saveUserLibrary() {
      try {
        const userOnly = library.filter(function (p) { return p.origin === "user"; });
        const payload = JSON.stringify({ schema_version: 1, presets: userOnly }, null, 2);
        const api = window.app && window.app.api;
        if (api && api.storeUserData) {
          api.storeUserData("Krea2PromptWizard/user_library.json", payload, { stringify: false, overwrite: true })
            .then(function () { showToast("User library saved", "info"); })
            .catch(function (e) { showToast("Save failed: " + e.message, "error"); });
        } else {
          (window.app && window.app.api && window.app.api.storeUserData || function () {})(payload);
        }
      } catch (e) {
        showToast("Save failed: " + e.message, "error");
      }
    }

    function materialize() {
      const result = materializeToNodes(state, {});
      if (result) showToast("Materialized " + (result.nodes ? result.nodes.length : 0) + " nodes.", "info");
    }

    function createSubgraph() {
      const result = createSubgraphFromWizard(state, {});
      if (result) showToast("Subgraph created.", "info");
    }

    function resetAll() {
      if (!window.confirm("Reset all wizard state?")) return;
      state = emptyState();
      state.collapsed = {};
      markDirty();
      render();
    }

    render();
    return { root: root, state: state, markDirty: markDirty, render: render };
  }

  K.createWizardWidget = createWizardWidget;
})();
