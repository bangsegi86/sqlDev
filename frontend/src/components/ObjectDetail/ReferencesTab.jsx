import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';

export default function ReferencesTab({ connectionId, schema, tableName }) {
  const { state, dispatch } = useApp();
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getTableReferences(connectionId, schema, tableName)
      .then(setRefs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading references...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;
  if (refs.length === 0) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>No foreign key references</div>;

  function goToTable(rSchema, rTable) {
    openTab(dispatch, state, {
      id: `TABLE-${rSchema}-${rTable}`,
      type: 'table',
      title: rTable,
      connectionId,
      content: { schema: rSchema, objectType: 'TABLE', name: rTable, activeTab: 'columns' },
    });
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {['Constraint', 'Column', 'Ref Schema', 'Ref Table', 'Ref Column'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {refs.map((ref, i) => (
            <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td style={tdStyle({ color: 'var(--text-secondary)' })}>{ref.CONSTRAINT_NAME}</td>
              <td style={tdStyle({ color: 'var(--fk-color)' })}>{ref.COLUMN_NAME}</td>
              <td style={tdStyle()}>{ref.R_OWNER}</td>
              <td style={tdStyle()}>
                <span
                  style={{ cursor: 'pointer', color: 'var(--accent-bright)', textDecoration: 'underline' }}
                  onClick={() => goToTable(ref.R_OWNER, ref.R_TABLE)}
                >{ref.R_TABLE}</span>
              </td>
              <td style={tdStyle()}>{ref.R_COLUMN}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', position: 'sticky', top: 0 };
function tdStyle(extra = {}) { return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra }; }
