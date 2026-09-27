"""Krea2 Prompt Wizard v2 ("Prompt Studio").

A token-based prompt editor. Users write normal text and insert preset
tokens such as ``{{krea2:character_serena|SERENA}}``; the frontend renders
those markers as colored inline pills and the backend expands every token
into its stored preset expansion at execution time.

Modules:

    presets.py     preset schema, bundled + user loading, tolerant validation
    compiler.py    document tokenizer and prompt compiler (pure logic)
    nodes.py       ComfyUI node registration
    api.py         HTTP routes for preset CRUD

This package is intentionally independent of the v1 wizard modules so the
two node generations cannot interfere with each other.
"""
