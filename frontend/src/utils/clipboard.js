import { useState, useCallback, useRef } from 'react';
import { diagLog } from './diagLog.js';

// navigator.clipboard.writeText() crashes Chrome's renderer process when
// the text exceeds ~100KB (Chromium IPC buffer bug). Empirically confirmed:
// ~80KB works, 163KB crashes. So we only use writeText for text under 80KB;
// larger text goes to the off-screen Ctrl+C fallback (no rendering = no crash).
const WRITE_TEXT_LIMIT = 80_000; // ~80 KB — safe upper bound from testing

// Returns true on success, false on failure (caller shows off-screen fallback).
// document.execCommand('copy') is intentionally NOT used — it crashes Chromium.
export async function copyText(text) {
  if (!text) return false;

  const len = text.length;
  const kb  = (len / 1024).toFixed(1);
  diagLog(`[clipboard] copyText start  len=${len} (${kb} KB)`);

  if (
    len <= WRITE_TEXT_LIMIT &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    diagLog('[clipboard] path → navigator.clipboard.writeText');
    try {
      await navigator.clipboard.writeText(text);
      diagLog('[clipboard] writeText SUCCESS');
      return true;
    } catch (err) {
      diagLog(`[clipboard] writeText FAILED: ${err?.name} ${err?.message}`);
    }
  } else {
    const reason = len > WRITE_TEXT_LIMIT
      ? `len ${len} > limit ${WRITE_TEXT_LIMIT} (Chrome IPC crash prevention)`
      : 'clipboard API unavailable';
    diagLog(`[clipboard] path → off-screen fallback  (${reason})`);
  }
  return false;
}

// React hook: returns [copy, copied, showFallback, clearFallback, fallbackTextRef]
//
// showFallback  — boolean; when true, show a "press Ctrl+C" modal
// fallbackTextRef — { current: string }; set the textarea's .value from this
//                  via a DOM ref (NOT via React state) to avoid re-rendering
//                  with a huge string in the VDOM.
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const fallbackTextRef = useRef('');

  const copy = useCallback(async (text) => {
    diagLog('[clipboard] useCopy.copy called');
    const ok = await copyText(text);
    diagLog(`[clipboard] copyText returned: ${ok}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else if (text) {
      diagLog('[clipboard] storing text in ref, setShowFallback(true)');
      fallbackTextRef.current = text;
      setShowFallback(true);
      diagLog('[clipboard] setShowFallback done');
    }
  }, []);

  const clearFallback = useCallback(() => {
    setShowFallback(false);
    fallbackTextRef.current = '';
  }, []);

  return [copy, copied, showFallback, clearFallback, fallbackTextRef];
}
