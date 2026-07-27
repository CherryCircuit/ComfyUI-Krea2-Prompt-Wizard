/* Searchable multi-select concept picker. */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, groupForCategory } = K.helpers;
  const {
    CATEGORIES,
    GROUPS,
    GROUP_LABELS,
    GROUP_CATEGORIES,
  } = K.constants;

  function showSearchableSelector(opts) {
    const {
      presets,
      categories,
      onPick,
      onToggle,
      onClose,
      initialQuery = "",
      initialPresetId = "",
      multiSelect = false,
      selectedIds = [],
      title = multiSelect ? "Add concepts" : "Choose a concept",
    } = opts;

    const list = Array.isArray(presets) ? presets : [];
    if (!list.length) return null;

    const allowedCategories = new Set(
      Array.isArray(categories) && categories.length ? categories : CATEGORIES,
    );
    const availableGroups = GROUPS.filter(function (group) {
      return GROUP_CATEGORIES[group].some(function (category) {
        return allowedCategories.has(category);
      });
    });
    const selected = new Set(selectedIds || []);

    const overlay = el("div", {
      class: "krea2-searchable-overlay",
      onClick: function (event) {
        if (event.target === overlay) close();
      },
    });
    const panel = el("div", {
      class: "krea2-searchable-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    });

    const heading = el("div", { class: "krea2-searchable-header" }, [
      el("strong", null, title),
      el("div", { class: "krea2-searchable-header-actions" }, [
        multiSelect
          ? el("button", {
              type: "button",
              class: "krea2-searchable-done",
              onClick: close,
            }, "Done")
          : null,
        el("button", {
          type: "button",
          class: "krea2-searchable-close",
          title: "Close",
          "aria-label": "Close",
          onClick: close,
        }, "×"),
      ]),
    ]);

    const search = el("input", {
      type: "text",
      class: "krea2-searchable-query",
      placeholder: "Search by idea, meaning, or visual effect...",
      value: initialQuery,
    });

    const chipRow = el("div", { class: "krea2-searchable-chips" });
    let activeGroup = "__all__";

    function makeChip(label, value) {
      const chip = el("button", {
        type: "button",
        class: "krea2-searchable-chip",
        dataset: { value: value },
        onClick: function () {
          activeGroup = value;
          for (const current of chipRow.querySelectorAll(".krea2-searchable-chip")) {
            current.classList.toggle("is-active", current.dataset.value === value);
          }
          renderResults();
        },
      }, label);
      if (value === activeGroup) chip.classList.add("is-active");
      return chip;
    }

    if (availableGroups.length > 1) {
      chipRow.appendChild(makeChip("All", "__all__"));
    } else if (availableGroups.length === 1) {
      activeGroup = availableGroups[0];
    }
    for (const group of availableGroups) {
      chipRow.appendChild(makeChip(GROUP_LABELS[group], group));
    }

    const selectedCount = el("span", { class: "krea2-searchable-selected-count" }, "");
    const listEl = el("div", {
      class: "krea2-searchable-list",
      tabIndex: "0",
    });
    const empty = el(
      "div",
      { class: "krea2-searchable-empty" },
      "No concepts match. Try a related word or broader idea.",
    );

    panel.appendChild(heading);
    panel.appendChild(search);
    panel.appendChild(chipRow);
    panel.appendChild(selectedCount);
    panel.appendChild(listEl);
    overlay.appendChild(panel);

    let highlighted = -1;
    let currentResults = [];

    function searchableText(preset) {
      return [
        preset.label || "",
        preset.phrase || "",
        (preset.aliases || []).join(" "),
        (preset.tags || []).join(" "),
        preset.category || "",
        GROUP_LABELS[groupForCategory(preset.category)] || "",
        preset.id || "",
      ].join(" ").toLowerCase();
    }

    function renderResults() {
      listEl.innerHTML = "";
      const query = (search.value || "").trim().toLowerCase();
      currentResults = list.filter(function (preset) {
        if (preset.disabled || !allowedCategories.has(preset.category)) return false;
        if (activeGroup !== "__all__" && groupForCategory(preset.category) !== activeGroup) {
          return false;
        }
        return !query || searchableText(preset).includes(query);
      }).slice(0, 240);
      if (highlighted < 0 && initialPresetId) {
        highlighted = currentResults.findIndex(function (preset) {
          return preset.id === initialPresetId;
        });
      }

      selectedCount.textContent = multiSelect
        ? selected.size + (selected.size === 1 ? " concept selected" : " concepts selected")
        : "";

      if (!currentResults.length) {
        listEl.appendChild(empty);
        highlighted = -1;
        return;
      }

      currentResults.forEach(function (preset, index) {
        const isSelected = selected.has(preset.id);
        const item = el("button", {
          type: "button",
          class: "krea2-searchable-item" + (isSelected ? " is-selected" : ""),
          dataset: { idx: String(index), presetId: preset.id },
          title: preset.phrase || preset.label || preset.id,
          onClick: function () { choose(index); },
          onMouseEnter: function () { setHighlight(index); },
        }, [
          el("span", { class: "krea2-searchable-check" }, isSelected ? "✓" : ""),
          el("span", { class: "krea2-searchable-title" }, preset.label || preset.id),
          el(
            "span",
            { class: "krea2-searchable-group" },
            GROUP_LABELS[groupForCategory(preset.category)],
          ),
        ]);
        listEl.appendChild(item);
      });
      setHighlight(Math.max(0, Math.min(highlighted, currentResults.length - 1)));
    }

    function setHighlight(index) {
      if (!currentResults.length) {
        highlighted = -1;
        return;
      }
      highlighted = Math.max(0, Math.min(index, currentResults.length - 1));
      const items = listEl.querySelectorAll(".krea2-searchable-item");
      items.forEach(function (item, itemIndex) {
        item.classList.toggle("is-active", itemIndex === highlighted);
      });
      const active = items[highlighted];
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    function choose(index) {
      const preset = currentResults[index];
      if (!preset) return;
      if (!multiSelect) {
        if (onPick) onPick(preset);
        close();
        return;
      }

      const willSelect = !selected.has(preset.id);
      if (willSelect) selected.add(preset.id);
      else selected.delete(preset.id);

      // Paint the selection state before the wizard performs its heavier
      // concept-card render. This also leaves the picker correct if the
      // parent callback encounters an unrelated rendering problem.
      renderResults();
      if (onToggle) onToggle(preset, willSelect);
    }

    function close() {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (onClose) onClose();
    }

    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight(highlighted + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight(highlighted - 1);
      } else if (event.key === "Enter" && highlighted >= 0) {
        event.preventDefault();
        choose(highlighted);
      }
    }

    search.addEventListener("input", renderResults);
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    renderResults();
    setTimeout(function () { search.focus(); search.select(); }, 0);

    return { close: close };
  }

  K.searchableSelector = { show: showSearchableSelector };
})();
