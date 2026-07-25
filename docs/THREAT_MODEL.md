# Threat Model

This document analyses the threats the wizard is exposed to and the
mitigations the project applies. It complements the higher-level
[`SECURITY.md`](../SECURITY.md) summary.

## Assets

The wizard protects the following assets:

1. **The user's ComfyUI host.** The wizard must not run unauthorised
   code, must not exfiltrate data, must not modify system files.
2. **The user's library data.** The wizard must not corrupt or
   silently delete the user's preset library.
3. **The user's workflow data.** The wizard must not produce prompt
   fragments the user did not ask for. The trace JSON must accurately
   reflect what was compiled.
4. **The user's privacy.** The wizard must not send any of the
   user's prompts, presets, or settings anywhere.
5. **The user's time.** The wizard must not block the queue, must
   not slow down the frontend, and must not fail catastrophically on
   bad input.

## Adversaries

The wizard is exposed to:

1. **A malicious library preset.** A user could craft a preset that
   contains code injection in the phrase field. The wizard renders
   the phrase verbatim. If the phrase is fed into Python's `eval`
   or JavaScript's `eval`, this would be a vulnerability.
2. **A malicious workflow JSON.** A user could embed a
   `wizard_state_json` that, when deserialised, executes code.
3. **A malicious frontend extension.** Another extension could
   intercept the wizard's DOM widget or event listeners.
4. **A malicious user library file.** A user could hand-edit the
   user library to add dangerous content.
5. **A network attacker.** The wizard is exposed to the public
   internet if the ComfyUI host is.

## Mitigations

### 1. No `eval` or `exec`

The wizard's backend never uses `eval`, `exec`, `compile`,
`__import__`, `popen`, or `subprocess`. The frontend never uses
`eval`, `Function`, or any equivalent. Custom phrases are rendered
verbatim into the prompt. A malicious phrase like `__import__('os')`
is treated as a literal string.

### 2. JSON deserialisation is safe

The wizard uses the standard `json` module, which is not vulnerable
to arbitrary code execution. State JSON is loaded with `json.loads`
and validated by the `validation` module. The validator never
executes validated content; it only inspects structure.

### 3. No network activity

The wizard performs no network activity of any kind. There is no
`requests` dependency, no `urllib` calls, no `socket` calls, no DNS
lookups. The wizard is safe to use on an isolated network.

### 4. Library editor input is validated

The Library editor's *Edit as Text* format is parsed by
`library.parse_user_text`. The parser is line-based and produces a
list of preset dictionaries. Each preset is then validated by
`validation.validate_preset`. Invalid presets are dropped.

### 5. Frontend uses only documented APIs

The wizard's frontend uses only the documented ComfyUI APIs:
`app.registerExtension`, `nodeType.prototype.onNodeCreated`,
`nodeType.prototype.onRemoved`, `node.addDOMWidget`,
`app.api.storeUserData`, `LiteGraph.createNode`, and
`graph.convertToSubgraph` (when available). It does not monkey-patch
unrelated prototypes.

### 6. DOM and event cleanup

The wizard's frontend removes its event listeners, observers, and
DOM nodes when the wizard node is removed. The `onRemoved` hook is
the standard place to do this, and the wizard uses it.

### 7. The wizard never executes user library code

The wizard loads the user library as JSON. It does not interpret any
field of the library as code. The Library editor's Save and Import
buttons write JSON to disk; the wizard never runs the saved content.

### 8. The wizard never modifies the user's shell

The wizard never executes shell commands, never modifies
`~/.bashrc` or `~/.profile`, never installs system services, never
modifies the Windows Registry.

### 9. The wizard never writes outside approved directories

The wizard's only write target is `<user_directory>/Krea2PromptWizard/`.
The wizard's only read targets are the bundled data files and the
user library file. The wizard never touches the model directory, the
output directory, the ComfyUI custom-nodes directory, or the host's
file system outside the project.

### 10. Backend is robust against malformed state

The wizard's backend never raises during execution. A malformed
`wizard_state_json` falls back to the base prompt with a warning.
This ensures the queue never blocks because of wizard issues.

## Out of scope

The wizard does not protect against:

1. A malicious ComfyUI installation. ComfyUI itself has its own
   threat model. The wizard trusts the ComfyUI APIs it uses.
2. A malicious third-party custom node. If a custom node reads
   `wizard_state_json` and uses it in an unsafe way, the wizard
   cannot prevent that. The wizard's STRUCTURE is safe; the wizard
   does not guarantee that other code will treat the state safely.
3. A user with write access to the wizard's bundled data. The
   bundled data is signed by being part of the install; if a user
   modifies it, they have already broken the trust boundary.

## Conclusion

The wizard is designed for **transparency, not security through
obscurity**. The user can read every line of the wizard's source.
The user can run the wizard in an offline environment. The user
can verify the wizard's behaviour with the bundled test suite.
The user can remove the wizard at any time by deleting the project
directory.
