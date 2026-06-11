import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from './ColContextMenu.jsx';

const ROW_NUM_WIDTH = 44;

const DataGrid = forwardRef(function DataGrid({
  columns = [], rows = [],
  onSort, sortColumn, sortDir,
  rowOffset = 0,
  onLoadMore, hasMore = false, loadingMore = false,
  loading = false,
  // Inline editing props (optional)
  editableColumns,      // Set or array of column names that can be edited
  primaryKeyColumns,    // array of PK column names needed for WHERE clause
  onCellEdit,          // callback(rowIdx, col, oldValue, newValue)
  pendingCellKeys,      // Set of "${rowIdx}::${col}" keys to highlight as pending
}, fwdRef) {
  const containerRef = useRef(null);
  const sentinelRef  = useRef(null);
  const keyboardNavRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const thElsRef = useRef({});  // col → <th> element for width measurement

  useImperativeHandle(fwdRef, () => ({
    focus: () => containerRef.current?.focus(),
  }), []);

  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(columns);

  const [selRow, setSelRow]       = useState(null);
  const [selCol, setSelCol]       = useState(null);
  const [allSel, setAllSel]       = useState(false);
  const [editCell, setEditCell]   = useState(null);
  const [frozenPkCols, setFrozenPkCols] = useState(false);
  const [thWidths, setThWidths]   = useState({});  // measured rendered widths

  // Measure actual rendered header cell widths after layout
  useLayoutEffect(() => {
    const widths = {};
    Object.entries(thElsRef.current).forEach(([col, el]) => {
      if (el) widths[col] = el.offsetWidth;
    });
    setThWidths(widths);
  }, [columns]);

  // Memoize to avoid recreating Sets/objects every render (would defeat React.memo in DataRow)
  const editableSet = useMemo(
    () => editableColumns
      ? (editableColumns instanceof Set ? editableColumns : new Set(editableColumns))
      : new Set(),
    [editableColumns],
  );

  const pkSet    = useMemo(() => new Set(primaryKeyColumns || []), [primaryKeyColumns]);
  const hasPkCols = pkSet.size > 0;

  // Compute frozen PK column left offsets (only when frozenPkCols toggle is on)
  const colFrozenLeft = useMemo(() => {
    if (!frozenPkCols || !hasPkCols) return {};
    const result = {};
    let offset = ROW_NUM_WIDTH;
    for (const col of columns) {
      if (pkSet.has(col)) {
        result[col] = offset;
        offset += hasWidths ? (colWidths[col] || 100) : (thWidths[col] || 120);
      }
    }
    return result;
  }, [frozenPkCols, hasPkCols, columns, pkSet, hasWidths, colWidths, thWidths]);

  const lastFrozenPkCol = useMemo(() => {
    for (let i = columns.length - 1; i >= 0; i--) {
      if (columns[i] in colFrozenLeft) return columns[i];
    }
    return null;
  }, [colFrozenLeft, columns]);

  const hasFrozenPkCols = lastFrozenPkCol !== null;

  const handleCellClick = useCallback((rowIdx, col) => {
    setSelRow(rowIdx);
    setSelCol(col);
    setAllSel(false);
    containerRef.current?.focus();
  }, []);

  const handleCellDoubleClick = useCallback((rowIdx, col) => {
    if (editableSet.has(col)) {
      setEditCell({ rowIdx, col });
      setSelRow(rowIdx);
      setSelCol(col);
      setAllSel(false);
    }
  }, [editableSet]);

  // commitType: 'enter' | 'tab' | 'blur'
  const handleEditCommit = useCallback((rowIdx, col, oldVal, newVal, commitType) => {
    setEditCell(null);
    if (oldVal !== newVal && onCellEdit) {
      onCellEdit(rowIdx, col, oldVal, newVal);
    }
    if (commitType === 'tab') return; // Tab: let browser move focus naturally
    requestAnimationFrame(() => {
      containerRef.current?.focus();
      if (commitType === 'enter') {
        // Enter: advance to next row
        keyboardNavRef.current = true;
        setSelRow(prev => {
          const max = rowsRef.current.length - 1;
          return prev !== null ? Math.min(max, prev + 1) : 0;
        });
      }
    });
  }, [onCellEdit]);

  const handleEditCancel = useCallback((cancelType) => {
    setEditCell(null);
    if (cancelType !== 'tab') {
      requestAnimationFrame(() => containerRef.current?.focus());
    }
  }, []);

  // 선택 셀이 키보드 이동으로 바뀔 때 스크롤 추적
  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    if (selRow === null || !selCol) return;
    const container = containerRef.current;
    const cell = container?.querySelector(`[data-cell="${selRow}::${selCol}"]`);
    if (!cell) return;
    const cr = cell.getBoundingClientRect();
    const br = container.getBoundingClientRect();
    if (cr.bottom > br.bottom) container.scrollTop += cr.bottom - br.bottom + 4;
    else if (cr.top < br.top)  container.scrollTop -= br.top - cr.top + 4;
    if (cr.right > br.right)   container.scrollLeft += cr.right - br.right + 4;
    else if (cr.left < br.left) container.scrollLeft -= br.left - cr.left + 4;
  }, [selRow, selCol]);

  function handleKeyDown(e) {
    if (editCell) return;

    // ── Arrow key navigation ──
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      keyboardNavRef.current = true;
      const curRow    = selRow ?? 0;
      const curColIdx = selCol ? columns.indexOf(selCol) : 0;
      let nr = curRow;
      let nc = curColIdx;
      if (e.key === 'ArrowDown')  nr = Math.min(rows.length - 1, curRow + 1);
      if (e.key === 'ArrowUp')    nr = Math.max(0, curRow - 1);
      if (e.key === 'ArrowRight') nc = Math.min(columns.length - 1, curColIdx + 1);
      if (e.key === 'ArrowLeft')  nc = Math.max(0, curColIdx - 1);
      setSelRow(nr);
      setSelCol(columns[nc]);
      setAllSel(false);
      return;
    }

    // Enter: 편집 모드 진입 (편집 가능한 셀인 경우)
    if (e.key === 'Enter' && selRow !== null && selCol !== null) {
      if (editableSet.has(selCol)) {
        e.preventDefault();
        setEditCell({ rowIdx: selRow, col: selCol });
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      setAllSel(true);
      setSelRow(null);
      setSelCol(null);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (window.getSelection()?.toString()) return;
      if (selRow !== null && selCol !== null) {
        e.preventDefault();
        const val = rows[selRow]?.[selCol];
        const text = val == null ? '' : String(val);
        navigator.clipboard.writeText(text).catch(() => {});
      }
    }
    // Ctrl+V: onPaste 이벤트로 처리 (하단 handlePaste 참조)
    if (e.key === 'Escape') {
      setSelRow(null); setSelCol(null); setAllSel(false);
    }
    // 일반 문자 입력 → 편집 가능 셀이면 즉시 편집 모드 진입 (입력 문자를 초기값으로)
    if (
      e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey &&
      selRow !== null && selCol !== null && editableSet.has(selCol)
    ) {
      e.preventDefault();
      setEditCell({ rowIdx: selRow, col: selCol, initialChar: e.key });
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

  function handlePaste(e) {
    if (editCell) return; // 편집 중인 입력창에서 처리
    if (selRow === null || selCol === null || !editableSet.has(selCol)) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (onCellEdit) {
      const oldVal = rows[selRow]?.[selCol];
      onCellEdit(selRow, selCol, oldVal == null ? '' : String(oldVal), text);
    }
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
        onPaste={handlePaste}
        style={{ overflow: 'auto', flex: 1, fontSize: 12, outline: 'none' }}
      >
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: hasWidths ? 'fixed' : 'auto' }}>
          {hasWidths && (
            <colgroup>
              <col style={{ width: ROW_NUM_WIDTH }} />
              {columns.map(c => <col key={c} style={{ width: colWidths[c] }} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              {/* ── # corner cell: always sticky (top + left) ── */}
              <th style={thStyle({
                width: ROW_NUM_WIDTH, cursor: 'default',
                left: 0, zIndex: 4,
                boxShadow: !hasFrozenPkCols ? FREEZE_SHADOW : undefined,
              })}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span>#</span>
                  {hasPkCols && (
                    <button
                      onClick={e => { e.stopPropagation(); setFrozenPkCols(f => !f); }}
                      title={frozenPkCols ? 'PK 컬럼 고정 해제' : 'PK 컬럼 고정'}
                      style={{
                        padding: '1px 4px', fontSize: 9, lineHeight: 1.3,
                        background: frozenPkCols ? 'var(--accent)' : 'transparent',
                        border: `1px solid ${frozenPkCols ? 'var(--accent-bright)' : 'var(--border)'}`,
                        color: frozenPkCols ? 'var(--accent-bright)' : 'var(--text-dim)',
                        borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >PK</button>
                  )}
                </div>
              </th>

              {columns.map(col => {
                const isFrozenPk  = col in colFrozenLeft;
                const isLastFrozen = col === lastFrozenPkCol;
                return (
                  <th
                    key={col}
                    ref={el => { thElsRef.current[col] = el; }}
                    style={thStyle({
                      cursor: onSort ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', position: 'relative', userSelect: 'none',
                      background: selCol === col ? 'rgba(79,193,255,0.22)' : 'var(--bg-panel)',
                      color: selCol === col ? 'var(--accent-bright)' : 'var(--text-secondary)',
                      borderBottom: selCol === col ? '2px solid var(--accent-bright)' : '1px solid var(--border)',
                      ...(isFrozenPk && {
                        left: colFrozenLeft[col],
                        zIndex: 3,
                        ...(isLastFrozen && { boxShadow: FREEZE_SHADOW }),
                      }),
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
                );
              })}
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
                  editableSet={editableSet}
                  editCell={editCell}
                  onCellClick={handleCellClick}
                  onCellDoubleClick={handleCellDoubleClick}
                  onEditCommit={handleEditCommit}
                  onEditCancel={handleEditCancel}
                  pendingCellKeys={pendingCellKeys}
                  frozenColLeft={colFrozenLeft}
                  lastFrozenPkCol={lastFrozenPkCol}
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
});

// Inline edit input component
function EditInput({ value, initialChar, onCommit, onCancel }) {
  const [draft, setDraft] = useState(initialChar !== undefined ? initialChar : (value == null ? '' : String(value)));
  const inputRef = useRef(null);
  const commitTypeRef = useRef(null); // 'enter' | 'tab' | 'escape' | null

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    if (initialChar !== undefined) {
      const len = draft.length;
      inputRef.current.setSelectionRange(len, len);
    } else {
      inputRef.current.select();
    }
  }, []);

  function handleKeyDown(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTypeRef.current = 'enter';
      onCommit(draft, 'enter');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commitTypeRef.current = 'escape';
      onCancel('escape');
    } else if (e.key === 'Tab') {
      // Tab: commit but let Tab navigate naturally (no preventDefault)
      commitTypeRef.current = 'tab';
      onCommit(draft, 'tab');
    }
  }

  function handleBlur() {
    if (commitTypeRef.current) return; // already handled by keydown
    commitTypeRef.current = 'blur';
    onCommit(draft, 'blur');
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--input-bg, #1e1e2e)',
        color: 'var(--text-primary)',
        border: '1px solid var(--accent-bright, #4fc1ff)',
        borderRadius: 2,
        padding: '1px 4px',
        fontSize: 12,
        outline: 'none',
      }}
    />
  );
}

const DataRow = React.memo(function DataRow({
  row, columns, index, rowOffset,
  isRowSel, selCol,
  editableSet, editCell,
  onCellClick, onCellDoubleClick,
  onEditCommit, onEditCancel,
  pendingCellKeys,
  frozenColLeft = {},      // { col: leftPx } — only frozen PK cols appear here
  lastFrozenPkCol = null,  // rightmost frozen PK col name, for shadow
}) {
  const rowBg = isRowSel
    ? 'rgba(79,193,255,0.16)'
    : (index % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent');

  // Opaque base for sticky cells (they overlay other content when scrolling)
  const stickyBaseBg = index % 2 === 1 ? '#212121' : '#1e1e1e';
  const rowNumBg = isRowSel
    ? 'color-mix(in srgb, #1e1e1e 75%, #4fc1ff)'
    : stickyBaseBg;

  const hasFrozenCols = lastFrozenPkCol !== null;

  return (
    <tr style={{ background: rowBg, cursor: 'default' }}>
      {/* ── Row number: always sticky left ── */}
      <td style={{
        ...TD_ROW_NUM,
        background: rowNumBg,
        color: isRowSel ? 'var(--accent-bright)' : 'var(--text-dim)',
        fontWeight: isRowSel ? 700 : 400,
        boxShadow: !hasFrozenCols ? FREEZE_SHADOW : undefined,
      }}>
        {rowOffset + index + 1}
      </td>

      {columns.map(col => {
        const val      = row[col];
        const isSelCol  = col === selCol;
        const isSelCell = isRowSel && isSelCol;
        const isEditing = editCell && editCell.rowIdx === index && editCell.col === col;
        const canEdit   = editableSet.has(col);
        const isPending = pendingCellKeys?.has(`${index}::${col}`);
        const isFrozen  = col in frozenColLeft;
        const isLastFrozen = col === lastFrozenPkCol;

        // Opaque background for frozen PK cells
        const frozenBg = isFrozen
          ? isPending
            ? 'color-mix(in srgb, #1e1e1e 82%, #ffc83c)'
            : isSelCell
              ? 'color-mix(in srgb, #1e1e1e 68%, #4fc1ff)'
              : isSelCol
                ? 'color-mix(in srgb, #1e1e1e 92%, #4fc1ff)'
                : isRowSel
                  ? 'color-mix(in srgb, #1e1e1e 84%, #4fc1ff)'
                  : stickyBaseBg
          : undefined;

        // Combine selection inset shadow + frozen right-edge shadow
        const selShadow = isPending
          ? 'inset 0 0 0 1px rgba(255,200,60,0.6)'
          : isSelCell ? 'inset 0 0 0 1px rgba(79,193,255,0.7)' : null;
        const edgeShadow = isLastFrozen ? FREEZE_SHADOW : null;
        const boxShadow = [selShadow, edgeShadow].filter(Boolean).join(', ') || undefined;

        return (
          <td
            key={col}
            data-cell={`${index}::${col}`}
            style={{
              ...TD_DATA,
              background: isFrozen
                ? frozenBg
                : isPending
                  ? 'rgba(255,200,60,0.18)'
                  : isSelCell
                    ? 'rgba(79,193,255,0.32)'
                    : isSelCol
                      ? 'rgba(79,193,255,0.08)'
                      : undefined,
              boxShadow,
              cursor: canEdit ? 'text' : 'default',
              ...(isFrozen && {
                position: 'sticky',
                left: frozenColLeft[col],
                zIndex: 1,
              }),
            }}
            onClick={() => onCellClick(index, col)}
            onDoubleClick={() => onCellDoubleClick(index, col)}
          >
            {isEditing ? (
              <EditInput
                value={val}
                initialChar={editCell?.initialChar}
                onCommit={(newVal, commitType) => onEditCommit(index, col, val, newVal, commitType)}
                onCancel={onEditCancel}
              />
            ) : (
              val == null
                ? <span className="null-val" style={{ fontStyle: 'italic', color: 'rgba(180,180,180,0.6)', fontSize: '0.9em' }}>(null)</span>
                : String(val)
            )}
          </td>
        );
      })}
    </tr>
  );
});

// Shadow rendered on the right edge of the last frozen column
const FREEZE_SHADOW = '4px 0 8px rgba(0,0,0,0.5)';

// # column td: always position:sticky left:0
const TD_ROW_NUM = {
  padding: '3px 8px',
  borderBottom: '1px solid rgba(62,62,66,0.5)',
  borderRight: '1px solid rgba(62,62,66,0.3)',
  textAlign: 'right',
  userSelect: 'none',
  position: 'sticky',
  left: 0,
  zIndex: 1,
};

const TD_DATA = {
  padding: '3px 8px',
  borderBottom: '1px solid rgba(62,62,66,0.5)',
  borderRight: '1px solid rgba(62,62,66,0.3)',
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function thStyle(extra = {}) {
  return {
    background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
    padding: '5px 8px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 2,
    ...extra,
  };
}

export default DataGrid;
