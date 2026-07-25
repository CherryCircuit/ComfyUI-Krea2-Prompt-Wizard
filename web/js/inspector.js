/* Inspector frontend rendering
 *
 * Renders the wizard's compiled trace and warnings into a Show Work
 * panel. The backend's Krea2PromptInspector node produces the same
 * output; this module just visualises it inline.
 */
(function () {
  "use strict";

  const K = window.KREA2;
  const { el, escapeHtml, CATEGORY_LABELS } = K.helpers;

  function renderShowWork(state, compiled) {
    const wrap = el("div", { class: "krea2-show-work" });
    const header = el("div", { class: "krea2-show-work-header" }, [
      el("h3", null, "Show Work"),
      makeBtn("Copy Final", function () { copy(compiled.final_prompt); }),
      makeBtn("Copy Plain", function () { copy(compiled.plain_prompt); }),
      makeBtn("Copy Trace", function () { copy(JSON.stringify(compiled, null, 2)); }),
    ]);
    wrap.appendChild(header);

    if (compiled.warnings && compiled.warnings.length) {
      const warnBlock = el("div", { class: "krea2-show-work-warnings" });
      warnBlock.appendChild(el("h4", null, "Warnings"));
      for (const w of compiled.warnings) {
        const div = el("div", { class: "krea2-show-work-warning " + (w.severity || "warning") }, [
          el("strong", null, "[" + (w.severity || "warning") + "] "),
          el("span", null, w.code || ""),
          w.message ? el("span", null, " — " + w.message) : null,
        ]);
        warnBlock.appendChild(div);
      }
      wrap.appendChild(warnBlock);
    }

    const table = el("table", { class: "krea2-show-work-table" });
    const thead = el("thead", null, [
      el("tr", null, [
        el("th", null, "Category"),
        el("th", null, "Selection"),
        el("th", null, "Mode"),
        el("th", null, "Slider"),
        el("th", null, "Weight"),
        el("th", null, "Fragment"),
        el("th", null, "Verification"),
      ]),
    ]);
    table.appendChild(thead);
    const tbody = el("tbody", null);
    for (const f of compiled.fragments) {
      const tr = el("tr", null, [
        el("td", null, CATEGORY_LABELS[f.category] || f.category),
        el("td", null, f.label || f.preset_id || ""),
        el("td", null, f.mode || "scalar"),
        el("td", null, f.slider != null ? String(f.slider) : ""),
        el("td", null, typeof f.weight === "number" ? f.weight.toFixed(2) : ""),
        el("td", { class: "krea2-row-fragment" }, f.fragment),
        el("td", null, f.verification || "general visual vocabulary"),
      ]);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);

    return wrap;
  }

  function makeBtn(label, onclick) {
    return el("button", { type: "button", class: "krea2-show-work-btn", onClick: onclick }, label);
  }

  function copy(text) {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        K.helpers.showToast("Copied", "info");
      }, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {
      console.warn("[Krea2PromptWizard] copy failed", e);
    }
    document.body.removeChild(ta);
  }

  K.inspectorView = { render: renderShowWork };
})();
