/* Compact concept card with live two-column board reordering. */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el } = K.helpers;

  function displayStrength(row) {
    if (Number.isFinite(Number(row.strength))) return Number(row.strength);
    return Math.max(-5, Math.min(5, (Number(row.intensity) || 0) / 20));
  }

  function storedStrength(value) {
    return Math.round(Math.max(-5, Math.min(5, Number(value) || 0)) * 4) / 4;
  }

  function renderRow(row, ctx) {
    const wrap = el("div", {
      class: "krea2-row",
      dataset: { rowId: row.id, category: row.category },
    });

    const dragHandle = el("button", {
      type: "button",
      class: "krea2-row-drag",
      title: "Drag concept to reorder",
      "aria-label": "Drag concept to reorder",
    }, "⠿");

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
      class: "krea2-row-remove",
      title: "Delete concept",
      "aria-label": "Delete concept",
      onClick: function () { ctx.removeRow(row.id); },
    }, "×");

    const initial = displayStrength(row);
    row.strength = storedStrength(initial);
    const slider = el("input", {
      type: "range",
      class: "krea2-row-intensity",
      min: "-5",
      max: "5",
      step: "0.25",
      value: String(initial),
      title: "Adjust concept strength from -5 to +5",
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
      min: "-5",
      max: "5",
      step: "0.25",
      value: String(initial),
      title: "Set concept strength from -5 to +5",
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
      label,
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
    wrap.appendChild(el("div", { class: "krea2-row-controls" }, [
      slider,
      number,
    ]));

    dragHandle.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      const parent = wrap.parentNode;
      if (!parent) return;
      const rect = wrap.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const placeholder = el("div", { class: "krea2-row-placeholder" });
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

      function onMove(moveEvent) {
        wrap.style.left = (moveEvent.clientX - offsetX) + "px";
        wrap.style.top = (moveEvent.clientY - offsetY) + "px";
        const candidates = Array.from(parent.querySelectorAll(".krea2-row")).filter(function (card) {
          return card !== wrap;
        });
        let targetRow = null;
        let nearestDistance = Infinity;
        for (const card of candidates) {
          const cardRect = card.getBoundingClientRect();
          const dx = moveEvent.clientX - (cardRect.left + cardRect.width / 2);
          const dy = moveEvent.clientY - (cardRect.top + cardRect.height / 2);
          const distance = dx * dx + dy * dy;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            targetRow = card;
          }
        }
        if (targetRow) {
          const targetRect = targetRow.getBoundingClientRect();
          const verticalOffset = moveEvent.clientY - (targetRect.top + targetRect.height / 2);
          const before = verticalOffset < -targetRect.height / 3
            || (
              Math.abs(verticalOffset) <= targetRect.height / 3
              && moveEvent.clientX < targetRect.left + targetRect.width / 2
            );
          parent.insertBefore(placeholder, before ? targetRow : targetRow.nextSibling);
        } else {
          parent.appendChild(placeholder);
        }
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        parent.insertBefore(wrap, placeholder);
        placeholder.remove();
        wrap.classList.remove("is-dragging");
        for (const property of [
          "position", "left", "top", "width", "height", "zIndex", "pointerEvents",
        ]) {
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
