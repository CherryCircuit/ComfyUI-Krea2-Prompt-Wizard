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
    debounce,
    emptyState,
    coerceState,
    uniqueRowId,
    compilePreview,
    fetchCompiledPreview,
    fetchLibrary,
    fetchSavedPresets,
    saveSavedPresets,
    showToast,
    groupForCategory,
  } = K.helpers;
  const {
    GROUPS,
    GROUP_LABELS,
    GROUP_CATEGORIES,
    RANDOM_GROUP_CATEGORIES,
    CATEGORIES,
  } = K.constants;
  const { render: renderRow } = K.presetRow;
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
    if (!Array.isArray(state.rows)) state.rows = [];

    const library = [];
    let savedPresets = [];
    let dirty = false;
    let undoStack = [];
    let redoStack = [];
    let persistedState = JSON.stringify(state);
    let latestPreview = null;
    let previewSequence = 0;

    fetchLibrary().then(function (presets) {
      library.splice(0, library.length, ...presets);
      render();
    }).catch(function () { render(); });

    const root = el("div", { class: "krea2-wizard-root" });

    /* --- Top section: base prompt, mode, library button --- */
    const basePromptControl = buildBasePrompt(state);
    const livePreview = buildLivePreview();
    const showWorkToggle = buildShowWorkToggle(state);
    const libraryBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: openLibrary }, "Library");
    const randomAllBtn = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-wizard-random-all",
      title: "Replace every concept group with a fresh combination",
      onClick: randomizeAll,
    }, "Randomize All");
    const materializeBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: materialize }, "Materialize");
    const subgraphBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: createSubgraph }, "Create Subgraph");
    const undoBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: undo, title: "Undo the last change" }, "Undo");
    const redoBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: redo, title: "Redo the last undone change" }, "Redo");
    const resetBtn = el("button", { type: "button", class: "krea2-wizard-btn", onClick: resetAll }, "Reset All");
    const savedPresetControl = buildSavedPresetControl();
    const creativeModeControl = buildCreativeModeControl();

    const topBar = el("div", { class: "krea2-wizard-top" }, [
      creativeModeControl,
      libraryBtn,
      randomAllBtn,
      materializeBtn,
      subgraphBtn,
      undoBtn,
      redoBtn,
      showWorkToggle,
      resetBtn,
    ]);

    /* --- Searchable add concept --- */
    const addConcept = el("button", {
      type: "button",
      class: "krea2-wizard-btn krea2-wizard-add",
      onClick: function () {
        showSearchableSelector({
          presets: compatibleLibrary(),
          multiSelect: true,
          selectedIds: state.rows.map(function (row) { return row.preset_id; }),
          onToggle: togglePreset,
        });
      },
    }, "+ Add Concept");

    /* --- Layout: collapsible categories --- */
    const categoryBody = el("div", { class: "krea2-wizard-categories" });
    const showWork = el("div", { class: "krea2-wizard-show-work-host" });

    const editorBody = el("div", { class: "krea2-wizard-editor" }, [
      savedPresetControl.root,
      basePromptControl.root,
      addConcept,
      categoryBody,
    ]);

    root.appendChild(topBar);
    root.appendChild(editorBody);
    root.appendChild(livePreview.root);
    root.appendChild(showWork);

    fetchSavedPresets().then(function (presets) {
      savedPresets = presets;
      refreshSavedPresetSelect();
    });

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
      const currentState = JSON.stringify(state);
      if (currentState === persistedState) return;
      undoStack.push(persistedState);
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      dirty = true;
      persistedState = currentState;
      persist();
      updateHistoryControls();
      renderLivePreview(true);
    }

    function undo() {
      if (undoStack.length === 0) return;
      redoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(undoStack.pop()));
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function redo() {
      if (redoStack.length === 0) return;
      undoStack.push(JSON.stringify(state));
      state = coerceState(JSON.parse(redoStack.pop()));
      dirty = true;
      persistedState = JSON.stringify(state);
      persist();
      updateHistoryControls();
      render();
    }

    function updateHistoryControls() {
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
    }

    function presetToRow(preset, state) {
      const initialStrength = Math.round(Math.max(-5, Math.min(5,
        (Number(preset.default_strength) || 0) / 20)) * 4) / 4;
      return {
        id: uniqueRowId(state),
        category: preset.category || "custom",
        preset_id: preset.id || "",
        label: preset.label || "",
        phrase: preset.phrase || "",
        control_mode: preset.control_mode || "scalar",
        intensity: parseInt(preset.default_strength, 10) || 0,
        strength: initialStrength,
        enabled: true,
        aliases: preset.aliases || [],
        verification: preset.verification || "general visual vocabulary",
        source: preset.source || "library",
        positive_phrase: preset.positive_phrase,
        negative_phrase: preset.negative_phrase,
        neutral_phrase: preset.neutral_phrase,
        safe_weight_min: preset.safe_weight_min,
        safe_weight_max: preset.safe_weight_max,
        compatible_profiles: preset.compatible_profiles || [],
      };
    }

    function togglePreset(preset, shouldSelect) {
      if (shouldSelect) {
        if (!state.rows.some(function (row) { return row.preset_id === preset.id; })) {
          state.rows.push(presetToRow(preset, state));
        }
      } else {
        state.rows = state.rows.filter(function (row) {
          return row.preset_id !== preset.id;
        });
      }
      markDirty();
      render();
    }

    function replaceGroupWithRandom(group) {
      state.rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) !== group;
      });
      const allowed = new Set(RANDOM_GROUP_CATEGORIES[group]);
      const candidates = compatibleLibrary().filter(function (preset) {
        return allowed.has(preset.category) && !preset.disabled;
      });
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = swap;
      }
      const minimum = Math.min(2, candidates.length);
      const maximum = Math.min(6, candidates.length);
      const count = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
      for (const preset of candidates.slice(0, count)) {
        state.rows.push(presetToRow(preset, state));
      }
    }

    function presetMedia(preset) {
      const category = preset.category || "";
      const text = [
        preset.id || "", preset.label || "", preset.phrase || "",
        (preset.tags || []).join(" "),
      ].join(" ").toLowerCase();
      if (category === "camera_body" || category === "lens_family") return "photo";
      if (category !== "style") return "common";
      if (/(photograph|photographic|film still|fashion editorial|direct.flash|cinematic)/.test(text)) {
        return "photo";
      }
      return "art";
    }

    function presetMatchesCreativeMode(preset) {
      const media = presetMedia(preset);
      return media === "common" || media === (state.creative_mode || "photo");
    }

    function compatibleLibrary() {
      return library.filter(presetMatchesCreativeMode);
    }

    function buildCreativeModeControl() {
      const wrap = el("div", {
        class: "krea2-wizard-creative-mode",
        title: "Choose concepts suited to photography or artwork",
      });
      for (const option of [
        { value: "photo", label: "Photography" },
        { value: "art", label: "Artwork" },
      ]) {
        wrap.appendChild(el("button", {
          type: "button",
          class: "krea2-wizard-creative-option"
            + ((state.creative_mode || "photo") === option.value ? " is-active" : ""),
          onClick: function () {
            if (state.creative_mode === option.value) return;
            state.creative_mode = option.value;
            for (const button of wrap.querySelectorAll(".krea2-wizard-creative-option")) {
              button.classList.toggle("is-active", button.textContent === option.label);
            }
            markDirty();
            render();
          },
        }, option.label));
      }
      return wrap;
    }

    function randomizeGroup(group) {
      if (!library.length) {
        showToast("The concept library is still loading.", "warning");
        return;
      }
      replaceGroupWithRandom(group);
      markDirty();
      render();
      showToast(GROUP_LABELS[group] + " randomized", "info");
    }

    function randomizeAll() {
      if (!library.length) {
        showToast("The concept library is still loading.", "warning");
        return;
      }
      if (!window.confirm("Replace all current concepts with a random combination?")) return;
      for (const group of GROUPS) replaceGroupWithRandom(group);
      markDirty();
      render();
      showToast("All concept groups randomized", "info");
    }

    function buildBasePrompt(state) {
      const ta = el("textarea", {
        class: "krea2-wizard-base",
        rows: "2",
        "aria-label": "Describe the image you want to make",
        placeholder: "Describe the scene, subject, mood, lighting, camera, or style.",
        onInput: function (e) {
          state.base_prompt = e.target.value;
          sizeBasePrompt();
          markDirty();
          syncNodeHeight();
        },
      }, state.base_prompt || "");
      return {
        root: el("div", { class: "krea2-wizard-prompt-field" }, [
          el("label", null, "Describe what you want to make"),
          ta,
        ]),
        input: ta,
      };
    }

    function buildShowWorkToggle(state) {
      const btn = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: function () {
          state.show_work = !state.show_work;
          markDirty();
          render();
        },
      }, state.show_work ? "Hide Work" : "Show Work");
      return btn;
    }

    function buildSavedPresetControl() {
      const select = el("select", {
        class: "krea2-wizard-saved-select",
        "aria-label": "Saved prompt and group presets",
      });
      const load = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: loadSelectedSavedPreset,
      }, "Load");
      const remove = el("button", {
        type: "button",
        class: "krea2-wizard-btn",
        onClick: deleteSelectedSavedPreset,
      }, "Delete");
      const save = el("button", {
        type: "button",
        class: "krea2-wizard-btn krea2-wizard-save",
        onClick: saveFullPreset,
      }, "Save Full Prompt");
      return {
        root: el("div", { class: "krea2-wizard-saved" }, [
          el("span", { class: "krea2-wizard-saved-label" }, "My presets"),
          select,
          load,
          remove,
          save,
        ]),
        select: select,
        load: load,
        remove: remove,
      };
    }

    function refreshSavedPresetSelect() {
      const current = savedPresetControl.select.value;
      savedPresetControl.select.innerHTML = "";
      savedPresetControl.select.appendChild(el("option", { value: "" }, "Choose a saved preset..."));
      const ordered = savedPresets.slice().sort(function (a, b) {
        return (a.scope + a.label).localeCompare(b.scope + b.label);
      });
      for (const preset of ordered) {
        const prefix = preset.scope === "full"
          ? "Full"
          : (GROUP_LABELS[preset.group] || "Group");
        savedPresetControl.select.appendChild(
          el("option", { value: preset.id }, prefix + " · " + preset.label));
      }
      savedPresetControl.select.value = savedPresets.some(function (preset) {
        return preset.id === current;
      }) ? current : "";
      const disabled = savedPresets.length === 0;
      savedPresetControl.load.disabled = disabled;
      savedPresetControl.remove.disabled = disabled;
    }

    function cloneRowsWithFreshIds(rows) {
      const occupied = state.rows.slice();
      return (rows || []).map(function (row) {
        const copy = JSON.parse(JSON.stringify(row));
        copy.id = uniqueRowId({ rows: occupied });
        occupied.push(copy);
        return copy;
      });
    }

    function makeSavedPresetId(scope, group) {
      return "saved_" + scope + "_" + (group || "all") + "_"
        + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2, 7);
    }

    function askPresetName(message) {
      const name = window.prompt(message, "");
      return name && name.trim() ? name.trim() : "";
    }

    function persistSavedPresets(successMessage) {
      return saveSavedPresets(savedPresets).then(function (presets) {
        savedPresets = presets;
        refreshSavedPresetSelect();
        render();
        showToast(successMessage, "info");
      }).catch(function (error) {
        showToast(error.message || "Could not save preset.", "error");
      });
    }

    function saveFullPreset() {
      const label = askPresetName("Name this full prompt preset");
      if (!label) return;
      savedPresets.push({
        id: makeSavedPresetId("full", ""),
        label: label,
        scope: "full",
        group: "",
        base_prompt: state.base_prompt || "",
        randomize_on_job: JSON.parse(JSON.stringify(state.randomize_on_job || {})),
        creative_mode: state.creative_mode || "photo",
        rows: JSON.parse(JSON.stringify(state.rows)),
      });
      persistSavedPresets("Full prompt preset saved");
    }

    function saveGroupPreset(group) {
      const rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) === group;
      });
      if (!rows.length) {
        showToast("Add at least one concept to this group first.", "warning");
        return;
      }
      const label = askPresetName("Name this " + GROUP_LABELS[group] + " preset");
      if (!label) return;
      savedPresets.push({
        id: makeSavedPresetId("group", group),
        label: label,
        scope: "group",
        group: group,
        base_prompt: "",
        rows: JSON.parse(JSON.stringify(rows)),
      });
      persistSavedPresets(GROUP_LABELS[group] + " preset saved");
    }

    function loadSelectedSavedPreset() {
      const preset = savedPresets.find(function (item) {
        return item.id === savedPresetControl.select.value;
      });
      if (!preset) return;
      if (preset.scope === "full") {
        state.base_prompt = preset.base_prompt || "";
        state.randomize_on_job = JSON.parse(JSON.stringify(preset.randomize_on_job || {}));
        state.creative_mode = preset.creative_mode || state.creative_mode || "photo";
        state.rows = cloneRowsWithFreshIds(preset.rows);
      } else {
        state.rows = state.rows.filter(function (row) {
          return groupForCategory(row.category) !== preset.group;
        });
        state.rows.push.apply(state.rows, cloneRowsWithFreshIds(preset.rows));
      }
      markDirty();
      render();
      showToast(preset.label + " loaded", "info");
    }

    function loadGroupPreset(group, presetId) {
      const preset = savedPresets.find(function (item) {
        return item.id === presetId && item.scope === "group" && item.group === group;
      });
      if (!preset) return;
      state.rows = state.rows.filter(function (row) {
        return groupForCategory(row.category) !== group;
      });
      state.rows.push.apply(state.rows, cloneRowsWithFreshIds(preset.rows));
      markDirty();
      render();
      showToast(preset.label + " loaded", "info");
    }

    function buildGroupPresetPicker(group) {
      const select = el("select", {
        class: "krea2-wizard-group-preset",
        "aria-label": GROUP_LABELS[group] + " saved presets",
      });
      select.appendChild(el("option", { value: "" }, "Load preset..."));
      for (const preset of savedPresets.filter(function (item) {
        return item.scope === "group" && item.group === group;
      })) {
        select.appendChild(el("option", { value: preset.id }, preset.label));
      }
      const load = el("button", {
        type: "button",
        class: "krea2-wizard-category-load",
        disabled: select.children.length <= 1,
        title: "Load a saved " + GROUP_LABELS[group] + " preset",
        onClick: function (event) {
          event.stopPropagation();
          loadGroupPreset(group, select.value);
        },
      }, "Load");
      return { select: select, load: load };
    }

    function deleteSelectedSavedPreset() {
      const id = savedPresetControl.select.value;
      const preset = savedPresets.find(function (item) { return item.id === id; });
      if (!preset || !window.confirm("Delete saved preset “" + preset.label + "”?")) return;
      savedPresets = savedPresets.filter(function (item) { return item.id !== id; });
      persistSavedPresets("Saved preset deleted");
    }

    function buildLivePreview() {
      const text = el("div", { class: "krea2-wizard-preview" }, "");
      const plain = el("pre", { class: "krea2-wizard-plain", hidden: true }, "");
      const buttons = el("div", { class: "krea2-wizard-preview-buttons" }, [
        el("button", { type: "button", onClick: function () { copy(text.textContent); } }, "Copy Final"),
        el("button", { type: "button", onClick: function () { copy(plain.textContent); } }, "Copy Plain"),
      ]);
      const header = el("h3", null, "Live Preview");
      const root = el("div", { class: "krea2-wizard-preview-host" }, [header, buttons, text, plain]);
      return { root: root, text: text, plain: plain };
    }

    function renderLivePreview(requestAuthoritativePreview) {
      const signature = JSON.stringify(state);
      const compiled = latestPreview && latestPreview.signature === signature
        ? latestPreview.result
        : compilePreview(state);
      renderInteractivePreview(compiled);
      livePreview.plain.textContent = compiled.plain_prompt;
      showWork.innerHTML = "";
      if (state.show_work) {
        showWork.appendChild(renderShowWork(state, compiled));
      }
      if (requestAuthoritativePreview !== false) {
        schedulePreview(signature);
      }
    }

    function renderInteractivePreview(compiled) {
      livePreview.text.innerHTML = "";
      const parts = [];
      if ((state.base_prompt || "").trim()) {
        parts.push({ text: state.base_prompt.trim(), rowId: "" });
      }
      const fragmentByRow = new Map((compiled.fragments || []).map(function (fragment) {
        return [fragment.row_id, fragment];
      }));
      for (const category of CATEGORIES) {
        for (const row of state.rows) {
          if (row.category !== category || row.enabled === false) continue;
          const fragment = fragmentByRow.get(row.id);
          if (fragment && fragment.fragment) {
            parts.push({ text: fragment.fragment, rowId: row.id });
          }
        }
      }
      parts.forEach(function (part, index) {
        if (index) livePreview.text.appendChild(document.createTextNode(", "));
        if (!part.rowId) {
          livePreview.text.appendChild(document.createTextNode(part.text));
          return;
        }
        livePreview.text.appendChild(el("button", {
          type: "button",
          class: "krea2-preview-concept",
          dataset: { rowId: part.rowId },
          onMouseEnter: function () { setRowHover(part.rowId, true); },
          onMouseLeave: function () { setRowHover(part.rowId, false); },
          onClick: function () { focusRow(part.rowId); },
        }, part.text));
      });
    }

    function setRowHover(rowId, active) {
      for (const element of root.querySelectorAll('[data-row-id="' + rowId + '"]')) {
        element.classList.toggle("is-linked-hover", active);
      }
    }

    function focusRow(rowId) {
      const row = state.rows.find(function (item) { return item.id === rowId; });
      if (!row) return;
      const group = groupForCategory(row.category);
      state.collapsed = state.collapsed || {};
      state.collapsed[group] = false;
      render();
      const schedule = window.requestAnimationFrame || window.setTimeout;
      schedule(function () {
        const card = root.querySelector('.krea2-row[data-row-id="' + rowId + '"]');
        if (!card) return;
        if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("is-focus-flash");
        window.setTimeout(function () { card.classList.remove("is-focus-flash"); }, 1200);
      }, 0);
    }

    function editRow(row) {
      const group = groupForCategory(row.category);
      showSearchableSelector({
        presets: compatibleLibrary(),
        title: "Replace " + (row.label || "concept"),
        categories: GROUP_CATEGORIES[group],
        multiSelect: false,
        selectedIds: [row.preset_id],
        initialPresetId: row.preset_id,
        onPick: function (preset) {
          const replacement = presetToRow(preset, state);
          replacement.id = row.id;
          replacement.strength = row.strength;
          replacement.enabled = row.enabled;
          const index = state.rows.findIndex(function (item) { return item.id === row.id; });
          if (index >= 0) state.rows[index] = replacement;
          markDirty();
          render();
          focusRow(replacement.id);
        },
      });
    }

    const schedulePreview = debounce(requestPreview, 140);

    function requestPreview(signature) {
      if (latestPreview && latestPreview.signature === signature) return;
      const requestId = ++previewSequence;
      const previewState = JSON.parse(signature);
      fetchCompiledPreview(previewState).then(function (compiled) {
        if (requestId !== previewSequence) return;
        latestPreview = { signature: signature, result: compiled };
        if (signature === JSON.stringify(state)) renderLivePreview(false);
      }).catch(function () {
        // Keep the instant local preview available if the optional API route is unavailable.
      });
    }

    function render() {
      basePromptControl.input.value = state.base_prompt || "";
      sizeBasePrompt();
      showWorkToggle.textContent = state.show_work ? "Hide Work" : "Show Work";
      categoryBody.innerHTML = "";
      const visibleGroups = GROUPS;
      for (const group of visibleGroups) {
        const rows = state.rows.filter(function (row) {
          return groupForCategory(row.category) === group;
        });
        const collapsed = !!(state.collapsed || {})[group];
        const section = el("section", {
          class: "krea2-wizard-category" + (collapsed ? " is-collapsed" : ""),
        });
        const header = el("div", { class: "krea2-wizard-category-header" }, [
          el("strong", { class: "krea2-wizard-category-title" }, GROUP_LABELS[group]),
          el("span", { class: "krea2-wizard-category-summary", title: rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(", ") }, rows.map(function (row) {
            return row.label || row.preset_id;
          }).join(" · ")),
          el("span", { class: "krea2-wizard-category-count" },
            rows.length + (rows.length === 1 ? " concept" : " concepts")),
        ]);
        const addBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-add",
          onClick: function (event) {
            event.stopPropagation();
            showSearchableSelector({
              presets: compatibleLibrary(),
              title: "Add " + GROUP_LABELS[group] + " concepts",
              categories: GROUP_CATEGORIES[group],
              multiSelect: true,
              selectedIds: rows.map(function (row) { return row.preset_id; }),
              onToggle: togglePreset,
            });
          },
        }, "+ Add");
        const randomBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-random",
          title: "Replace this group with a random combination",
          onClick: function (event) {
            event.stopPropagation();
            randomizeGroup(group);
          },
        }, "Randomize");
        const saveBtn = el("button", {
          type: "button",
          class: "krea2-wizard-category-save",
          title: "Save these concepts and their values as a reusable group preset",
          onClick: function (event) {
            event.stopPropagation();
            saveGroupPreset(group);
          },
        }, "Save preset");
        const groupPreset = buildGroupPresetPicker(group);
        const randomEachJob = el("label", {
          class: "krea2-wizard-random-job",
          title: "Choose a fresh random " + GROUP_LABELS[group] + " setup every queued job",
        }, [
          el("input", {
            type: "checkbox",
            checked: !!(state.randomize_on_job || {})[group],
            onChange: function (event) {
              state.randomize_on_job = state.randomize_on_job || {};
              state.randomize_on_job[group] = !!event.target.checked;
              markDirty();
            },
          }),
          el("span", null, "Each job"),
        ]);
        const randomControls = el("div", { class: "krea2-wizard-random-controls" }, [
          randomBtn,
          randomEachJob,
        ]);
        const actions = el("div", { class: "krea2-wizard-category-actions" }, [
          addBtn,
          groupPreset.select,
          groupPreset.load,
          saveBtn,
          randomControls,
        ]);
        const content = el("div", { class: "krea2-wizard-category-content" });
        if (rows.length === 0) {
          content.appendChild(el("div", { class: "krea2-wizard-empty" },
            "No concepts yet. Add your own or try Randomize."));
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
              onReorder: function (parent) {
                const ids = Array.prototype.map.call(parent.querySelectorAll(".krea2-row"), function (el) { return el.dataset.rowId; });
                const reordered = ids.map(function (id) {
                  return state.rows.find(function (row) { return row.id === id; });
                }).filter(Boolean);
                const groupIds = new Set(rows.map(function (row) { return row.id; }));
                state.rows = state.rows.map(function (row) {
                  return groupIds.has(row.id) ? reordered.shift() : row;
                });
                markDirty();
              },
              editRow: editRow,
              onHover: setRowHover,
            }));
          }
        }
        header.addEventListener("click", function () {
          state.collapsed = state.collapsed || {};
          state.collapsed[group] = !state.collapsed[group];
          content.style.display = state.collapsed[group] ? "none" : "";
          actions.style.display = state.collapsed[group] ? "none" : "";
          section.classList.toggle("is-collapsed", state.collapsed[group]);
          markDirty();
        });
        if (collapsed) {
          content.style.display = "none";
          actions.style.display = "none";
        }
        section.appendChild(header);
        section.appendChild(actions);
        section.appendChild(content);
        categoryBody.appendChild(section);
      }
      updateHistoryControls();
      renderLivePreview(true);
      syncNodeHeight();
    }

    function sizeBasePrompt() {
      const input = basePromptControl && basePromptControl.input;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.max(52, input.scrollHeight || 0) + "px";
    }

    function syncNodeHeight() {
      const schedule = window.requestAnimationFrame || function (callback) {
        return window.setTimeout(callback, 0);
      };
      schedule(function () {
        if (!root.isConnected || !node.setSize) return;
        const current = node.size || [700, 720];
        const desiredHeight = Math.max(720, Math.ceil(root.scrollHeight + 90));
        if (current[1] < desiredHeight) {
          node.setSize([Math.max(current[0] || 0, 700), desiredHeight]);
        }
        if (node.setDirtyCanvas) node.setDirtyCanvas(true);
      });
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
        saveUser: saveUserLibrary,
      });
    }

    function saveUserLibrary() {
      const userOnly = library.filter(function (p) { return p.origin === "user"; });
      const api = window.app && window.app.api;
      const url = (api && api.apiURL && api.apiURL("/krea2_prompt_wizard/library"))
        || "/krea2_prompt_wizard/library";
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: userOnly }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            const issue = payload.issues && payload.issues[0];
            throw new Error(issue ? issue.message : "Could not save the library.");
          }
          showToast("Library saved", "info");
          return payload;
        });
      });
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
