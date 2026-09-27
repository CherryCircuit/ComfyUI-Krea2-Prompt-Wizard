/**
 * Pure tokenizer + document operations for the Krea2 Prompt Studio (v2).
 *
 * A studio document is plain text mixed with token markers:
 *
 *   "Hello {{krea2:character_serena|SERENA}} walks in."
 *
 * The marker references a preset by stable id; the display label is a
 * fallback hint shown when the preset itself cannot be resolved.
 *
 * This module is the JavaScript mirror of `src/studio/tokens.py`. The
 * backend stays the authoritative compiler at execution time; the mirror
 * powers the live editor, preview and the pure unit tests.
 */

export const TOKEN_PREFIX = "{{krea2:";
export const TOKEN_SUFFIX = "}}";
export const TOKEN_ID_RE = /^[A-Za-z0-9_-]+$/;

const TOKEN_RE = /\{\{krea2:([A-Za-z0-9_-]+)(?:\|([^}]*))?\}\}/g;

/**
 * Parse a document into segments: {type:"text", value, start, end} and
 * {type:"token", id, label, raw, start, end}. Offsets index into the
 * document string so the editor can splice without re-parsing.
 * @param {string} doc
 * @returns {Array<{type:string, value?:string, id?:string, label?:string, raw?:string, start:number, end:number}>}
 */
export function parseDocument(doc) {
  const segments = [];
  const source = String(doc ?? "");
  let pos = 0;
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match.index > pos) {
      segments.push({ type: "text", value: source.slice(pos, match.index), start: pos, end: match.index });
    }
    segments.push({
      type: "token",
      id: match[1],
      label: (match[2] || "").trim(),
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
    pos = match.index + match[0].length;
  }
  if (pos < source.length) {
    segments.push({ type: "text", value: source.slice(pos), start: pos, end: source.length });
  }
  return segments;
}

/** Serialize one token marker. */
export function tokenMarkup(id, label = "") {
  let pid = String(id ?? "").trim();
  if (!TOKEN_ID_RE.test(pid)) pid = pid.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
  const cleanLabel = String(label ?? "").trim();
  return cleanLabel ? `{{krea2:${pid}|${cleanLabel}}}` : `{{krea2:${pid}}}`;
}

/** Replace [start, end) in doc with text. Pure. */
export function replaceRange(doc, start, end, text) {
  const source = String(doc ?? "");
  const s = Math.max(0, Math.min(source.length, start));
  const e = Math.max(s, Math.min(source.length, end));
  return source.slice(0, s) + String(text ?? "") + source.slice(e);
}

/**
 * All token ranges as {id, label, raw, start, end}, sorted by position.
 * @param {string} doc
 */
export function tokenRanges(doc) {
  return parseDocument(doc).filter((segment) => segment.type === "token");
}

/**
 * Find the token whose range contains `offset` (boundaries inclusive on
 * the end edge so a caret sitting right after a token belongs to it).
 * @returns {{id, label, raw, start, end} | null}
 */
export function tokenAt(doc, offset) {
  for (const token of tokenRanges(doc)) {
    if (offset > token.start && offset <= token.end) return token;
  }
  return null;
}

/**
 * Render the human-readable raw view: tokens become [LABEL] (or the
 * current preset label via resolveLabel) and unknown presets become
 * [MISSING: id].
 * @param {string} doc
 * @param {(id: string) => string | null | undefined} [resolveLabel]
 */
export function rawDisplay(doc, resolveLabel) {
  let out = "";
  for (const segment of parseDocument(doc)) {
    if (segment.type === "text") {
      out += segment.value;
      continue;
    }
    const resolved = resolveLabel ? resolveLabel(segment.id) : undefined;
    const label = resolved === undefined ? segment.label : resolved || "";
    out += label ? `[${label}]` : `[MISSING: ${segment.id}]`;
  }
  return out;
}

/**
 * Expand a document against a preset lookup. Used by the live preview;
 * mirrors src/studio/compiler.py.
 * @param {string} doc
 * @ {(id: string) => {prompt: string, negative: string, enabled: boolean} | null | undefined} lookup
 * @returns {{prompt: string, negative: string, raw: string, usedIds: string[], missingIds: string[]}}
 */
export function compileDocument(doc, lookup) {
  const parts = [];
  const negatives = [];
  const seenNegative = new Set();
  const usedIds = [];
  const missingIds = [];
  for (const segment of parseDocument(doc)) {
    if (segment.type === "text") {
      parts.push(segment.value);
      continue;
    }
    const preset = lookup ? lookup(segment.id) : null;
    if (!preset || preset.enabled === false) {
      if (!missingIds.includes(segment.id)) missingIds.push(segment.id);
      parts.push(`[MISSING: ${segment.id}]`);
      continue;
    }
    if (!usedIds.includes(segment.id)) usedIds.push(segment.id);
    parts.push(String(preset.prompt ?? "").trim());
    const negative = String(preset.negative ?? "").trim();
    if (negative) {
      for (const clause of negative.split(/[\n,]+/)) {
        const piece = clause.trim();
        const key = piece.toLowerCase();
        if (piece && !seenNegative.has(key)) {
          seenNegative.add(key);
          negatives.push(piece);
        }
      }
    }
  }
  return {
    prompt: cleanSpacing(parts.join("")),
    negative: negatives.join(", "),
    raw: rawDisplay(doc, (id) => {
      const preset = lookup ? lookup(id) : null;
      return preset && preset.enabled !== false ? preset.name ?? null : null;
    }),
    usedIds,
    missingIds,
  };
}

/** Collapse doubled spaces / exactly-doubled punctuation (mirror of Python clean_spacing). */
export function cleanSpacing(text) {
  let out = String(text ?? "").replace(/\u00a0/g, " ");
  out = out.replace(/[ \t]+/g, " ");
  out = out.replace(/ +\n/g, "\n");
  out = out.replace(/\n +/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/([.,;:!?])\1+/g, (run) => (run.length === 2 ? run[0] : run));
  return out.trim();
}

/** Count words (whitespace separated) and token occurrences. */
export function documentStats(doc) {
  const source = String(doc ?? "");
  const words = source.trim() ? source.trim().split(/\s+/).length : 0;
  return { words, tokens: tokenRanges(source).length, chars: source.length };
}
