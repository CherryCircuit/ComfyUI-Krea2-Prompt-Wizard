# Development

This document is for contributors and maintainers.

## Repository layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full directory tree.

## Setting up the dev environment

The wizard uses only the Python standard library plus ComfyUI's
documented APIs. To develop the wizard, clone the repository and
install the development dependencies:

```
git clone https://github.com/ComfyUI-Krea2-Prompt-Wizard/ComfyUI-Krea2-Prompt-Wizard
cd ComfyUI-Krea2-Prompt-Wizard
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

There are no third-party dependencies for the backend. The frontend
ships plain JavaScript and uses no bundler.

## Running the tests

The project uses the standard library `unittest` framework. To run
all tests:

```
python3 -m unittest discover -s tests -p "test_*.py" -v
```

To run a single test file:

```
python3 -m unittest tests.test_weights -v
```

The test suite has 140 tests covering weight mapping, validation,
library IO, conflict detection, the wizard state builder, the
compiler, the assembler, the inspector, migrations, workflow
snapshots, and 4 golden prompt tests.

## Validating the library and workflows

To validate the bundled library and the bundled workflows:

```
python3 scripts/validate_library.py
python3 scripts/validate_workflows.py
```

These scripts exit non-zero if the library or workflows are invalid.

## Rebuilding the library and master presets

The bundled library and master presets are built from
`scripts/build_default_library.py` and
`scripts/build_master_presets.py`. To rebuild:

```
python3 scripts/build_default_library.py
python3 scripts/build_master_presets.py
python3 scripts/build_conflicts.py
python3 scripts/build_workflows.py
```

The build scripts are deterministic. Re-running them with the same
input produces the same output.

## Coding conventions

- Use `from __future__ import annotations` in every module.
- All public functions and classes have docstrings.
- All schema constants live in `src/schemas.py`.
- All validation routines live in `src/validation.py`.
- All user data IO lives in `src/user_paths.py`.
- Frontend modules attach their helpers to the `KREA2` global on
  `window`.
- Frontend CSS uses `var(--krea2-*)` for theme-aware colours.

## Security review checklist

Before merging any change, verify:

- The change does not introduce `eval`, `exec`, `subprocess`,
  `os.system`, `shell=True`, `compile`, or `__import__` with
  dynamic module names.
- The change does not introduce network activity.
- The change does not write outside the project directory and the
  user library directory.
- The change does not modify the bundled library without updating
  the `validation` module.
- The change does not change the wizard's schema version without
  updating the migration logic.
- The change does not break the public outputs of the existing
  nodes.

## Releasing a new version

1. Update the version in `pyproject.toml` and `__init__.py`.
2. Update `CHANGELOG.md`.
3. Re-run the build scripts.
4. Run the test suite.
5. Run the validators.
6. Create a release archive with `scripts/build_release.py`.

The release archive is a tarball named
`ComfyUI-Krea2-Prompt-Wizard-<version>.tar.gz`. It includes the
project files but excludes development artefacts (tests, scripts,
documentation, build outputs).
