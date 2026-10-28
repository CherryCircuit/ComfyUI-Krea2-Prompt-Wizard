import { app } from "../../scripts/app.js";

// Keep legacy helper modules compatible while using ComfyUI's supported app import.
window.app = app;

// These are .mjs so ComfyUI does not auto-import them independently and out of order.
await import("./js/state.mjs?v=35");
await import("./js/searchable_selector.mjs?v=35");
await import("./js/preset_row.mjs?v=35");
await import("./js/library_editor.mjs?v=35");
await import("./js/materialize.mjs?v=35");
await import("./js/inspector.mjs?v=35");
await import("./js/workspace.mjs?v=35");
await import("./js/lighting_scene.mjs?v=35");
await import("./js/wizard_widget.mjs?v=35");

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./css/wizard.css?v=35", import.meta.url).href;
document.head.appendChild(stylesheet);

app.registerExtension({
  name: "Krea2PromptWizard",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "Krea2PromptWizard") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      try {
        const wizard = window.KREA2.createWizardWidget(this);
        if (!wizard || !this.addDOMWidget) return result;
        this.wizardWidget = wizard;

        const expertWidget = this.widgets?.find((widget) => widget.name === "expert_mode");
        if (expertWidget) {
          expertWidget.hidden = true;
          expertWidget.type = "hidden";
          expertWidget.computeSize = () => [0, -4];
        }

        const containWheel = event => event.stopPropagation();
        wizard.root.addEventListener("wheel", containWheel, { passive: true });

        const domWidget = this.addDOMWidget(
          "Krea2PromptWizard",
          "Krea2PromptWizard",
          wizard.root,
          {
            serialize: false,
            hideOnZoom: false,
            // v2: the tabbed editor is the full surface; the floor only
            // guards an empty state.
            getMinHeight: () => 280,
            getMinWidth: () => 360,
          },
        );
        wizard.domWidget = domWidget;
        this.resizable = true;
        this.setSize([560, 680]);
        const removed = this.onRemoved;
        this.onRemoved = function () {
          wizard.root.removeEventListener("wheel", containWheel);
          wizard.dispose?.();
          return removed?.apply(this, arguments);
        };
        const resized = this.onResize;
        this.onResize = function (size) {
          const result = resized?.apply(this, arguments);
          if (size && (size[0] < 360 || size[1] < 420)) this.setSize([Math.max(360, size[0]), Math.max(420, size[1])]);
          wizard.resize?.(size);
          return result;
        };
      } catch (error) {
        console.error("[Krea2PromptWizard] widget creation failed", error);
      }
      return result;
    };

    const configure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
      const result = configure?.apply(this, arguments);
      try {
        if (this.wizardWidget && typeof this.wizardWidget.setState === "function") {
          const valueWidget = (this.widgets || []).find(function (w) { return w.name === "wizard_state_json"; });
          if (valueWidget && valueWidget.value) {
            let parsed = {};
            try { parsed = JSON.parse(valueWidget.value); } catch (e) {}
            this.wizardWidget.setState(parsed);
            if (Array.isArray(info?.size)) this.setSize([Math.max(360, info.size[0]), Math.max(420, info.size[1])]);
          }
        }
      } catch (e) {
        console.error("[Krea2PromptWizard] configure failed", e);
      }
      return result;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const result = onExecuted?.apply(this, arguments);
      try {
        const payload = message?.krea2_resolved_state;
        const raw = Array.isArray(payload) ? payload[0] : payload;
        const promptPayload = message?.krea2_prompt_output;
        const prompt = Array.isArray(promptPayload) ? promptPayload[0] : promptPayload;
        if (this.wizardWidget && typeof this.wizardWidget.recordExecution === "function") {
          this.wizardWidget.recordExecution(prompt, message);
        }
        if (this.wizardWidget && typeof raw === "string") {
          const resolved = JSON.parse(raw);
          // Preserve the tab and UI state the user is currently working on;
          // only the resolved prompt content is applied.
          this.wizardWidget.applyResolvedState(resolved, message?.krea2_resolved_revision);
          this.setDirtyCanvas?.(true, true);
        }
      } catch (error) {
        console.error("[Krea2PromptWizard] could not show the randomized result", error);
      }
      return result;
    };
  },
});
