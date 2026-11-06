/**
 * The randomizer board: the v1 "surprise me" loop, rebuilt for the studio.
 *
 * One row per prompt slot (environment, lighting, camera, hair, outfit,
 * emotion…). Each row can roll a new preset now, keep rolling on every
 * queue item, and narrow the draw to a checkbox pool. Pools are grouped by
 * the preset's collection ("Medieval", "Sci-Fi", "School"…), with a
 * tri-state collection checkbox, so "randomize the environment, but only
 * in sci-fi or school" is two clicks.
 *
 * Pools live in the hidden `randomizer_doc` widget. The backend reads the
 * same JSON and applies the filter when a `~` token rolls at execution
 * time; "Randomize now" is pure frontend and works without a round trip.
 */
import { attachQuickTooltip, el, openModal } from "./ui.mjs?v=26";
import {
  categoryLabel,
  FACET_DEFINITIONS,
  groupByCollection,
  presetStore,
} from "./preset_store.mjs?v=26";
import { tokenRanges } from "./tokenizer.mjs?v=26";

/** Slots bound to a character token (attachments). */
const CHARACTER_SLOTS = [
  { id: "hair", label: "Hair", category: "hair", group: "hair" },
  {
    id: "wardrobe_full",
    label: "Outfit",
    category: "wardrobe",
    group: "wardrobe_full",
    // A full outfit and separates describe the same body. Rolling one
    // removes the other so a random result never wears both.
    clears: [
      ["wardrobe", "wardrobe_outer"],
      ["wardrobe", "wardrobe_mid"],
      ["wardrobe", "wardrobe_base"],
      ["wardrobe", "wardrobe_bottom"],
    ],
  },
  {
    id: "wardrobe_outer",
    label: "Outer",
    category: "wardrobe",
    group: "wardrobe_outer",
    clears: [["wardrobe", "wardrobe_full"]],
  },
  {
    id: "wardrobe_mid",
    label: "Mid",
    category: "wardrobe",
    group: "wardrobe_mid",
    clears: [["wardrobe", "wardrobe_full"]],
  },
  {
    id: "wardrobe_base",
    label: "Base",
    category: "wardrobe",
    group: "wardrobe_base",
    clears: [["wardrobe", "wardrobe_full"]],
  },
  {
    id: "wardrobe_bottom",
    label: "Bottom",
    category: "wardrobe",
    group: "wardrobe_bottom",
    clears: [["wardrobe", "wardrobe_full"]],
  },
  {
    id: "wardrobe_legwear",
    label: "Legwear",
    category: "wardrobe",
    group: "wardrobe_legwear",
    clears: [],
  },
  {
    id: "wardrobe_accessory",
    label: "Accessory",
    category: "wardrobe",
    group: "wardrobe_accessory",
    clears: [],
  },
  { id: "emotion", label: "Emotion", category: "emotion", group: "emotion" },
  { id: "state", label: "State", category: "state", group: "" },
];

/** Facets that sit underneath a parent token (hair -> colour, garment -> colour/pattern). */
const FACETS = FACET_DEFINITIONS;

/** Slots that describe the shot itself. One token each. */
const SCENE_SLOTS = [
  { id: "scene", label: "Environment", category: "scene", group: "scene" },
  { id: "lighting_time", label: "Time of Day", category: "lighting", group: "lighting_time" },
  { id: "lighting_source", label: "Light Source", category: "lighting", group: "lighting_source" },
  {
    id: "lighting_quality",
    label: "Light Quality",
    category: "lighting",
    group: "lighting_quality",
  },
  {
    id: "lighting_direction",
    label: "Light Direction",
    category: "lighting",
    group: "lighting_direction",
  },
  { id: "framing", label: "Framing", category: "camera", group: "framing" },
  { id: "angle", label: "Angle", category: "camera", group: "angle" },
  { id: "lens", label: "Lens", category: "camera", group: "lens" },
  { id: "movement", label: "Movement", category: "camera", group: "movement" },
  { id: "color_grade", label: "Color Grade", category: "style", group: "color_grade" },
  { id: "style", label: "Style", category: "style", group: "style" },
];

export function slotKey(slot) {
  return `${slot.category}|${slot.group || ""}`;
}

/** Unique board row; facets share a pool key but not a row. */
function rowKey(slot) {
  return `${slotKey(slot)}@${slot.parentId || slot.host?.id || ""}`;
}

function shufflePick(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function loopIcon() {
  const span = el("span", "kpw2-rz-loopicon");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
    '<path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  return span;
}

function diceIcon() {
  const span = el("span", "kpw2-rz-diceicon");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
    '<circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="16" cy="8" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="8" cy="16" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none"/></svg>';
  return span;
}

/**
 * @param {{
 *   editor: object,
 *   getPools: () => Record<string, string[]>,
 *   setPools: (pools: Record<string, string[]>) => void,
 * }} options
 */
export function createRandomizer({ editor, getPools, setPools, onOpenRecipes }) {
  const root = el("div", "kpw2-rz");
  let pools = normalizePools(getPools());
  let selectedKey = "";
  let query = "";
  let status = "";
  let modal = null;

  const head = el("div", "kpw2-rz-head");
  const titleWrap = el("div");
  titleWrap.append(
    el("div", "kpw2-rz-title", "Prompt Randomizer"),
    el(
      "div",
      "kpw2-rz-sub",
      "Pick a pool for each slot, then roll. Every-run tokens re-roll on each queue item."
    )
  );
  const headActions = el("div", "kpw2-rz-headactions");
  const recipes = el("button", "kpw2-ghost-button", "Recipes");
  recipes.type = "button";
  recipes.title = "Recipes";
  attachQuickTooltip(recipes, "Recipes");
  recipes.addEventListener("click", () => onOpenRecipes?.());
  const rollAll = el("button", "kpw2-primary-button", "Roll all");
  rollAll.type = "button";
  const resetPools = el("button", "kpw2-ghost-button", "Reset pools");
  resetPools.type = "button";
  const done = el("button", "kpw2-ghost-button", "Done");
  done.type = "button";
  headActions.append(recipes, rollAll, resetPools, done);
  head.append(titleWrap, headActions);

  const body = el("div", "kpw2-rz-body");
  const slotsPane = el("div", "kpw2-rz-slots");
  const poolPane = el("div", "kpw2-rz-pool");
  body.append(slotsPane, poolPane);

  const statusLine = el("div", "kpw2-rz-status");
  root.append(head, body, statusLine);

  done.addEventListener("click", () => close());
  resetPools.addEventListener("click", () => {
    pools = {};
    persist();
    status = "Pools reset — every enabled preset in a slot is available.";
    refresh();
  });
  rollAll.addEventListener("click", () => {
    let rolled = 0;
    for (const slot of allSlots()) {
      if (roll(slot, { quiet: true })) rolled += 1;
    }
    status = rolled
      ? `Rolled ${rolled} slot${rolled === 1 ? "" : "s"}.`
      : "Nothing to roll — check at least one option in a pool, or add a character first.";
    refresh();
  });

  // ---- slots ---------------------------------------------------------------

  function normalizePools(value) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    for (const [key, ids] of Object.entries(value)) {
      if (!Array.isArray(ids)) continue;
      out[key] = ids.map(String).filter(Boolean);
    }
    return out;
  }

  function persist() {
    setPools(JSON.parse(JSON.stringify(pools)));
  }

  function hostTokens() {
    return tokenRanges(editor.doc).filter((token) => {
      if (token.host) return false;
      const preset = presetStore.get(token.id);
      return preset && preset.enabled && preset.category === "character";
    });
  }

  function allSlots() {
    const slots = [];
    for (const host of hostTokens()) {
      const preset = presetStore.get(host.id);
      const character = {
        id: host.id,
        name: preset?.name || host.id,
        start: host.start,
        end: host.end,
      };
      for (const definition of CHARACTER_SLOTS) {
        const main = { ...definition, host: character };
        slots.push(main);
        const facets = FACETS[definition.group] || [];
        if (!facets.length) continue;
        const parentToken = tokenFor(main);
        if (!parentToken) continue;
        for (const facet of facets) {
          slots.push({
            ...facet,
            host: character,
            facet: true,
            parentSlotId: definition.id,
            parentId: parentToken.id,
            label: `${definition.label} · ${facet.label}`,
          });
        }
      }
    }
    for (const definition of SCENE_SLOTS) slots.push({ ...definition, host: null });
    return slots;
  }

  function slotLabel(slot) {
    return slot.host ? `${slot.host.name} · ${slot.label}` : slot.label;
  }

  function enabledPresets(slot) {
    return presetStore.presets.filter(
      (preset) =>
        preset.enabled &&
        preset.category === slot.category &&
        preset.exclusive_group === (slot.group || "")
    );
  }

  function allowedIds(slot) {
    const all = enabledPresets(slot).map((preset) => preset.id);
    const pool = pools[slotKey(slot)];
    if (!Array.isArray(pool)) return new Set(all);
    return new Set(all.filter((id) => pool.includes(id)));
  }

  function tokenFor(slot) {
    const tokens = tokenRanges(editor.doc);
    return (
      tokens.find((token) => {
        if (slot.parentId) {
          if (token.host !== slot.parentId) return false;
        } else if (slot.host) {
          if (token.host !== slot.host.id) return false;
        } else if (token.host) {
          return false;
        }
        const preset = presetStore.get(token.id);
        return (
          preset &&
          preset.category === slot.category &&
          preset.exclusive_group === (slot.group || "")
        );
      }) || null
    );
  }

  function currentPreset(slot) {
    const token = tokenFor(slot);
    return token ? presetStore.get(token.id) : null;
  }

  function slotRow(slot) {
    const key = slotKey(slot);
    const rid = rowKey(slot);
    const token = tokenFor(slot);
    const preset = token ? presetStore.get(token.id) : null;
    const total = enabledPresets(slot).length;
    const allowed = allowedIds(slot).size;
    const explicit = Array.isArray(pools[key]);

    const row = el(
      "div",
      "kpw2-rz-row" +
        (selectedKey === rid ? " kpw2-rz-rowsel" : "") +
        (slot.facet ? " kpw2-rz-facet" : "")
    );
    row.dataset.slot = key;
    row.dataset.row = rid;
    row.dataset.host = slot.host?.id || "";
    row.dataset.parent = slot.parentId || "";
    const pick = el("button", "kpw2-rz-pick");
    pick.type = "button";
    pick.title = `Choose this slot${slot.host ? ` for ${slot.host.name}` : ""}`;
    pick.append(el("span", "kpw2-rz-slot", slot.label));
    pick.append(
      el(
        "span",
        "kpw2-rz-current" + (preset ? "" : " kpw2-rz-unset"),
        preset ? preset.name : "— not set —"
      )
    );
    pick.addEventListener("click", () => {
      selectedKey = rid;
      query = "";
      refresh();
    });

    const dice = el("button", "kpw2-rz-dice");
    dice.type = "button";
    dice.title = `Roll a random ${slot.label.toLowerCase()} now`;
    dice.append(diceIcon());
    dice.addEventListener("click", () => {
      if (roll(slot)) {
        status = `${slotLabel(slot)} → ${currentPreset(slot)?.name || "new pick"}`;
        refresh();
      }
    });

    const every = el(
      "button",
      "kpw2-rz-every" + (token?.randomize ? " on" : "")
    );
    every.type = "button";
    every.title = token?.randomize
      ? "This slot re-rolls on every queue item — click to pin the current pick"
      : "Re-roll this slot on every queue item";
    every.append(loopIcon());
    every.addEventListener("click", () => {
      if (token) {
        editor.toggleRandomize(token);
      } else if (roll(slot, { everyRun: true })) {
        status = `${slotLabel(slot)} now re-rolls every run.`;
      } else {
        status = `No ${slot.label.toLowerCase()} option available to roll.`;
      }
      refresh();
    });

    const poolButton = el(
      "button",
      "kpw2-rz-poolcount" + (explicit ? " kpw2-rz-filtered" : "")
    );
    poolButton.type = "button";
    poolButton.textContent = `${allowed}/${total}`;
    poolButton.title = explicit
      ? `${allowed} of ${total} options checked in this pool`
      : `All ${total} options available — click to narrow the pool`;
    poolButton.addEventListener("click", () => {
      selectedKey = rid;
      query = "";
      refresh();
    });

    row.append(pick, dice, every, poolButton);
    return row;
  }

  function renderSlots() {
    slotsPane.replaceChildren();
    const slots = allSlots();
    if (!slots.length) {
      slotsPane.append(
        el(
          "div",
          "kpw2-rz-empty",
          "Add a character token to unlock hair, outfit and emotion slots."
        )
      );
      return;
    }
    const hosts = hostTokens();
    for (const host of hosts) {
      slotsPane.append(
        el("div", "kpw2-rz-section", `Character — ${presetStore.get(host.id)?.name || host.id}`)
      );
      for (const slot of slots.filter((entry) => entry.host?.id === host.id)) {
        slotsPane.append(slotRow(slot));
      }
    }
    slotsPane.append(el("div", "kpw2-rz-section", "Scene"));
    for (const slot of slots.filter((entry) => !entry.host)) {
      slotsPane.append(slotRow(slot));
    }
  }

  // ---- pool pane -----------------------------------------------------------

  function selectedSlot() {
    const slots = allSlots();
    if (!slots.length) return null;
    return slots.find((slot) => rowKey(slot) === selectedKey) || slots[0];
  }

  function setMany(slot, ids, checked) {
    const key = slotKey(slot);
    const next = new Set(allowedIds(slot));
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    // Checking the whole slot is the same as having no filter; keeping the
    // key absent makes the "All" button and the row count agree.
    if (next.size === enabledPresets(slot).length) delete pools[key];
    else pools[key] = [...next];
    persist();
    status = checked
      ? `Added ${ids.length} option${ids.length === 1 ? "" : "s"} to ${slotLabel(slot)}.`
      : `Removed ${ids.length} option${ids.length === 1 ? "" : "s"} from ${slotLabel(slot)}.`;
  }

  function poolList(slot) {
    const all = enabledPresets(slot);
    const allowed = allowedIds(slot);
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? all.filter(
          (preset) =>
            preset.name.toLowerCase().includes(needle) ||
            (preset.collection || "").toLowerCase().includes(needle) ||
            preset.tags.some((tag) => tag.toLowerCase().includes(needle))
        )
      : all;
    const groups = groupByCollection(visible);
    const list = el("div", "kpw2-rz-checklist");

    if (!all.length) {
      list.append(el("div", "kpw2-rz-empty", "No presets in this slot yet."));
      return list;
    }
    if (!visible.length) {
      list.append(el("div", "kpw2-rz-empty", "No options match the search."));
      return list;
    }

    for (const group of groups) {
      const checkedCount = group.items.filter((preset) => allowed.has(preset.id)).length;
      const groupHead = el("label", "kpw2-rz-group");
      const groupBox = el("input");
      groupBox.type = "checkbox";
      groupBox.checked = checkedCount === group.items.length;
      groupBox.indeterminate = checkedCount > 0 && checkedCount < group.items.length;
      groupBox.addEventListener("change", () => {
        setMany(slot, group.items.map((preset) => preset.id), groupBox.checked);
        refresh();
      });
      groupHead.append(
        groupBox,
        el("span", "kpw2-rz-groupname", group.name),
        el("span", "kpw2-rz-groupcount", `${checkedCount}/${group.items.length}`)
      );
      list.append(groupHead);
      for (const preset of group.items) {
        const item = el("label", "kpw2-rz-item");
        const box = el("input");
        box.type = "checkbox";
        box.checked = allowed.has(preset.id);
        box.addEventListener("change", () => {
          setMany(slot, [preset.id], box.checked);
          refresh();
        });
        item.append(box, el("span", "kpw2-rz-itemname", preset.name));
        if (preset.description) item.title = preset.description;
        list.append(item);
      }
    }
    return list;
  }

  function renderPool() {
    const slot = selectedSlot();
    poolPane.replaceChildren();
    if (!slot) {
      poolPane.append(
        el(
          "div",
          "kpw2-rz-empty",
          "Add a character token, or use a scene slot after one is available."
        )
      );
      return;
    }
    const all = enabledPresets(slot);
    const allowed = allowedIds(slot);
    const explicit = Array.isArray(pools[slotKey(slot)]);
    const headRow = el("div", "kpw2-rz-poolhead");
    headRow.append(
      el("div", "kpw2-rz-pooltitle", slotLabel(slot)),
      el(
        "div",
        "kpw2-rz-poolsub",
        `${allowed.size} of ${all.length} checked${explicit ? "" : " — whole slot"}`
      )
    );
    poolPane.append(headRow);

    const actions = el("div", "kpw2-rz-poollactions");
    const allButton = el("button", "kpw2-ghost-button", "All");
    allButton.type = "button";
    allButton.title = "Allow the whole slot again (same as clearing the filter)";
    allButton.addEventListener("click", () => {
      delete pools[slotKey(slot)];
      persist();
      status = `${slotLabel(slot)} uses the whole slot again.`;
      refresh();
    });
    const noneButton = el("button", "kpw2-ghost-button", "None");
    noneButton.type = "button";
    noneButton.title = "Disallow every option in this slot";
    noneButton.addEventListener("click", () => {
      setMany(slot, all.map((preset) => preset.id), false);
      refresh();
    });
    actions.append(allButton, noneButton);
    poolPane.append(actions);

    const search = el("input", "kpw2-rz-search");
    search.type = "text";
    search.placeholder = `Search ${categoryLabel(slot.category).toLowerCase()} options…`;
    search.value = query;
    search.addEventListener("input", () => {
      query = search.value;
      const list = poolPane.querySelector(".kpw2-rz-checklist");
      if (list) list.replaceWith(poolList(slot));
    });
    poolPane.append(search);
    poolPane.append(poolList(slot));
  }

  // ---- rolling -------------------------------------------------------------

  function clearConflicts(slot) {
    if (!slot.host || !slot.clears?.length) return;
    for (const [category, group] of slot.clears) {
      // Re-read the document each time: deleting a token shifts the ranges
      // of everything after it.
      let guard = 0;
      while (guard < 12) {
        guard += 1;
        const stale = tokenRanges(editor.doc).find((token) => {
          if (token.host !== slot.host.id) return false;
          const preset = presetStore.get(token.id);
          return (
            preset &&
            preset.category === category &&
            preset.exclusive_group === (group || "")
          );
        });
        if (!stale) break;
        editor.deleteToken(stale);
      }
    }
  }

  function placeExact(slot, preset, { randomize = false } = {}) {
    if (slot.parentId) {
      const parent = tokenRanges(editor.doc).find((token) => token.id === slot.parentId);
      if (!parent) return false;
      editor.attachToHost(
        { start: parent.start, end: parent.end },
        preset,
        { randomize }
      );
      return true;
    }
    if (slot.host) {
      const host = tokenRanges(editor.doc).find(
        (token) => token.id === slot.host.id && !token.host
      );
      if (!host) return false;
      clearConflicts(slot);
      editor.attachToHost(
        { start: host.start, end: host.end },
        preset,
        { randomize }
      );
      return true;
    }
    editor.insertToken(preset, { randomize });
    return true;
  }

  /** What "Save current board" captures. */
  function getRecipeState() {
    const picks = {};
    for (const slot of allSlots()) {
      const token = tokenFor(slot);
      const preset = token ? presetStore.get(token.id) : null;
      if (preset) picks[slotKey(slot)] = preset.id;
    }
    return {
      pools: JSON.parse(JSON.stringify(pools)),
      picks,
    };
  }

  /** Apply a saved recipe: replace the pools, then restore or reroll. */
  function applyRecipe(recipe) {
    pools = normalizePools(recipe?.pools);
    persist();
    let applied = 0;
    function applySlot(slot) {
      const key = slotKey(slot);
      const hasPool = Array.isArray(recipe?.pools?.[key]);
      const pickId = recipe?.picks?.[key];
      if (!hasPool && !pickId) return;
      if (recipe.randomize !== false) {
        if (roll(slot, { quiet: true })) applied += 1;
        return;
      }
      const preset = pickId ? presetStore.get(pickId) : null;
      if (preset && preset.enabled) {
        if (placeExact(slot, preset, { randomize: false })) applied += 1;
      } else if (roll(slot, { quiet: true })) {
        applied += 1;
      }
    }
    // Parent slots first. Facet rows (hair colour, garment colour/pattern)
    // only exist once their parent token has been placed, so they are a
    // second pass over the refreshed board.
    for (const slot of allSlots().filter((entry) => !entry.facet)) applySlot(slot);
    for (const slot of allSlots().filter((entry) => entry.facet)) applySlot(slot);
    status = applied
      ? `Applied "${recipe.name}" — ${applied} slot${applied === 1 ? "" : "s"}.`
      : `"${recipe.name}" did not match any current slot.`;
    const recipeKeys = new Set([
      ...Object.keys(recipe?.pools || {}),
      ...Object.keys(recipe?.picks || {}),
    ]);
    const wantsCharacter = [...recipeKeys].some((key) =>
      /^(hair|wardrobe|emotion|state|look|performance)\|/.test(key)
    );
    if (wantsCharacter && !hostTokens().length) {
      status += " Add a character to fill Hair, Outfit and Emotion.";
    }
    refresh();
  }

  function roll(slot, { everyRun = false, quiet = false } = {}) {
    const allowed = allowedIds(slot);
    const current = tokenFor(slot);
    const candidates = enabledPresets(slot).filter(
      (preset) => allowed.has(preset.id) && preset.id !== current?.id
    );
    const pick = shufflePick(candidates);
    if (!pick) {
      if (!quiet) {
        status = `No other ${slot.label.toLowerCase()} option in this pool. Check more boxes or reset the pool.`;
      }
      return false;
    }
    const randomize = everyRun || (current ? current.randomize : false);
    if (slot.parentId) {
      const parent = tokenRanges(editor.doc).find((token) => token.id === slot.parentId);
      if (!parent) return false;
      editor.attachToHost(
        { start: parent.start, end: parent.end },
        pick,
        { randomize }
      );
    } else if (slot.host) {
      // Resolve by character id, not the offset captured when the board was
      // drawn: an earlier roll may have shifted every token after it.
      const host = tokenRanges(editor.doc).find(
        (token) => token.id === slot.host.id && !token.host
      );
      if (!host) return false;
      clearConflicts(slot);
      editor.attachToHost(
        { start: host.start, end: host.end },
        pick,
        { randomize }
      );
    } else {
      editor.insertToken(pick, { randomize });
    }
    if (!quiet) status = `${slotLabel(slot)} → ${pick.name}`;
    return true;
  }

  // ---- shell ---------------------------------------------------------------

  function refresh() {
    const slots = allSlots();
    if (!selectedKey || !slots.some((slot) => rowKey(slot) === selectedKey)) {
      const missing = slots.find(
        (slot) => !tokenFor(slot) && enabledPresets(slot).length > 0
      );
      selectedKey = rowKey(
        missing || slots[0] || { category: "scene", group: "scene" }
      );
    }
    renderSlots();
    renderPool();
    statusLine.textContent = status;
    statusLine.classList.toggle("kpw2-rz-status-on", Boolean(status));
  }

  function open() {
    if (modal) return;
    pools = normalizePools(getPools());
    status = "";
    modal = openModal();
    modal.dialog.classList.add("kpw2-rz-modal");
    modal.dialog.append(root);
    modal.overlay.classList.add("kpw2-rz-overlay");
    refresh();
  }

  function close() {
    if (!modal) return;
    const handle = modal;
    modal = null;
    handle.close();
  }

  return {
    root,
    open,
    close,
    refresh,
    getRecipeState,
    applyRecipe,
    get isOpen() {
      return modal != null;
    },
  };
}
