"""The refiner over a server the user already runs: one OpenAI-compatible client.

The in-process backend (`refine_local.py`) is the default for the reason it
states itself. This module is for the machine where that argument runs the
other way: an LM Studio or Ollama that is already resident for other work,
a llama.cpp server, a box on the LAN — all of which speak the same
chat-completions dialect, so "support everything" is a base URL and a model
name. Structure and security model follow roadmaus/ComfyUI-Continuity's
`refine_remote.py` (MIT).

**Where the key lives, and where it never goes.** The API key is written
once, through the save route, into its own file in ComfyUI's user directory
— not into the settings file people paste into bug reports. The status
route answers "a key is set", never the key. The key is bound to the URL it
was saved with: moving the endpoint without a new key drops the old one, so
no one who can reach the (unauthenticated) ComfyUI server can repoint the
URL and collect the credential. A key travels only over HTTPS or to
loopback. Errors are scrubbed before they are raised.

Everything below stdlib: `urllib` is the whole transport, so this adds no
dependency and the pure suite can test the URL rules and the key binding.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from .refine_prompts import NUM_PREDICT, RefineError

# Its own file, not a corner of the prefs file: prefs are convenience
# metadata people sync; a credential must not be.
FILE = "krea2_studio_refiner.json"

# How long one call may sit on the wire. Connect fails in seconds on its
# own; this is the read side, and a local server on a big model genuinely
# runs for minutes with nothing arriving.
TIMEOUT = 600

# What a fetched error body may contribute to a message shown in the panel.
ERROR_EXCERPT = 300


class ConfigError(ValueError):
    """A URL or key this module will not store, with the reason."""


class ServerError(RefineError):
    """The server answered with an error status; carries the pieces the
    parameter negotiation reads while staying a RefineError."""

    def __init__(self, message, code, detail):
        super().__init__(message)
        self.code = code
        self.detail = detail


# ---- the credentials file ----------------------------------------------------


def _path():
    import folder_paths

    return os.path.join(folder_paths.get_user_directory(), FILE)


def _read():
    try:
        with open(_path(), "r", encoding="utf-8") as handle:
            stored = json.load(handle)
    except (OSError, ValueError):
        return {}
    return stored if isinstance(stored, dict) else {}


def _write(entry):
    target = _path()
    os.makedirs(os.path.dirname(target), exist_ok=True)
    # Owner-only from the first byte — open-then-chmod leaves a window in
    # which the umask decides who read the key. Atomic for the same reason
    # every settings write here is: a half-written file must not eat the key.
    temporary = f"{target}.tmp"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(entry, handle, indent=2)
    os.replace(temporary, target)


def _loopback(host):
    """Traffic to this host never leaves the machine."""
    host = (host or "").lower().strip("[]")
    return host in ("localhost", "::1") or host.startswith("127.")


def normalize_url(url):
    """A pasted URL -> the base the two endpoints hang off, or ConfigError.

    Tolerant of the obvious paste — a trailing slash, or the full
    `/chat/completions` copied out of a provider's docs. Not tolerant of a
    missing or non-HTTP scheme: `file:` here would be a read primitive on
    the server's disk dressed as a setting.
    """
    url = (url or "").strip().rstrip("/")
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ConfigError(
            "the server URL must start with http:// or https:// — "
            "e.g. http://localhost:1234/v1 for LM Studio"
        )
    for tail in ("/chat/completions", "/completions", "/models"):
        if url.endswith(tail):
            url = url[: -len(tail)]
    return url


def configure(url, key=None):
    """Store the endpoint, holding the key-to-URL binding.

    `key=None` means "no key arrived in this save": kept only while the URL
    is the one it was saved against, dropped the moment the URL moves. An
    empty string is the explicit gesture "forget the key".
    """
    url = normalize_url(url)
    stored = _read()
    if key is None:
        key = stored.get("key", "") if url and url == stored.get("url") else ""
    key = (key or "").strip()
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in key):
        raise ConfigError("the API key contains control characters — check the paste")
    if key and not url:
        raise ConfigError("a key needs a server URL to belong to")
    _write({"url": url, "key": key})
    return status()


def status():
    """What the browser may know: the URL, and *whether* a key is set."""
    stored = _read()
    return {"url": stored.get("url", ""), "key_set": bool(stored.get("key"))}


# ---- the wire ----------------------------------------------------------------


def _scrub(text, key):
    """Blot the key out of text bound for a message or a log."""
    return text.replace(key, "•••") if key else text


def _headers(url, key):
    headers = {"Content-Type": "application/json"}
    if key:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" and not _loopback(parsed.hostname):
            raise RefineError(
                f"the refiner will not send your API key over plain http to "
                f"{parsed.hostname} — use https, or clear the key for an open "
                f"local server"
            )
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _request(url, key, payload=None, timeout=TIMEOUT):
    """One HTTP exchange -> the parsed JSON body, every failure a RefineError.

    The provider's own complaint is worth relaying — "model not found" beats
    "400" — so an error body is excerpted, scrubbed and passed on.
    """
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=_headers(url, key),
                                     method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            body = json.loads(exc.read(4096).decode("utf-8", "replace"))
            error = body.get("error")
            detail = (error.get("message") if isinstance(error, dict) else error) or ""
            param = error.get("param") if isinstance(error, dict) else None
            if param and str(param) not in str(detail):
                detail = f"{detail} (param: {param})"
        except (OSError, ValueError):
            pass
        detail = _scrub(str(detail)[:ERROR_EXCERPT], key)
        raise ServerError(
            f"the server answered {exc.code}" + (f": {detail}" if detail else ""),
            exc.code, detail,
        ) from None
    except urllib.error.URLError as exc:
        raise RefineError(
            f"could not reach {url}: {_scrub(str(exc.reason), key)} — "
            f"is the server running?"
        ) from None
    except (OSError, ValueError) as exc:
        raise RefineError(
            f"the server's reply could not be read: {_scrub(str(exc), key)}"
        ) from None


# Where LM Studio and Ollama answer by default; the settings panel knocks on
# both before asking the user to type an address. Loopback only, keyless,
# fixed list — a probe that took a URL from a request would be an open relay.
LOCAL_SERVERS = (
    ("LM Studio", "http://localhost:1234/v1"),
    ("Ollama", "http://localhost:11434/v1"),
)
PROBE_TIMEOUT = 1.5


def list_models(url=None, key=None, timeout=TIMEOUT):
    """The model names the server offers, off its `/models` listing.

    Called with nothing, it lists for the stored endpoint — the only URL the
    routes ever hand it. Called with an explicit URL by `configure`'s
    connection test and by `probe_local` with the two loopback defaults.
    """
    if url is None:
        stored = _read()
        url, key = stored.get("url", ""), stored.get("key", "")
    if not url:
        raise RefineError("no refiner server is configured")
    body = _request(f"{url}/models", key, timeout=timeout)
    names = [entry.get("id") for entry in body.get("data") or []
             if isinstance(entry, dict) and entry.get("id")]
    return sorted(names)


def probe_local():
    """Which of `LOCAL_SERVERS` is answering right now: `[{name, url, models}]`."""
    up = []
    for name, url in LOCAL_SERVERS:
        try:
            models = list_models(url, "", timeout=PROBE_TIMEOUT)
        except RefineError:
            continue
        up.append({"name": name, "url": url, "models": models})
    return up


# What `chat` may give up when a server refuses it by name. Hosted reasoning
# models reject sampling controls outright, and a 400 the user cannot act on
# is the wrong place to stop: the parameters are preferences, the request is
# the prompt. `max_tokens` renames to its successor when the complaint says
# so, so the reply-length budget survives the newer dialect.
NEGOTIABLE = ("temperature", "seed", "max_tokens", "reasoning_effort")


def adapt(detail, payload):
    """Rewrite `payload` past a 400 naming a parameter. -> what changed, or None.

    Deliberately literal: the named parameter must be one this module sent
    and must appear in the server's own complaint, so an unrelated 400 — a
    bad model name, a malformed message — is never papered over by silently
    resending with less.
    """
    for param in NEGOTIABLE:
        if param not in payload or param not in detail:
            continue
        if param == "max_tokens" and "max_completion_tokens" in detail:
            payload["max_completion_tokens"] = payload.pop("max_tokens")
            return "max_tokens -> max_completion_tokens"
        del payload[param]
        return param
    return None


def messages(system, message):
    """The two chat turns, the one shape every server parses."""
    return [{"role": "system", "content": system},
            {"role": "user", "content": message}]


def _content(body):
    """`choices[0].message.content`, whatever shape the server gave it.

    -> `(content, finish_reason, thought)`. `thought` is whether the message
    carried a reasoning trace beside its content — `reasoning` on Ollama and
    OpenRouter, `reasoning_content` on vLLM and DeepSeek — the one fact that
    tells an empty reply from a thinking model apart from an empty reply
    from a broken one.
    """
    try:
        message = body["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        raise RefineError(
            f"the server's reply is not a chat completion: {str(body)[:ERROR_EXCERPT]}"
        ) from None
    content = message.get("content")
    if isinstance(content, list):  # some servers return content parts
        content = "".join(part.get("text", "") for part in content
                          if isinstance(part, dict))
    thought = any(str(message.get(key) or "").strip()
                  for key in ("reasoning", "reasoning_content"))
    return content or "", (body.get("choices") or [{}])[0].get("finish_reason"), thought


def chat(model, system, message, images=(), temperature: float = 0.3, seed: int = -1,
         max_tokens=None, prefill: str = "") -> str:
    """One generation -> the assistant's raw content string.

    The same signature as `refine_local.chat`. `prefill` shapes nothing:
    chat-completions has no slot for beginning the assistant's turn, so the
    JSON shape rides on the system prompt alone and on `json_object`'s
    tolerance for a fenced or prefaced object.
    """
    stored = _read()
    url, key = stored.get("url", ""), stored.get("key", "")
    if not url:
        raise RefineError(
            "no refiner server is configured — set its URL in the refiner's settings")
    from .refine_prompts import reply_tokens

    max_tokens = reply_tokens(max_tokens) if max_tokens is not None else NUM_PREDICT

    payload = {
        "model": model,
        "messages": messages(system, message),
        "temperature": max(float(temperature), 0.0),
        "max_tokens": max_tokens,
        "stream": False,
    }
    if int(seed) >= 0:
        payload["seed"] = int(seed)
    # Reasoning off: a thinking model left to its default spends the whole
    # reply budget on a trace and returns no content. A provider that rejects
    # the word 400s and `adapt` sheds it.
    payload["reasoning_effort"] = "none"

    for _ in range(len(NEGOTIABLE) + 1):
        try:
            body = _request(f"{url}/chat/completions", key, payload)
            break
        except ServerError as exc:
            if exc.code != 400 or not adapt(exc.detail, payload):
                raise

    content, finish, thought = _content(body)
    if not content.strip():
        if thought:
            spent = (body.get("usage") or {}).get("completion_tokens")
            raise RefineError(
                f"'{model}' spent its whole reply"
                + (f" of {spent} tokens" if spent else "")
                + " thinking and never reached the answer. Raise the reply "
                "length in the refiner's settings, or pick a model that does "
                "not think."
            )
        raise RefineError(
            f"'{model}' returned nothing — a reasoning model may have spent the "
            f"whole budget thinking. Raise the reply length, or pick another model."
        )
    if finish == "length":
        raise RefineError(
            f"'{model}' ran out of room after {max_tokens} tokens and the reply "
            f"is cut off. Raise the reply length in the refiner's settings."
        )
    return content
