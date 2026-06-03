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
      <div style={{ padding: '5px 14px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>∞</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>SEQUENCE</span>
        <span style={{ color: 'var(--border-light)', fontSize: 12 }}>›</span>
        <span style={{ color: 'var(--accent-bright)', fontSize: 12 }}>{schema}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>.</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{name}</span>
      </div>
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        {loading && <div className="pane-loading"><span className="spinner" />로딩 중...</div>}
        {error && <div className="error-pane"><span className="error-pane-msg">{error}</span></div>}
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
