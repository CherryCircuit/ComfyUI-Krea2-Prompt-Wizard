/**
 * Rich token editor for the Krea2 Prompt Studio.
 *
 * Architecture (mirrors the proven approach used by rich prompt editors in
 * ComfyUI): the document string with inline {{krea2:id|Label}} markers is
 * the single source of truth, stored in the node's `prompt_doc` widget.
 * The visible surface is a contentEditable div that renders that string as
 * plain text nodes plus atomic, non-editable token spans. Every user input
 * is intercepted via `beforeinput`, translated into a splice on the
 * document string, and the view is re-rendered from the model. This keeps
 * tokens perfectly atomic (backspace deletes a whole pill) and makes
 * copy/paste round-trip: serialized markers paste back as tokens.
 *
 * Attachments (outfits, emotions on a character) are markers with a
 * `@host` field. When an attachment marker sits immediately after its
 * host marker — the normal case, enforced at insert time — the two are
 * rendered as ONE merged element: the host pill visually containing the
 * attachment sub-pill. The merged element's doc length is the combined
 * marker length, so caret math stays exact.
 *
 * Each pill carries a small dice toggle that flags the token for runtime
 * randomization (`~`): the backend then picks a random same-slot preset
 * on every execution.
 *
 * Undo/redo uses a private stack because continuous re-rendering defeats
 * the browser's DOM-level undo. Plain-text mode is a genuine <textarea>
 * fallback for environments or users that prefer raw markers.
 */
import {
  parseDocument,
  tokenMarkup,
  replaceRange,
  replaceTokenFields,
  attachToken,
  remapHosts,
  tokenAt,
  tokenRanges,
  compileFramedDocument,
  documentStats,
  hasFrames,
  FRAME_FIRST,
  FRAME_LAST,
} from "./tokenizer.mjs?v=3";
import { offsetOfPoint, pointForOffset } from "./caret_math.mjs?v=3";
import { presetStore, tokenTooltip } from "./preset_store.mjs?v=3";

const SENTINEL = "\u200B"; // zero-width space: gives the caret a home between tokens

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sentinelNode() {
  return document.createTextNode(SENTINEL);
}

function isSentinel(node) {
  return node.nodeType === Node.TEXT_NODE && node.textContent === SENTINEL;
}

/** ChildInfo for caret math: what a rendered child contributes to the doc. */
function childInfo(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return isSentinel(node)
      ? { kind: "sentinel", docLen: 0 }
      : { kind: "text", docLen: node.textContent.length };
  }
  if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.raw !== undefined) {
    return { kind: "token", docLen: node.dataset.raw.length };
  }
  return { kind: "text", docLen: node.textContent ? node.textContent.length : 0 };
}

export function createStudioEditor({
  onChange = () => {},
  onTokenPopup = () => {},
  onOpenChooser = () => {},
  onModeChange = () => {},
} = {}) {
  const root = el("div", "kpw2-editor-root");
  const editor = el("div", "kpw2-editor");
  editor.contentEditable = "true";
  editor.spellcheck = false;
  editor.dataset.placeholder = "Write your prompt…  Type [ to insert a preset";
  const plain = el("textarea", "kpw2-editor-plain");
  plain.spellcheck = false;
  plain.style.display = "none";

  root.append(editor, plain);

  const state = {
    doc: "",
    mode: "rich", // "rich" | "plain"
    history: [],
    historyIndex: -1,
    lastCaret: null, // {start, end} remembered even when focus moves away
    lastEditAt: 0,
    lastCoalesceKey: null,
    composing: false,
    defaultPrevented: false,
  };

  // ------------------------------------------------------------------ model

  function notify() {
    onChange(state.doc, documentStats(state.doc));
  }

  function pushHistory(coalesceKey = null) {
    const now = Date.now();
    const top = state.history[state.historyIndex];
    const canCoalesce =
      coalesceKey &&
      top &&
      top.coalesceKey === coalesceKey &&
      now - state.lastEditAt < 700 &&
      state.historyIndex === state.history.length - 1;
    state.lastEditAt = now;
    if (canCoalesce) {
      top.doc = state.doc;
      top.caret = state.lastCaret;
      return;
    }
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ doc: state.doc, caret: state.lastCaret, coalesceKey });
    if (state.history.length > 200) state.history.shift();
    state.historyIndex = state.history.length - 1;
    state.lastCoalesceKey = coalesceKey;
  }

  function applyDoc(nextDoc, caret, { coalesceKey = null, notify: notifyChange = true } = {}) {
    state.doc = String(nextDoc ?? "");
    state.lastCaret = caret
      ? {
          start: Math.max(0, Math.min(state.doc.length, caret.start)),
          end: Math.max(0, Math.min(state.doc.length, caret.end)),
        }
      : null;
    if (state.mode === "rich") {
      render();
    } else {
      if (plain.value !== state.doc) plain.value = state.doc;
    }
    pushHistory(coalesceKey);
    if (notifyChange) notify();
  }

  function undo() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    const entry = state.history[state.historyIndex];
    state.doc = entry.doc;
    state.lastCaret = entry.caret;
    render();
    if (state.mode === "rich") editor.focus();
    notify();
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    const entry = state.history[state.historyIndex];
    state.doc = entry.doc;
    state.lastCaret = entry.caret;
    render();
    if (state.mode === "rich") editor.focus();
    notify();
  }

  // ------------------------------------------------------- offset plumbing

  /** ChildInfos for the current rendered state (aligned with childNodes). */
  function infos() {
    return Array.from(editor.childNodes, childInfo);
  }

  /** Index of a node within the editor's child list (-1 when nested). */
  function indexOfChild(node) {
    for (let i = 0; i < editor.childNodes.length; i++) {
      if (editor.childNodes[i] === node) return i;
    }
    // A point inside a token span resolves to the span itself.
    for (let i = 0; i < editor.childNodes.length; i++) {
      const child = editor.childNodes[i];
      if (child.contains && child.contains(node)) return i;
    }
    return -1;
  }

  /** Convert a Range boundary point to a doc offset. */
  function offsetOfDomPoint(container, offsetInContainer, isEnd) {
    if (container === editor) {
      return offsetOfPoint(infos(), offsetInContainer, 0, isEnd);
    }
    const index = indexOfChild(container);
    if (index < 0) return state.doc.length;
    const child = editor.childNodes[index];
    if (child.nodeType === Node.TEXT_NODE) {
      return isSentinel(child)
        ? offsetOfPoint(infos(), index, 0, isEnd)
        : offsetOfPoint(infos(), index, offsetInContainer, isEnd);
    }
    // Element boundary or a point inside a token span.
    return offsetOfPoint(infos(), index, offsetInContainer > 0 ? 1 : 0, isEnd);
  }

  /** Current selection as doc offsets (points inside tokens snap outward). */
  function captureCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return state.lastCaret ?? { start: state.doc.length, end: state.doc.length };
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return state.lastCaret ?? { start: state.doc.length, end: state.doc.length };
    }
    let start = offsetOfDomPoint(range.startContainer, range.startOffset, false);
    let end = offsetOfDomPoint(range.endContainer, range.endOffset, true);
    if (end < start) [start, end] = [end, start];
    const caret = { start, end };
    state.lastCaret = caret;
    return caret;
  }

  /** Convert a doc offset to a (node, offsetInNode) caret point. */
  function domPointForOffset(target) {
    const children = editor.childNodes;
    const infosList = infos();
    const point = pointForOffset(infosList, target);
    if (point.index >= children.length) {
      return { node: editor, offset: children.length };
    }
    const child = children[point.index];
    const info = infosList[point.index];
    if (info.kind === "token") {
      return { node: editor, offset: point.offsetInChild === 0 ? point.index : point.index + 1 };
    }
    if (info.kind === "sentinel") {
      return { node: child, offset: 0 };
    }
    return { node: child, offset: point.offsetInChild };
  }

  function setCaret(start, end = start) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const a = domPointForOffset(start);
    const b = end !== start ? domPointForOffset(end) : a;
    try {
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (error) {
      console.warn("[Krea2Studio] caret restore failed", error);
    }
  }

  // ----------------------------------------------------------------- render

  function categoryClassFor(preset) {
    return preset ? `kpw2-cat-${preset.category}` : "kpw2-token-missing";
  }

  function makeDice(range) {
    const dice = el("span", "kpw2-dice", "🎲");
    dice.title = "Randomize on every run (pick a random preset from the same slot)";
    dice.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      toggleRandomize(range);
    });
    return dice;
  }

  /**
   * Build one standalone (or detached-attachment) pill.
   * @param {object} segment doc segment for the token
   * @param {boolean} detached true when an attachment's host is absent
   */
  function makeTokenSpan(segment, detached = false) {
    const preset = presetStore.get(segment.id);
    const span = el("span", "kpw2-token");
    span.contentEditable = "false";
    span.dataset.raw = segment.raw;
    span.dataset.id = segment.id;
    span.__range = { start: segment.start, end: segment.end, id: segment.id, host: segment.host };
    if (!preset || !preset.enabled) {
      span.classList.add("kpw2-token-missing");
      span.append(el("span", "kpw2-token-label", `[MISSING: ${segment.id}]`));
      span.title = `Missing preset "${segment.id}". Use the Preset Manager to restore or create it.`;
      return span;
    }
    span.classList.add(categoryClassFor(preset));
    if (detached) span.classList.add("kpw2-token-detached");
    span.append(el("span", "kpw2-token-label", preset.name));
    span.title = tokenTooltip(preset);
    if (segment.randomize) {
      span.classList.add("kpw2-token-random");
      span.append(makeDice({ start: segment.start, end: segment.end }));
    }
    return span;
  }

  /**
   * Build a host pill that visually contains its adjacent attachment
   * sub-pills. `rawCombined` covers the host marker plus every adjacent
   * attachment marker so caret math treats it as one atomic run.
   */
  function makeHostSpan(segment, attached) {
    const preset = presetStore.get(segment.id);
    const span = el("span", "kpw2-token kpw2-token-host");
    span.contentEditable = "false";
    const rawCombined = segment.raw + attached.map((a) => a.raw).join("");
    span.dataset.raw = rawCombined;
    span.dataset.id = segment.id;
    span.__range = { start: segment.start, end: segment.end, id: segment.id, host: "" };

    if (!preset || !preset.enabled) {
      span.classList.add("kpw2-token-missing");
      span.append(el("span", "kpw2-token-label", `[MISSING: ${segment.id}]`));
    } else {
      span.classList.add(categoryClassFor(preset));
      span.append(el("span", "kpw2-token-label", preset.name));
      span.title = tokenTooltip(preset);
    }
    if (segment.randomize) {
      span.classList.add("kpw2-token-random");
      span.append(makeDice({ start: segment.start, end: segment.end }));
    }

    for (const attachment of attached) {
      const attPreset = presetStore.get(attachment.id);
      const sub = el("span", "kpw2-subtoken");
      sub.contentEditable = "false";
      sub.dataset.raw = attachment.raw;
      sub.dataset.id = attachment.id;
      sub.__range = { start: attachment.start, end: attachment.end, id: attachment.id, host: attachment.host };
      if (!attPreset || !attPreset.enabled) {
        sub.classList.add("kpw2-token-missing");
        sub.append(el("span", "kpw2-token-label", `[MISSING: ${attachment.id}]`));
      } else {
        sub.classList.add(categoryClassFor(attPreset));
        sub.append(el("span", "kpw2-token-label", attPreset.name));
        sub.title = tokenTooltip(attPreset);
      }
      if (attachment.randomize) {
        sub.classList.add("kpw2-token-random");
        sub.append(makeDice({ start: attachment.start, end: attachment.end }));
      }
      span.append(sub);
    }
    return span;
  }

  function render() {
    const caret = state.lastCaret;
    const segments = parseDocument(state.doc);
    const frag = document.createDocumentFragment();
    let lastWasAtomic = false;
    let i = 0;
    while (i < segments.length) {
      const segment = segments[i];
      if (segment.type === "text") {
        if (segment.value) {
          frag.append(document.createTextNode(segment.value));
          lastWasAtomic = false;
        }
        i += 1;
        continue;
      }
      if (segment.type === "frame") {
        if (lastWasAtomic || frag.childNodes.length === 0) frag.append(sentinelNode());
        frag.append(makeFrameDivider(segment));
        lastWasAtomic = true;
        i += 1;
        continue;
      }
      if (segment.host) {
        // Reached an attachment that is not adjacent to its host (the
        // adjacent case is consumed below): render it standalone.
        if (lastWasAtomic || frag.childNodes.length === 0) frag.append(sentinelNode());
        frag.append(makeTokenSpan(segment, true));
        lastWasAtomic = true;
        i += 1;
        continue;
      }
      // Collect attachments that directly follow this host marker.
      const attached = [];
      let end = segment.end;
      let j = i + 1;
      while (
        j < segments.length &&
        segments[j].type === "token" &&
        segments[j].host === segment.id &&
        segments[j].start === end
      ) {
        attached.push(segments[j]);
        end = segments[j].end;
        j += 1;
      }
      if (lastWasAtomic || frag.childNodes.length === 0) frag.append(sentinelNode());
      frag.append(makeHostSpan(segment, attached));
      lastWasAtomic = true;
      i = j;
    }
    if (lastWasAtomic) frag.append(sentinelNode());
    editor.replaceChildren(frag);
    if (caret) setCaret(caret.start, caret.end);
  }

  /** Labeled section divider for a frame marker. Atomic via dataset.raw. */
  function makeFrameDivider(segment) {
    const divider = el("div", `kpw2-frame-divider kpw2-frame-${segment.value}`);
    divider.contentEditable = "false";
    divider.dataset.raw = segment.raw;
    divider.textContent =
      segment.value === "first"
        ? "▾  FIRST FRAME — only this changes in the first image"
        : "▾  LAST FRAME — only this changes in the last image";
    divider.title =
      "Text in this section appears only in the " +
      `${segment.value}-frame prompt. Text above the markers is shared.`;
    return divider;
  }

  /** Re-render with fresh preset data (labels/colors may have changed). */
  function refreshTokens() {
    if (state.mode === "rich") render();
  }

  // -------------------------------------------------------------- mutations

  function replaceSelection(text, coalesceKey = null) {
    const { start, end } = captureCaret();
    applyDoc(replaceRange(state.doc, start, end, text), {
      start: start + text.length,
      end: start + text.length,
    }, { coalesceKey });
  }

  function isWordChar(ch) {
    return !!ch && /[\w]/.test(ch);
  }

  /**
   * Find the token that blocks insertion of `preset` under the same
   * exclusive group. Global presets (no host) conflict with other global
   * presets of the group; attachments conflict within the same host.
   */
  function findExclusiveToken(exclusiveGroup, hostId) {
    if (!exclusiveGroup) return null;
    for (const token of tokenRanges(state.doc)) {
      if ((token.host || "") !== hostId) continue;
      const tokenPreset = presetStore.get(token.id);
      if (tokenPreset && tokenPreset.exclusive_group === exclusiveGroup) {
        return token;
      }
    }
    return null;
  }

  /** Insert a preset token at the caret (or swap per exclusivity rules). */
  function insertToken(preset, { hostRange = null } = {}) {
    if (hostRange) {
      attachToHost(hostRange, preset);
      return;
    }
    const existing = findExclusiveToken(preset.exclusive_group, "");
    if (existing) {
      // Replace the current same-slot token in place (position preserved).
      const markup = tokenMarkup(preset.id, preset.name, { randomize: existing.randomize });
      applyDoc(replaceRange(state.doc, existing.start, existing.end, markup), {
        start: existing.start + markup.length,
        end: existing.start + markup.length,
      });
      editor.focus();
      return;
    }
    const { start, end } = captureCaret();
    let insert = tokenMarkup(preset.id, preset.name);
    let caret = start;
    // Add one boundary space when the token would land against a word.
    if (isWordChar(state.doc[start - 1])) {
      insert = " " + insert;
      caret += 1;
    }
    if (isWordChar(state.doc[end])) insert = insert + " ";
    applyDoc(replaceRange(state.doc, start, end, insert), {
      start: caret + insert.length,
      end: caret + insert.length,
    });
    editor.focus();
  }

  /**
   * Attach `preset` to the character token at `hostRange`. Replaces any
   * same-slot attachment already on that character; otherwise the new
   * attachment marker lands directly after the host marker.
   */
  function attachToHost(hostRange, preset) {
    const host = tokenRanges(state.doc).find(
      (token) => token.start === hostRange.start && !token.host
    );
    if (!host) return;
    const existing = findExclusiveToken(preset.exclusive_group, host.id);
    const markup = tokenMarkup(preset.id, preset.name, {
      host: host.id,
      randomize: existing ? existing.randomize : false,
    });
    let nextDoc;
    let caret;
    if (existing) {
      nextDoc = replaceRange(state.doc, existing.start, existing.end, markup);
      caret = existing.start + markup.length;
    } else {
      nextDoc = attachToken(state.doc, { start: host.start, end: host.end }, preset.id, preset.name);
      caret = host.end + markup.length;
    }
    applyDoc(nextDoc, { start: caret, end: caret });
    editor.focus();
  }

  /** Swap any token's preset in place (keeps host + randomize flags). */
  function replaceToken(oldRange, preset) {
    const current = tokenRanges(state.doc).find(
      (token) => token.start === oldRange.start && token.id === oldRange.id
    );
    const markup = tokenMarkup(preset.id, preset.name, {
      host: current?.host || "",
      randomize: current?.randomize || false,
    });
    applyDoc(replaceRange(state.doc, oldRange.start, oldRange.end, markup), {
      start: oldRange.start + markup.length,
      end: oldRange.start + markup.length,
    });
    editor.focus();
  }

  /**
   * Swap a host character preset and re-point its attachments at the new
   * character id so outfits/emotions survive the swap.
   */
  function replaceHost(oldRange, preset) {
    const oldId = oldRange.id;
    const markup = tokenMarkup(preset.id, preset.name, {
      randomize: tokenRanges(state.doc).find(
        (token) => token.start === oldRange.start && token.id === oldRange.id
      )?.randomize || false,
    });
    let nextDoc = replaceRange(state.doc, oldRange.start, oldRange.end, markup);
    nextDoc = remapHosts(nextDoc, oldId, preset.id);
    applyDoc(nextDoc, { start: oldRange.start + markup.length, end: oldRange.start + markup.length });
    editor.focus();
  }

  /** Remove a token plus one neighboring space so words don't fuse. */
  function deleteToken(range) {
    let start = range.start;
    let end = range.end;
    if (state.doc[start - 1] === " " && state.doc[end] === " ") start -= 1;
    applyDoc(replaceRange(state.doc, start, end, ""), { start, end });
  }

  /** Toggle the runtime-randomize flag on one token. */
  function toggleRandomize(range) {
    const current = tokenRanges(state.doc).find(
      (token) => token.start === range.start && token.end === range.end
    );
    if (!current) return;
    applyDoc(
      replaceTokenFields(state.doc, range.start, range.end, {
        randomize: !current.randomize,
      }),
      { start: range.end, end: range.end }
    );
  }

  /**
   * Toggle First/Last frame sections. Adding appends the marker layout
   * (shared text above, first between the markers, last below). Removing
   * strips the markers; the text itself is kept and becomes shared.
   */
  function toggleFrames() {
    if (hasFrames(state.doc)) {
      const next = state.doc.split(FRAME_FIRST).join("").split(FRAME_LAST).join("");
      applyDoc(next, { start: next.length, end: next.length });
      return;
    }
    const base = state.doc.replace(/\s*$/, "");
    const next = `${base}\n${FRAME_FIRST}\n\n${FRAME_LAST}\n`;
    // Place the caret inside the FIRST section so typing flows there.
    const firstStart = base.length + 1 + FRAME_FIRST.length + 1;
    applyDoc(next, { start: firstStart, end: firstStart });
    editor.focus();
  }

  // ----------------------------------------------------------- input pipeline

  editor.addEventListener("compositionstart", () => {
    state.composing = true;
  });
  editor.addEventListener("compositionend", () => {
    state.composing = false;
    rebuildFromDom();
  });

  /**
   * Fallback sync: when an input slips past `beforeinput` (IME composition
   * or an unhandled input type), rebuild the document from the DOM.
   * Token spans carry their serialized form in dataset.raw, so this is
   * lossless for everything we render.
   */
  function rebuildFromDom() {
    let out = "";
    for (const child of editor.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!isSentinel(child)) out += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE && child.dataset?.raw !== undefined) {
        out += child.dataset.raw;
      } else if (child.textContent) {
        out += child.textContent;
      }
    }
    const caret = Math.min(captureCaret().start, out.length);
    applyDoc(out, { start: caret, end: caret });
  }

  editor.addEventListener("beforeinput", (event) => {
    if (state.composing) return; // let IME mutate; normalized on compositionend
    const inputType = event.inputType || "";
    const handles = new Set([
      "insertText",
      "insertParagraph",
      "insertLineBreak",
      "insertFromPaste",
      "insertFromDrop",
      "insertReplacementText",
      "deleteContentBackward",
      "deleteContentForward",
      "deleteByCut",
      "historyUndo",
      "historyRedo",
    ]);
    if (!handles.has(inputType)) return; // fallback sync via `input`
    event.preventDefault();
    state.defaultPrevented = true;

    const { start, end } = captureCaret();

    switch (inputType) {
      case "historyUndo":
        undo();
        return;
      case "historyRedo":
        redo();
        return;
      case "insertParagraph":
      case "insertLineBreak":
        applyDoc(replaceRange(state.doc, start, end, "\n"), { start: start + 1, end: start + 1 });
        return;
      case "insertFromPaste":
      case "insertFromDrop": {
        const text = event.dataTransfer?.getData?.("text/plain");
        if (text == null) return; // fall through to DOM rebuild on input
        applyDoc(replaceRange(state.doc, start, end, text), {
          start: start + text.length,
          end: start + text.length,
        });
        return;
      }
      case "insertReplacementText":
      case "insertText": {
        // "[" at a word boundary opens the preset chooser instead of typing.
        if (event.data === "[" && chooserTriggerOk(start)) {
          onOpenChooser({ start, end });
          return;
        }
        applyDoc(replaceRange(state.doc, start, end, event.data ?? ""), {
          start: start + (event.data ?? "").length,
          end: start + (event.data ?? "").length,
        }, { coalesceKey: "type" });
        return;
      }
      case "deleteByCut":
        applyDoc(replaceRange(state.doc, start, end, ""), { start, end });
        return;
      case "deleteContentForward": {
        if (start === end) {
          const frame = frameAt(start + 1);
          if (frame && frame.start === start) {
            state.lastCaret = { start: frame.start, end: frame.end };
            setCaret(frame.start, frame.end);
            return;
          }
          const token = tokenAt(state.doc, start + 1);
          if (token && token.start === start) {
            // Caret directly before a pill: select it first (native feel).
            state.lastCaret = { start: token.start, end: token.end };
            setCaret(token.start, token.end);
            return;
          }
          if (start >= state.doc.length) return;
          const size = /\r?\n/.test(state.doc.slice(start, start + 2)) ? 2 : 1;
          applyDoc(replaceRange(state.doc, start, start + size, ""), { start, end: start });
          return;
        }
        applyDoc(replaceRange(state.doc, start, end, ""), { start, end });
        return;
      }
      case "deleteContentBackward": {
        if (start === end) {
          if (start === 0) return;
          const frame = frameAt(start);
          if (frame && frame.end === start) {
            deleteToken(frame);
            return;
          }
          const token = tokenAt(state.doc, start);
          if (token && token.end === start) {
            deleteToken(token);
            return;
          }
          if (token && token.start === start) return; // can't eat into a pill
          const size = start >= 2 && /\r?\n$/.test(state.doc.slice(0, start)) ? 2 : 1;
          applyDoc(replaceRange(state.doc, start - size, start, ""), { start: start - size, end: start - size }, { coalesceKey: "delete" });
          return;
        }
        applyDoc(replaceRange(state.doc, start, end, ""), { start, end });
        return;
      }
    }
  });

  /** "[" triggers the chooser only at word boundaries, not mid-word. */
  function chooserTriggerOk(offset) {
    if (offset === 0) return true;
    const before = state.doc[offset - 1];
    return /\s|\n|[({[]/.test(before);
  }

  /** Frame-marker segment at a caret position (end-edge inclusive). */
  function frameAt(offset) {
    for (const segment of parseDocument(state.doc)) {
      if (segment.type === "frame" && offset > segment.start && offset <= segment.end) {
        return segment;
      }
    }
    return null;
  }

  // Non-prevented inputs (IME, odd input types) rebuild the model from DOM.
  editor.addEventListener("input", (event) => {
    if (state.defaultPrevented) {
      state.defaultPrevented = false;
      return;
    }
    if (state.composing) return;
    if (event.inputType === "insertCompositionText") return;
    rebuildFromDom();
  });

  editor.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !event.altKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && !event.shiftKey && event.key === " ") {
      event.preventDefault();
      onOpenChooser({ ...captureCaret() });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      replaceSelection("  ", "type");
      return;
    }
  });

  editor.addEventListener("click", (event) => {
    // Sub-pills (attachments) first — they live inside host pills.
    const sub = event.target.closest?.(".kpw2-subtoken");
    if (sub && editor.contains(sub)) {
      const range = sub.__range;
      if (range) onTokenPopup(range, sub.getBoundingClientRect(), sub, { attached: true });
      return;
    }
    const dice = event.target.closest?.(".kpw2-dice");
    if (dice) return; // handled (and stopped) by the dice listener itself
    const tokenSpan = event.target.closest?.(".kpw2-token");
    if (!tokenSpan || !editor.contains(tokenSpan)) return;
    const range = tokenSpan.__range;
    if (range) onTokenPopup(range, tokenSpan.getBoundingClientRect(), tokenSpan, { attached: false });
  });

  plain.addEventListener("input", () => {
    const caret = plain.selectionStart ?? plain.value.length;
    applyDoc(plain.value, { start: caret, end: caret });
  });

  // ----------------------------------------------------------------- public

  function setMode(mode, { silent = false } = {}) {
    state.mode = mode === "plain" ? "plain" : "rich";
    const rich = state.mode === "rich";
    editor.style.display = rich ? "" : "none";
    editor.contentEditable = rich ? "true" : "false";
    plain.style.display = rich ? "none" : "";
    if (rich) render();
    else plain.value = state.doc;
    if (!silent) onModeChange(state.mode);
  }

  return {
    root,
    editor,
    plain,
    get doc() {
      return state.doc;
    },
    get mode() {
      return state.mode;
    },
    setDoc(doc, { resetHistory = false } = {}) {
      state.doc = String(doc ?? "");
      state.lastCaret = null;
      if (resetHistory) {
        state.history = [{ doc: state.doc, caret: null, coalesceKey: null }];
        state.historyIndex = 0;
        state.lastEditAt = 0;
      }
      if (state.mode === "rich") render();
      else plain.value = state.doc;
      notify();
    },
    insertToken,
    attachToHost,
    replaceToken,
    replaceHost,
    deleteToken,
    toggleRandomize,
    toggleFrames,
    refreshTokens,
    setMode,
    undo,
    redo,
    captureCaret,
    focus() {
      (state.mode === "rich" ? editor : plain).focus();
    },
    compile() {
      return compileFramedDocument(state.doc, (id) => presetStore.lookup(id));
    },
  };
}
