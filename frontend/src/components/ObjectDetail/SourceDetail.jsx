import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';

export default function SourceDetail({ tab }) {
  const { dispatch } = useApp();
  const { schema, objectType, name } = tab.content;
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || 'source');
  const [source, setSource] = useState('');
  const [props, setProps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'source' && !source) {
      setLoading(true); setError('');
      api.getSource(tab.connectionId, schema, objectType, name)
        .then(r => setSource(r.source))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
    if (activeTab === 'properties' && !props) {
      api.getObjectProperties(tab.connectionId, schema, objectType, name)
        .then(setProps)
        .catch(() => {});
    }
  }, [activeTab]);

  function switchTab(t) {
    setActiveTab(t);
    dispatch({ type: 'UPDATE_TAB_CONTENT', payload: { tabId: tab.id, content: { activeTab: t } } });
  }

  function copy() {
    navigator.clipboard.writeText(source).catch(() => {});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{objectType}</span>
        <span style={{ margin: '0 6px', color: 'var(--text-dim)' }}>›</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{schema}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>.</span>
        <span style={{ fontWeight: 700 }}>{name}</span>
      </div>

      <div className="inner-tabs">
        {['source', 'properties'].map(t => (
          <div key={t} className={`inner-tab ${activeTab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {t === 'source' ? 'Source' : 'Properties'}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'source' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
              <button className="btn-secondary" onClick={copy} style={{ padding: '2px 8px', fontSize: 11 }}>📋 복사</button>
            </div>
            {loading && <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading source...</div>}
            {error && <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>}
            {!loading && !error && (
              <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                <pre style={{
                  padding: 0, margin: 0,
                  fontFamily: 'var(--code-font)', fontSize: 12,
                  color: 'var(--text-primary)', lineHeight: 1.5,
                  background: 'var(--bg-primary)',
                }}>
                  {source.split('\n').map((line, i) => (
                    <div key={i} style={{ display: 'flex' }}>
                      <span style={{ width: 44, color: 'var(--text-dim)', textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none', paddingTop: 0, lineHeight: 1.5 }}>{i + 1}</span>
                      <span style={{ flex: 1, paddingLeft: 4 }}>{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>
        )}
        {activeTab === 'properties' && (
          <div style={{ padding: 12, fontSize: 12 }}>
            {props ? (
              <table style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(props).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '4px 12px 4px 4px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k}</td>
                      <td style={{ padding: '4px', color: v === 'INVALID' ? 'var(--danger)' : 'var(--text-primary)' }}>{String(v ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>}
          </div>
        )}
      </div>
    </div>
  );
}
