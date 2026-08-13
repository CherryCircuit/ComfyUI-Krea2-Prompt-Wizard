/* Searchable multi-select concept picker. */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, icon, groupForCategory } = K.helpers;
  const {
    CATEGORIES,
    CATEGORY_LABELS,
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
        }, icon("close", { width: "12", height: "12" })),
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

    function showColorPicker(anchor, presetId, onPick) {
      const existing = document.querySelector(".krea2-color-picker-menu");
      if (existing) existing.remove();
      const tags = [
        ["red", "#ff6b6b"],
        ["orange", "#ffa94d"],
        ["yellow", "#fab005"],
        ["green", "#51cf66"],
        ["blue", "#339af0"],
        ["pink", "#f06595"],
      ];
      const menu = el("div", { class: "krea2-color-picker-menu" });
      for (const entry of tags) {
        menu.appendChild(el("button", {
          type: "button",
          class: "krea2-color-option",
          title: "Tag " + entry[0],
          "aria-label": "Tag " + entry[0],
          onClick: function (e) {
            e.stopPropagation();
            onPick(entry[0]);
            menu.remove();
          },
        }, icon("dot", { color: entry[1], width: "14", height: "14" })));
      }
      menu.appendChild(el("button", {
        type: "button",
        class: "krea2-color-option krea2-color-option-clear",
        title: "Clear tag",
        "aria-label": "Clear tag",
        onClick: function (e) {
          e.stopPropagation();
          onPick("");
          menu.remove();
        },
      }, "Clear"));
      const rect = anchor.getBoundingClientRect();
      Object.assign(menu.style, {
        position: "fixed",
        left: rect.left + "px",
        top: (rect.bottom + 4) + "px",
        zIndex: "2147483500",
        background: "var(--krea2-panel, #202329)",
        border: "1px solid var(--krea2-border)",
        borderRadius: "4px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      });
      document.body.appendChild(menu);
      function onDocClick(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", onDocClick, true);
        }
      }
      setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
    }

    function renderResults() {
      listEl.innerHTML = "";
      const query = (search.value || "").trim().toLowerCase();
      const appliedIds = Array.from(selected);
      currentResults = list.filter(function (preset) {
        if (preset.disabled || !allowedCategories.has(preset.category)) return false;
        if (activeGroup !== "__all__" && groupForCategory(preset.category) !== activeGroup) {
          return false;
        }
        if (opts.filterPreset && !opts.filterPreset(preset, appliedIds)) return false;
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

      // Sort by category, then alphabetically by label within each category.
      currentResults.sort(function (a, b) {
        var catA = a.category || "";
        var catB = b.category || "";
        var byCategory = catA.localeCompare(catB);
        if (byCategory !== 0) return byCategory;
        return String(a.label || "").toLowerCase().localeCompare(String(b.label || "").toLowerCase());
      });

      var lastCategory = "";
      var absIndex = 0;
      for (var ri = 0; ri < currentResults.length; ri++) {
        const preset = currentResults[ri];
        var presetCat = preset.category || "";
        if (presetCat !== lastCategory) {
          if (lastCategory !== "") {
            // Add a subtle separator between categories
            var sep = el("div", { class: "krea2-searchable-cat-sep" });
            listEl.appendChild(sep);
          }
          var headerLabel = CATEGORY_LABELS[presetCat] || presetCat;
          var header = el("div", { class: "krea2-searchable-cat-header" }, headerLabel);
          listEl.appendChild(header);
          lastCategory = presetCat;
        }

        var index = ri;
        var isSelected = selected.has(preset.id);
        var color = opts.getConceptColor ? opts.getConceptColor(preset.id) : ((opts.conceptColors || {})[preset.id] || "");
        var itemClass = "krea2-searchable-item";
        if (isSelected && color) itemClass += " is-selected is-starred-" + color;
        else if (isSelected) itemClass += " is-selected-only";
        else if (color) itemClass += " is-starred-" + color;

        var item = el("div", {
          class: itemClass,
          role: "option",
          tabIndex: "0",
          "aria-selected": isSelected ? "true" : "false",
          dataset: { idx: String(absIndex), presetId: preset.id },
          title: preset.phrase || preset.label || preset.id,
          onClick: function (i) { return function () { choose(i); }; }(index),
          onKeyDown: function (i) { return function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(i);
            }
          }; }(index),
          onMouseEnter: function (i) { return function () { setHighlight(i); }; }(index),
        }, [
          el("button", {
            type: "button",
            class: "krea2-star-btn" + (color ? " color-" + color + " is-starred" : ""),
            title: "Star concept with a color tag",
            "aria-label": "Tag concept with a color",
            onClick: function (e) {
              e.stopPropagation();
              showColorPicker(e.currentTarget, preset.id, function (newColor) {
                if (opts.onColorChange) opts.onColorChange(preset.id, newColor);
                renderResults();
              });
            },
          }, icon("star", { width: "12", height: "12" })),
          el("span", { class: "krea2-searchable-check" }, isSelected ? icon("check", { width: "10", height: "10" }) : ""),
          el("span", { class: "krea2-searchable-title" }, preset.label || preset.id),
          el("span", { class: "krea2-searchable-group" }, CATEGORY_LABELS[presetCat] || presetCat),
        ]);
        listEl.appendChild(item);
        absIndex++;
      }
      // Rebuild currentResults in the new sorted order for highlight indexing
      currentResults = Array.prototype.slice.call(listEl.querySelectorAll(".krea2-searchable-item")).map(function (el) {
        return list.find(function (p) { return p.id === el.dataset.presetId; });
      }).filter(Boolean);
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
