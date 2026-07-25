"""Test helpers shared across the test suite."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

# Ensure the project root is on sys.path so ``src`` is importable.
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)

# Default to a private user directory for tests.
TEMP_USER = tempfile.mkdtemp(prefix="krea2_user_dir_")
os.environ["COMFYUI_USER_DIR"] = TEMP_USER


def load_default_library() -> dict:
    with open(os.path.join(ROOT, "presets", "default_library.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def load_master_presets() -> dict:
    with open(os.path.join(ROOT, "presets", "master_presets.json"), "r", encoding="utf-8") as f:
        return json.load(f)


class BaseTest(unittest.TestCase):
    pass
