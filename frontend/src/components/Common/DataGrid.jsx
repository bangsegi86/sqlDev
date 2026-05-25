import React, { useRef, useEffect, memo } from 'react';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from './ColContextMenu.jsx';

export default function DataGrid({
  columns = [], rows = [],
  onSort, sortColumn, sortDir,
  rowOffset = 0,
  // Lazy-load props (optional)
  onLoadMore, hasMore = false, loadingMore = false,
  // Overlay loading (initial fetch or load-more)
  loading = false,
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
      {/* Loading overlay — shown during initial fetch and load-more */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(20, 20, 22, 0.55)',
          backdropFilter: 'blur(2px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          pointerEvents: 'none',
        }}>
          <div className="grid-spinner" />
          <span style={{ color: 'rgba(212,212,212,0.85)', fontSize: 12, letterSpacing: 0.3 }}>
            데이터 로딩 중...
          </span>
        </div>
      )}

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
              <DataRow key={i} row={row} columns={columns} index={i} rowOffset={rowOffset} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>
                  No data
                </td>
              </tr>
            )}

            {/* Sentinel row: IntersectionObserver target + manual button */}
            {hasMore && (
              <tr ref={sentinelRef}>
                <td
                  colSpan={columns.length + 1}
                  style={{ textAlign: 'center', padding: '10px 8px', borderTop: '1px solid var(--border)' }}
                >
                  {!loadingMore && (
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

// Static cell styles — created once at module level
const TD_ROW_NUM = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', color: 'var(--text-dim)', textAlign: 'right', userSelect: 'none' };
const TD_DATA    = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const TR_ODD     = { background: 'rgba(255,255,255,0.03)' };
const TR_EVEN    = {};

// Memoized row — skips re-render unless its own row data or columns change
const DataRow = memo(function DataRow({ row, columns, index, rowOffset }) {
  return (
    <tr style={index % 2 === 0 ? TR_EVEN : TR_ODD}>
      <td style={TD_ROW_NUM}>{rowOffset + index + 1}</td>
      {columns.map(col => {
        const val = row[col];
        return (
          <td key={col} style={TD_DATA}>
            {val === null || val === undefined ? <span className="null-val">(null)</span> : String(val)}
          </td>
        );
      })}
    </tr>
  );
});

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
