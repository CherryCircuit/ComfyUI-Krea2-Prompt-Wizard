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

  /* Emotion concepts are grouped by sentiment with emoji headers so the
   * picker reads like a mood board instead of one flat alphabet. */
  const EMOTION_BUCKETS = [
    { emoji: "😀", label: "Happy & Joyful", keys: ["joy", "happi", "glee", "elat", "delight", "amuse", "excit", "content", "radian", "cheer", "bliss", "relief", "affection", "tender", "love", "pride", "hope", "wonder", "awe", "seren", "calm", "playful", "flirt", "warmth"] },
    { emoji: "😡", label: "Angry & Frustrated", keys: ["anger", "angry", "rage", "fury", "furious", "irritat", "frustrat", "annoy", "exasper", "fuming"] },
    { emoji: "😭", label: "Sad & Depressed", keys: ["sad", "grief", "despair", "melanchol", "lonel", "sorrow", "mourn", "disappoint", "depress", "hopeless", "cry", "tear"] },
    { emoji: "😨", label: "Fear & Anxiety", keys: ["fear", "afraid", "terror", "panic", "anxi", "nervous", "dread", "horr", "scared", "terrif"] },
    { emoji: "😲", label: "Surprise & Shock", keys: ["surpris", "shock", "astonish", "amaze", "startl", "jaw"] },
    { emoji: "🤔", label: "Curious & Thinking", keys: ["curious", "confus", "puzzl", "skeptic", "suspic", "uncertain", "baffl", "intrigu", "thoughtful", "contemplat"] },
    { emoji: "😏", label: "Sly & Contemptuous", keys: ["contempt", "disgust", "sneer", "disdain", "smug", "smirk", "scorn", "suspicion"] },
    { emoji: "😴", label: "Tired & Numb", keys: ["fatigue", "tired", "exhaust", "weary", "bored", "numb", "apathet", "drained", "sleepy", "letharg"] },
    { emoji: "😰", label: "Shame & Embarrassment", keys: ["embarrass", "shame", "guilt", "humiliat", "awkward", "blush", "remorse"] },
    { emoji: "😤", label: "Defiant & Determined", keys: ["defian", "determin", "resolute", "assert", "stubborn", "firm", "commanded"] },
  ];
  const EMOTION_OTHER_BUCKET = { emoji: "✨", label: "Other" };

  function emotionBucketFor(preset) {
    const haystack = [preset.label, preset.phrase].concat(preset.aliases || [])
      .join(" ").toLowerCase();
    for (const bucket of EMOTION_BUCKETS) {
      if (bucket.keys.some(function (key) { return haystack.includes(key); })) {
        return bucket;
      }
    }
    return EMOTION_OTHER_BUCKET;
  }

  function emotionBucketIndex(preset) {
    const bucket = emotionBucketFor(preset);
    if (bucket === EMOTION_OTHER_BUCKET) return EMOTION_BUCKETS.length;
    return EMOTION_BUCKETS.indexOf(bucket);
  }

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
      // Emotion concepts are grouped into sentiment buckets first.
      currentResults.sort(function (a, b) {
        var catA = a.category || "";
        var catB = b.category || "";
        var byCategory = catA.localeCompare(catB);
        if (byCategory !== 0) return byCategory;
        var bucketA = emotionBucketIndex(a);
        var bucketB = emotionBucketIndex(b);
        if (bucketA !== bucketB) return bucketA - bucketB;
        return String(a.label || "").toLowerCase().localeCompare(String(b.label || "").toLowerCase());
      });

      var lastCategory = "";
      var lastBucket = null;
      var absIndex = 0;
      for (var ri = 0; ri < currentResults.length; ri++) {
        const preset = currentResults[ri];
        var presetCat = preset.category || "";
        var isEmotionCat = presetCat === "emotion" || presetCat === "emotion_trigger";
        if (presetCat !== lastCategory) {
          // Emotion and emotion-trigger share one combined section.
          if (lastCategory !== "" && !(isEmotionCat && (lastCategory === "emotion" || lastCategory === "emotion_trigger"))) {
            // Add a subtle separator between categories
            var sep = el("div", { class: "krea2-searchable-cat-sep" });
            listEl.appendChild(sep);
          }
          if (!(isEmotionCat && (lastCategory === "emotion" || lastCategory === "emotion_trigger"))) {
            var headerLabel = CATEGORY_LABELS[presetCat] || presetCat;
            var header = el("div", { class: "krea2-searchable-cat-header" }, headerLabel);
            listEl.appendChild(header);
          }
          lastCategory = presetCat;
          lastBucket = null;
        }
        if (isEmotionCat) {
          const bucket = emotionBucketFor(preset);
          if (bucket && bucket !== lastBucket) {
            lastBucket = bucket;
            listEl.appendChild(el("div", { class: "krea2-searchable-bucket-header" },
              bucket.emoji + " " + bucket.label));
          }
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
