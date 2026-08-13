import { app } from "../../scripts/app.js";

// Keep legacy helper modules compatible while using ComfyUI's supported app import.
window.app = app;

// These are .mjs so ComfyUI does not auto-import them independently and out of order.
await import("./js/state.mjs?v=10");
await import("./js/searchable_selector.mjs?v=10");
await import("./js/preset_row.mjs?v=10");
await import("./js/library_editor.mjs?v=10");
await import("./js/materialize.mjs?v=10");
await import("./js/inspector.mjs?v=10");
await import("./js/wizard_widget.mjs?v=10");

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./css/wizard.css?v=10", import.meta.url).href;
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

        wizard.root.addEventListener("wheel", function (event) {
          var scrollable = event.target.closest(".krea2-wizard-categories, .krea2-searchable-list, textarea, select");
          var atBoundary = !scrollable || (scrollable.scrollTop === 0 && event.deltaY < 0) || (scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight && event.deltaY > 0);
          if (atBoundary) {
            var canvasEl = app && app.canvas && app.canvas.canvas;
            if (canvasEl) {
              canvasEl.dispatchEvent(new WheelEvent("wheel", {
                clientX: event.clientX,
                clientY: event.clientY,
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                deltaZ: event.deltaZ,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
                bubbles: true,
                cancelable: true,
              }));
              event.preventDefault();
            }
          }
        }, { passive: false });

        wizard.root.addEventListener("mousedown", function (event) {
          if (event.button === 1) {
            var canvas = app && app.canvas;
            var canvasEl = canvas && canvas.canvas;
            if (canvasEl) {
              var forward = function (method, mouseEvent) {
                if (typeof canvas[method] === "function") canvas[method](mouseEvent);
                else canvasEl.dispatchEvent(new MouseEvent(mouseEvent.type, mouseEvent));
              };
              forward("processMouseDown", event);
              event.preventDefault();
              event.stopPropagation();
              function move(moveEvent) { forward("processMouseMove", moveEvent); }
              function release(upEvent) {
                forward("processMouseUp", upEvent);
                document.removeEventListener("mousemove", move, true);
                document.removeEventListener("mouseup", release, true);
              }
              document.addEventListener("mousemove", move, true);
              document.addEventListener("mouseup", release, true);
            }
          }
        }, true);

        const domWidget = this.addDOMWidget(
          "Krea2PromptWizard",
          "Krea2PromptWizard",
          wizard.root,
          {
            serialize: false,
            hideOnZoom: false,
            // v2: the tabbed editor is the full surface; the floor only
            // guards an empty state.
            getMinHeight: () => 96,
          },
        );
        wizard.domWidget = domWidget;
        domWidget.computeSize = () => {
          return [
            Math.max(this.size?.[0] || 700, 700),
            Math.max(wizard.root.scrollHeight || 0, 96),
          ];
        };
        this.resizable = true;
        this.setSize([
          Math.max(this.size?.[0] || 0, 700),
          Math.max(this.size?.[1] || 0, 420),
        ]);
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
          this.wizardWidget.recordExecution(prompt);
        }
        if (this.wizardWidget && typeof raw === "string") {
          const resolved = JSON.parse(raw);
          // Preserve the tab and UI state the user is currently working on;
          // only the resolved prompt content is applied.
          this.wizardWidget.applyResolvedState(resolved);
          this.setDirtyCanvas?.(true, true);
        }
      } catch (error) {
        console.error("[Krea2PromptWizard] could not show the randomized result", error);
      }
      return result;
    };
  },
});
