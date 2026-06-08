import { useState, useCallback, useRef } from 'react';
import { diagLog } from './diagLog.js';

// Returns true on success, false on failure.
// document.execCommand('copy') is intentionally NOT used — it crashes
// Chromium renderer processes when called with large text selections.
//
// navigator.clipboard.writeText() is safe for large text (async, no render crash).
// On non-secure contexts (HTTP/LAN) it throws — we catch and return false,
// then the caller shows the off-screen fallback modal.
export async function copyText(text) {
  if (!text) return false;

  const len = text.length;
  const kb  = (len / 1024).toFixed(1);
  diagLog(`[clipboard] copyText start  len=${len} (${kb} KB)`);

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    diagLog('[clipboard] path → navigator.clipboard.writeText');
    try {
      await navigator.clipboard.writeText(text);
      diagLog('[clipboard] writeText SUCCESS');
      return true;
    } catch (err) {
      diagLog(`[clipboard] writeText FAILED: ${err?.name} ${err?.message}`);
    }
  } else {
    diagLog('[clipboard] path → fallback modal (clipboard API unavailable)');
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
