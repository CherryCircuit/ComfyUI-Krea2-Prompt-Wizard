"""User directory resolution.

This module is the single point that knows how to find the ComfyUI user
directory. It must work with or without ComfyUI fully loaded. When the
package is imported by a unit test that does not have ComfyUI available,
the implementation falls back to a safe temporary directory.

The ComfyUI backend exposes the user directory via ``folder_paths.get_user_directory``
(``Comfy-Org/ComfyUI/folder_paths.py``, commit ``f966a2b``). We dynamically
import that module rather than assuming it is importable at test time.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional


_KNOWN_USER_DIR_ENVS = (
    "COMFYUI_USER_DIR",
    "COMFY_USER_DIRECTORY",
)


def _env_user_dir() -> Optional[str]:
    """Return the user directory from environment variables, if any."""
    for env in _KNOWN_USER_DIR_ENVS:
        path = os.environ.get(env)
        if path:
            return path
    return None


def _comfyui_user_dir() -> Optional[str]:
    """Resolve the user directory using the ComfyUI runtime if available."""
    try:
        import folder_paths  # type: ignore
    except Exception:
        return None
    try:
        getter = getattr(folder_paths, "get_user_directory", None)
        if callable(getter):
            return str(getter())
    except Exception:
        return None
    return None


def _fallback_user_dir() -> str:
    """Return a process-scoped temporary directory as a final fallback.

    The fallback is used by tests and by code that imports this module
    outside of a ComfyUI installation. It is never written to during
    normal operation; unit tests patch it explicitly.
    """
    return os.path.join(tempfile.gettempdir(), "comfyui_user_dir")


def user_directory() -> str:
    """Return the absolute path to the ComfyUI user directory.

    Resolution order:

    1. ``COMFYUI_USER_DIR`` / ``COMFY_USER_DIRECTORY`` environment variables.
    2. ``folder_paths.get_user_directory()`` from the running ComfyUI.
    3. A process-scoped temporary directory (safe fallback for tests).
    """
    env = _env_user_dir()
    if env:
        return os.path.abspath(env)
    runtime = _comfyui_user_dir()
    if runtime:
        return os.path.abspath(runtime)
    return os.path.abspath(_fallback_user_dir())


def package_user_dir(create: bool = True) -> str:
    """Return the absolute path to the wizard's user directory.

    The package writes to ``<user_directory>/Krea2PromptWizard/`` and never
    to any other location. ``create`` controls whether the directory is
    captured if it does not already exist.
    """
    path = os.path.join(user_directory(), "Krea2PromptWizard")
    if create:
        os.makedirs(path, exist_ok=True)
    return path


def user_library_path(create: bool = True) -> str:
    """Return the canonical location of the user-side library file."""
    path = os.path.join(package_user_dir(create=create), "user_library.json")
    return path


def user_saved_presets_path(create: bool = True) -> str:
    """Return the canonical location of full-prompt and group presets."""
    return os.path.join(package_user_dir(create=create), "saved_presets.json")


def atomic_write(path: str, data: bytes) -> None:
    """Replace ``path`` atomically with ``data``.

    Writes to a temporary file in the same directory and uses ``os.replace``
    to perform the swap. This is the supported durability pattern for the
    wizard's user data.
    """
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        mode="wb",
        delete=False,
        prefix=".tmp_",
        suffix=os.path.splitext(path)[1],
        dir=parent or None,
    )
    try:
        tmp.write(data)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, path)
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise


def timestamp_backup(path: str, suffix: str = ".bak") -> Optional[str]:
    """Create a timestamped backup of ``path`` next to it.

    Returns the backup path or ``None`` if the source file does not exist.
    """
    if not os.path.exists(path):
        return None
    parent = os.path.dirname(path)
    base = os.path.basename(path)
    name, ext = os.path.splitext(base)
    stamp = time_str()
    backup = os.path.join(parent, f"{name}.{stamp}{ext}{suffix}")
    import shutil

    shutil.copy2(path, backup)
    return backup


def time_str() -> str:
    """Return a filesystem-safe timestamp string."""
    import datetime as _dt

    return _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
