import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';
import AnalyzerTab from './AnalyzerTab.jsx';
import ExplainTab from './ExplainTab.jsx';
import { formatSQL } from '../../utils/formatSQL.js';

const ANALYZABLE = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER'];

export default function SourceDetail({ tab }) {
  const { dispatch } = useApp();
  const { schema, objectType, name } = tab.content;
  const canAnalyze = ANALYZABLE.includes(objectType);
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || (canAnalyze ? 'analyzer' : 'source'));
  const [source, setSource] = useState('');
  const [isFormatted, setIsFormatted] = useState(false);
  const [formattedSource, setFormattedSource] = useState('');
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

  const tabs = [
    ...(canAnalyze ? [{ id: 'analyzer', label: '📊 분석기' }] : []),
    ...(canAnalyze ? [{ id: 'explain', label: '📝 설명' }] : []),
    { id: 'source', label: 'Source' },
    { id: 'properties', label: 'Properties' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{objectType}</span>
        <span style={{ color: 'var(--text-dim)' }}>›</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{schema}</span>
        <span style={{ color: 'var(--text-dim)' }}>.</span>
        <span style={{ fontWeight: 700 }}>{name}</span>
      </div>

      {/* Tab bar */}
      <div className="inner-tabs">
        {tabs.map(t => (
          <div key={t.id} className={`inner-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'analyzer' && canAnalyze && (
          <AnalyzerTab
            connectionId={tab.connectionId}
            schema={schema}
            objectType={objectType}
            name={name}
          />
        )}

        {activeTab === 'explain' && canAnalyze && (
          <ExplainTab
            connectionId={tab.connectionId}
            schema={schema}
            objectType={objectType}
            name={name}
          />
        )}

        {activeTab === 'source' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(isFormatted ? formattedSource : source)}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >📋 복사</button>
              <button
                className={isFormatted ? 'btn-success' : 'btn-secondary'}
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => {
                  if (!isFormatted) {
                    setFormattedSource(formatSQL(source));
                    setIsFormatted(true);
                  } else {
                    setIsFormatted(false);
                  }
                }}
                title="SQL/PL-SQL 코드 줄 맞추기"
              >
                {isFormatted ? '✓ 원본 보기' : '≡ 줄 맞추기'}
              </button>
              {isFormatted && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>포맷 적용됨</span>}
            </div>
            {loading && <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading source...</div>}
            {error && <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>}
            {!loading && !error && (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <pre style={{ margin: 0, padding: 0, fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, background: 'var(--bg-primary)', minWidth: 'max-content' }}>
                  {(isFormatted ? formattedSource : source).split('\n').map((line, i) => (
                    <div key={i} style={{ display: 'flex' }}>
                      <span style={{ width: 44, minWidth: 44, color: 'var(--text-dim)', textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none', lineHeight: 1.5 }}>{i + 1}</span>
                      <span style={{ whiteSpace: 'pre', paddingLeft: 4 }}>{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'properties' && (
          <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
            {props ? (
              <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {Object.entries(props).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '4px 16px 4px 4px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k}</td>
                      <td style={{ padding: 4, color: v === 'INVALID' ? 'var(--danger)' : 'var(--text-primary)' }}>{String(v ?? '')}</td>
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
