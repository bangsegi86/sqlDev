import { useState, useCallback } from 'react';

export function useColResize(headers) {
  const [colWidths, setColWidths] = useState({});
  const [menu, setMenu] = useState(null); // { x, y }
  const hasWidths = Object.keys(colWidths).length > 0;

  const openMenu = useCallback((e) => {
    e.preventDefault();
    const MENU_W = 185, MENU_H = 140;
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
      y: Math.min(e.clientY, window.innerHeight - MENU_H - 8),
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const resetWidths = useCallback(() => setColWidths({}), []);

  // displayRows: array of { [header]: string } — the visible text per cell
  const fitToData = useCallback((displayRows) => {
    const charW = 7.5, pad = 24;
    const newW = {};
    headers.forEach(h => {
      const maxLen = Math.max(
        h.length,
        ...displayRows.map(row => String(row[h] ?? '').length)
      );
      newW[h] = Math.min(Math.max(Math.ceil(maxLen * charW) + pad, 60), 400);
    });
    setColWidths(newW);
  }, [headers]);

  const fitToHeader = useCallback(() => {
    const newW = {};
    headers.forEach(h => { newW[h] = Math.max(h.length * 8 + 24, 60); });
    setColWidths(newW);
  }, [headers]);

  // containerWidth: pass container's clientWidth; rowNumWidth: width of the # col (0 if none)
  const fitToScreen = useCallback((containerWidth, rowNumWidth = 0) => {
    if (!headers.length) return;
    const w = Math.max(Math.floor((containerWidth - rowNumWidth) / headers.length), 60);
    const newW = {};
    headers.forEach(h => { newW[h] = w; });
    setColWidths(newW);
  }, [headers]);

  const startResize = useCallback((e, header) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement.offsetWidth;
    function onMove(ev) {
      setColWidths(prev => ({ ...prev, [header]: Math.max(40, startW + ev.clientX - startX) }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize };
}
