/* Preset row component
 *
 * Renders a single row in the wizard, with controls for:
 * - enable / disable
 * - preset selection
 * - intensity slider + numeric input
 * - advanced controls (control mode, raw mode, bipolar phrase)
 * - generated fragment preview
 * - duplicate / remove / favourite
 *
 * The row receives a state object and a callback that fires after any
 * mutation. The parent widget is responsible for persistence.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const {
    el,
    escapeHtml,
    debounce,
    clampSlider,
    defaultWeightForRow,
    phraseForRow,
    formatPhrase,
    formatWeight,
  } = K.helpers;
  const { CATEGORY_LABELS, MODES } = K.constants;
  const searchable = K.searchableSelector;

  function renderRow(row, ctx) {
    const wrap = el("div", { class: "krea2-row", dataset: { rowId: row.id, category: row.category } });

    const enabled = el("input", {
      type: "checkbox",
      class: "krea2-row-enabled",
      title: "Enable this row",
      checked: row.enabled !== false,
      onChange: function (e) {
        row.enabled = !!e.target.checked;
        ctx.markDirty();
        updateFragment();
      },
    });

    const dragHandle = el("span", { class: "krea2-row-drag", title: "Drag to reorder" }, "≡");

    const presetSelector = el("button", {
      type: "button",
      class: "krea2-row-preset",
      title: "Click to change preset",
      onClick: function () {
        searchable.show({
          anchor: presetSelector,
          presets: ctx.presets,
          categories: [row.category].concat(K.constants.CATEGORIES.filter(function (c) { return c !== row.category; })),
          onPick: function (preset) {
            row.preset_id = preset.id || "";
            row.label = preset.label || row.label;
            row.phrase = preset.phrase || row.phrase;
            row.category = preset.category || row.category;
            row.control_mode = preset.control_mode || "scalar";
            row.aliases = preset.aliases || [];
            if (preset.positive_phrase) row.positive_phrase = preset.positive_phrase;
            if (preset.negative_phrase) row.negative_phrase = preset.negative_phrase;
            if (preset.neutral_phrase) row.neutral_phrase = preset.neutral_phrase;
            ctx.markDirty();
            ctx.refresh();
          },
        });
      },
    });

    const labelDisplay = el("span", { class: "krea2-row-label" }, row.label || row.preset_id || "(no preset)");

    const intensity = el("input", {
      type: "range",
      class: "krea2-row-intensity",
      min: "-100",
      max: "100",
      step: "1",
      value: String(row.intensity || 0),
      title: "Drag to change intensity",
      onInput: function (e) {
        row.intensity = clampSlider(e.target.value);
        numericInput.value = String(row.intensity);
        updateFragment();
        ctx.markDirty();
      },
    });

    const numericInput = el("input", {
      type: "number",
      class: "krea2-row-numeric",
      min: "-100",
      max: "100",
      step: "1",
      value: String(row.intensity || 0),
      onInput: function (e) {
        row.intensity = clampSlider(e.target.value);
        intensity.value = String(row.intensity);
        updateFragment();
        ctx.markDirty();
      },
    });

    const fragment = el("code", { class: "krea2-row-fragment" }, "");
    const weightDisplay = el("span", { class: "krea2-row-weight" }, "");

    const advancedToggle = el("button", {
      type: "button",
      class: "krea2-row-advanced",
      title: "Advanced controls",
      onClick: function () {
        const open = advanced.classList.toggle("is-open");
        advancedToggle.textContent = open ? "Less" : "Advanced";
      },
    }, "Advanced");

    const removeBtn = el("button", {
      type: "button",
      class: "krea2-row-remove",
      title: "Remove this row",
      onClick: function () {
        ctx.removeRow(row.id);
      },
    }, "×");

    const duplicateBtn = el("button", {
      type: "button",
      class: "krea2-row-duplicate",
      title: "Duplicate this row",
      onClick: function () {
        ctx.duplicateRow(row.id);
      },
    }, "⎘");

    const favouriteBtn = el("button", {
      type: "button",
      class: "krea2-row-favourite",
      title: "Mark this preset as a favourite",
      onClick: function () {
        row.favourite = !row.favourite;
        favouriteBtn.classList.toggle("is-fav", !!row.favourite);
        ctx.markDirty();
      },
    }, "★");

    if (row.favourite) favouriteBtn.classList.add("is-fav");

    // --- Advanced panel ---
    const advanced = el("div", { class: "krea2-row-advanced-panel" });

    const modeSelect = el("select", {
      class: "krea2-row-mode",
      onChange: function (e) {
        row.control_mode = e.target.value;
        if (row.control_mode === MODES.BIPOLAR) {
          row.positive_phrase = row.positive_phrase || row.phrase || "";
          row.negative_phrase = row.negative_phrase || row.phrase || "";
        }
        ctx.markDirty();
        ctx.refresh();
      },
    }, [
      el("option", { value: MODES.SCALAR }, "Scalar"),
      el("option", { value: MODES.BIPOLAR }, "Bipolar"),
      el("option", { value: MODES.RAW, title: "Optional raw mode" }, "Raw (advanced)"),
    ]);
    modeSelect.value = row.control_mode || MODES.SCALAR;

    const phraseInput = el("input", {
      type: "text",
      class: "krea2-row-phrase",
      placeholder: "Phrase override",
      value: row.phrase || "",
      onInput: function (e) {
        row.phrase = e.target.value;
        updateFragment();
        ctx.markDirty();
      },
    });

    const positiveInput = el("input", {
      type: "text",
      class: "krea2-row-positive",
      placeholder: "Positive phrase (bipolar)",
      value: row.positive_phrase || "",
      onInput: function (e) {
        row.positive_phrase = e.target.value;
        updateFragment();
        ctx.markDirty();
      },
    });

    const negativeInput = el("input", {
      type: "text",
      class: "krea2-row-negative",
      placeholder: "Negative phrase (bipolar)",
      value: row.negative_phrase || "",
      onInput: function (e) {
        row.negative_phrase = e.target.value;
        updateFragment();
        ctx.markDirty();
      },
    });

    const neutralInput = el("input", {
      type: "text",
      class: "krea2-row-neutral",
      placeholder: "Neutral phrase (bipolar, optional)",
      value: row.neutral_phrase || "",
      onInput: function (e) {
        row.neutral_phrase = e.target.value;
        updateFragment();
        ctx.markDirty();
      },
    });

    const customMin = el("input", {
      type: "number",
      class: "krea2-row-custom-min",
      step: "0.05",
      placeholder: "Custom min",
      value: row.safe_weight_min != null ? row.safe_weight_min : "",
      onInput: function (e) {
        const v = parseFloat(e.target.value);
        row.safe_weight_min = isNaN(v) ? null : v;
        ctx.markDirty();
      },
    });

    const customMax = el("input", {
      type: "number",
      class: "krea2-row-custom-max",
      step: "0.05",
      placeholder: "Custom max",
      value: row.safe_weight_max != null ? row.safe_weight_max : "",
      onInput: function (e) {
        const v = parseFloat(e.target.value);
        row.safe_weight_max = isNaN(v) ? null : v;
        ctx.markDirty();
      },
    });

    const verificationBadge = el("span", {
      class: "krea2-row-verification",
      title: row.verification || "general visual vocabulary",
    }, row.verification || "general visual vocabulary");

    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Mode"),
      modeSelect,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Phrase"),
      phraseInput,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Positive"),
      positiveInput,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Negative"),
      negativeInput,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Neutral"),
      neutralInput,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Min / Max"),
      customMin,
      customMax,
    ]));
    advanced.appendChild(el("div", { class: "krea2-row-advanced-row" }, [
      el("label", null, "Verification"),
      verificationBadge,
    ]));

    // ------- Layout -------
    const head = el("div", { class: "krea2-row-head" }, [
      enabled,
      dragHandle,
      presetSelector,
      labelDisplay,
      intensity,
      numericInput,
      weightDisplay,
      advancedToggle,
      duplicateBtn,
      favouriteBtn,
      removeBtn,
    ]);
    presetSelector.appendChild(labelDisplay);

    const preview = el("div", { class: "krea2-row-preview" }, [
      fragment,
    ]);

    wrap.appendChild(head);
    wrap.appendChild(preview);
    wrap.appendChild(advanced);

    function updateFragment() {
      const w = defaultWeightForRow(row);
      const phrase = phraseForRow(row);
      const formatted = formatPhrase(phrase, w);
      fragment.textContent = formatted || "(empty)";
      weightDisplay.textContent = "w=" + formatWeight(w);
      weightDisplay.dataset.weight = String(w);
      weightDisplay.classList.toggle("is-high", w > 2.0);
      weightDisplay.classList.toggle("is-low", w < 1.0 && w !== 1.0);
      fragment.classList.toggle("is-warning", Math.abs(w) > 3.0);
    }

    /* Drag-and-drop reordering */
    dragHandle.addEventListener("mousedown", function (e) {
      const startY = e.clientY;
      const rect = wrap.getBoundingClientRect();
      const offset = startY - rect.top;
      let lastEvent = e;
      function onMove(ev) {
        lastEvent = ev;
        const dy = ev.clientY - startY;
        wrap.style.transform = "translateY(" + dy + "px)";
        wrap.style.zIndex = "5";
        wrap.style.opacity = "0.85";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        wrap.style.transform = "";
        wrap.style.opacity = "";
        wrap.style.zIndex = "";
        const target = document.elementFromPoint(lastEvent.clientX, lastEvent.clientY);
        const targetRow = target && target.closest && target.closest(".krea2-row");
        if (targetRow && targetRow !== wrap && targetRow.parentNode) {
          const parent = wrap.parentNode;
          const targetRect = targetRow.getBoundingClientRect();
          const after = (lastEvent.clientY - targetRect.top) > targetRect.height / 2;
          if (after) {
            parent.insertBefore(wrap, targetRow.nextSibling);
          } else {
            parent.insertBefore(wrap, targetRow);
          }
          ctx.onReorder(parent);
        }
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });

    updateFragment();
    return wrap;
  }

  K.presetRow = { render: renderRow };
})();
