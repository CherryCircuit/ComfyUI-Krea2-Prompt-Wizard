/* Concept row: [label] [−] [value] [+] [×] with live two-column board
 * reordering. The center value is a drag surrogate for a slider: mousedown
 * on it, drag vertically (up = +step per 10px), release. Clicking the value
 * lets you type an exact number. The − and + pills auto-repeat while held.
 *
 * The stepper controls are also exported (K.presetRow.makeStepper) so the
 * per-character LoRA rows share the exact same interaction.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const {
    el,
    icon,
    displayStrength,
    storedStrength,
    formatStepValue,
  } = K.helpers;

  const ROW_MIN = -3;
  const ROW_MAX = 3;
  const ROW_STEP = 0.5;

  const COLOR_TAGS = [
    ["red", "#ff6b6b"],
    ["orange", "#ffa94d"],
    ["yellow", "#fab005"],
    ["green", "#51cf66"],
    ["blue", "#339af0"],
    ["pink", "#f06595"],
  ];

  function showColorPicker(anchor, presetId, onPick) {
    const existing = document.querySelector(".krea2-color-picker-menu");
    if (existing) existing.remove();
    const menu = el("div", { class: "krea2-color-picker-menu" });
    for (const entry of COLOR_TAGS) {
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
      borderRadius: "6px",
      padding: "4px",
      display: "flex",
      alignItems: "center",
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

  /* Click-and-hold auto-repeat for the − / + pills. */
  function attachRepeat(button, onStep) {
    let timer = null;
    function stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("mouseleave", stop);
      button.classList.remove("is-repeating");
    }
    button.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      onStep();
      button.classList.add("is-repeating");
      timer = setInterval(onStep, 130);
      document.addEventListener("mouseup", stop);
      document.addEventListener("mouseleave", stop);
    });
  }

  /* Vertical drag surrogate for the center value: up = +step per 10px,
   * down = -step per 10px, released on mouseup. */
  function attachValueDrag(valueEl, getValue, setValue, step) {
    valueEl.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      const startY = event.clientY;
      const startValue = Number(getValue());
      let moved = false;
      valueEl.classList.add("is-dragging");
      document.body.classList.add("krea2-ns-resize");
      function onMove(moveEvent) {
        const deltaSteps = Math.round((startY - moveEvent.clientY) / 10);
        const next = startValue + deltaSteps * step;
        if (Math.abs(moveEvent.clientY - startY) > 2) moved = true;
        setValue(next);
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        valueEl.classList.remove("is-dragging");
        document.body.classList.remove("krea2-ns-resize");
        if (moved) valueEl.dataset.dragMoved = "1";
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  /* Click the value to type an exact number. Enter/blur commits,
   * Escape cancels. Suppressed after a drag so dragging never opens the
   * editor. */
  function attachValueEdit(valueEl, getValue, onCommit, format, clamp) {
    let editing = false;
    valueEl.addEventListener("click", function () {
      if (valueEl.dataset.dragMoved) {
        delete valueEl.dataset.dragMoved;
        return;
      }
      if (editing) return;
      editing = true;
      const input = el("input", {
        type: "text",
        class: "krea2-row-value-input",
        value: String(getValue()),
        "aria-label": "Type an exact strength",
      });
      function commit() {
        if (!editing) return;
        editing = false;
        const number = Number(input.value);
        if (Number.isFinite(number)) {
          onCommit(clamp ? clamp(number) : number);
        } else {
          valueEl.textContent = format(getValue());
        }
        if (input.parentNode) input.parentNode.removeChild(input);
      }
      function cancel() {
        if (!editing) return;
        editing = false;
        valueEl.textContent = format(getValue());
        if (input.parentNode) input.parentNode.removeChild(input);
      }
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") cancel();
        if (typeof event.stopPropagation === "function") event.stopPropagation();
      });
      input.addEventListener("blur", commit);
      valueEl.textContent = "";
      valueEl.appendChild(input);
      input.focus();
      input.select();
    });
  }

  /* Shared stepper control: [−] [value] [+] with hold-to-repeat, vertical
   * drag and click-to-type. Used by concept rows and LoRA rows. */
  function makeStepper(opts) {
    const step = Number(opts.step) || ROW_STEP;
    const min = Number.isFinite(Number(opts.min)) ? Number(opts.min) : ROW_MIN;
    const max = Number.isFinite(Number(opts.max)) ? Number(opts.max) : ROW_MAX;
    const typedMin = Number.isFinite(Number(opts.typedMin)) ? Number(opts.typedMin) : min;
    const typedMax = Number.isFinite(Number(opts.typedMax)) ? Number(opts.typedMax) : max;
    const format = opts.format || formatStepValue;
    const onCommit = opts.onCommit || function () {};
    const snap = function (v) {
      return Math.round(Math.max(min, Math.min(max, Number(v))) / step) * step;
    };
    let current = Number.isFinite(Number(opts.value)) ? Number(opts.value) : 0;

    const valueEl = el("div", {
      class: "krea2-row-value",
      role: "slider",
      tabIndex: "0",
      "aria-label": opts.label || "Strength",
      "aria-valuemin": String(min),
      "aria-valuemax": String(max),
      "aria-valuenow": String(current),
      title: "Drag vertically to adjust, or click to type an exact value",
    }, format(current));
    const minus = el("button", {
      type: "button",
      class: "krea2-row-step-minus",
      title: "Decrease by " + step + " (hold to repeat)",
      "aria-label": "Decrease strength by " + step,
    }, icon("minus", { width: "10", height: "10" }));
    const plus = el("button", {
      type: "button",
      class: "krea2-row-step-plus",
      title: "Increase by " + step + " (hold to repeat)",
      "aria-label": "Increase strength by " + step,
    }, icon("plus", { width: "10", height: "10" }));

    function setValue(next) {
      current = snap(next);
      valueEl.textContent = format(current);
      valueEl.setAttribute("aria-valuenow", String(current));
      onCommit(current);
    }
    function setValueTyped(next) {
      current = Math.max(typedMin, Math.min(typedMax, Number(next)));
      valueEl.textContent = format(current);
      valueEl.setAttribute("aria-valuenow", String(current));
      onCommit(current);
    }

    attachRepeat(minus, function () { setValue(current - step); });
    attachRepeat(plus, function () { setValue(current + step); });
    attachValueDrag(valueEl, function () { return current; }, setValue, step);
    attachValueEdit(valueEl, function () { return current; }, setValueTyped, format);

    return {
      valueEl: valueEl,
      minus: minus,
      plus: plus,
      getValue: function () { return current; },
      setValue: setValue,
    };
  }

  function renderRow(row, ctx) {
    const color = ctx.conceptColors && ctx.conceptColors[row.preset_id] || "";
    const wrap = el("div", {
      class: "krea2-row" + (color ? " is-starred-" + color : ""),
      dataset: { rowId: row.id, category: row.category },
    });

    const dragHandle = el("button", {
      type: "button",
      class: "krea2-row-drag",
      title: "Drag concept to reorder",
      "aria-label": "Drag concept to reorder",
    }, icon("grip", { width: "12", height: "12" }));

    const starBtn = el("button", {
      type: "button",
      class: "krea2-star-btn" + (color ? " color-" + color + " is-starred" : ""),
      title: "Star concept with a color tag",
      "aria-label": "Tag concept with a color",
      onClick: function (event) {
        event.stopPropagation();
        showColorPicker(event.currentTarget, row.preset_id, function (newColor) {
          ctx.conceptColors = ctx.conceptColors || {};
          if (newColor) ctx.conceptColors[row.preset_id] = newColor;
          else delete ctx.conceptColors[row.preset_id];
          wrap.className = "krea2-row" + (newColor ? " is-starred-" + newColor : "") + (row.enabled === false ? " is-disabled" : "");
          ctx.markDirty();
          if (ctx.persistConceptColors) ctx.persistConceptColors();
          if (ctx.refresh) ctx.refresh();
        });
      },
    }, icon("star", { width: "12", height: "12" }));

    const label = el("button", {
      type: "button",
      class: "krea2-row-label",
      title: "Replace this concept",
      onClick: function () { ctx.editRow(row); },
    }, row.label || row.preset_id || "Concept");

    const initial = storedStrength(displayStrength(row));
    row.strength = initial;

    const stepper = makeStepper({
      value: initial,
      step: ROW_STEP,
      min: ROW_MIN,
      max: ROW_MAX,
      label: "Concept strength",
      onCommit: function (value) {
        row.strength = value;
        ctx.markDirty();
      },
    });

    const enabled = el("button", {
      type: "button",
      class: "krea2-row-visibility" + (row.enabled === false ? " is-off" : ""),
      title: row.enabled === false ? "Show concept in the final prompt" : "Hide concept from the final prompt",
      "aria-label": row.enabled === false ? "Show concept" : "Hide concept",
      "aria-pressed": row.enabled !== false ? "true" : "false",
      onClick: function (event) {
        row.enabled = row.enabled === false;
        event.currentTarget.classList.toggle("is-off", row.enabled === false);
        event.currentTarget.setAttribute("aria-pressed", row.enabled !== false ? "true" : "false");
        event.currentTarget.setAttribute(
          "aria-label",
          row.enabled === false ? "Show concept" : "Hide concept",
        );
        event.currentTarget.title = row.enabled === false
          ? "Show concept in the final prompt"
          : "Hide concept from the final prompt";
        wrap.classList.toggle("is-disabled", row.enabled === false);
        ctx.markDirty();
      },
    }, icon("eye", { width: "12", height: "12" }));

    const remove = el("button", {
      type: "button",
      class: "krea2-row-remove krea2-danger",
      title: "Delete concept",
      "aria-label": "Delete concept",
      onClick: function () { ctx.removeRow(row.id); },
    }, icon("trash", { width: "11", height: "11" }));

    wrap.appendChild(el("div", { class: "krea2-row-head" }, [
      dragHandle,
      starBtn,
      label,
      stepper.minus,
      stepper.valueEl,
      stepper.plus,
      enabled,
      remove,
    ]));
    wrap.classList.toggle("is-disabled", row.enabled === false);
    wrap.addEventListener("mouseenter", function () {
      wrap.classList.add("is-hovered");
      if (ctx.onHover) ctx.onHover(row.id, true);
    });
    wrap.addEventListener("mouseleave", function () {
      wrap.classList.remove("is-hovered");
      if (ctx.onHover) ctx.onHover(row.id, false);
    });

    dragHandle.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      var parent = wrap.parentNode;
      if (!parent) return;
      var rect = wrap.getBoundingClientRect();
      var offsetX = event.clientX - rect.left;
      var offsetY = event.clientY - rect.top;
      var placeholder = el("div", { class: "krea2-row-placeholder" });
      placeholder.style.height = rect.height + "px";
      parent.insertBefore(placeholder, wrap);

      wrap.classList.add("is-dragging");
      Object.assign(wrap.style, {
        position: "fixed",
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
        zIndex: "2147482500",
        pointerEvents: "none",
      });

      var lastPlacement = null;
      var rafId = null;

      function onMove(moveEvent) {
        wrap.style.left = (moveEvent.clientX - offsetX) + "px";
        wrap.style.top = (moveEvent.clientY - offsetY) + "px";
        if (rafId) return;
        rafId = window.requestAnimationFrame(function () {
          rafId = null;
          var candidates = Array.from(parent.querySelectorAll(".krea2-row")).filter(function (card) {
            return card !== wrap;
          });
          var targetRow = null;
          var nearestDistance = Infinity;
          for (var ci = 0; ci < candidates.length; ci++) {
            var card = candidates[ci];
            var cardRect = card.getBoundingClientRect();
            var dx = moveEvent.clientX - (cardRect.left + cardRect.width / 2);
            var dy = moveEvent.clientY - (cardRect.top + cardRect.height / 2);
            var distance = dx * dx + dy * dy;
            if (distance < nearestDistance) {
              nearestDistance = distance;
              targetRow = card;
            }
          }
          var newPlacement;
          if (targetRow) {
            var targetRect = targetRow.getBoundingClientRect();
            var verticalOffset = moveEvent.clientY - (targetRect.top + targetRect.height / 2);
            var before = verticalOffset < -targetRect.height / 3
              || (
                Math.abs(verticalOffset) <= targetRect.height / 3
                && moveEvent.clientX < targetRect.left + targetRect.width / 2
              );
            newPlacement = before ? targetRow : targetRow.nextSibling;
          } else {
            newPlacement = null;
          }
          if (newPlacement !== lastPlacement) {
            lastPlacement = newPlacement;
            if (targetRow) {
              parent.insertBefore(placeholder, before ? targetRow : targetRow.nextSibling);
            } else {
              parent.appendChild(placeholder);
            }
          }
        });
      }

      function onUp() {
        if (rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        parent.insertBefore(wrap, placeholder);
        placeholder.remove();
        wrap.classList.remove("is-dragging");
        for (var pi = 0; pi < ["position", "left", "top", "width", "height", "zIndex", "pointerEvents"].length; pi++) {
          var property = ["position", "left", "top", "width", "height", "zIndex", "pointerEvents"][pi];
          wrap.style[property] = "";
        }
        ctx.onReorder(parent);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      event.preventDefault();
    });

    return wrap;
  }

  K.presetRow = { render: renderRow, makeStepper: makeStepper };
})();
