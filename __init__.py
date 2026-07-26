"""
ComfyUI-Krea2-Prompt-Wizard

A transparent, database-driven visual prompt builder for Krea 2 image generation
inside ComfyUI.

Primary node: Krea2 Prompt Wizard

This package is fully self-contained. The wizard will work without KJNodes
installed. KJNodes is used opportunistically when available through
``docs/workflows/example_kj_nodes.json`` and the optional helper builder in
``src/wizard.py`` (the public API is unchanged either way).

Project layout (Python side):

    src/
        __init__.py                 # this file
        nodes.py                    # node registration
        wizard.py                   # wizard state model + builder
        compiler.py                 # state -> prompt text
        assembler.py                # assembler pure logic
        inspector.py                # inspector formatting
        weight_mapping.py           # slider -> weight math
        library.py                  # library + user file IO
        validation.py               # backend validation
        schemas.py                  # preset / state / weight schemas
        migrations.py               # preset migrations
        conflicts.py                # conflict detection
        user_paths.py               # user directory resolver

Web side (loaded automatically because the package exposes ``WEB_DIRECTORY``):

    web/
        js/extension.js
        js/wizard_widget.js
        js/preset_row.js
        js/searchable_selector.js
        js/library_editor.js
        js/materialize.js
        js/inspector.js
        js/state.js
        css/wizard.css
"""
from __future__ import annotations

import os
import sys

# ---------------------------------------------------------------------------
_PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
if _PACKAGE_DIR not in sys.path:
    sys.path.insert(0, _PACKAGE_DIR)

from src.package_paths import CONFLICTS_PATH, DEFAULT_LIBRARY_PATH, MASTER_PRESETS_PATH, WEB_DIR

# ComfyUI loads frontend extensions from this directory.
WEB_DIRECTORY = "./web/js" if os.path.isdir(WEB_DIR) else None


# ---------------------------------------------------------------------------
# Lazy public re-exports
# ---------------------------------------------------------------------------


from src import nodes as _nodes

NODE_CLASS_MAPPINGS = _nodes.NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = _nodes.NODE_DISPLAY_NAME_MAPPINGS


__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
    "_DEFAULT_LIBRARY_PATH",
    "_MASTER_PRESETS_PATH",
    "_CONFLICTS_PATH",
]


__version__ = "1.0.0"
