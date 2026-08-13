/* Concept row: [label] [−] [value] [+] [×] with live two-column board
 * reordering. The center value is a drag surrogate for a slider: mousedown
 * on it, drag vertically (up = +0.5 per 10px), release. The − and + pills
 * auto-repeat while held. Range is -3 to +3 in 0.5 steps. */
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

  function stepRow(row, valueEl, delta, ctx) {
    const next = storedStrength(Number(displayStrength(row)) + delta);
    row.strength = Math.max(ROW_MIN, Math.min(ROW_MAX, next));
    if (valueEl) valueEl.textContent = formatStepValue(row.strength);
    ctx.markDirty();
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

  /* Vertical drag surrogate for the center value: up = +0.5/10px,
   * down = -0.5/10px, released on mouseup. */
  function attachValueDrag(valueEl, row, ctx) {
    valueEl.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      const startY = event.clientY;
      const startValue = Number(displayStrength(row));
      valueEl.classList.add("is-dragging");
      document.body.classList.add("krea2-ns-resize");
      function onMove(moveEvent) {
        const deltaSteps = Math.round((startY - moveEvent.clientY) / 10);
        const next = storedStrength(startValue + deltaSteps * ROW_STEP);
        row.strength = Math.max(ROW_MIN, Math.min(ROW_MAX, next));
        valueEl.textContent = formatStepValue(row.strength);
        ctx.markDirty();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        valueEl.classList.remove("is-dragging");
        document.body.classList.remove("krea2-ns-resize");
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
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

    const valueEl = el("div", {
      class: "krea2-row-value",
      role: "slider",
      tabIndex: "0",
      "aria-label": "Concept strength",
      "aria-valuemin": String(ROW_MIN),
      "aria-valuemax": String(ROW_MAX),
      "aria-valuenow": String(initial),
      title: "Drag vertically to adjust strength from -3 to +3",
    }, formatStepValue(initial));

    const minus = el("button", {
      type: "button",
      class: "krea2-row-step-minus",
      title: "Decrease strength by 0.5 (hold to repeat)",
      "aria-label": "Decrease concept strength",
    }, icon("close", { width: "10", height: "10" }));
    const plus = el("button", {
      type: "button",
      class: "krea2-row-step-plus",
      title: "Increase strength by 0.5 (hold to repeat)",
      "aria-label": "Increase concept strength",
    }, icon("plus", { width: "10", height: "10" }));

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
    }, icon("close", { width: "10", height: "10" }));

    wrap.appendChild(el("div", { class: "krea2-row-head" }, [
      dragHandle,
      starBtn,
      label,
      minus,
      valueEl,
      plus,
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

    attachRepeat(minus, function () { stepRow(row, valueEl, -ROW_STEP, ctx); });
    attachRepeat(plus, function () { stepRow(row, valueEl, ROW_STEP, ctx); });
    attachValueDrag(valueEl, row, ctx);

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

  K.presetRow = { render: renderRow };
})();
