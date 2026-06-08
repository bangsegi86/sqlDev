import { useState, useEffect, useCallback } from 'react';
import { loadCodeDefs } from '../components/SqlEditor/CodeDictModal.jsx';

// ── Utilities (also exported for use in SqlEditor's Ctrl+click navigation) ──

export function patternMatches(pattern, word) {
  const p = pattern.toUpperCase();
  const w = word.toUpperCase();
  if (p === '*') return true;
  if (p === w) return true;
  if (p.startsWith('*') && p.length > 1) return w.endsWith(p.slice(1));
  if (p.endsWith('*') && p.length > 1) return w.startsWith(p.slice(0, -1));
  return false;
}

export function getRawWordAtPos(text, charPos) {
  if (!text) return '';
  let pos = charPos;
  if (pos >= text.length || !/[\w$#]/.test(text[pos])) pos = charPos - 1;
  if (pos < 0 || !/[\w$#]/.test(text[pos])) return '';
  let start = pos;
  while (start > 0 && /[\w$#]/.test(text[start - 1])) start--;
  let end = pos;
  while (end < text.length - 1 && /[\w$#]/.test(text[end + 1])) end++;
  return text.slice(start, end + 1);
}

function getWordFromPoint(x, y) {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const caret = document.caretPositionFromPoint(x, y);
    if (!caret) return '';
    range = document.createRange();
    range.setStart(caret.offsetNode, caret.offset);
  }
  if (!range) return '';
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return '';
  return getRawWordAtPos(node.textContent, range.startOffset);
}

export function useCodeLookup() {
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, word, matchingDefs }
  const [lookup, setLookup]   = useState(null); // { def, word, x, y }
  const [dictOpen, setDictOpen] = useState(false);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctxMenu]);

  // text: full source string (required for textarea where selectionStart is used)
  //       omit or pass null for <pre>/<div> (uses caretRangeFromPoint instead)
  const openContextMenu = useCallback((e, text) => {
    e.preventDefault();
    setLookup(null);

    const defs = loadCodeDefs();
    let word;
    if (typeof e.target.selectionStart === 'number' && text != null) {
      word = getRawWordAtPos(text, e.target.selectionStart);
    } else {
      word = getWordFromPoint(e.clientX, e.clientY);
    }

    const matchingDefs = word
      ? defs.filter(def => def.patterns.some(p => patternMatches(p, word)))
      : [];
    setCtxMenu({ x: e.clientX, y: e.clientY, word, matchingDefs });
  }, []);

  const openLookup = useCallback((def) => {
    const x    = ctxMenu?.x ?? 0;
    const y    = ctxMenu?.y ?? 0;
    const word = ctxMenu?.word;
    setCtxMenu(null);
    setLookup({ def, word, x, y });
  }, [ctxMenu]);

  return {
    ctxMenu,
    lookup,
    dictOpen,
    setDictOpen,
    openContextMenu,
    openLookup,
    closeCtxMenu:  () => setCtxMenu(null),
    closeLookup:   () => setLookup(null),
  };
}
