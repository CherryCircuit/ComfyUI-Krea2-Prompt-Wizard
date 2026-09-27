/**
 * Searchable preset chooser for the Prompt Studio.
 *
 * Opened by the "+ Category" toolbar buttons, the "[" trigger, or
 * Ctrl/Cmd+Space. Selecting a preset inserts its token at the editor's
 * remembered caret. With no search query it shows ★ Favorites and
 * Recent sections first. Presets with a preview image render as visual
 * cards; every row has a star toggle for favoriting.
 */
import { el, anchoredPanel } from "./ui.mjs?v=3";
import { categoryLabel, presetStore, previewImageUrl } from "./preset_store.mjs?v=3";

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
  let results = []; // flat list of {preset, rowElement}
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

  function starButton(preset) {
    const star = el("button", "kpw2-star" + (store.isFavorite(preset.id) ? " kpw2-star-on" : ""));
    star.type = "button";
    star.textContent = store.isFavorite(preset.id) ? "★" : "☆";
    star.title = store.isFavorite(preset.id) ? "Remove from favorites" : "Add to favorites";
    star.addEventListener("click", (event) => {
      event.stopPropagation();
      void store.toggleFavorite(preset.id).then(() => renderList());
    });
    return star;
  }

  function rowElement(preset) {
    const thumbUrl = previewImageUrl(preset);
    const row = el("button", "kpw2-chooser-row" + (thumbUrl ? " kpw2-has-thumb" : ""));
    row.type = "button";
    if (thumbUrl) {
      const img = el("img", "kpw2-thumb");
      img.src = thumbUrl;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.remove();
        row.prepend(el("span", `kpw2-dot kpw2-cat-${preset.category}`));
        row.classList.remove("kpw2-has-thumb");
      });
      row.append(img);
    } else {
      row.append(el("span", `kpw2-dot kpw2-cat-${preset.category}`));
    }
    const name = el("span", "kpw2-chooser-name", preset.name);
    const cat = el("span", "kpw2-chooser-cat", categoryLabel(preset.category));
    row.append(name, cat, starButton(preset));
    if (preset.description) row.title = preset.description;
    return row;
  }

  function sectionLabel(text) {
    return el("div", "kpw2-chooser-section", text);
  }

  function renderList() {
    const query = search.value.trim();
    const enabled = store.presets.filter((preset) => preset.enabled);
    const inCategory = enabled.filter(
      (preset) => !activeCategory || preset.category === activeCategory
    );
    results = [];
    list.replaceChildren();

    if (!query) {
      const favorites = inCategory.filter((preset) => store.isFavorite(preset.id));
      const recent = store.recent
        .map((id) => inCategory.find((preset) => preset.id === id))
        .filter(Boolean);
      const recentOnly = recent.filter(
        (preset) => !favorites.some((fav) => fav.id === preset.id)
      );
      if (favorites.length) {
        list.append(sectionLabel("★ Favorites"));
        for (const preset of favorites) appendRow(preset);
      }
      if (recentOnly.length) {
        list.append(sectionLabel("Recent"));
        for (const preset of recentOnly.slice(0, 8)) appendRow(preset);
      }
      if (favorites.length || recentOnly.length) {
        list.append(sectionLabel(activeCategory ? "All" : "All presets"));
      }
    }

    const filtered = inCategory
      .filter((preset) => matchesQuery(preset, query))
      .slice(0, 60);
    if (!results.length && !filtered.length) {
      list.append(el("div", "kpw2-chooser-empty", query ? "No matching presets." : "No presets available."));
      return;
    }
    for (const preset of filtered) appendRow(preset);
    highlightIndex = Math.min(highlightIndex, Math.max(0, results.length - 1));
    updateHighlight();
  }

  function appendRow(preset) {
    const row = rowElement(preset);
    row.addEventListener("click", () => choose(preset));
    row.addEventListener("mousemove", () => {
      const index = results.findIndex((entry) => entry.preset.id === preset.id);
      if (index >= 0 && highlightIndex !== index) {
        highlightIndex = index;
        updateHighlight();
      }
    });
    results.push({ preset, rowElement: row });
    list.append(row);
  }

  function updateHighlight() {
    results.forEach((entry, index) =>
      entry.rowElement.classList.toggle("kpw2-active", index === highlightIndex)
    );
    const active = results[highlightIndex]?.rowElement;
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function choose(preset) {
    close();
    void store.pushRecent(preset.id);
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
      choose(results[highlightIndex].preset);
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
    panel = anchoredPanel("chooser", anchorRect, () => panelBody, { width: 340 });
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
