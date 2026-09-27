/**
 * Small shared UI helpers for the Prompt Studio components.
 * Deliberately dependency-free so every panel/modal behaves the same.
 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Create a dismissible floating panel anchored to a rect. Only one panel
 * is open at a time per layer ("chooser" | "popup").
 */
const openPanels = new Map();

export function closePanel(layer) {
  const panel = openPanels.get(layer);
  if (panel) {
    panel.destroy();
  }
}

export function anchoredPanel(layer, anchorRect, buildContent, { onClose = () => {}, width = 280 } = {}) {
  closePanel(layer);

  const panel = el("div", "kpw2-panel");
  panel.style.width = `${width}px`;
  const content = buildContent(panel) || panel;
  if (content !== panel) panel.append(content);
  document.body.append(panel);

  // Position within the viewport (below the anchor by default, flipping up
  // when there is not enough room).
  const bounds = panel.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = Math.min(Math.max(8, anchorRect.left), viewportW - bounds.width - 8);
  let top = anchorRect.bottom + 6;
  if (top + bounds.height > viewportH - 8) {
    top = Math.max(8, anchorRect.top - bounds.height - 6);
  }
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  function onOutside(event) {
    if (!panel.contains(event.target)) {
      destroy();
    }
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      destroy();
    }
  }

  function destroy() {
    openPanels.delete(layer);
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    panel.remove();
    onClose();
  }

  openPanels.set(layer, { destroy });
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return { panel, destroy };
}

/** Full-screen overlay modal with a centered dialog. Returns {dialog, close}. */
export function openModal(className = "") {
  const overlay = el("div", `kpw2-modal-overlay ${className}`);
  const dialog = el("div", "kpw2-modal");
  overlay.append(dialog);

  function close() {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  }
  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  return { overlay, dialog, close };
}

/** Clipboard write with a textarea fallback for non-secure contexts. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = el("textarea");
    scratch.value = text;
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.append(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    scratch.remove();
    return ok;
  }
}
