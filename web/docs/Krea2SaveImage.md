# Krea2 Save Image

*Saves images with the exact generated prompt embedded as PNG metadata.*

The plain Save Image node only writes the graph JSON (`prompt`) and the
workflow (`workflow`) chunks. `Krea2 Save Image` does everything the
plain node does, **plus** it writes the exact resolved prompt text into
the PNG as its own text chunk:

| PNG chunk | Contents |
|---|---|
| `prompt` | The graph JSON (same as Save Image) — or the plain prompt text when *plain_prompt_metadata* is on. |
| `workflow` | The workflow JSON (same as Save Image). |
| `krea2_prompt` | The exact generated prompt text. |
| `krea2_motion_prompt` | The video motion prompt, when provided. |

Because the prompt is stored as plain text in its own chunk, it
survives graph changes and stays readable by any tool that can open PNG
metadata (ExifTool, ImageMagick, the browser, or ComfyUI's own
metadata viewers that surface custom text chunks).

## Inputs

| Input | Type | Description |
|---|---|---|
| `images` | IMAGE | The image(s) to save. |
| `filename_prefix` | STRING | Prefix for saved file names (default `Krea2`). |
| `prompt_text` | STRING | The exact generated prompt — connect the wizard's `Prompt Output`. |
| `motion_text` | STRING | Optional motion prompt — connect `Video Motion Prompt`. |
| `plain_prompt_metadata` | BOOLEAN | Off by default. When on, the `prompt` chunk contains the plain prompt text instead of the graph JSON — exactly what Timesaver / A1111-style viewers display as **Positive Prompt**. |

## Outputs

| Output | Description |
|---|---|
| `filename` | The saved file name of the last image. |

## Wiring

```
Krea2 Prompt Wizard ──Prompt Output──▶ Krea2 Save Image ──▶ (done)
        │                                  ▲ images
        │                                  │
        └──Video Motion Prompt─────────────┘ (optional)
                          │
                          └─── KSampler output ──▶ images
```

The KSampler output feeds `images`; the wizard's `Prompt Output` feeds
`prompt_text`.

## Diagnosing "my prompt is missing from the metadata"

There is no "Positive Prompt" metadata key in ComfyUI — the PNG has a
`prompt` chunk (the full graph JSON, which always contains your prompt
text on whatever node holds it) and a `workflow` chunk. Tools that show
a "Positive Prompt" (including the **Timesaver Artius Browser**) read
the `prompt` chunk and show it only when it is **plain text**; when it
is the graph JSON they hunt for nodes whose *text input is a literal
string* (linked inputs are skipped).

- With a `CLIPTextEncode` node, the graph JSON carries the literal
  prompt text, so Timesaver shows it.
- With `Krea2 Prompt Weight`, the text input is a **linked** reference
  (`[node_id, slot]`), which Timesaver skips — so nothing is shown.
  This is a metadata *format* issue, not a missing prompt.
- If the PNG has **no** `prompt` / `workflow` chunks at all, metadata
  embedding is disabled globally (`--disable-metadata`).
- **Fixes:** enable the wizard's "prompt metadata chunk" setting (the
  wizard writes the resolved prompt as the final `prompt` chunk, and
  PIL readers take the last chunk), or use `Krea2 Save Image` with
  *plain_prompt_metadata* on.

Check with ExifTool:

```
exiftool -png:all your_image.png
```

or with Python:

```python
from PIL import Image
img = Image.open("your_image.png")
print(img.text.keys())        # chunks present
print(img.text.get("krea2_prompt"))
```

## Alternative metadata-savvy savers

Several popular packs write `extra_pnginfo` keys into PNG metadata and
will also embed the wizard's `krea2_prompt` key automatically:

- **WAS Node Suite** — "Save Image" / "Save Image with Metadata".
- **ComfyUI-Image-Saver** — dedicated metadata-preserving saver.
- **ComfyUI_SaveImageWithMetaData** (MelMass).
- **Efficiency Nodes** — Save Image writes metadata.

The wizard sets `extra_pnginfo["krea2_prompt"]` on every execution, so
any of these savers will carry the prompt into the PNG without extra
wiring.
