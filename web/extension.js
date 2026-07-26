/* Krea2 Prompt Wizard root frontend bootstrap.
 *
 * ComfyUI classic installs expect a root `web/extension.js` entrypoint.
 */
(function () {
  "use strict";

  const currentScript = document.currentScript;
  const baseUrl = currentScript && currentScript.src ? new URL("./", currentScript.src) : new URL("./", window.location.href);
  const script = document.createElement("script");
  script.src = new URL("js/extension.js", baseUrl).href;
  script.async = false;
  document.head.appendChild(script);
})();
