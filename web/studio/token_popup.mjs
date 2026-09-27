/**
 * Token click-popup for the Prompt Studio.
 *
 * Clicking a pill opens a compact list of the token's category presets.
 * Selecting a different preset swaps the token in place; the popup also
 * offers edit/delete/new-preset shortcuts.
 */
import { el, anchoredPanel } from "./ui.mjs?v=1";
import { categoryLabel } from "./preset_store.mjs?v=1";

/**
 * @param {{
 *   store: import("./preset_store.mjs").PresetStore,
 *   onReplace: (oldRange: object, preset: object) => void,
 *   onDelete: (oldRange: object) => void,
 *   onEditPreset: (preset: object) => void,
 *   onNewPreset: (category: string) => void,
 * }} options
 */
export function createTokenPopup({ store, onReplace, onDelete, onEditPreset, onNewPreset }) {
  let panel = null;
  let activeRange = null;

  function rowButton(preset, isCurrent) {
    const row = el("button", "kpw2-popup-row" + (isCurrent ? " kpw2-active" : ""));
    row.type = "button";
    row.append(
      el("span", "kpw2-popup-check", isCurrent ? "✓" : ""),
      el("span", "kpw2-popup-name", preset.name)
    );
    if (preset.description) row.title = preset.description;
    row.addEventListener("click", () => {
      const target = preset;
      const range = activeRange;
      close();
      if (!isCurrent && range) onReplace(range, target);
    });
    return row;
  }

  function open(tokenRange, anchorRect, tokenSpan) {
    close();
    activeRange = tokenRange;
    const preset = store.get(tokenRange.id);
    const category = preset?.category ?? "other";

    const title = el("div", "kpw2-panel-title", `${categoryLabel(category)} presets`);
    const list = el("div", "kpw2-popup-list");
    const options = store.byCategory(category).filter((p) => p.enabled);
    if (!options.length) {
      list.append(el("div", "kpw2-chooser-empty", "No presets in this category yet."));
    }
    for (const option of options) {
      list.append(rowButton(option, option.id === tokenRange.id));
    }

    const footer = el("div", "kpw2-popup-footer");
    const newButton = el("button", "kpw2-ghost-button", "+ New Preset");
    newButton.type = "button";
    const editButton = el("button", "kpw2-ghost-button", "Edit Preset");
    editButton.type = "button";
    const removeButton = el("button", "kpw2-danger-button", "Remove Token");
    removeButton.type = "button";
    footer.append(newButton, editButton, removeButton);

    const body = el("div", "kpw2-token-popup");
    body.append(title, list, footer);

    if (preset) {
      editButton.addEventListener("click", () => {
        close();
        onEditPreset(preset);
      });
    } else {
      editButton.disabled = true;
    }
    newButton.addEventListener("click", () => {
      close();
      onNewPreset(category);
    });
    removeButton.addEventListener("click", () => {
      const range = activeRange;
      close();
      if (range) onDelete(range);
    });

    // Anchor next to the pill itself when available.
    const rect = tokenSpan?.getBoundingClientRect?.() ?? anchorRect;
    panel = anchoredPanel("popup", rect, () => body, { width: 260 });
  }

  function close() {
    if (panel) {
      const target = panel;
      panel = null;
      activeRange = null;
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
