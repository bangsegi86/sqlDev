import { useState, useCallback, useRef } from 'react';

// Clipboard write limit: skip the async API for very large text.
// navigator.clipboard.writeText() can cause renderer crashes in some Chromium
// builds when given large payloads — fall through to the modal for safety.
const CLIPBOARD_API_LIMIT = 60_000; // ~60 KB

// Returns true on success, false on failure.
// document.execCommand('copy') is intentionally NOT used — it crashes
// Chromium renderer processes when called with large text selections.
export async function copyText(text) {
  if (!text) return false;

  const len = text.length;
  const kb  = (len / 1024).toFixed(1);
  console.log(`[clipboard] copyText start  len=${len} (${kb} KB)`);

  if (
    len <= CLIPBOARD_API_LIMIT &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    console.log('[clipboard] path → navigator.clipboard.writeText');
    try {
      await navigator.clipboard.writeText(text);
      console.log('[clipboard] writeText SUCCESS');
      return true;
    } catch (err) {
      console.warn('[clipboard] writeText FAILED:', err?.name, err?.message);
    }
  } else {
    const reason = len > CLIPBOARD_API_LIMIT
      ? `len ${len} > limit ${CLIPBOARD_API_LIMIT}`
      : 'clipboard API unavailable';
    console.log(`[clipboard] path → fallback modal  (${reason})`);
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
    console.log('[clipboard] useCopy.copy called');
    const ok = await copyText(text);
    console.log('[clipboard] copyText returned:', ok);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else if (text) {
      console.log('[clipboard] storing text in ref, setShowFallback(true)');
      fallbackTextRef.current = text;
      setShowFallback(true);
      console.log('[clipboard] setShowFallback done');
    }
  }, []);

  const clearFallback = useCallback(() => {
    setShowFallback(false);
    fallbackTextRef.current = '';
  }, []);

  return [copy, copied, showFallback, clearFallback, fallbackTextRef];
}
