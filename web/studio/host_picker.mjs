/**
 * Host picker for the Prompt Studio.
 *
 * When an attachable preset (outfit, emotion) is inserted and the prompt
 * contains more than one character token, this panel asks which character
 * the preset belongs to. Also offers a standalone insertion escape hatch.
 */
import { el, anchoredPanel } from "./ui.mjs?v=2";
import { presetStore } from "./preset_store.mjs?v=2";

/**
 * @param {{
 *   onPick: (hostRange: object | null) => void,
 * }} options
 */
export function createHostPicker({ onPick }) {
  let panel = null;

  function open({ anchorRect, hostCandidates }) {
    close();

    const title = el("div", "kpw2-panel-title", "Attach to which character?");
    const list = el("div", "kpw2-popup-list");

    for (const candidate of hostCandidates) {
      const preset = presetStore.get(candidate.id);
      const row = el("button", "kpw2-popup-row");
      row.type = "button";
      row.append(
        el("span", `kpw2-dot ${preset ? `kpw2-cat-${preset.category}` : "kpw2-cat-other"}`),
        el("span", "kpw2-popup-name", preset ? preset.name : candidate.id)
      );
      row.addEventListener("click", () => {
        const range = { start: candidate.start, end: candidate.end, id: candidate.id, host: "" };
        close();
        onPick(range);
      });
      list.append(row);
    }

    const footer = el("div", "kpw2-popup-footer");
    const standalone = el("button", "kpw2-ghost-button", "Insert without character");
    standalone.type = "button";
    standalone.addEventListener("click", () => {
      close();
      onPick(null);
    });
    const cancel = el("button", "kpw2-ghost-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => close());
    footer.append(standalone, cancel);

    const body = el("div", "kpw2-token-popup");
    body.append(title, list, footer);

    panel = anchoredPanel("chooser", anchorRect, () => body, { width: 280 });
  }

  function close() {
    if (panel) {
      const target = panel;
      panel = null;
      target.destroy();
    }
  }

  return {
    open,
    close,
    get isOpen() {
      return panel != null;
    },
  };
}
