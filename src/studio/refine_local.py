"""Where the refiner's model runs: a VLM loaded as a ComfyUI text encoder.

The design follows roadmaus/ComfyUI-Continuity's `refine_local.py` (MIT):
the weights live in ComfyUI's own process, loaded through the ordinary
`comfy.sd.load_clip` path so they are one entry in ComfyUI's model list —
offloaded, evicted by the next sampler pass, and handed back after each
generation. A second runtime (an Ollama, a llama.cpp server) would be VRAM
ComfyUI cannot see or reclaim; `refine_remote.py` is the deliberate
exception for a server the user already keeps resident.

The model must be a *full* Qwen3-VL or Qwen3.5 text-encoder checkpoint that
can generate: H3's own `qwen3vl_32b` conditioning encoder is truncated to 50
of 64 layers with no language head and would produce noise, so it is named
specifically rather than failing with a KeyError.

Everything except the loading lives in `refine_prompts.py` and is
unit-tested without torch.
"""
from __future__ import annotations

import gc
import random

from . import refine_prompts
from .refine_prompts import RefineError

# ComfyUI's own `TextGenerate` sampling defaults, tuned for exactly this —
# a small instruct model asked for one structured answer.
TOP_K = 64
TOP_P = 0.95
MIN_P = 0.05
REPETITION_PENALTY = 1.05

# The kinds ComfyUI loads standalone with a way back to vocabulary and that
# speak the ChatML `chatml` writes. Kept in step with Continuity's list;
# the 32B is named so picking it produces the real reason, not a KeyError.
SUPPORTED = (
    "qwen3vl_4b", "qwen3vl_8b",
    "qwen35_08b", "qwen35_2b", "qwen35_4b", "qwen35_9b", "qwen35_27b",
)
TRUNCATED = "qwen3vl_32b"

# Who this generation says it is on ComfyUI's progress channel — a button,
# not a graph step, so it does not borrow whichever node ran last.
PROGRESS_ID = "krea2-refine"

# ComfyUI's interrupt derives from BaseException, so it is re-raised as a
# plain message rather than swallowed by the general handler below.
try:  # pragma: no cover - import shape differs across ComfyUI versions
    from comfy.model_management import InterruptProcessingException
except Exception:  # tests, or anywhere outside ComfyUI
    class InterruptProcessingException(BaseException):  # type: ignore[no-redef]
        pass


class _ProgressContext:
    """A name for this generation's ticks where there is not one already.

    `BaseGenerate.generate` ticks a progress bar once per token; without an
    executing context it falls back to `PromptServer.last_prompt_id`, which
    `main.py` only assigns when a prompt runs — so a refine pressed before
    the session's first queue would crash. Entering a context of our own
    takes both ids from there and never reaches that fallback.
    """

    def __enter__(self):
        try:
            from comfy_execution.utils import CurrentNodeContext
        except Exception:
            return self
        self._token = CurrentNodeContext(prompt_id=PROGRESS_ID, node_id=PROGRESS_ID)
        self._token.__enter__()
        return self

    def __exit__(self, *exc):
        return getattr(self, "_token", None) and self._token.__exit__(*exc)


# ---- the model ---------------------------------------------------------------

_loaded = {"name": None, "clip": None}


def list_models() -> list:
    """Text encoder files on disk, as `folder_paths` knows them.

    Unfiltered on purpose: whether a file can generate is judged on the
    loaded model in `_check`, where the answer is real — a name filter
    would hide a renamed Qwen3-VL and show unusable T5s.
    """
    try:
        import folder_paths
    except ImportError:  # tests, or anywhere outside ComfyUI
        return []
    return list(folder_paths.get_filename_list("text_encoders"))


def _check(clip, name: str):
    """Refuse a text encoder that cannot generate, saying which kind it is."""
    inner = getattr(clip.cond_stage_model, clip.cond_stage_model.clip)
    kind = getattr(clip.cond_stage_model, "clip_name", "")

    if kind == TRUNCATED:
        raise RefineError(
            f"'{name}' is H3's own conditioning encoder — Qwen3-VL-32B truncated "
            f"to 50 of its 64 layers, with no final norm and no language head. "
            f"It has nothing to decode text with. Load a separate Qwen3-VL or "
            f"Qwen3.5 text encoder for the refiner."
        )
    if kind not in SUPPORTED:
        raise RefineError(
            f"'{name}' loads as {kind or 'an unrecognised text encoder'}. The "
            f"refiner writes Qwen's chat format, so it needs a Qwen3-VL (4B, 8B) "
            f"or Qwen3.5 (0.8B to 27B) text encoder in models/text_encoders."
        )

    # A model consumed as a mid-network tap is truncated the same way H3's is,
    # whatever it is called. Checked on the config rather than the name,
    # because that is where the fact lives.
    try:
        config = inner.transformer.model.config
    except AttributeError:
        config = None
    if config is not None and not getattr(config, "final_norm", True):
        raise RefineError(
            f"'{name}' is a truncated conditioning checkpoint — no final norm, "
            f"so no usable output layer. Load a full Qwen3-VL text encoder instead."
        )
    return clip


def load(name: str):
    """The chosen text encoder, loaded once and kept.

    Kept because the alternative is reading several gigabytes off disk every
    time the button is pressed. Keeping the object does not keep the VRAM:
    `CLIP.generate` goes through ComfyUI's model management, so the weights
    are evicted by the next sampler pass like any other model.
    """
    if not (name or "").strip():
        raise RefineError("no text encoder chosen")
    if _loaded["name"] == name and _loaded["clip"] is not None:
        return _loaded["clip"]

    import comfy.sd
    import folder_paths

    # The old one goes first: two VLMs resident to answer one press is the
    # problem this backend exists to avoid.
    unload()

    path = folder_paths.get_full_path_or_raise("text_encoders", name)
    try:
        clip = comfy.sd.load_clip(
            ckpt_paths=[path],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )
    except RefineError:
        raise
    except Exception as exc:  # a bad file is a message, not a stack trace
        raise RefineError(f"'{name}' could not be loaded as a text encoder: {exc}") from exc

    _check(clip, name)
    _loaded.update(name=name, clip=clip)
    return clip


def release():
    """Move the held model's weights off the GPU, keeping the object and RAM.

    Called at the end of every generation: a refine may be the last thing
    that happens for an hour, and idle VRAM should be nobody's. The weights
    land back on the offload device, so the next press is a RAM-to-GPU copy
    rather than a read off disk.
    """
    if _loaded["clip"] is None:
        return
    try:
        import comfy.model_management as mm

        mm.unload_model_and_clones(_loaded["clip"].patcher)
    except Exception:  # freeing is best effort; generation already happened
        pass


def unload():
    """Drop the held model. ComfyUI frees the VRAM; this frees the rest."""
    if _loaded["clip"] is None:
        return
    try:
        import comfy.model_management as mm

        mm.unload_model_and_clones(_loaded["clip"].patcher)
    except Exception:
        pass
    _loaded.update(name=None, clip=None)
    gc.collect()


# ---- the call ----------------------------------------------------------------


def chat(name: str, system: str, message: str, images=(), temperature: float = 0.3,
         seed: int = -1, max_tokens=None, prefill: str = refine_prompts.PREFILL) -> str:
    """One generation -> the assistant's raw content string.

    Same signature as `refine_remote.chat`, which is what lets the route
    hold one call site per path. `images` is accepted for signature
    compatibility with the remote backend; Krea 2 prompting is text-only, so
    nothing here attaches pictures.

    `prefill` starts the assistant's turn inside the reply object, which is
    what holds a small model to the JSON contract; the remote backend has no
    such slot and ignores the value.
    """
    clip = load(name)
    max_tokens = refine_prompts.reply_tokens(max_tokens)

    prompt = refine_prompts.chatml(system, message, prefill=prefill)
    tokens = clip.tokenize(prompt)

    import comfy.model_management as mm

    # -1 is "new every time", drawn here: core seeds a torch.Generator with
    # whatever it is handed, so a 0 would make every reply the same reply.
    seed = int(seed)
    if seed < 0:
        seed = random.randrange(2 ** 31)

    try:
        with _ProgressContext():
            generated = clip.generate(
                tokens,
                do_sample=float(temperature) > 0,
                max_length=max_tokens,
                temperature=max(float(temperature), 0.01),
                top_k=TOP_K,
                top_p=TOP_P,
                min_p=MIN_P,
                repetition_penalty=REPETITION_PENALTY,
                seed=seed,
            )
    except RefineError:
        raise
    except InterruptProcessingException:
        raise RefineError("the rewrite was cancelled") from None
    except Exception as exc:
        raise RefineError(f"'{name}' failed while generating: {type(exc).__name__}: {exc}") from exc
    finally:
        # The generation is over either way; decoding needs the tokenizer,
        # not the weights. A button's model does not idle in VRAM.
        release()

    content = prefill + clip.decode(generated)
    if not content[len(prefill):].strip():
        raise RefineError(
            f"'{name}' returned nothing. It may have hit the token limit before "
            f"writing anything, or the prompt may be longer than its context."
        )
    if len(generated) >= max_tokens:
        raise RefineError(
            f"'{name}' ran out of room after {max_tokens} tokens and the reply is "
            f"cut off. Raise the reply length in the refiner's settings, or "
            f"shorten the prompt."
        )
    return content
