import { useState, useCallback, useRef } from 'react';
import { diagLog } from './diagLog.js';

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Both clipboard API methods (writeText and ClipboardItem+Blob) crash Chrome's
// renderer via Mojo IPC when text exceeds ~80KB. Skip both for large text and
// let the caller show the off-screen textarea fallback instead.
const WRITE_TEXT_LIMIT = 80_000; // ~80 KB — empirically safe ceiling

export async function copyText(text) {
  if (!text) return false;

  const len = text.length;
  diagLog(`[clipboard] copyText start  len=${len} (${(len/1024).toFixed(1)} KB)`);

  if (len > WRITE_TEXT_LIMIT) {
    diagLog(`[clipboard] text too large (${(len/1024).toFixed(1)} KB) — skipping clipboard API → off-screen fallback`);
    return false;
  }

  // Method 1: writeText
  if (navigator.clipboard?.writeText) {
    diagLog('[clipboard] method 1: writeText');
    try {
      await navigator.clipboard.writeText(text);
      diagLog('[clipboard] writeText SUCCESS');
      return true;
    } catch (err) {
      diagLog(`[clipboard] writeText FAILED: ${err?.name}`);
    }
  }

  // Method 2: ClipboardItem + Blob (fallback when writeText is unavailable/denied)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    diagLog('[clipboard] method 2: ClipboardItem + Blob');
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      diagLog('[clipboard] ClipboardItem SUCCESS');
      return true;
    } catch (err) {
      diagLog(`[clipboard] ClipboardItem FAILED: ${err?.name}`);
    }
  }

  diagLog('[clipboard] all methods failed → off-screen fallback');
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
