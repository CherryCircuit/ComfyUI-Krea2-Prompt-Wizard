/**
 * Pure caret math for the Prompt Studio editor.
 *
 * The editor renders the document as a flat list of children: plain text
 * nodes, zero-width sentinel text nodes, and atomic token spans. For
 * offset math each child collapses to `{kind, docLen}` where `docLen` is
 * the number of document-string characters it represents (sentinels are
 * zero; token spans are the length of their serialized marker).
 *
 * Keeping these conversions pure makes the round-trip
 * document ⇄ caret-position unit-testable without a DOM.
 */

/**
 * @typedef {{kind: "text"|"sentinel"|"token", docLen: number}} ChildInfo
 */

/** Total document length represented by a child list. */
export function totalLength(children) {
  let total = 0;
  for (const child of children) total += child.docLen;
  return total;
}

/**
 * Convert a point inside a child to a document offset.
 *
 * `offsetInChild` semantics: text → character offset; sentinel → anything
 * (maps to the sentinel position, doc offset `acc`); token → 0 = token
 * start boundary, >0 = token end boundary.
 *
 * When `isEnd` is false and the point falls strictly inside a token, the
 * result retracts to the token start (selection starts snap outward to
 * cover the whole pill); with `isEnd` true they extend to the token end.
 */
export function offsetOfPoint(children, index, offsetInChild, isEnd = true) {
  if (index >= children.length) return totalLength(children);
  let acc = 0;
  for (let i = 0; i < index; i++) acc += children[i].docLen;
  const child = children[index];
  if (child.kind === "sentinel") return acc;
  if (child.kind === "token") {
    if (offsetInChild > 0) return isEnd ? acc + child.docLen : acc;
    return acc;
  }
  return acc + Math.max(0, Math.min(child.docLen, offsetInChild));
}

/**
 * Convert a document offset to a caret point `{index, offsetInChild}`.
 *
 * Tokens collapse to their boundaries: `(tokenIndex, 0)` for "before" and
 * `(tokenIndex, 1)` for "after". Sentinels keep their own index so the
 * editor can place a real (visible) caret position there.
 */
export function pointForOffset(children, target) {
  // No early end-of-document return here: a trailing sentinel should win
  // over the past-the-end boundary (it is a real caret position).
  let acc = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const len = child.docLen;
    // A sentinel sitting exactly at `target` is the preferred caret home:
    // it is a real (zero-width) text position the browser can show.
    if (child.kind === "sentinel" && target === acc) {
      return { index: i, offsetInChild: 0 };
    }
    if (target < acc + len) {
      if (child.kind === "token") {
        return { index: i, offsetInChild: target === acc ? 0 : 1 };
      }
      if (child.kind === "sentinel") {
        return { index: i, offsetInChild: 0 };
      }
      return { index: i, offsetInChild: target - acc };
    }
    acc += len;
  }
  return { index: children.length, offsetInChild: 0 };
}
