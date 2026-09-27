/**
 * Searchable preset chooser for the Prompt Studio.
 *
 * Opened by the "+ Category" toolbar buttons, the "[" trigger, or
 * Ctrl/Cmd+Space. Selecting a preset inserts its token at the editor's
 * remembered caret.
 */
import { el, anchoredPanel } from "./ui.mjs?v=1";
import { categoryLabel } from "./preset_store.mjs?v=1";

function matchesQuery(preset, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    preset.name.toLowerCase().includes(q) ||
    preset.id.toLowerCase().includes(q) ||
    preset.category.toLowerCase().includes(q) ||
    preset.tags.some((tag) => tag.toLowerCase().includes(q)) ||
    (preset.description || "").toLowerCase().includes(q)
  );
}

/**
 * @param {{
 *   store: import("./preset_store.mjs").PresetStore,
 *   onInsert: (preset: object) => void,
 *   onManage: () => void,
 * }} options
 */
export function createPresetChooser({ store, onInsert, onManage }) {
  let activeCategory = null;
  let results = [];
  let highlightIndex = 0;
  let panel = null; // { destroy } while open

  const title = el("div", "kpw2-panel-title", "Insert preset");
  const search = el("input", "kpw2-chooser-search");
  search.type = "text";
  search.placeholder = "Search presets…";

  const list = el("div", "kpw2-chooser-list");

  const footer = el("div", "kpw2-chooser-footer");
  const manageButton = el("button", "kpw2-ghost-button", "Preset Manager…");
  manageButton.type = "button";
  footer.append(manageButton);

  const panelBody = el("div", "kpw2-chooser");
  panelBody.append(title, search, list, footer);

  function renderList() {
    const query = search.value.trim();
    results = store.presets
      .filter((preset) => preset.enabled)
      .filter((preset) => !activeCategory || preset.category === activeCategory)
      .filter((preset) => matchesQuery(preset, query))
      .slice(0, 60);
    highlightIndex = results.length ? Math.min(highlightIndex, results.length - 1) : 0;
    list.replaceChildren();
    if (!results.length) {
      list.append(el("div", "kpw2-chooser-empty", query ? "No matching presets." : "No presets available."));
      return;
    }
    results.forEach((preset, index) => {
      const row = el("button", "kpw2-chooser-row" + (index === highlightIndex ? " kpw2-active" : ""));
      row.type = "button";
      const dot = el("span", `kpw2-dot kpw2-cat-${preset.category}`);
      const name = el("span", "kpw2-chooser-name", preset.name);
      const cat = el("span", "kpw2-chooser-cat", categoryLabel(preset.category));
      row.append(dot, name, cat);
      if (preset.description) row.title = preset.description;
      row.addEventListener("click", () => choose(preset));
      row.addEventListener("mousemove", () => {
        if (highlightIndex !== index) {
          highlightIndex = index;
          updateHighlight();
        }
      });
      list.append(row);
    });
  }

  function updateHighlight() {
    const rows = list.querySelectorAll(".kpw2-chooser-row");
    rows.forEach((row, index) => row.classList.toggle("kpw2-active", index === highlightIndex));
    const active = rows[highlightIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function choose(preset) {
    close();
    onInsert(preset);
  }

  search.addEventListener("input", () => {
    highlightIndex = 0;
    renderList();
  });

  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length) {
        highlightIndex = (highlightIndex + 1) % results.length;
        updateHighlight();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) {
        highlightIndex = (highlightIndex - 1 + results.length) % results.length;
        updateHighlight();
      }
    } else if ((event.key === "Enter" || event.key === "Tab") && results[highlightIndex]) {
      event.preventDefault();
      choose(results[highlightIndex]);
    }
  });

  manageButton.addEventListener("click", () => {
    close();
    onManage();
  });

  /**
   * @param {{category?: string|null, anchorRect: DOMRect}} options
   */
  function open({ category = null, anchorRect } = {}) {
    close();
    activeCategory = category || null;
    highlightIndex = 0;
    search.value = "";
    title.textContent = category ? `${categoryLabel(category)} presets` : "Insert preset";
    renderList();
    panel = anchoredPanel("chooser", anchorRect, () => panelBody, { width: 320 });
    search.focus();
  }

  function close() {
    if (panel) {
      const target = panel;
      panel = null;
      target.destroy();
    }
  }

  return {
    open,
    close,
    get isOpen() {
      return panel != null;
    },
  };
}
