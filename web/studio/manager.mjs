/**
 * Preset Manager for the Prompt Studio.
 *
 * A single modal that lists all presets (search + category filter) and
 * edits one preset at a time. Saves go through the preset store, which
 * upserts changes into the user payload; bundled presets are overridden
 * by id rather than modified in place, and can be tombstoned.
 */
import { el, openModal } from "./ui.mjs?v=1";
import { CATEGORY_ORDER, categoryLabel, presetStore } from "./preset_store.mjs?v=1";

function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "preset";
}

function uniqueId(base) {
  let candidate = base;
  let counter = 2;
  while (presetStore.get(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  return candidate;
}

function fieldRow(labelText, input) {
  const row = el("label", "kpw2-form-row");
  row.append(el("div", "kpw2-form-label", labelText), input);
  return row;
}

function textInput(value, placeholder) {
  const input = el("input", "kpw2-form-input");
  input.type = "text";
  input.value = value ?? "";
  input.placeholder = placeholder ?? "";
  return input;
}

function areaInput(value, placeholder, rows = 6) {
  const area = el("textarea", "kpw2-form-area");
  area.rows = rows;
  area.value = value ?? "";
  area.placeholder = placeholder ?? "";
  return area;
}

/**
 * @param {{
 *   onChanged: () => void,
 *   initialCategory?: string | null,
 *   selectId?: string | null,
 * }} options
 */
export function openPresetManager({ onChanged = () => {}, initialCategory = null, selectId = null } = {}) {
  const { dialog, close } = openModal("kpw2-manager-modal");

  let selectedId = selectId && presetStore.get(selectId) ? selectId : null;
  let filterCategory = initialCategory || "all";
  let filterQuery = "";

  // ---- list side ----------------------------------------------------------
  const searchInput = textInput("", "Search presets…");
  searchInput.classList.add("kpw2-manager-search");

  const categorySelect = el("select", "kpw2-manager-filter");
  for (const category of ["all", ...CATEGORY_ORDER]) {
    const option = el("option", null, category === "all" ? "All categories" : categoryLabel(category));
    option.value = category;
    categorySelect.append(option);
  }
  categorySelect.value = filterCategory;

  const newListButton = el("button", "kpw2-primary-button", "+ New Preset");
  newListButton.type = "button";

  const listHead = el("div", "kpw2-manager-listhead");
  const searchWrap = el("div", "kpw2-manager-searchwrap");
  searchWrap.append(searchInput, categorySelect);
  listHead.append(searchWrap, newListButton);

  const presetList = el("div", "kpw2-manager-list");

  const listPane = el("div", "kpw2-manager-listpane");
  listPane.append(listHead, presetList);

  // ---- form side ----------------------------------------------------------
  const nameInput = textInput("", "Preset name");
  const categoryInput = el("select", "kpw2-form-input");
  for (const category of CATEGORY_ORDER) {
    const option = el("option", null, categoryLabel(category));
    option.value = category;
    categoryInput.append(option);
  }
  const descriptionInput = textInput("", "One-line description (shown on hover)");
  const promptArea = areaInput("", "The full prompt this token expands into", 8);
  const negativeArea = areaInput("", "Optional negative prompt clauses (comma separated)", 4);
  const tagsInput = textInput("", "comma, separated, tags");
  const notesArea = areaInput("", "Private notes", 2);
  const enabledInput = el("input");
  enabledInput.type = "checkbox";

  const form = el("div", "kpw2-manager-form");
  form.append(
    fieldRow("Name", nameInput),
    fieldRow("Category", categoryInput),
    fieldRow("Description", descriptionInput),
    fieldRow("Prompt", promptArea),
    fieldRow("Negative", negativeArea),
    fieldRow("Tags", tagsInput),
    fieldRow("Notes", notesArea)
  );

  const enabledRow = el("label", "kpw2-form-check");
  enabledRow.append(enabledInput, el("span", null, "Enabled (disabled presets render as missing)"));
  form.append(enabledRow);

  const duplicateButton = el("button", "kpw2-ghost-button", "Duplicate");
  duplicateButton.type = "button";
  const deleteButton = el("button", "kpw2-danger-button", "Delete");
  deleteButton.type = "button";
  const cancelButton = el("button", "kpw2-ghost-button", "Cancel");
  cancelButton.type = "button";
  const saveButton = el("button", "kpw2-primary-button", "Save Preset");
  saveButton.type = "button";

  const formActions = el("div", "kpw2-manager-actions");
  formActions.append(duplicateButton, deleteButton, el("span", "kpw2-form-spacer"), cancelButton, saveButton);

  const statusLine = el("div", "kpw2-manager-status");

  const formPane = el("div", "kpw2-manager-formpane");
  const formScroll = el("div", "kpw2-manager-formscroll");
  formScroll.append(form);
  formPane.append(formScroll, statusLine, formActions);

  const columns = el("div", "kpw2-manager-columns");
  columns.append(listPane, formPane);
  dialog.append(columns);

  // ---- behavior -----------------------------------------------------------

  function currentDraft() {
    return {
      id: selectedId,
      name: nameInput.value.trim(),
      category: categoryInput.value,
      description: descriptionInput.value,
      prompt: promptArea.value,
      negative: negativeArea.value,
      tags: tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: notesArea.value,
      enabled: enabledInput.checked,
    };
  }

  function fillForm(preset) {
    nameInput.value = preset?.name ?? "";
    categoryInput.value = preset?.category ?? "other";
    descriptionInput.value = preset?.description ?? "";
    promptArea.value = preset?.prompt ?? "";
    negativeArea.value = preset?.negative ?? "";
    tagsInput.value = (preset?.tags ?? []).join(", ");
    notesArea.value = preset?.notes ?? "";
    enabledInput.checked = preset ? preset.enabled !== false : true;
  }

  function renderList() {
    const query = filterQuery.toLowerCase();
    presetList.replaceChildren();
    const presets = presetStore.presets
      .filter((preset) => filterCategory === "all" || preset.category === filterCategory)
      .filter((preset) => {
        if (!query) return true;
        return (
          preset.name.toLowerCase().includes(query) ||
          preset.id.toLowerCase().includes(query) ||
          preset.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      });
    for (const preset of presets) {
      const row = el("button", "kpw2-manager-row" + (preset.id === selectedId ? " kpw2-active" : ""));
      row.type = "button";
      row.append(
        el("span", `kpw2-dot kpw2-cat-${preset.category}`),
        el("span", "kpw2-manager-rowname", preset.name),
        el("span", "kpw2-manager-rowcat", categoryLabel(preset.category))
      );
      if (preset.enabled === false) row.classList.add("kpw2-row-disabled");
      row.addEventListener("click", () => {
        selectedId = preset.id;
        fillForm(preset);
        statusLine.textContent = "";
        renderList();
      });
      presetList.append(row);
    }
    if (!presets.length) {
      presetList.append(el("div", "kpw2-chooser-empty", "No presets match."));
    }
  }

  function setStatus(message, isError = false) {
    statusLine.textContent = message || "";
    statusLine.classList.toggle("kpw2-status-error", isError);
  }

  async function saveDraft() {
    const draft = currentDraft();
    if (!draft.name) {
      setStatus("Name is required.", true);
      return;
    }
    if (!draft.prompt.trim()) {
      setStatus("Prompt is required (the text the token expands into).", true);
      return;
    }
    let targetId = selectedId;
    if (!targetId) {
      targetId = uniqueId(`${draft.category}_${slugify(draft.name)}`);
    }
    const existing = presetStore.get(targetId);
    const payload = {
      ...existing ? existing : {},
      ...draft,
      id: targetId,
      name: draft.name,
    };
    try {
      await presetStore.saveChanges([{ preset: payload }]);
      selectedId = targetId;
      setStatus("Saved.");
      renderList();
      onChanged();
    } catch (error) {
      setStatus(error.message || "Save failed.", true);
    }
  }

  function newDraft(basePreset = null) {
    const name = basePreset ? `${basePreset.name} Copy` : "";
    const category = basePreset?.category ?? initialCategory ?? "other";
    selectedId = null;
    fillForm({
      name,
      category,
      description: basePreset?.description ?? "",
      prompt: basePreset?.prompt ?? "",
      negative: basePreset?.negative ?? "",
      tags: basePreset?.tags ?? [],
      notes: basePreset?.notes ?? "",
      enabled: true,
    });
    renderList();
    setStatus("Unsaved new preset — press Save Preset to keep it.");
    nameInput.focus();
  }

  async function deleteSelected() {
    const preset = presetStore.get(selectedId);
    if (!preset) return;
    if (!window.confirm(`Delete preset "${preset.name}"? Workflows using it will show [MISSING: ${preset.id}].`)) {
      return;
    }
    try {
      await presetStore.saveChanges([{ preset: { id: preset.id }, deleted: true }]);
      selectedId = null;
      fillForm(null);
      setStatus("Deleted.");
      renderList();
      onChanged();
    } catch (error) {
      setStatus(error.message || "Delete failed.", true);
    }
  }

  newListButton.addEventListener("click", () => newDraft());
  duplicateButton.addEventListener("click", () => {
    const preset = presetStore.get(selectedId);
    if (preset) newDraft(preset);
  });
  deleteButton.addEventListener("click", () => void deleteSelected());
  cancelButton.addEventListener("click", () => {
    fillForm(presetStore.get(selectedId));
    setStatus("");
  });
  saveButton.addEventListener("click", () => void saveDraft());
  searchInput.addEventListener("input", () => {
    filterQuery = searchInput.value;
    renderList();
  });
  categorySelect.addEventListener("change", () => {
    filterCategory = categorySelect.value;
    renderList();
  });

  // Initial state
  if (selectedId) fillForm(presetStore.get(selectedId));
  else if (initialCategory) newDraft();
  else fillForm(null);
  renderList();

  return { close };
}
