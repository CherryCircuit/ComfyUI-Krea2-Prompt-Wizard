/**
 * Recipe manager for the randomizer board.
 *
 * A recipe is the board's pools plus the picks that were in the slots when
 * it was saved. Applying one either rerolls every covered slot inside those
 * pools or restores the saved picks exactly.
 */
import { el, openModal } from "./ui.mjs?v=26";
import { recipeStore } from "./recipe_store.mjs?v=26";
import { readableName } from "./preset_store.mjs?v=26";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function recipeSummary(recipe) {
  const slots = Object.keys(recipe.pools || {}).length;
  const options = Object.values(recipe.pools || {}).reduce(
    (total, ids) => total + ids.length,
    0
  );
  return `${slots} slot${slots === 1 ? "" : "s"} · ${options} option${options === 1 ? "" : "s"}`;
}

function field(labelText, control) {
  const row = el("label", "kpw2-recipe-field");
  row.append(el("span", "kpw2-recipe-label", labelText), control);
  return row;
}

/**
 * @param {{randomizer: object, onApplied?: () => void}} options
 */
export function openRecipePanel({ randomizer, onApplied = () => {} }) {
  const { overlay, dialog, close } = openModal();
  dialog.classList.add("kpw2-recipe-modal");
  overlay.classList.add("kpw2-recipe-overlay");

  const root = el("div", "kpw2-recipe");
  const head = el("div", "kpw2-recipe-head");
  const titleWrap = el("div");
  titleWrap.append(
    el("div", "kpw2-recipe-title", "Recipes"),
    el(
      "div",
      "kpw2-recipe-sub",
      "A recipe remembers the slot picks and the checked pools around them."
    )
  );
  const saveToggle = el("button", "kpw2-primary-button", "Save current board");
  saveToggle.type = "button";
  const done = el("button", "kpw2-ghost-button", "Done");
  done.type = "button";
  const headActions = el("div", "kpw2-recipe-headactions");
  headActions.append(saveToggle, done);
  head.append(titleWrap, headActions);

  const statusLine = el("div", "kpw2-recipe-status");
  const form = el("div", "kpw2-recipe-form");
  const list = el("div", "kpw2-recipe-list");
  root.append(head, statusLine, form, list);
  dialog.append(root);

  let editing = null;
  let busy = false;

  const nameInput = el("input", "kpw2-recipe-input");
  nameInput.type = "text";
  nameInput.placeholder = "Name this recipe";
  const descInput = el("textarea", "kpw2-recipe-input");
  descInput.rows = "2";
  descInput.placeholder = "What this recipe is for (optional)";
  const modeSelect = el("select", "kpw2-recipe-input");
  for (const [value, label] of [
    ["roll", "Reroll every covered slot inside the pools"],
    ["restore", "Restore the picks I save now"],
  ]) {
    const option = el("option", null, label);
    option.value = value;
    modeSelect.append(option);
  }
  const saveButton = el("button", "kpw2-primary-button", "Save recipe");
  saveButton.type = "button";
  const cancelButton = el("button", "kpw2-ghost-button", "Cancel");
  cancelButton.type = "button";
  const formActions = el("div", "kpw2-recipe-formactions");
  formActions.append(cancelButton, saveButton);
  form.append(
    field("Name", nameInput),
    field("Description", descInput),
    field("When applied", modeSelect),
    formActions
  );
  form.style.display = "none";

  function setStatus(text, isError = false) {
    statusLine.textContent = text;
    statusLine.classList.toggle("kpw2-recipe-error", isError);
  }

  function openForm(recipe = null) {
    editing = recipe;
    nameInput.value = recipe?.name ?? "";
    descInput.value = recipe?.description ?? "";
    modeSelect.value = recipe && recipe.randomize === false ? "restore" : "roll";
    saveButton.textContent = recipe
      ? recipe.origin === "user"
        ? "Update recipe"
        : "Save copy"
      : "Save recipe";
    form.style.display = "";
    list.style.display = "none";
    saveToggle.style.display = "none";
    nameInput.focus();
  }

  function closeForm() {
    editing = null;
    form.style.display = "none";
    list.style.display = "";
    saveToggle.style.display = "";
    setStatus("");
  }

  function uniqueId(name) {
    const base = `recipe_${slugify(name) || "untitled"}`;
    let id = base;
    let counter = 2;
    while (recipeStore.get(id)) {
      id = `${base}_${counter}`;
      counter += 1;
    }
    return id;
  }

  async function save() {
    if (busy) return;
    const name = readableName(nameInput.value.trim());
    if (!name) {
      setStatus("Give the recipe a name.", true);
      return;
    }
    const state = randomizer.getRecipeState();
    if (!Object.keys(state.pools).length && !Object.keys(state.picks).length) {
      setStatus("The board is empty — roll something or check a pool first.", true);
      return;
    }
    busy = true;
    setStatus("Saving…");
    try {
      await recipeStore.saveRecipe({
        id:
          editing && editing.origin === "user"
            ? editing.id
            : uniqueId(name),
        name,
        description: descInput.value.trim(),
        randomize: modeSelect.value === "roll",
        pools: state.pools,
        picks: state.picks,
      });
      closeForm();
      setStatus("Recipe saved.");
      render();
      list.scrollTop = list.scrollHeight;
    } catch (error) {
      setStatus(error.message || "Save failed.", true);
    } finally {
      busy = false;
    }
  }

  async function remove(recipe) {
    if (!window.confirm(`Delete the recipe "${recipe.name}"?`)) return;
    try {
      await recipeStore.deleteRecipe(recipe.id);
      setStatus("Recipe deleted.");
      render();
    } catch (error) {
      setStatus(error.message || "Delete failed.", true);
    }
  }

  function recipeCard(recipe) {
    const card = el("div", "kpw2-recipe-card");
    const body = el("div", "kpw2-recipe-cardbody");
    const name = el("div", "kpw2-recipe-name", recipe.name);
    const meta = el("div", "kpw2-recipe-meta", recipeSummary(recipe));
    if (recipe.origin === "user") meta.append(el("span", "kpw2-recipe-badge", "Yours"));
    body.append(name);
    if (recipe.description) body.append(el("div", "kpw2-recipe-desc", recipe.description));
    body.append(meta);

    const actions = el("div", "kpw2-recipe-cardactions");
    const apply = el("button", "kpw2-primary-button", "Apply");
    apply.type = "button";
    apply.addEventListener("click", () => {
      randomizer.applyRecipe(recipe);
      close();
      onApplied();
    });
    const update = el("button", "kpw2-ghost-button", recipe.origin === "user" ? "Update" : "Save copy");
    update.type = "button";
    update.title =
      recipe.origin === "user"
        ? "Replace this recipe with the current board"
        : "Save the current board over a copy of this bundled recipe";
    update.addEventListener("click", () => openForm(recipe));
    actions.append(apply, update);
    if (recipe.origin === "user") {
      const del = el("button", "kpw2-danger-button", "Delete");
      del.type = "button";
      del.addEventListener("click", () => void remove(recipe));
      actions.append(del);
    }
    card.append(body, actions);
    return card;
  }

  function render() {
    list.replaceChildren();
    if (recipeStore.lastError) {
      list.append(el("div", "kpw2-recipe-empty", recipeStore.lastError));
      return;
    }
    if (!recipeStore.recipes.length) {
      list.append(
        el(
          "div",
          "kpw2-recipe-empty",
          "No recipes yet. Roll a board you like, then save it here."
        )
      );
      return;
    }
    for (const recipe of recipeStore.recipes) list.append(recipeCard(recipe));
  }

  saveToggle.addEventListener("click", () => openForm(null));
  cancelButton.addEventListener("click", closeForm);
  saveButton.addEventListener("click", () => void save());
  done.addEventListener("click", close);

  render();
  recipeStore
    .ensureLoaded()
    .then(() => render())
    .catch(() => render());
  return { close };
}
