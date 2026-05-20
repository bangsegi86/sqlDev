import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from '../Common/ColContextMenu.jsx';

const HEADERS = ['#', 'Column Name', 'Type', 'Length', 'Nullable', 'Default', 'Key', 'Comment'];

export default function ColumnsTab({ connectionId, schema, tableName }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(HEADERS);

  useEffect(() => {
    setLoading(true); setError('');
    api.getColumns(connectionId, schema, tableName)
      .then(setColumns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading columns...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;

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

  return (
    <div ref={containerRef} style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, tableLayout: hasWidths ? 'fixed' : 'auto' }}>
        {hasWidths && (
          <colgroup>
            {HEADERS.map(h => <col key={h} style={{ width: colWidths[h] }} />)}
          </colgroup>
        )}
        <thead>
          <tr>
            {HEADERS.map(h => (
              <th key={h} style={{ ...thStyle, ...w(h), position: 'relative' }} onContextMenu={openMenu}>
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
          {columns.map((col, i) => (
            <tr key={col.COLUMN_NAME} style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td style={tdStyle({ color: 'var(--text-dim)' })}>{col.COLUMN_ID}</td>
              <td style={tdStyle({ fontWeight: col.IS_PK ? 700 : 400, color: col.IS_PK ? 'var(--pk-color)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                {col.COLUMN_NAME}
              </td>
              <td style={tdStyle({ color: 'var(--accent-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{col.DATA_TYPE}</td>
              <td style={tdStyle({ color: 'var(--text-secondary)' })}>
                {col.DATA_PRECISION != null ? `${col.DATA_PRECISION}${col.DATA_SCALE ? `,${col.DATA_SCALE}` : ''}` : col.DATA_LENGTH}
              </td>
              <td style={tdStyle({ textAlign: 'center' })}>
                {col.NULLABLE === 'Y' ? <span style={{ color: 'var(--text-dim)' }}>Y</span> : <span style={{ color: 'var(--danger)', fontWeight: 700 }}>N</span>}
              </td>
              <td style={tdStyle({ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                {col.DATA_DEFAULT ?? <span className="null-val">(null)</span>}
              </td>
              <td style={tdStyle({ textAlign: 'center' })}>
                {col.IS_PK && <span className="tag-pk" title="Primary Key">PK</span>}
              </td>
              <td style={tdStyle({ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}
                  title={col.COMMENTS || ''}>
                {col.COMMENTS || ''}
              </td>
            </tr>
          ))}
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
  );
}

const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, userSelect: 'none' };
function tdStyle(extra = {}) { return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra }; }
