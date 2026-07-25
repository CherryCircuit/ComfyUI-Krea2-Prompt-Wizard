"""Shared filesystem paths for the package."""
from __future__ import annotations

import os

PACKAGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_DIR = os.path.join(PACKAGE_DIR, "presets")
WEB_DIR = os.path.join(PACKAGE_DIR, "web")

DEFAULT_LIBRARY_PATH = os.path.join(PRESETS_DIR, "default_library.json")
MASTER_PRESETS_PATH = os.path.join(PRESETS_DIR, "master_presets.json")
CONFLICTS_PATH = os.path.join(PRESETS_DIR, "conflicts.json")
