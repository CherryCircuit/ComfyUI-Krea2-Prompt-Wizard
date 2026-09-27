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
 * Undo/redo uses a private stack because continuous re-rendering defeats
 * the browser's DOM-level undo. Plain-text mode is a genuine <textarea>
 * fallback for environments or users that prefer raw markers.
 */
import {
  parseDocument,
  tokenMarkup,
  replaceRange,
  tokenAt,
  compileDocument,
  documentStats,
} from "./tokenizer.mjs?v=1";
import { offsetOfPoint, pointForOffset } from "./caret_math.mjs?v=1";
import { presetStore, tokenTooltip } from "./preset_store.mjs?v=1";

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

  function makeTokenSpan(segment) {
    const preset = presetStore.get(segment.id);
    const span = el("span", "kpw2-token");
    span.contentEditable = "false";
    span.dataset.raw = segment.raw;
    span.dataset.id = segment.id;
    if (!preset || !preset.enabled) {
      span.classList.add("kpw2-token-missing");
      span.dataset.raw = segment.raw;
      span.append(el("span", "kpw2-token-label", `[MISSING: ${segment.id}]`));
      span.title = `Missing preset "${segment.id}". Use the Preset Manager to restore or create it.`;
      return span;
    }
    span.classList.add(`kpw2-cat-${preset.category}`);
    span.append(el("span", "kpw2-token-label", preset.name));
    span.title = tokenTooltip(preset);
    return span;
  }

  function render() {
    const caret = state.lastCaret;
    const frag = document.createDocumentFragment();
    let lastWasToken = false;
    for (const segment of parseDocument(state.doc)) {
      if (segment.type === "token") {
        if (lastWasToken || frag.childNodes.length === 0) frag.append(sentinelNode());
        frag.append(makeTokenSpan(segment));
        lastWasToken = true;
      } else if (segment.value) {
        frag.append(document.createTextNode(segment.value));
        lastWasToken = false;
      }
    }
    if (lastWasToken) frag.append(sentinelNode());
    editor.replaceChildren(frag);
    if (caret) setCaret(caret.start, caret.end);
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

  /** Insert a preset token at the caret with smart boundary spacing. */
  function insertToken(preset) {
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

  /** Swap a token's preset in place. */
  function replaceToken(oldRange, preset) {
    const markup = tokenMarkup(preset.id, preset.name);
    applyDoc(replaceRange(state.doc, oldRange.start, oldRange.end, markup), {
      start: oldRange.start + markup.length,
      end: oldRange.start + markup.length,
    });
    editor.focus();
  }

  /** Remove a token plus one neighboring space so words don't fuse. */
  function deleteToken(range) {
    let start = range.start;
    let end = range.end;
    if (state.doc[start - 1] === " " && state.doc[end] === " ") start -= 1;
    applyDoc(replaceRange(state.doc, start, end, ""), { start, end });
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
    const tokenSpan = event.target.closest?.(".kpw2-token");
    if (!tokenSpan) return;
    const raw = tokenSpan.dataset?.raw;
    const id = tokenSpan.dataset?.id;
    if (!raw || !id) return;
    // Record the clicked token's range so popup actions operate on it.
    const segments = parseDocument(state.doc);
    const range = segments.find((s) => s.type === "token" && s.raw === raw && s.id === id);
    if (range) onTokenPopup(range, tokenSpan.getBoundingClientRect(), tokenSpan);
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
    replaceToken,
    deleteToken,
    refreshTokens,
    setMode,
    undo,
    redo,
    captureCaret,
    focus() {
      (state.mode === "rich" ? editor : plain).focus();
    },
    compile() {
      return compileDocument(state.doc, (id) => presetStore.lookup(id));
    },
  };
}
