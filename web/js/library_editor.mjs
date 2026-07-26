/* Library editor dialog
 *
 * Opens from the wizard's "Library" button. Provides:
 * - Category tabs
 * - Global search
 * - Add / Edit / Duplicate / Delete / Disable / Favourite
 * - Import / Export
 * - Restore bundled defaults
 * - Show user presets / bundled presets / verified presets filter
 * - Edit as Text (line-based)
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, escapeHtml, debounce } = K.helpers;
  const { CATEGORIES, CATEGORY_LABELS } = K.constants;

  function openEditor(ctx) {
    const overlay = el("div", { class: "krea2-library-overlay", onClick: function (e) {
      if (e.target === overlay) close();
    } });
    const dialog = el("div", { class: "krea2-library-dialog" });
    overlay.appendChild(dialog);

    const header = el("div", { class: "krea2-library-header" }, [
      el("h2", null, "Krea2 Prompt Wizard — Library"),
      el("button", { type: "button", class: "krea2-library-close", onClick: close }, "Close"),
    ]);
    dialog.appendChild(header);

    const tabs = el("div", { class: "krea2-library-tabs" });
    function makeTab(label, value) {
      return el("button", {
        type: "button",
        class: "krea2-library-tab",
        dataset: { value: value },
        onClick: function () {
          for (const t of tabs.querySelectorAll(".krea2-library-tab")) {
            t.classList.toggle("is-active", t.dataset.value === value);
          }
          renderList();
        },
      }, label);
    }
    tabs.appendChild(makeTab("All", "all"));
    for (const c of CATEGORIES) {
      tabs.appendChild(makeTab(CATEGORY_LABELS[c] || c, c));
    }
    dialog.appendChild(tabs);

    const toolbar = el("div", { class: "krea2-library-toolbar" });
    const search = el("input", {
      type: "text",
      placeholder: "Search label, phrase, alias, category...",
      class: "krea2-library-search",
      onInput: debounce(renderList, 80),
    });
    const filterSelect = el("select", {
      class: "krea2-library-filter",
      onChange: renderList,
    }, [
      el("option", { value: "all" }, "All presets"),
      el("option", { value: "user" }, "User presets"),
      el("option", { value: "bundled" }, "Bundled presets"),
      el("option", { value: "verified" }, "Verified only"),
      el("option", { value: "favourite" }, "Favourites"),
    ]);

    toolbar.appendChild(search);
    toolbar.appendChild(filterSelect);

    const addBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { addPreset(); } }, "Add Preset");
    const editTextBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { openEditAsText(); } }, "Edit as Text");
    const importBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { importLibrary(); } }, "Import");
    const exportBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { exportLibrary(); } }, "Export");
    const restoreBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { restoreDefaults(); } }, "Restore Bundled Defaults");

    toolbar.appendChild(addBtn);
    toolbar.appendChild(editTextBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(restoreBtn);

    dialog.appendChild(toolbar);

    const list = el("div", { class: "krea2-library-list" });
    dialog.appendChild(list);

    const status = el("div", { class: "krea2-library-status" }, "");
    dialog.appendChild(status);

    function currentTab() {
      const t = tabs.querySelector(".krea2-library-tab.is-active");
      return t ? t.dataset.value : "all";
    }

    function renderList() {
      list.innerHTML = "";
      const q = (search.value || "").toLowerCase();
      const tab = currentTab();
      const filter = filterSelect.value || "all";
      const presets = (ctx.library || []).slice();
      const filtered = presets.filter(function (p) {
        if (tab !== "all" && p.category !== tab) return false;
        if (filter === "user" && p.origin !== "user") return false;
        if (filter === "bundled" && p.origin !== "bundled") return false;
        if (filter === "verified" && !(p.verification || "").toLowerCase().includes("verified")) return false;
        if (filter === "favourite" && !p.favourite) return false;
        if (!q) return true;
        const hay = [p.label || "", p.phrase || "", (p.aliases || []).join(" "), p.id || ""].join(" ").toLowerCase();
        return hay.includes(q);
      });

      if (filtered.length === 0) {
        list.appendChild(el("div", { class: "krea2-library-empty" }, "No presets match."));
        return;
      }
      for (const p of filtered) {
        list.appendChild(renderRow(p));
      }
    }

    function renderRow(preset) {
      const wrap = el("div", { class: "krea2-library-item", dataset: { id: preset.id, category: preset.category } });
      const title = el("div", { class: "krea2-library-title" }, preset.label || preset.id);
      const id = el("div", { class: "krea2-library-subtitle" }, preset.id || "");
      const meta = el("div", { class: "krea2-library-meta" }, [
        el("span", null, CATEGORY_LABELS[preset.category] || preset.category || "?"),
        el("span", null, "Phrase: " + (preset.phrase || "(none)")),
        el("span", null, "Verification: " + (preset.verification || "general visual vocabulary")),
      ]);
      const actions = el("div", { class: "krea2-library-actions" });
      if (preset.origin === "user") {
        actions.appendChild(makeBtn("Edit", function () { editPreset(preset.id); }));
        actions.appendChild(makeBtn("Duplicate", function () { duplicatePreset(preset.id); }));
        actions.appendChild(makeBtn("Delete", function () { deletePreset(preset.id); }));
      } else {
        actions.appendChild(makeBtn("Duplicate to User", function () { duplicateToUser(preset.id); }));
      }
      actions.appendChild(makeBtn("Toggle Favourite", function () { toggleFavourite(preset.id); }));
      if (preset.origin === "user") {
        actions.appendChild(makeBtn(preset.disabled ? "Enable" : "Disable", function () { toggleDisabled(preset.id); }));
      }
      wrap.appendChild(title);
      wrap.appendChild(id);
      wrap.appendChild(meta);
      wrap.appendChild(actions);
      return wrap;
    }

    function makeBtn(label, onClick) {
      return el("button", { type: "button", class: "krea2-library-btn-small", onClick: onClick }, label);
    }

    function addPreset() {
      const preset = {
        id: "custom." + Date.now().toString(16),
        category: "custom",
        label: "New preset",
        phrase: "your phrase",
        default_strength: 0,
        control_mode: "scalar",
        aliases: [],
        verification: "general visual vocabulary",
        schema_version: 1,
        origin: "user",
      };
      ctx.library.push(preset);
      ctx.markDirty();
      renderList();
      status.textContent = "Added. Edit the preset inline below.";
      editPreset(preset.id);
    }

    function editPreset(presetId) {
      const preset = ctx.library.find(function (p) { return p.id === presetId; });
      if (!preset) return;
      const fields = [
        { key: "label", label: "Label", type: "text" },
        { key: "phrase", label: "Phrase", type: "text" },
        { key: "category", label: "Category", type: "select", options: CATEGORIES },
        { key: "default_strength", label: "Default strength (-100..100)", type: "number" },
        { key: "control_mode", label: "Mode", type: "select", options: ["scalar", "bipolar", "raw"] },
        { key: "aliases", label: "Aliases (comma-separated)", type: "text", split: true },
        { key: "positive_phrase", label: "Positive phrase (bipolar)", type: "text" },
        { key: "negative_phrase", label: "Negative phrase (bipolar)", type: "text" },
        { key: "neutral_phrase", label: "Neutral phrase (bipolar)", type: "text" },
        { key: "verification", label: "Verification", type: "select", options: [
          "general visual vocabulary",
          "community reported",
          "locally tested",
          "krea2_turbo verified",
          "krea2_raw verified",
          "unreliable",
          "deprecated",
        ] },
        { key: "source", label: "Source", type: "text" },
        { key: "notes", label: "Notes", type: "textarea" },
      ];

      const form = el("div", { class: "krea2-library-form" });
      for (const f of fields) {
        let input;
        const value = preset[f.key];
        if (f.type === "select") {
          input = el("select", null, (f.options || []).map(function (opt) {
            return el("option", { value: opt, selected: opt === value }, opt);
          }));
        } else if (f.type === "textarea") {
          input = el("textarea", { rows: "2" }, value || "");
        } else if (f.type === "number") {
          input = el("input", { type: "number", value: value != null ? value : 0, min: -100, max: 100, step: 1 });
        } else {
          input = el("input", { type: "text", value: f.split && Array.isArray(value) ? value.join(", ") : (value || "") });
        }
        form.appendChild(el("label", null, [f.label, input]));
        input.addEventListener("change", function () {
          let v = input.value;
          if (f.type === "number") v = parseInt(v, 10) || 0;
          if (f.split && typeof v === "string") v = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          preset[f.key] = v;
          ctx.markDirty();
        });
      }
      const closeBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: closeForm }, "Done");
      const removeBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { deletePreset(preset.id); closeForm(); } }, "Delete");
      const cancelBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: closeForm }, "Cancel");

      const formWrap = el("div", { class: "krea2-library-formwrap" }, [form, el("div", { class: "krea2-library-form-actions" }, [closeBtn, removeBtn, cancelBtn])]);
      list.appendChild(formWrap);

      function closeForm() {
        if (formWrap.parentNode) formWrap.parentNode.removeChild(formWrap);
        renderList();
      }
    }

    function duplicatePreset(presetId) {
      const idx = ctx.library.findIndex(function (p) { return p.id === presetId; });
      if (idx < 0) return;
      const copy = JSON.parse(JSON.stringify(ctx.library[idx]));
      copy.id = (copy.id || "preset") + "_copy_" + Date.now().toString(16);
      copy.label = (copy.label || "Preset") + " (Copy)";
      copy.origin = "user";
      ctx.library.splice(idx + 1, 0, copy);
      ctx.markDirty();
      renderList();
    }

    function duplicateToUser(presetId) {
      const src = ctx.library.find(function (p) { return p.id === presetId; });
      if (!src) return;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = "user." + (src.id || "preset") + "_" + Date.now().toString(16);
      copy.origin = "user";
      ctx.library.push(copy);
      ctx.markDirty();
      renderList();
    }

    function deletePreset(presetId) {
      const idx = ctx.library.findIndex(function (p) { return p.id === presetId; });
      if (idx < 0) return;
      if (!window.confirm("Delete preset '" + presetId + "'?")) return;
      ctx.library.splice(idx, 1);
      ctx.markDirty();
      renderList();
    }

    function toggleFavourite(presetId) {
      const p = ctx.library.find(function (pr) { return pr.id === presetId; });
      if (!p) return;
      p.favourite = !p.favourite;
      ctx.markDirty();
      renderList();
    }

    function toggleDisabled(presetId) {
      const p = ctx.library.find(function (pr) { return pr.id === presetId; });
      if (!p) return;
      p.disabled = !p.disabled;
      ctx.markDirty();
      renderList();
    }

    function openEditAsText() {
      const lines = formatLibraryAsText(ctx.library);
      const ta = el("textarea", { class: "krea2-library-textarea", rows: "20" }, lines);
      const saveBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () {
        try {
          const parsed = parseLibraryAsText(ta.value);
          ctx.library = parsed.concat(ctx.library.filter(function (p) { return p.origin === "bundled"; }));
          ctx.markDirty();
          renderList();
          status.textContent = "Imported " + parsed.length + " presets.";
        } catch (e) {
          status.textContent = "Error: " + e.message;
        }
      } }, "Apply");
      const cancelBtn = el("button", { type: "button", class: "krea2-library-btn", onClick: function () { closeForm(); } }, "Cancel");
      const wrap = el("div", { class: "krea2-library-formwrap" }, [ta, el("div", { class: "krea2-library-form-actions" }, [saveBtn, cancelBtn])]);
      list.appendChild(wrap);
      function closeForm() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    }

    function importLibrary() {
      const input = el("input", { type: "file", accept: ".json" });
      input.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const data = JSON.parse(reader.result);
            const incoming = Array.isArray(data) ? data : (data.presets || []);
            const userOnly = incoming.filter(function (p) { return p.origin !== "bundled"; });
            ctx.library = ctx.library.concat(userOnly);
            ctx.markDirty();
            renderList();
            status.textContent = "Imported " + userOnly.length + " presets.";
          } catch (err) {
            status.textContent = "Import failed: " + err.message;
          }
        };
        reader.readAsText(file);
      });
      input.click();
    }

    function exportLibrary() {
      const userOnly = ctx.library.filter(function (p) { return p.origin === "user"; });
      const payload = JSON.stringify({ schema_version: 1, presets: userOnly }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: "user_library.json" });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function restoreDefaults() {
      if (!window.confirm("Restore bundled defaults? Your user library will be backed up and replaced.")) return;
      ctx.restoreBundledDefaults = true;
      ctx.markDirty();
      renderList();
      status.textContent = "Bundled defaults restored. Changes apply on Save.";
    }

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      ctx.close();
    }

    document.body.appendChild(overlay);
    renderList();
    return { close: close };
  }

  function formatLibraryAsText(library) {
    const lines = [
      "# Krea2 Prompt Wizard — Edit as Text format",
      "# Label | Phrase | Default Strength | Mode | Aliases | Notes",
      "# Use 'pos:<text>' and 'neg:<text>' notes for bipolar rows.",
      "#",
    ];
    for (const p of library) {
      if (!p || p.origin !== "user") continue;
      const label = p.label || "";
      const phrase = p.phrase || "";
      const ds = parseInt(p.default_strength, 10) || 0;
      const mode = p.control_mode || "scalar";
      const aliases = (p.aliases || []).join(",");
      const bits = [];
      if (p.positive_phrase) bits.push("pos:" + p.positive_phrase);
      if (p.negative_phrase) bits.push("neg:" + p.negative_phrase);
      if (p.notes) bits.push(p.notes);
      const notes = bits.join(";");
      lines.push([label, phrase, ds, mode, aliases, notes].join(" | "));
    }
    return lines.join("\n") + "\n";
  }

  function parseLibraryAsText(text) {
    const out = [];
    for (const rawLine of (text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("|").map(function (p) { return p.trim(); });
      if (parts.length < 3) throw new Error("Invalid line: " + rawLine);
      const label = parts[0];
      const phrase = parts[1];
      const ds = parseInt(parts[2], 10) || 0;
      const mode = parts[3] || "scalar";
      const aliases = (parts[4] || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      const notes = parts[5] || "";
      const slug = (label || "custom").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const preset = {
        id: "custom." + slug + "_" + Date.now().toString(16),
        label: label,
        phrase: phrase,
        category: "custom",
        default_strength: Math.max(-100, Math.min(100, ds)),
        control_mode: ["scalar", "bipolar", "raw"].includes(mode) ? mode : "scalar",
        aliases: aliases,
        verification: "general visual vocabulary",
        schema_version: 1,
        origin: "user",
      };
      if (mode === "bipolar") {
        for (const note of notes.split(";")) {
          const n = note.trim();
          if (n.toLowerCase().startsWith("pos:")) preset.positive_phrase = n.slice(4).trim();
          else if (n.toLowerCase().startsWith("neg:")) preset.negative_phrase = n.slice(4).trim();
        }
        preset.neutral_phrase = phrase;
      }
      out.push(preset);
    }
    return out;
  }

  K.libraryEditor = { open: openEditor };
})();
