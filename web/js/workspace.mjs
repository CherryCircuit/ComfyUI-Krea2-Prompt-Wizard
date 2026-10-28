/* Shared workspace controls. The embedded and focused editor move the same DOM. */
(function () {
  "use strict";
  const K = window.KREA2;
  const { el, icon } = K.helpers;
  function button(label, action, attrs) {
    return el("button", Object.assign({ type: "button", class: "krea2-wizard-btn", onClick: action }, attrs || {}), label);
  }
  /* Icon-only action button. The visible meaning lives in the tooltip and
   * the accessible label so wordy controls can collapse to a single glyph. */
  function iconButton(name, title, action, attrs) {
    return el("button", Object.assign({
      type: "button",
      class: "krea2-wizard-btn krea2-icon-btn",
      title: title,
      "aria-label": title,
      onClick: action,
    }, attrs || {}), icon(name, { width: "13", height: "13" }));
  }
  /* Icon toggle (shuffle/lock style): pressed state carries the meaning. */
  function iconToggle(name, title, active, change, attrs) {
    const toggle = el("button", Object.assign({
      type: "button",
      class: "krea2-wizard-btn krea2-icon-btn" + (active ? " is-active" : ""),
      title: title,
      "aria-label": title,
      "aria-pressed": active ? "true" : "false",
      onClick: () => change(!active),
    }, attrs || {}), icon(name, { width: "13", height: "13" }));
    return toggle;
  }
  function check(label, checked, change) {
    return el("label", { class: "krea2-inline-check" }, [el("input", { type: "checkbox", checked: !!checked, onChange: event => change(!!event.target.checked) }), el("span", null, label)]);
  }
  function field(label, value, change, multiline) {
    const input = el(multiline ? "textarea" : "input", { class: "krea2-compact-input", "aria-label": label, value: value ?? "", onInput: event => change(event.target.value) });
    if (multiline) input.value = value ?? "";
    return el("label", { class: "krea2-workspace-field" }, [el("span", null, label), input]);
  }
  function section(id, title, summary, open, toggle, content) {
    const body = el("div", { class: "krea2-workspace-section-body" });
    if (open) body.appendChild(content());
    return el("section", { class: "krea2-workspace-section", dataset: { sectionId: id } }, [
      button(title, toggle, { class: "krea2-workspace-heading", "aria-expanded": String(open), "aria-controls": "krea2-section-" + id }),
      el("span", { class: "krea2-workspace-summary" }, summary), body,
    ]);
  }
  function nameDialog(options) {
    const overlay = el("div", { class: "krea2-workspace-overlay" });
    const panel = el("div", { class: "krea2-workspace-dialog krea2-workspace-name-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Save preset" });
    const previousFocus = document.activeElement;
    const input = el("input", { type: "text", class: "krea2-compact-input", "aria-label": "Preset name", value: options.value || "", placeholder: "Give this preset a name", maxLength: 160 });
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    let closed = false;
    function close(value = "") {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      previousFocus?.focus?.();
      resolveResult(value);
    }
    function save() { if (input.value.trim()) close(input.value.trim()); else input.focus?.(); }
    const saveButton = button("Save", save, { disabled: !input.value.trim() });
    const cancelButton = button("Cancel", () => close());
    function onKey(event) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault?.(); event.stopImmediatePropagation?.();
        if (event.key === "Escape") close(); else save();
      } else if (event.key === "Tab") {
        const controls = [input, cancelButton, saveButton].filter(control => !control.disabled);
        const index = controls.indexOf(document.activeElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === controls.length - 1)) {
          event.preventDefault?.(); controls[event.shiftKey ? controls.length - 1 : 0].focus?.();
        }
      }
    }
    input.addEventListener("input", () => { saveButton.disabled = !input.value.trim(); });
    panel.appendChild(el("strong", null, options.title || "Save preset"));
    panel.appendChild(el("label", { class: "krea2-workspace-field" }, [el("span", null, "Preset name"), input]));
    panel.appendChild(el("div", { class: "krea2-workspace-actions" }, [cancelButton, saveButton]));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    input.focus?.(); input.select?.();
    return { result, close };
  }
  function textDialog(options) {
    const overlay = el("div", { class: "krea2-workspace-overlay" });
    const panel = el("div", { class: "krea2-workspace-dialog", role: "dialog", "aria-modal": "true", "aria-label": options.title || "Edit text" });
    const previousFocus = document.activeElement;
    const input = el(options.multiline ? "textarea" : "input", { class: "krea2-compact-input", "aria-label": options.label || options.title || "Text" });
    input.value = options.value || "";
    if (options.multiline) input.rows = "5";
    let closed = false;
    function close(saved) {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      previousFocus?.focus?.();
      if (saved) options.onSave?.(input.value);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault?.(); event.stopImmediatePropagation?.();
        close(false);
      }
    }
    panel.appendChild(el("strong", null, options.title || "Edit text"));
    if (options.note) panel.appendChild(el("p", null, options.note));
    panel.appendChild(el("label", { class: "krea2-workspace-field" }, [el("span", null, options.label || "Text"), input]));
    panel.appendChild(el("div", { class: "krea2-workspace-actions" }, [button("Cancel", () => close(false)), button("Save", () => close(true))]));
    overlay.appendChild(panel);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(false); });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    input.focus?.();
    return { close };
  }
  function chooser(options) {
    const overlay = el("div", { class: "krea2-workspace-overlay" });
    const panel = el("div", { class: "krea2-workspace-dialog", role: "dialog", "aria-modal": "true", "aria-label": options.title || "Presets" });
    const search = el("input", { type: "search", class: "krea2-compact-input", placeholder: "Search names, phrases and categories", "aria-label": "Search presets" });
    const list = el("div", { class: "krea2-workspace-chooser-list" });
    const filters = el("select", { "aria-label": "Preset list", class: "krea2-compact-select" }, [el("option", { value: "all" }, "All presets"), el("option", { value: "favorites" }, "Favorites"), el("option", { value: "recents" }, "Recent")]);
    let selected = null;
    const editor = el("div", { class: "krea2-workspace-preset-editor" });
    const close = () => { document.removeEventListener("keydown", escape); overlay.remove(); options.onClose?.(); };
    function escape(event) { if (event.key === "Escape") close(); }
    function render() {
      list.innerHTML = "";
      const prefs = options.preferences();
      const favorites = prefs.favorites || [];
      const recent = prefs.recents || [];
      let entries = options.entries().filter(entry => {
        const searchable = JSON.stringify([entry.label, entry.group, entry.scope, entry.rows]).toLowerCase();
        return (!search.value || searchable.includes(search.value.toLowerCase()))
          && (filters.value !== "favorites" || favorites.includes(entry.id))
          && (filters.value !== "recents" || recent.includes(entry.id));
      });
      entries.sort((a,b) => filters.value === "recents" ? recent.indexOf(a.id) - recent.indexOf(b.id) : String(a.label).localeCompare(String(b.label)));
      for (const entry of entries) {
        const item = el("div", { class: "krea2-workspace-preset-item" });
        item.appendChild(button((favorites.includes(entry.id) ? "★ " : "☆ ") + (entry.label || "Untitled"), () => { selected = entry; edit(entry); }, { class: "krea2-workspace-preset-name" }));
        item.appendChild(el("small", null, [entry.scope || "concept", entry.group || "", entry.builtin ? "Built in" : "Saved"].filter(Boolean).join(" · ")));
        item.appendChild(button(favorites.includes(entry.id) ? "Unfavorite" : "Favorite", () => { options.favorite(entry.id); render(); }));
        item.appendChild(button("Apply", () => { options.apply(entry); close(); }));
        list.appendChild(item);
      }
      if (!entries.length) list.appendChild(el("p", null, "No matching presets."));
    }
    function edit(entry) {
      editor.innerHTML = "";
      let label = entry.label || "";
      editor.appendChild(field("Preset name", label, value => { label = value; }));
      editor.appendChild(button("Edit in workspace", () => { options.edit(entry); close(); }));
      editor.appendChild(button("Duplicate / Save as", () => { options.save(Object.assign({}, entry, { label: label.trim() || entry.label }), true); render(); editor.innerHTML = ""; }));
      if (!entry.builtin) {
        editor.appendChild(button("Rename", () => { options.save(Object.assign({}, entry, { label: label.trim() || entry.label }), false); render(); editor.innerHTML = ""; }));
        editor.appendChild(button("Update from current workspace", () => { options.update(entry, label.trim() || entry.label); render(); editor.innerHTML = ""; }));
        editor.appendChild(button("Delete", () => { options.remove(entry); editor.innerHTML = ""; render(); }));
      }
    }
    panel.appendChild(el("div", { class: "krea2-workspace-dialog-heading" }, [el("strong", null, options.title || "Preset chooser"), button("Close", close)]));
    panel.appendChild(el("div", { class: "krea2-workspace-actions" }, [search, filters, button("Create from current", async () => { await options.create(); render(); })]));
    if (options.controls) panel.appendChild(options.controls);
    panel.appendChild(list); panel.appendChild(editor); overlay.appendChild(panel);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    search.addEventListener("input", render); filters.addEventListener("change", render);
    document.body.appendChild(overlay); document.addEventListener("keydown", escape);
    render(); search.focus?.();
    return { close, render };
  }
  K.workspace = { button, iconButton, iconToggle, check, field, section, chooser, nameDialog, textDialog };
})();
