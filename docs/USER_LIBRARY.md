# User Library

The user library is a per-user JSON file that lets each user extend
the bundled preset library with their own concepts. This document
describes the location, format, and editing workflow.

## Location

```
<user_directory>/Krea2PromptWizard/user_library.json
```

`<user_directory>` is resolved through ComfyUI's
`folder_paths.get_user_directory()` API. The wizard never assumes a
specific operating-system path.

## Format

The user library is a JSON object with the same shape as the bundled
`default_library.json`:

```json
{
  "schema_version": 1,
  "presets": [
    {
      "id": "custom.golden_hour",
      "category": "lighting_setup",
      "label": "Golden hour",
      "phrase": "golden hour",
      "default_strength": 70,
      "control_mode": "scalar",
      "aliases": ["warm light"],
      "verification": "general visual vocabulary",
      "schema_version": 1,
      "origin": "user"
    }
  ]
}
```

The `origin` field is informational. The bundled presets have
`"origin": "bundled"`; user presets have `"origin": "user"`. The
wizard's Library editor automatically tags user presets.

## Editing

The user library can be edited in three ways:

### 1. Through the Library editor

Open the Library editor from the wizard's *Library* button. The
editor supports Add, Edit, Duplicate, Delete, Disable, Favourite,
Import, Export, Restore Bundled Defaults, and *Edit as Text*.

### 2. Through the *Edit as Text* format

The *Edit as Text* mode in the Library editor uses a line-based
format that requires no JSON knowledge. Lines beginning with `#` are
comments. The format is:

```
Label | Phrase | Default Strength | Mode | Aliases | Notes
```

For example:

```
Golden hour | golden hour | 70 | scalar | warm light |
Cold day | cold day | 50 | scalar | chilly |
Density | minimal detail <> dense layered detail | 0 | bipolar | sparse |
```

For bipolar presets, the `Notes` field may contain `pos:<text>` and
`neg:<text>` segments.

### 3. By hand

You can edit `user_library.json` directly with any text editor. The
wizard will read the file on the next library load. If the file
contains invalid JSON, the wizard falls back to an empty library and
issues a warning.

## Atomic writes

The wizard writes the user library atomically. Before every write:

1. A timestamped backup is created at
   `<user_directory>/Krea2PromptWizard/user_library.<timestamp>.json.bak`.
2. The new content is written to a temporary file in the same
   directory.
3. The temporary file is flushed to disk with `fsync`.
4. The temporary file is renamed to `user_library.json` using
   `os.replace`.

If the write fails partway through, the previous file is preserved.

## Backups

The wizard creates timestamped backups before every save. Backups
are stored in the same directory as the user library. The wizard
keeps the most recent backup; older backups are not removed
automatically.

## Migrations

When a bundled preset is renamed, the wizard applies the migration
to every row in the user's workflow. The legacy id is preserved in
`legacy_preset_id` so the user can verify the migration.

If a preset is removed from the bundled library, the migration
marks the preset as `deprecated` and points to the replacement.

## Restoring bundled defaults

Click *Restore Bundled Defaults* in the Library editor. The wizard
backs up the current user library and replaces it with an empty
user library. Bundled presets are unaffected because they are
shipped in `presets/default_library.json` and merged at load time.
