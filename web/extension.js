import { app } from "../../scripts/app.js";

// Keep legacy helper modules compatible while using ComfyUI's supported app import.
window.app = app;

// These are .mjs so ComfyUI does not auto-import them independently and out of order.
await import("./js/state.mjs");
await import("./js/searchable_selector.mjs");
await import("./js/preset_row.mjs");
await import("./js/library_editor.mjs");
await import("./js/materialize.mjs");
await import("./js/inspector.mjs");
await import("./js/wizard_widget.mjs");

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./css/wizard.css", import.meta.url).href;
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

        const expertWidget = this.widgets?.find((widget) => widget.name === "expert_mode");
        if (expertWidget) {
          expertWidget.hidden = true;
          expertWidget.type = "hidden";
          expertWidget.computeSize = () => [0, -4];
        }

        const domWidget = this.addDOMWidget(
          "Krea2PromptWizard",
          "Krea2PromptWizard",
          wizard.root,
          {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => 560,
          },
        );
        wizard.domWidget = domWidget;
        domWidget.computeSize = () => [Math.max(this.size?.[0] || 520, 520), 620];
        this.resizable = true;
        this.setSize([
          Math.max(this.size?.[0] || 0, 520),
          Math.max(this.size?.[1] || 0, 680),
        ]);
      } catch (error) {
        console.error("[Krea2PromptWizard] widget creation failed", error);
      }
      return result;
    };
  },
});
