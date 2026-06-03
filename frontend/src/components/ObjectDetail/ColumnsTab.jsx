import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from '../Common/ColContextMenu.jsx';
import ColumnReorderModal from './ColumnReorderModal.jsx';

const HEADERS = ['#', 'Column Name', 'Type', 'Length', 'Nullable', 'Default', 'Key', 'Comment'];

export default function ColumnsTab({ connectionId, schema, tableName, objectType }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const [selRow, setSelRow] = useState(null);
  const [selCol, setSelCol] = useState(null);
  const [allSel, setAllSel] = useState(false);

  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(HEADERS);

  useEffect(() => {
    setLoading(true); setError('');
    setSelRow(null); setSelCol(null); setAllSel(false);
    api.getColumns(connectionId, schema, tableName)
      .then(setColumns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading columns...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;

  function handleCellClick(rowIdx, colHeader) {
    setSelRow(rowIdx);
    setSelCol(colHeader);
    setAllSel(false);
    containerRef.current?.focus();
  }

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

  function handleFitData() {
    fitToData(columns.map(col => ({
      '#': String(col.COLUMN_ID ?? ''),
      'Column Name': col.COLUMN_NAME ?? '',
      'Type': col.DATA_TYPE ?? '',
      'Length': col.DATA_PRECISION != null
        ? `${col.DATA_PRECISION}${col.DATA_SCALE ? `,${col.DATA_SCALE}` : ''}`
        : String(col.DATA_LENGTH ?? ''),
      'Nullable': 'Y',
      'Default': String(col.DATA_DEFAULT ?? ''),
      'Key': col.IS_PK ? 'PK' : '',
      'Comment': col.COMMENTS ?? '',
    })));
  }

  function handleFitScreen() {
    fitToScreen(containerRef.current?.clientWidth ?? 600, 0);
  }

  const w = h => colWidths[h] ? { width: colWidths[h], minWidth: colWidths[h] } : {};

  // Row cell values for each column header
  function cellValue(col, h) {
    switch (h) {
      case '#':           return col.COLUMN_ID;
      case 'Column Name': return col.COLUMN_NAME;
      case 'Type':        return col.DATA_TYPE;
      case 'Length':      return col.DATA_PRECISION != null
        ? `${col.DATA_PRECISION}${col.DATA_SCALE ? `,${col.DATA_SCALE}` : ''}`
        : col.DATA_LENGTH;
      case 'Nullable':    return col.NULLABLE;
      case 'Default':     return col.DATA_DEFAULT;
      case 'Key':         return col.IS_PK ? 'PK' : '';
      case 'Comment':     return col.COMMENTS ?? '';
      default:            return '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {objectType !== 'VIEW' && objectType !== 'MATERIALIZED VIEW' && columns.length > 0 && (
        <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <button
            className="btn-secondary"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={() => setReorderOpen(true)}
          >⇅ 컬럼 순서 변경</button>
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ overflow: 'auto', flex: 1, outline: 'none' }}
      >
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
            {columns.map((col, i) => {
              const isRowSel = allSel || selRow === i;
              const rowBg = isRowSel
                ? 'rgba(79,193,255,0.16)'
                : (i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent');
              return (
                <tr key={col.COLUMN_NAME} style={{ background: rowBg, cursor: 'default' }}>
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
                          ...cellExtra(col, h, isRowSel),
                        }}
                        title={h === 'Comment' ? (col.COMMENTS || '') : undefined}
                        onClick={() => handleCellClick(i, h)}
                      >
                        {renderCell(col, h, isRowSel)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

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

      {reorderOpen && (
        <ColumnReorderModal
          connectionId={connectionId}
          schema={schema}
          tableName={tableName}
          columns={columns}
          onClose={() => setReorderOpen(false)}
        />
      )}
    </div>
  );
}

function renderCell(col, h, isRowSel) {
  switch (h) {
    case '#':
      return <span style={{ color: isRowSel ? 'var(--accent-bright)' : 'var(--text-dim)', fontWeight: isRowSel ? 700 : 400 }}>{col.COLUMN_ID}</span>;
    case 'Column Name':
      return col.COLUMN_NAME;
    case 'Type':
      return col.DATA_TYPE;
    case 'Length':
      return col.DATA_PRECISION != null
        ? `${col.DATA_PRECISION}${col.DATA_SCALE ? `,${col.DATA_SCALE}` : ''}`
        : col.DATA_LENGTH;
    case 'Nullable':
      return col.NULLABLE === 'Y'
        ? <span style={{ color: 'var(--text-dim)' }}>Y</span>
        : <span style={{ color: 'var(--danger)', fontWeight: 700 }}>N</span>;
    case 'Default':
      return col.DATA_DEFAULT ?? <span className="null-val">(null)</span>;
    case 'Key':
      return col.IS_PK ? <span className="tag-pk" title="Primary Key">PK</span> : null;
    case 'Comment':
      return col.COMMENTS || '';
    default:
      return null;
  }
}

function cellExtra(col, h) {
  switch (h) {
    case 'Column Name':
      return { fontWeight: col.IS_PK ? 700 : 400, color: col.IS_PK ? 'var(--pk-color)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    case 'Type':
      return { color: 'var(--accent-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    case 'Length': case '#':
      return { color: 'var(--text-secondary)' };
    case 'Nullable': case 'Key':
      return { textAlign: 'center' };
    case 'Default': case 'Comment':
      return { color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    default:
      return {};
  }
}

const baseTdStyle = { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)' };
const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, userSelect: 'none' };
