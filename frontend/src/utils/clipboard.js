import { useState, useCallback } from 'react';

// Copies text to clipboard using only the async Clipboard API.
// document.execCommand('copy') is intentionally NOT used — it can crash
// Chromium renderer processes when called with large text selections.
//
// Returns: { ok: true } on success, { ok: false, text } on failure so the
// caller can show a fallback UI (e.g. a modal textarea for manual Ctrl+C).
export async function copyText(text) {
  if (!text) return { ok: false, text };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // Clipboard API refused (permission denied, non-secure context, etc.)
    }
  }
  return { ok: false, text };
}

// React hook: returns [copy(text), state]
// state = { copied: bool, fallbackText: string|null }
// When fallbackText is non-null the caller should show a textarea modal.
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState(null);

  const copy = useCallback(async (text) => {
    const result = await copyText(text);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else if (result.text) {
      setFallbackText(result.text);
    }
  }, []);

  const clearFallback = useCallback(() => setFallbackText(null), []);

  return [copy, copied, fallbackText, clearFallback];
}
