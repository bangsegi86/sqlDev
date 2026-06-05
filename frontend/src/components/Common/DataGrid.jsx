import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from './ColContextMenu.jsx';

export default function DataGrid({
  columns = [], rows = [],
  onSort, sortColumn, sortDir,
  rowOffset = 0,
  onLoadMore, hasMore = false, loadingMore = false,
  loading = false,
}) {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(columns);

  const [selRow, setSelRow] = useState(null);
  const [selCol, setSelCol] = useState(null);
  const [allSel, setAllSel] = useState(false);

  const handleCellClick = useCallback((rowIdx, col) => {
    setSelRow(rowIdx);
    setSelCol(col);
    setAllSel(false);
    containerRef.current?.focus();
  }, []);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      setAllSel(true);
      setSelRow(null);
      setSelCol(null);
    }
    if (e.key === 'Escape') {
      setSelRow(null); setSelCol(null); setAllSel(false);
    }
  }

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
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(2px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          pointerEvents: 'none',
        }}>
          <div className="grid-spinner" />
          <span style={{ color: 'rgba(212,212,212,0.85)', fontSize: 12, letterSpacing: 0.3 }}>데이터 로딩 중...</span>
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ overflow: 'auto', flex: 1, fontSize: 12, outline: 'none' }}
      >
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: hasWidths ? 'fixed' : 'auto' }}>
          {hasWidths && (
            <colgroup>
              <col style={{ width: 44 }} />
              {columns.map(c => <col key={c} style={{ width: colWidths[c] }} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              <th style={thStyle({ width: 44, cursor: 'default' })}>#</th>
              {columns.map(col => (
                <th
                  key={col}
                  style={thStyle({
                    cursor: onSort ? 'pointer' : 'default',
                    whiteSpace: 'nowrap', position: 'relative', userSelect: 'none',
                    background: selCol === col ? 'rgba(79,193,255,0.22)' : 'var(--bg-panel)',
                    color: selCol === col ? 'var(--accent-bright)' : 'var(--text-secondary)',
                    borderBottom: selCol === col ? '2px solid var(--accent-bright)' : '1px solid var(--border)',
                  })}
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
            {rows.map((row, i) => {
              const isRowSel = allSel || selRow === i;
              return (
                <DataRow
                  key={i}
                  row={row}
                  columns={columns}
                  index={i}
                  rowOffset={rowOffset}
                  isRowSel={isRowSel}
                  selCol={selCol}
                  onCellClick={handleCellClick}
                />
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '32px 16px', color: 'var(--text-dim)', fontSize: 12 }}>
                    <span style={{ fontSize: 22, opacity: 0.4 }}>○</span>
                    데이터 없음
                  </div>
                </td>
              </tr>
            )}
            {hasMore && (
              <tr ref={sentinelRef}>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
                  {!loadingMore && (
                    <button className="btn-secondary" onClick={onLoadMore} style={{ padding: '4px 16px', fontSize: 12 }}>
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

const DataRow = React.memo(function DataRow({ row, columns, index, rowOffset, isRowSel, selCol, onCellClick }) {
  const rowBg = isRowSel
    ? 'rgba(79,193,255,0.16)'
    : (index % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent');

  return (
    <tr style={{ background: rowBg, cursor: 'default' }}>
      <td style={{ ...TD_ROW_NUM, background: isRowSel ? 'rgba(79,193,255,0.25)' : undefined, color: isRowSel ? 'var(--accent-bright)' : 'var(--text-dim)', fontWeight: isRowSel ? 700 : 400 }}>
        {rowOffset + index + 1}
      </td>
      {columns.map(col => {
        const val = row[col];
        const isSelCol = col === selCol;
        const isSelCell = isRowSel && isSelCol;
        return (
          <td
            key={col}
            style={{
              ...TD_DATA,
              background: isSelCell
                ? 'rgba(79,193,255,0.32)'
                : isSelCol
                  ? 'rgba(79,193,255,0.08)'
                  : undefined,
              boxShadow: isSelCell ? 'inset 0 0 0 1px rgba(79,193,255,0.7)' : undefined,
            }}
            onClick={() => onCellClick(index, col)}
          >
            {val == null ? <span className="null-val">(null)</span> : String(val)}
          </td>
        );
      })}
    </tr>
  );
});

const TD_ROW_NUM = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', textAlign: 'right', userSelect: 'none' };
const TD_DATA    = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function thStyle(extra = {}) {
  return {
    background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
    padding: '5px 8px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 2,
    ...extra,
  };
}
