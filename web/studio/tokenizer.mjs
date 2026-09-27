/**
 * Pure tokenizer + document operations for the Krea2 Prompt Studio (v2).
 *
 * A studio document is plain text mixed with token markers:
 *
 *   "Hello {{krea2:character_serena|SERENA}} walks in."
 *
 * Marker grammar (v2):
 *
 *   {{krea2:<preset_id>|<label>|@<host_id>|~}}
 *
 *   - preset_id  stable preset reference (required)
 *   - label      first optional field; human-readable fallback hint
 *   - @host_id   attachment flag: belongs to a host token (a character)
 *   - ~          randomize flag: pick a random same-slot preset at runtime
 *
 * Flags may appear in any order after the label, so v1 documents
 * ({{krea2:id|Label}}) parse unchanged.
 *
 * This module is the JavaScript mirror of `src/studio/tokens.py`. The
 * backend stays the authoritative compiler at execution time; the mirror
 * powers the live editor, preview and the pure unit tests.
 */

export const TOKEN_PREFIX = "{{krea2:";
export const TOKEN_SUFFIX = "}}";
export const TOKEN_ID_RE = /^[A-Za-z0-9_-]+$/;
export const RANDOMIZE_FLAG = "~";
export const HOST_FLAG_PREFIX = "@";

/**
 * Parse a document into segments: {type:"text", value, start, end} and
 * {type:"token", id, label, host, randomize, raw, start, end}. Offsets
 * index into the document string so the editor can splice without
 * re-parsing.
 * @param {string} doc
 */
export function parseDocument(doc) {
  const segments = [];
  const source = String(doc ?? "");
  const tokenRe = /\{\{krea2:([A-Za-z0-9_-]+)((?:\|[^}]*)?)\}\}/g;
  let pos = 0;
  let match;
  while ((match = tokenRe.exec(source)) !== null) {
    if (match.index > pos) {
      segments.push({ type: "text", value: source.slice(pos, match.index), start: pos, end: match.index });
    }
    const { label, host, randomize } = parseFields(match[2]);
    segments.push({
      type: "token",
      id: match[1],
      label,
      host,
      randomize,
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

/** Split the pipe-separated marker fields into {label, host, randomize}. */
function parseFields(fieldStr) {
  let label = "";
  let host = "";
  let randomize = false;
  let labelTaken = false;
  const fields = fieldStr ? fieldStr.split("|") : [];
  for (const rawField of fields) {
    const item = rawField.trim();
    if (!item) continue;
    if (item === RANDOMIZE_FLAG) randomize = true;
    else if (item.startsWith(HOST_FLAG_PREFIX)) host = item.slice(HOST_FLAG_PREFIX.length).trim();
    else if (!labelTaken) {
      label = item;
      labelTaken = true;
    }
  }
  return { label, host, randomize };
}

/** Serialize one token marker with canonical field order. */
export function tokenMarkup(id, label = "", { host = "", randomize = false } = {}) {
  let pid = String(id ?? "").trim();
  if (!TOKEN_ID_RE.test(pid)) pid = pid.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
  const fields = [];
  const cleanLabel = String(label ?? "").trim();
  if (cleanLabel) fields.push(cleanLabel);
  const cleanHost = String(host ?? "").trim();
  if (cleanHost) fields.push(`${HOST_FLAG_PREFIX}${cleanHost}`);
  if (randomize) fields.push(RANDOMIZE_FLAG);
  return fields.length
    ? `{{krea2:${pid}|${fields.join("|")}}}`
    : `{{krea2:${pid}}}`;
}

/** Replace [start, end) in doc with text. Pure. */
export function replaceRange(doc, start, end, text) {
  const source = String(doc ?? "");
  const s = Math.max(0, Math.min(source.length, start));
  const e = Math.max(s, Math.min(source.length, end));
  return source.slice(0, s) + String(text ?? "") + source.slice(e);
}

/** All token ranges as segments, sorted by position. */
export function tokenRanges(doc) {
  return parseDocument(doc).filter((segment) => segment.type === "token");
}

/**
 * Find the token whose range contains `offset` (boundaries inclusive on
 * the end edge so a caret sitting right after a token belongs to it).
 */
export function tokenAt(doc, offset) {
  for (const token of tokenRanges(doc)) {
    if (offset > token.start && offset <= token.end) return token;
  }
  return null;
}

/** Distinct host ids referenced by attachment tokens, in first-use order. */
export function hostIds(doc) {
  const seen = [];
  for (const token of tokenRanges(doc)) {
    if (token.host && !seen.includes(token.host)) seen.push(token.host);
  }
  return seen;
}

/** True when any token carries the randomize flag. */
export function hasRandomize(doc) {
  return /\{\{krea2:[A-Za-z0-9_-]+[^}]*~[^}]*\}\}/.test(String(doc ?? ""));
}

/**
 * Rewrite one token's optional fields in place, preserving its id.
 * Pass only the fields that should change (null/undefined = keep).
 */
export function replaceTokenFields(
  doc,
  rangeStart,
  rangeEnd,
  { label, host, randomize } = {}
) {
  for (const segment of parseDocument(doc)) {
    if (segment.type !== "token" || segment.start !== rangeStart) continue;
    const next = {
      host: host === undefined ? segment.host : host,
      randomize: randomize === undefined ? segment.randomize : Boolean(randomize),
    };
    const nextLabel = label === undefined ? segment.label : label;
    return (
      doc.slice(0, rangeStart)
      + tokenMarkup(segment.id, nextLabel, next)
      + doc.slice(rangeEnd)
    );
  }
  return doc;
}

/**
 * Insert an attachment token immediately after its host token.
 * @param {string} doc
 * @param {{start: number, end: number}} hostRange
 * @param {string} presetId
 * @param {string} label
 */
export function attachToken(doc, hostRange, presetId, label) {
  const hostToken = tokenRanges(doc).find(
    (token) => token.start === hostRange.start && !token.host
  );
  const marker = tokenMarkup(presetId, label, { host: hostToken ? hostToken.id : "" });
  return doc.slice(0, hostRange.end) + marker + doc.slice(hostRange.end);
}

/** Rewrite every attachment pointing at oldHostId to point at newHostId. */
export function remapHosts(doc, oldHostId, newHostId) {
  let out = doc;
  for (const token of tokenRanges(doc)) {
    if (token.host !== oldHostId) continue;
    out = replaceTokenFields(out, token.start, token.end, { host: newHostId });
  }
  return out;
}

/**
 * Render the human-readable raw view. Plain tokens become [LABEL];
 * attachments render inside their host's brackets as (LABEL) and stand
 * alone when their host is absent. Unknown presets become [MISSING: id].
 * @param {string} doc
 * @param {(id: string) => string | null | undefined} [resolveLabel]
 */
export function rawDisplay(doc, resolveLabel) {
  const tokens = tokenRanges(doc);
  const hostsPresent = new Set(tokens.filter((t) => !t.host).map((t) => t.id));

  const labelFor = (id, fallback) => {
    if (resolveLabel) {
      const resolved = resolveLabel(id);
      return resolved === undefined ? fallback : resolved || "";
    }
    return fallback;
  };

  let out = "";
  for (const segment of parseDocument(doc)) {
    if (segment.type === "text") {
      out += segment.value;
      continue;
    }
    if (segment.host && hostsPresent.has(segment.host)) continue; // nested below
    const label = labelFor(segment.id, segment.label);
    if (!label) {
      out += segment.host
        ? `[MISSING: ${segment.host}] (MISSING: ${segment.id})`
        : `[MISSING: ${segment.id}]`;
      continue;
    }
    if (segment.host) {
      out += `[MISSING: ${segment.host}] (${label})`;
      continue;
    }
    const attachments = tokens.filter(
      (t) => t.host === segment.id
    );
    if (attachments.length) {
      const inner = attachments
        .map((t) => {
          const attLabel = labelFor(t.id, t.label);
          return attLabel ? `(${attLabel})` : `(MISSING: ${t.id})`;
        })
        .join(" ");
      out += `[${label} ${inner}]`;
    } else {
      out += `[${label}]`;
    }
  }
  return out;
}

/**
 * Expand a document against a preset lookup. Used by the live preview;
 * mirrors src/studio/compiler.py (without the runtime randomization,
 * which only the backend performs at execution time).
 * @param {string} doc
 * @ {(id: string) => {prompt: string, negative: string, enabled: boolean} | null | undefined} lookup
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
