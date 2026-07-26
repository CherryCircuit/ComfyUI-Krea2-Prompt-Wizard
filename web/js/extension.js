import { app } from "../../scripts/app.js";

/* Krea2 Prompt Wizard frontend extension. */
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Loading order
  // ------------------------------------------------------------------
  // The KREA2 namespace is created by state.js. The other modules attach
  // their helpers to it. We load them in order to ensure each module
  // can find the others.
  function loadScript(name) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = new URL(name, baseUrl).href;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + name)); };
      document.head.appendChild(s);
    });
  }

  function loadStylesheet(name) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = new URL(name, baseUrl).href;
    document.head.appendChild(link);
  }

  const baseUrl = new URL("./", import.meta.url);

  let installationError = null;
  const SCRIPTS = [
    "state.js",
    "searchable_selector.js",
    "preset_row.js",
    "library_editor.js",
    "materialize.js",
    "inspector.js",
    "wizard_widget.js",
  ];

  function install() {
    if (!window.KREA2) {
      installationError = "state.js failed to load";
      return;
    }
    if (!app || !app.registerExtension) {
      installationError = "ComfyUI app.registerExtension not available";
      return;
    }
    try {
      loadStylesheet("wizard.css");
    } catch (e) {
      console.warn("[Krea2PromptWizard] stylesheet failed", e);
    }

    const extension = {
      name: "Krea2PromptWizard",
      async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData || nodeData.name !== "Krea2PromptWizard") return;
        const baseOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
          if (baseOnNodeCreated) baseOnNodeCreated.apply(this, arguments);
          try {
            const widget = window.KREA2.createWizardWidget(this);
            if (widget && this.addDOMWidget) {
              const domWidget = this.addDOMWidget("Krea2PromptWizard", "custom", widget.root, {
                serialize: false,
                hideOnZoom: false,
              });
              if (domWidget) {
                widget.domWidget = domWidget;
              }
            }
          } catch (e) {
            console.warn("[Krea2PromptWizard] widget creation failed", e);
          }
        };
        const baseOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
          try {
            if (this.widgets) {
              for (const w of this.widgets) {
                if (w.name === "Krea2PromptWizard" && w.element) {
                  w.element.remove();
                }
              }
            }
          } catch (e) { /* ignore */ }
          if (baseOnRemoved) baseOnRemoved.apply(this, arguments);
        };
      },
      async setup() {
        try {
          const presets = await window.KREA2.helpers.fetchLibrary();
          const masters = await window.KREA2.helpers.fetchMasterPresets();
          window.KREA2._library = presets;
          window.KREA2._masterPresets = masters;
        } catch (e) {
          console.warn("[Krea2PromptWizard] setup failed", e);
        }
      },
    };

    app.registerExtension(extension);
  }

  function boot() {
    let cursor = Promise.resolve();
    for (const s of SCRIPTS) {
      cursor = cursor.then(function () { return loadScript(s).catch(function (e) { console.warn("[Krea2PromptWizard]", e); }); });
    }
    cursor.then(function () { install(); }).catch(function (e) {
      console.warn("[Krea2PromptWizard] install failed", e);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
