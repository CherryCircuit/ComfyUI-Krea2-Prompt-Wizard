# SECURITY

The Krea2 Prompt Wizard is built with security as a first-class
concern. This document summarises the threat model, mitigations, and
uninstall instructions. The full technical analysis lives in
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Network activity

**The wizard performs no network activity.**

- No HTTP, HTTPS, FTP, SMTP, or any other outbound traffic.
- No telemetry, analytics, or "phone home" beacons.
- No model downloads, weight fetches, or CDN calls.
- No remote JavaScript. The frontend extension loads only from the
  ComfyUI `/extensions/krea2_prompt_wizard/` static directory.
- No DNS lookups. The wizard never resolves external hostnames.

You can verify this by running the wizard in an offline environment
(e.g. a ComfyUI host with iptables blocking all outbound traffic).
The wizard continues to function normally.

## Files read and written

The wizard reads and writes only to:

| Path | Read | Write | Notes |
|---|---|---|---|
| `presets/default_library.json` (bundled) | yes | no | Read-only bundled data. |
| `presets/master_presets.json` (bundled) | yes | no | Read-only bundled data. |
| `presets/conflicts.json` (bundled) | yes | no | Read-only bundled data. |
| `<user_directory>/Krea2PromptWizard/user_library.json` | yes | yes | Atomic write with timestamped backup. |
| `<user_directory>/Krea2PromptWizard/*.bak` | no | yes | Backup of the previous file. |
| `<user_directory>/Krea2PromptWizard/.tmp_*` | no | yes | Atomic-write staging files. |

The user directory is resolved through ComfyUI's
`folder_paths.get_user_directory()` API. It is **never** constructed
from environment variables the wizard controls.

The wizard performs **no writes outside the project directory and the
user library directory**. It does not:

- Touch the model directory.
- Touch the ComfyUI custom-nodes directory.
- Touch `~/.bashrc`, `~/.profile`, or any shell configuration.
- Touch the Windows Registry.
- Modify system services.

## Subprocesses and code execution

**The wizard never executes subprocesses, never runs shell commands,
never evaluates dynamic code, and never loads remote Python or
JavaScript modules.**

The Python code uses only the standard library and ComfyUI's
documented APIs (`folder_paths`, `nodes`). The JavaScript code is
shipped as plain text under `web/js/` and is loaded only by the
ComfyUI frontend.

The wizard does **not** use `eval`, `exec`, `subprocess`, `os.system`,
`shell=True`, `popen`, `compile`, `__import__`, or `importlib` with
dynamic module names. These were not used in the development of the
project and have been audited out.

## Input validation

The wizard accepts user-supplied text in:

- The `wizard_state_json` STRING input.
- The `base_prompt_override` STRING input.
- The `wizard_state_json` widget value.
- The Library editor's *Edit as Text* input.
- Custom phrase overrides on individual rows.

All inputs are validated by the `src/validation.py` module. The
validator never executes supplied text, never imports modules, and
never builds dynamic class definitions. Validation produces a
`ValidationResult` with errors and warnings; the wizard never raises
during execution.

The backend is robust against:

- Malformed JSON.
- Missing or extra fields.
- Out-of-range intensities.
- Unbalanced parentheses.
- Empty phrases.
- Categories outside the documented list.
- Duplicate row ids.
- Nested weighted phrases.

## File I/O

User-library writes use **atomic file replacement** with the
following guarantees:

1. The wizard writes the new content to a temporary file in the same
   directory.
2. The wizard calls `os.fsync` to flush the temporary file to disk.
3. The wizard uses `os.replace` to swap the temporary file into
   place.

A timestamped backup of the previous file is created before every
save.

## Static analysis

The wizard source is short, well-commented, and free of obfuscated
code. No bytecode cache is shipped. No minified JavaScript is
shipped.

## Uninstall

To uninstall the wizard:

```
rm -rf ComfyUI/custom_nodes/ComfyUI-Krea2-Prompt-Wizard
```

To also remove your user data:

```
rm -rf <user_directory>/Krea2PromptWizard
```

The wizard does not install any system-level services, cron jobs, or
shell configuration. There is no daemon to kill. There is no
auto-update mechanism.

## Reporting vulnerabilities

Please open an issue at
https://github.com/ComfyUI-Krea2-Prompt-Wizard/ComfyUI-Krea2-Prompt-Wizard/issues
with the `security` label. The wizard's author is committed to a
prompt response and a coordinated disclosure.
