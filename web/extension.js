/* Krea2 Prompt Wizard — root frontend bootstrap
 *
 * ComfyUI custom-node loaders commonly auto-discover a root-level
 * `web/extension.js`. This wrapper loads the actual implementation
 * from `web/js/extension.js`.
 */
(function () {
  "use strict";

  const script = document.currentScript;
  const baseUrl = script && script.src ? new URL("./", script.src) : new URL("./", window.location.href);
  const impl = document.createElement("script");
  impl.src = new URL("js/extension.js", baseUrl).href;
  impl.async = false;
  document.head.appendChild(impl);
})();
