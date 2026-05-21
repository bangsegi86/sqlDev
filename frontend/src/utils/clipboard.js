import { useState, useCallback } from 'react';

// Copies text to clipboard with a textarea fallback for large content or
// environments where the Clipboard API is unavailable / throws.
export function copyText(text) {
  if (!text) return Promise.resolve(false);

  // Modern Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),  // fall back on any error (quota, focus, permission)
    );
  }

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
    });
  }, []);

  return [copy, copied];
}
