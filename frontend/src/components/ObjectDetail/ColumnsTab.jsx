import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function ColumnsTab({ connectionId, schema, tableName }) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    api.getColumns(connectionId, schema, tableName)
      .then(setColumns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <Loading />;
  if (error) return <Error msg={error} />;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {['#', 'Column Name', 'Type', 'Length', 'Nullable', 'Default', 'Key'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr key={col.COLUMN_NAME} style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td style={tdStyle({ color: 'var(--text-dim)', width: 36 })}>{col.COLUMN_ID}</td>
              <td style={tdStyle({ fontWeight: col.IS_PK ? 700 : 400, color: col.IS_PK ? 'var(--pk-color)' : 'var(--text-primary)' })}>
                {col.COLUMN_NAME}
              </td>
              <td style={tdStyle({ color: 'var(--accent-bright)' })}>{col.DATA_TYPE}</td>
              <td style={tdStyle({ color: 'var(--text-secondary)' })}>
                {col.DATA_PRECISION != null ? `${col.DATA_PRECISION}${col.DATA_SCALE ? `,${col.DATA_SCALE}` : ''}` : col.DATA_LENGTH}
              </td>
              <td style={tdStyle({ textAlign: 'center' })}>
                {col.NULLABLE === 'Y' ? <span style={{ color: 'var(--text-dim)' }}>Y</span> : <span style={{ color: 'var(--danger)', fontWeight: 700 }}>N</span>}
              </td>
              <td style={tdStyle({ color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                {col.DATA_DEFAULT ?? <span className="null-val">(null)</span>}
              </td>
              <td style={tdStyle({ textAlign: 'center' })}>
                {col.IS_PK && <span className="tag-pk" title="Primary Key">PK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0 };
function tdStyle(extra = {}) { return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra }; }

function Loading() { return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading columns...</div>; }
function Error({ msg }) { return <div style={{ padding: 16, color: 'var(--danger)' }}>{msg}</div>; }
