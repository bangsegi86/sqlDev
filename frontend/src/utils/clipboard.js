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

  if (
    text.length <= CLIPBOARD_API_LIMIT &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, non-secure context, etc.
    }
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
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else if (text) {
      fallbackTextRef.current = text;
      setShowFallback(true);
    }
  }, []);

  const clearFallback = useCallback(() => {
    setShowFallback(false);
    fallbackTextRef.current = '';
  }, []);

  return [copy, copied, showFallback, clearFallback, fallbackTextRef];
}
