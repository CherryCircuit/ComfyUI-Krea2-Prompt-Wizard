"""Build a release archive.

The release archive contains the project files needed to install
the wizard. It excludes development artefacts.

Run from the project root:

    python3 scripts/build_release.py

The archive is written to ``dist/ComfyUI-Krea2-Prompt-Wizard-<version>.tar.gz``.
"""
from __future__ import annotations

import os
import shutil
import sys
import tarfile
import tempfile

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(THIS_DIR)
sys.path.insert(0, ROOT)


# Directories included in the release.
INCLUDE_DIRS = [
    "src",
    "presets",
    "subgraphs",
    "workflows",
    "web",
    "docs",
]

# Files included in the release root.
INCLUDE_FILES = [
    "__init__.py",
    "pyproject.toml",
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CHANGELOG.md",
]

# Directories excluded from the release.
EXCLUDE_DIRS = [
    "tests",
    "scripts",
    ".git",
    "__pycache__",
    ".venv",
    "node_modules",
    "dist",
    "build",
]


def _read_pyproject_version() -> str:
    with open(os.path.join(ROOT, "pyproject.toml"), "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("version") and "=" in line:
                _, value = line.split("=", 1)
                return value.strip().strip('"').strip("'")
    return "0.0.0"


def _should_skip_dir(name: str) -> bool:
    return name in EXCLUDE_DIRS


def main() -> None:
    version = _read_pyproject_version()
    dist_dir = os.path.join(ROOT, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    archive_name = f"ComfyUI-Krea2-Prompt-Wizard-{version}.tar.gz"
    archive_path = os.path.join(dist_dir, archive_name)

    # Validate the library and workflows before packaging.
    import subprocess
    print("Validating library...")
    subprocess.check_call([sys.executable, os.path.join(ROOT, "scripts", "validate_library.py")])
    print("Validating workflows...")
    subprocess.check_call([sys.executable, os.path.join(ROOT, "scripts", "validate_workflows.py")])

    # Run the test suite before packaging.
    print("Running tests...")
    subprocess.check_call([sys.executable, "-m", "unittest", "discover",
                          "-s", os.path.join(ROOT, "tests"),
                          "-p", "test_*.py"])

    print("Packaging", archive_path, "...")
    with tarfile.open(archive_path, "w:gz") as tar:
        for name in INCLUDE_FILES:
            path = os.path.join(ROOT, name)
            if not os.path.exists(path):
                print(f"  skipping missing {name}")
                continue
            tar.add(path, arcname=os.path.join("ComfyUI-Krea2-Prompt-Wizard", name))
        for sub in INCLUDE_DIRS:
            sub_path = os.path.join(ROOT, sub)
            if not os.path.isdir(sub_path):
                print(f"  skipping missing {sub}/")
                continue
            for root, dirs, files in os.walk(sub_path):
                dirs[:] = [d for d in dirs if not _should_skip_dir(d)]
                for f in files:
                    if f.endswith(".pyc"):
                        continue
                    src = os.path.join(root, f)
                    arc = os.path.relpath(src, ROOT)
                    arc = os.path.join("ComfyUI-Krea2-Prompt-Wizard", arc)
                    tar.add(src, arcname=arc)

    size = os.path.getsize(archive_path)
    print(f"  wrote {archive_path} ({size:,} bytes)")


if __name__ == "__main__":
    main()
