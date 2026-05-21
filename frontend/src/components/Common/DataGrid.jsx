import React, { useRef, useEffect } from 'react';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from './ColContextMenu.jsx';

export default function DataGrid({
  columns = [], rows = [],
  onSort, sortColumn, sortDir,
  rowOffset = 0,
  // Lazy-load props (optional)
  onLoadMore, hasMore = false, loadingMore = false,
}) {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(columns);

  // IntersectionObserver: auto-trigger onLoadMore when sentinel scrolls into view
  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) onLoadMore(); },
      { root, rootMargin: '180px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore]);

  function handleFitData() {
    fitToData(rows.map(row => {
      const obj = {};
      columns.forEach(c => { obj[c] = row[c] == null ? '' : String(row[c]); });
      return obj;
    }));
  }

  function handleFitScreen() {
    fitToScreen(containerRef.current?.clientWidth ?? 600, 44);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: hasWidths ? 'fixed' : 'auto' }}>
          {hasWidths && (
            <colgroup>
              <col style={{ width: 44 }} />
              {columns.map(c => <col key={c} style={{ width: colWidths[c] }} />)}
            </colgroup>
          )}
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={thStyle({ width: 44, cursor: 'default' })}>#</th>
              {columns.map(col => (
                <th
                  key={col}
                  style={thStyle({ cursor: onSort ? 'pointer' : 'default', whiteSpace: 'nowrap', position: 'relative', userSelect: 'none' })}
                  onClick={() => onSort?.(col)}
                  onContextMenu={openMenu}
                >
                  {col}
                  {sortColumn === col && (
                    <span style={{ marginLeft: 4, color: 'var(--accent-bright)' }}>
                      {sortDir === 'DESC' ? '▼' : '▲'}
                    </span>
                  )}
                  <div
                    style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'col-resize', zIndex: 2 }}
                    onMouseDown={e => startResize(e, col)}
                    onClick={e => e.stopPropagation()}
                    onContextMenu={e => e.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
                <td style={tdStyle({ color: 'var(--text-dim)', textAlign: 'right', userSelect: 'none' })}>{rowOffset + i + 1}</td>
                {columns.map(col => {
                  const val = row[col];
                  return (
                    <td key={col} style={tdStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                      {val === null || val === undefined
                        ? <span className="null-val">(null)</span>
                        : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>
                  No data
                </td>
              </tr>
            )}

            {/* Lazy-load sentinel / indicator */}
            {(hasMore || loadingMore) && (
              <tr ref={sentinelRef}>
                <td
                  colSpan={columns.length + 1}
                  style={{ textAlign: 'center', padding: '10px 8px', borderTop: '1px solid var(--border)' }}
                >
                  {loadingMore ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      데이터 로딩 중...
                    </span>
                  ) : (
                    <button
                      className="btn-secondary"
                      onClick={onLoadMore}
                      style={{ padding: '4px 16px', fontSize: 12 }}
                    >
                      + 500건 더 불러오기
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ColContextMenu
        menu={menu}
        onClose={closeMenu}
        onFitData={handleFitData}
        onFitHeader={fitToHeader}
        onFitScreen={handleFitScreen}
        onReset={resetWidths}
        hasWidths={hasWidths}
      />
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
    padding: '5px 8px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    position: 'sticky', top: 0,
    ...extra,
  };
}

function tdStyle(extra = {}) {
  return {
    padding: '3px 8px',
    borderBottom: '1px solid rgba(62,62,66,0.5)',
    borderRight: '1px solid rgba(62,62,66,0.3)',
    color: 'var(--text-primary)',
    ...extra,
  };
}
