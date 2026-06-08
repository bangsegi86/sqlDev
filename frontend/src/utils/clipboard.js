import { useState, useCallback } from 'react';

// Copies text to clipboard with a textarea fallback for large content or
// environments where the Clipboard API is unavailable / throws.
export function copyText(text) {
  if (!text) return Promise.resolve(false);

  // The modern async Clipboard API requires a secure context (HTTPS or localhost).
  // If we're NOT in a secure context, skip it entirely and run the synchronous
  // legacy approach immediately — it must run within the user-gesture window,
  // which it won't if we wait for an async Promise rejection to resolve first.
  const canUseAsync =
    window.isSecureContext !== false &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function';

  if (canUseAsync) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => Promise.resolve(legacyCopy(text)),  // also falls back synchronously
    );
  }

  // Synchronous path — guaranteed to run within the original user gesture
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// React hook: returns [copy(text), copied] where `copied` is true for 1.5s after success
export function useCopy() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((text) => {
    copyText(text).then(ok => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }).catch(() => {});
  }, []);

  return [copy, copied];
}
