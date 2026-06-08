import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from '../Common/ColContextMenu.jsx';

const HEADERS = ['Index Name', 'Type', 'Unique', 'Status', 'Columns', 'Rows', 'Last Analyzed'];

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().slice(0, 10);
}

function TypeBadge({ type }) {
  const styles = {
    'NORMAL': { background: 'rgba(120,120,130,0.25)', color: 'var(--text-secondary)' },
    'BITMAP': { background: 'rgba(150,60,220,0.25)', color: '#c084fc' },
    'FUNCTION-BASED NORMAL': { background: 'rgba(37,99,235,0.25)', color: '#60a5fa' },
  };
  const s = styles[type] || styles['NORMAL'];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 11, fontWeight: 600, ...s,
    }}>{type || 'NORMAL'}</span>
  );
}

function UniqueBadge({ uniqueness }) {
  if (uniqueness !== 'UNIQUE') return null;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 11, fontWeight: 700,
      background: 'rgba(34,197,94,0.2)', color: '#4ade80',
    }}>UNIQUE</span>
  );
}

function StatusBadge({ status }) {
  const color = status === 'VALID' ? '#4ade80' : status === 'UNUSABLE' ? 'var(--danger)' : 'var(--text-dim)';
  return <span style={{ color, fontWeight: 600, fontSize: 11 }}>{status}</span>;
}

export default function IndexesTab({ connectionId, schema, tableName }) {
  const [indexes, setIndexes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const [selRow, setSelRow] = useState(null);
  const [selCol, setSelCol] = useState(null);
  const [allSel, setAllSel] = useState(false);

  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(HEADERS);

  function load() {
    setLoading(true); setError('');
    setSelRow(null); setSelCol(null); setAllSel(false);
    api.getIndexes(connectionId, schema, tableName)
      .then(data => setIndexes(data.indexes || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [connectionId, schema, tableName]);

  if (loading) return (
    <div className="pane-loading">
      <span className="spinner" />
      인덱스 정보 로딩 중...
    </div>
  );
  if (error) return (
    <div className="error-pane">
      <span className="error-pane-msg">{error}</span>
      <button className="btn-secondary" style={{ fontSize: 11 }} onClick={load}>↻ 재시도</button>
    </div>
  );

  function cellValue(idx, h) {
    switch (h) {
      case 'Index Name':    return idx.INDEX_NAME ?? '';
      case 'Type':          return idx.INDEX_TYPE ?? '';
      case 'Unique':        return idx.UNIQUENESS ?? '';
      case 'Status':        return idx.STATUS ?? '';
      case 'Columns':       return idx.COLUMNS ?? '';
      case 'Rows':          return idx.NUM_ROWS != null ? String(idx.NUM_ROWS) : '';
      case 'Last Analyzed': return formatDate(idx.LAST_ANALYZED);
      default:              return '';
    }
  }

  function handleCellClick(rowIdx, colHeader) {
    setSelRow(rowIdx);
    setSelCol(colHeader);
    setAllSel(false);
    containerRef.current?.focus();
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      setAllSel(true); setSelRow(null); setSelCol(null);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (window.getSelection()?.toString()) return;
      if (selRow !== null && selCol !== null) {
        e.preventDefault();
        const val = cellValue(indexes[selRow], selCol);
        navigator.clipboard.writeText(val).catch(() => {});
      }
    }
    if (e.key === 'Escape') { setSelRow(null); setSelCol(null); setAllSel(false); }
  }

  function handleFitData() {
    fitToData(indexes.map(idx => ({
      'Index Name':    idx.INDEX_NAME ?? '',
      'Type':          idx.INDEX_TYPE ?? '',
      'Unique':        idx.UNIQUENESS === 'UNIQUE' ? 'UNIQUE' : '',
      'Status':        idx.STATUS ?? '',
      'Columns':       idx.COLUMNS ?? '',
      'Rows':          idx.NUM_ROWS != null ? String(idx.NUM_ROWS) : '',
      'Last Analyzed': formatDate(idx.LAST_ANALYZED),
    })));
  }

  function handleFitScreen() {
    fitToScreen(containerRef.current?.clientWidth ?? 600, 0);
  }

  const w = h => colWidths[h] ? { width: colWidths[h], minWidth: colWidths[h] } : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ overflow: 'auto', flex: 1, outline: 'none' }}
      >
        {indexes.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
            인덱스가 없습니다.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, tableLayout: hasWidths ? 'fixed' : 'auto' }}>
            {hasWidths && (
              <colgroup>
                {HEADERS.map(h => <col key={h} style={{ width: colWidths[h] }} />)}
              </colgroup>
            )}
            <thead>
              <tr>
                {HEADERS.map(h => (
                  <th
                    key={h}
                    style={{
                      ...thStyle,
                      ...w(h),
                      position: 'relative',
                      background: selCol === h ? 'rgba(79,193,255,0.22)' : 'var(--bg-panel)',
                      color: selCol === h ? 'var(--accent-bright)' : 'var(--text-secondary)',
                      borderBottom: selCol === h ? '2px solid var(--accent-bright)' : '1px solid var(--border)',
                    }}
                    onContextMenu={openMenu}
                  >
                    {h}
                    <div
                      style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'col-resize', zIndex: 1 }}
                      onMouseDown={e => startResize(e, h)}
                      onContextMenu={e => e.stopPropagation()}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx, i) => {
                const isRowSel = allSel || selRow === i;
                const rowBg = isRowSel
                  ? 'rgba(79,193,255,0.16)'
                  : (i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent');
                return (
                  <tr key={idx.INDEX_NAME} style={{ background: rowBg, cursor: 'default' }}>
                    {HEADERS.map(h => {
                      const isSelCol = h === selCol;
                      const isSelCell = isRowSel && isSelCol;
                      const cellBg = isSelCell
                        ? 'rgba(79,193,255,0.32)'
                        : isSelCol
                          ? 'rgba(79,193,255,0.08)'
                          : undefined;
                      return (
                        <td
                          key={h}
                          style={{
                            ...baseTdStyle,
                            background: cellBg,
                            boxShadow: isSelCell ? 'inset 0 0 0 1px rgba(79,193,255,0.7)' : undefined,
                            ...cellExtra(h),
                          }}
                          onClick={() => handleCellClick(i, h)}
                        >
                          {renderCell(idx, h)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

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
    </div>
  );
}

function renderCell(idx, h) {
  switch (h) {
    case 'Index Name':    return <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{idx.INDEX_NAME}</span>;
    case 'Type':          return <TypeBadge type={idx.INDEX_TYPE} />;
    case 'Unique':        return <UniqueBadge uniqueness={idx.UNIQUENESS} />;
    case 'Status':        return <StatusBadge status={idx.STATUS} />;
    case 'Columns':       return <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{idx.COLUMNS}</span>;
    case 'Rows':          return <span style={{ color: 'var(--text-dim)' }}>{idx.NUM_ROWS != null ? idx.NUM_ROWS.toLocaleString() : ''}</span>;
    case 'Last Analyzed': return <span style={{ color: 'var(--text-dim)' }}>{formatDate(idx.LAST_ANALYZED)}</span>;
    default:              return null;
  }
}

function cellExtra(h) {
  switch (h) {
    case 'Index Name':    return { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    case 'Type':          return { whiteSpace: 'nowrap' };
    case 'Unique':        return { textAlign: 'center' };
    case 'Status':        return { textAlign: 'center' };
    case 'Columns':       return { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    case 'Rows':          return { textAlign: 'right', color: 'var(--text-dim)' };
    case 'Last Analyzed': return { whiteSpace: 'nowrap', color: 'var(--text-dim)' };
    default:              return {};
  }
}

const baseTdStyle = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)' };
const thStyle = {
  background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
  padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, userSelect: 'none',
};
