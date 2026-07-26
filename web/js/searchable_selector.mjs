/* Searchable selector widget
 * Used by Add Concept buttons and by the in-row preset selector.
 *
 * Behaviour:
 * - Type to filter; matches label, phrase, aliases, and category.
 * - Mouse wheel cycles through the result list.
 * - Enter inserts the highlighted item; Esc closes.
 * - Categories can be filtered via the chip row above the search.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, escapeHtml, CATEGORIES, CATEGORY_LABELS } = K.helpers;

  function showSearchableSelector(opts) {
    const {
      anchor,
      presets,
      categories,
      onPick,
      onClose,
      initialQuery = "",
      filterMode = "all",
    } = opts;

    const list = Array.isArray(presets) ? presets : [];
    if (!list.length) return null;

    const cats = Array.isArray(categories) && categories.length
      ? categories
      : CATEGORIES.slice();

    const overlay = el("div", {
      class: "krea2-searchable-overlay",
      onClick: function (e) {
        if (e.target === overlay) close();
      },
    });

    const panel = el("div", { class: "krea2-searchable-panel" });
    overlay.appendChild(panel);

    const search = el("input", {
      type: "text",
      class: "krea2-searchable-query",
      placeholder: "Search presets by label, phrase, alias, or category...",
      value: initialQuery,
    });

    const chipRow = el("div", { class: "krea2-searchable-chips" });
    let activeCategory = "__all__";
    function makeChip(label, value) {
      const chip = el("button", {
        type: "button",
        class: "krea2-searchable-chip",
        onClick: function () {
          activeCategory = value;
          for (const c of chipRow.querySelectorAll(".krea2-searchable-chip")) {
            c.classList.toggle("is-active", c.dataset.value === value);
          }
          renderResults();
        },
      }, label);
      chip.dataset.value = value;
      if (value === activeCategory) chip.classList.add("is-active");
      return chip;
    }
    chipRow.appendChild(makeChip("All", "__all__"));
    for (const c of cats) {
      chipRow.appendChild(makeChip(CATEGORY_LABELS[c] || c, c));
    }

    const listEl = el("div", { class: "krea2-searchable-list", tabIndex: "0" });
    const empty = el("div", { class: "krea2-searchable-empty" }, "No presets match your search.");
    listEl.appendChild(empty);

    panel.appendChild(search);
    panel.appendChild(chipRow);
    panel.appendChild(listEl);

    let highlighted = -1;
    let currentResults = [];

    function renderResults() {
      listEl.innerHTML = "";
      const q = (search.value || "").trim().toLowerCase();
      currentResults = list.filter((p) => {
        if (activeCategory !== "__all__" && p.category !== activeCategory) return false;
        if (!q) return true;
        const hay = [
          p.label || "",
          p.phrase || "",
          (p.aliases || []).join(" "),
          p.category || "",
          p.id || "",
        ].join(" ").toLowerCase();
        return hay.includes(q);
      }).slice(0, 200);

      if (currentResults.length === 0) {
        listEl.appendChild(empty);
        return;
      }
      currentResults.forEach((p, idx) => {
        const item = el("div", {
          class: "krea2-searchable-item",
          onClick: function () { pick(idx); },
          onMouseEnter: function () { setHighlight(idx); },
        });
        item.dataset.idx = String(idx);
        const label = el("div", { class: "krea2-searchable-title" }, p.label || p.id);
        const meta = el("div", { class: "krea2-searchable-meta" }, [
          el("span", { class: "krea2-searchable-cat" }, CATEGORY_LABELS[p.category] || p.category),
          el("span", { class: "krea2-searchable-phrase" }, p.phrase || ""),
          el("span", { class: "krea2-searchable-ver" }, p.verification || "general visual vocabulary"),
        ]);
        item.appendChild(label);
        item.appendChild(meta);
        listEl.appendChild(item);
      });
      setHighlight(0);
    }

    function setHighlight(idx) {
      if (idx < 0) idx = currentResults.length - 1;
      if (idx >= currentResults.length) idx = 0;
      highlighted = idx;
      const items = listEl.querySelectorAll(".krea2-searchable-item");
      items.forEach((it, i) => it.classList.toggle("is-active", i === highlighted));
      const active = items[highlighted];
      if (active && active.scrollIntoView) {
        active.scrollIntoView({ block: "nearest" });
      }
    }

    function pick(idx) {
      const p = currentResults[idx];
      if (!p) return;
      close();
      if (onPick) onPick(p);
    }

    function close() {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (onClose) onClose();
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight(highlighted + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight(highlighted - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(highlighted);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setHighlight(highlighted + (e.shiftKey ? -1 : 1));
      }
    }

    listEl.addEventListener("wheel", function (e) {
      if (currentResults.length === 0) return;
      e.preventDefault();
      setHighlight(highlighted + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    search.addEventListener("input", function () {
      renderResults();
    });

    document.addEventListener("keydown", onKey, true);

    renderResults();
    setTimeout(function () { search.focus(); search.select(); }, 0);

    if (anchor && anchor.parentNode) {
      anchor.parentNode.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }

    return { close: close };
  }

  K.searchableSelector = { show: showSearchableSelector };
})();
