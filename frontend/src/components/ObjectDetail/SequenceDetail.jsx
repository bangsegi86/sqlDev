import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function SequenceDetail({ tab }) {
  const { schema, name } = tab.content;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSequenceInfo(tab.connectionId, schema, name)
      .then(setInfo)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab.connectionId, schema, name]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>SEQUENCE</span>
        <span style={{ margin: '0 6px', color: 'var(--text-dim)' }}>›</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{schema}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>.</span>
        <span style={{ fontWeight: 700 }}>{name}</span>
      </div>
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>}
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {info && (
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {Object.entries(info).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '5px 16px 5px 0', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k}</td>
                  <td style={{ padding: '5px 0', color: 'var(--text-primary)' }}>{String(v ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
