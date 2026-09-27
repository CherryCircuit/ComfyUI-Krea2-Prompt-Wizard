"""Filesystem paths for the Prompt Studio (v2).

Deliberately separate from the v1 wizard paths so the two generations can
evolve independently. Bundled studio presets live in ``presets/studio/``;
user presets live beside the v1 user data under the pack's user directory.
"""
from __future__ import annotations

import os

from ..package_paths import PRESETS_DIR
from .. import user_paths

BUNDLED_STUDIO_DIR = os.path.join(PRESETS_DIR, "studio")

USER_PRESETS_FILENAME = "studio_presets.json"


def studio_user_presets_path(create: bool = True) -> str:
    """Return the canonical location of the user studio preset file."""
    return os.path.join(
        user_paths.package_user_dir(create=create), USER_PRESETS_FILENAME
    )
