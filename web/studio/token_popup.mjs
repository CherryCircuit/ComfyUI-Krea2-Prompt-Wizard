/**
 * Token click-popup for the Prompt Studio.
 *
 * Clicking a pill opens a compact list of same-slot presets (same
 * category AND exclusive group). Selecting a different preset swaps the
 * token in place; attachments keep their host. The popup also toggles
 * runtime randomization and offers edit/remove/new-preset shortcuts.
 */
import { el, anchoredPanel } from "./ui.mjs?v=2";
import { categoryLabel } from "./preset_store.mjs?v=2";

/**
 * @param {{
 *   store: import("./preset_store.mjs").PresetStore,
 *   onReplace: (oldRange: object, preset: object) => void,
 *   onDelete: (oldRange: object) => void,
 *   onEditPreset: (preset: object) => void,
 *   onNewPreset: (category: string) => void,
 *   onToggleRandomize: (range: object) => void,
 * }} options
 */
export function createTokenPopup({
  store,
  onReplace,
  onDelete,
  onEditPreset,
  onNewPreset,
  onToggleRandomize,
}) {
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

  function open(tokenRange, anchorRect, tokenSpan, { attached = false } = {}) {
    close();
    activeRange = tokenRange;
    const preset = store.get(tokenRange.id);
    const category = preset?.category ?? "other";
    const group = preset?.exclusive_group ?? "";

    const isRandom = Boolean(tokenRange.randomize);

    const title = el(
      "div",
      "kpw2-panel-title",
      categoryLabel(category) + (group ? ` · ${group.replace(/^wardrobe_/, "").replace(/_/g, " ")}` : "")
    );
    const list = el("div", "kpw2-popup-list");
    // Same slot only: category AND exclusive group. Ungrouped presets
    // list their whole category.
    const options = store
      .byCategory(category)
      .filter((p) => p.enabled)
      .filter((p) => (group ? p.exclusive_group === group : true));
    if (!options.length) {
      list.append(el("div", "kpw2-chooser-empty", "No presets in this slot yet."));
    }
    for (const option of options) {
      list.append(rowButton(option, option.id === tokenRange.id));
    }

    const footer = el("div", "kpw2-popup-footer");

    const randomButton = el(
      "button",
      "kpw2-ghost-button" + (isRandom ? " kpw2-active-toggle" : ""),
      (isRandom ? "✓ " : "") + "🎲 Randomize each run"
    );
    randomButton.type = "button";
    randomButton.title = "Pick a random preset from this slot on every execution";
    randomButton.addEventListener("click", () => {
      const range = activeRange;
      close();
      if (range) onToggleRandomize(range);
    });

    const newButton = el("button", "kpw2-ghost-button", "+ New Preset");
    newButton.type = "button";
    const editButton = el("button", "kpw2-ghost-button", "Edit Preset");
    editButton.type = "button";
    const removeButton = el(
      "button",
      "kpw2-danger-button",
      attached ? "Remove Attachment" : "Remove Token"
    );
    removeButton.type = "button";
    footer.append(randomButton, newButton, editButton, removeButton);

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
    panel = anchoredPanel("popup", rect, () => body, { width: 280 });
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
