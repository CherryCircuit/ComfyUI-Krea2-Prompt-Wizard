/* Compact concept card with live two-column board reordering. */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el } = K.helpers;

  function displayStrength(row) {
    if (Number.isFinite(Number(row.strength))) return Number(row.strength);
    return Math.max(-3, Math.min(3, (Number(row.intensity) || 0) / 20));
  }

  function storedStrength(value) {
    return Math.round(Math.max(-3, Math.min(3, Number(value) || 0)) * 4) / 4;
  }

  function showColorPicker(anchor, presetId, onPick) {
    const existing = document.querySelector(".krea2-color-picker-menu");
    if (existing) existing.remove();
    const menu = el("div", { class: "krea2-color-picker-menu" }, [
      makeColorOption("🔴 Red", "red"),
      makeColorOption("🟠 Orange", "orange"),
      makeColorOption("🟡 Yellow", "yellow"),
      makeColorOption("🟢 Green", "green"),
      makeColorOption("🔵 Blue", "blue"),
      makeColorOption("🩷 Pink", "pink"),
      makeColorOption("❌ Clear", ""),
    ]);
    function makeColorOption(label, val) {
      return el("button", {
        type: "button",
        class: "krea2-color-option",
        style: {
          background: "transparent",
          border: "0",
          color: "var(--krea2-text)",
          textAlign: "left",
          padding: "3px 6px",
          borderRadius: "3px",
          cursor: "pointer",
        },
        onClick: function (e) {
          e.stopPropagation();
          onPick(val);
          menu.remove();
        },
      }, label);
    }
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
    }, "⠿");

    const starBtn = el("button", {
      type: "button",
      class: "krea2-star-btn" + (color ? " color-" + color + " is-starred" : ""),
      title: "Star concept with macOS color tag",
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
    }, "★");

    const label = el("button", {
      type: "button",
      class: "krea2-row-label",
      title: "Replace this concept",
      onClick: function () { ctx.editRow(row); },
    }, row.label || row.preset_id || "Concept");

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
    });

    const remove = el("button", {
      type: "button",
      class: "krea2-row-remove krea2-danger",
      title: "Delete concept",
      "aria-label": "Delete concept",
      onClick: function () { ctx.removeRow(row.id); },
    }, "×");

    const initial = displayStrength(row);
    row.strength = storedStrength(initial);
    const slider = el("input", {
      type: "range",
      class: "krea2-row-intensity",
      min: "-3",
      max: "3",
      step: "0.25",
      value: String(initial),
      title: "Adjust concept strength from -3 to +3",
      "aria-label": "Concept strength",
      onInput: function (event) {
        row.strength = storedStrength(event.target.value);
        number.value = String(row.strength);
        ctx.markDirty();
      },
    });

    const number = el("input", {
      type: "number",
      class: "krea2-row-numeric",
      min: "-3",
      max: "3",
      step: "0.25",
      value: String(initial),
      title: "Set concept strength from -3 to +3",
      "aria-label": "Concept strength value",
      onInput: function (event) {
        row.strength = storedStrength(event.target.value);
        slider.value = String(row.strength);
        event.target.value = String(row.strength);
        ctx.markDirty();
      },
    });

    wrap.appendChild(el("div", { class: "krea2-row-head" }, [
      dragHandle,
      starBtn,
      label,
      slider,
      number,
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

  K.presetRow = { render: renderRow };
})();
