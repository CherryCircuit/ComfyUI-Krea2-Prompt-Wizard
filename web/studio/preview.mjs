/**
 * "Preview Expanded" modal: shows exactly what the node will output, with
 * copy buttons for each of the three STRING outputs.
 */
import { el, openModal, copyText } from "./ui.mjs?v=1";
import { compileDocument } from "./tokenizer.mjs?v=1";
import { presetStore } from "./preset_store.mjs?v=1";

function section(label, text, copyButton) {
  const wrap = el("div", "kpw2-preview-section");
  const head = el("div", "kpw2-preview-head");
  head.append(el("div", "kpw2-preview-label", label), copyButton ?? el("span"));
  const body = el("div", "kpw2-preview-body", text || "—");
  wrap.append(head, body);
  return wrap;
}

function copyButtonFor(getText) {
  const button = el("button", "kpw2-ghost-button", "Copy");
  button.type = "button";
  button.addEventListener("click", async () => {
    const ok = await copyText(getText());
    button.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  });
  return button;
}

/** @param {{doc: string}} options */
export function showPreviewModal({ doc }) {
  const compiled = compileDocument(doc, (id) => presetStore.lookup(id));
  const { dialog, close } = openModal("kpw2-preview-modal");

  const header = el("div", "kpw2-modal-header");
  header.append(el("div", "kpw2-modal-title", "Expanded prompt"));
  const closeButton = el("button", "kpw2-ghost-button", "Close");
  closeButton.type = "button";
  closeButton.addEventListener("click", close);
  header.append(closeButton);

  const body = el("div", "kpw2-modal-body kpw2-preview-bodywrap");
  body.append(
    section("prompt", compiled.prompt, copyButtonFor(() => compiled.prompt)),
    section("negative", compiled.negative, copyButtonFor(() => compiled.negative)),
    section("raw_prompt", compiled.raw, copyButtonFor(() => compiled.raw))
  );
  if (compiled.missingIds.length) {
    body.append(
      el(
        "div",
        "kpw2-preview-warning",
        `Unresolved presets: ${compiled.missingIds.join(", ")} — they appear as [MISSING: …] in the output.`
      )
    );
  }

  const footer = el("div", "kpw2-modal-footer");
  const note = el(
    "div",
    "kpw2-modal-note",
    "This is the exact text the node emits at run time. Presets are read fresh from disk on each execution."
  );
  footer.append(note);

  dialog.append(header, body, footer);
  return { close };
}
