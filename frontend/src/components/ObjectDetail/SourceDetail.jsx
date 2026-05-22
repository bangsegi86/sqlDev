import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';
import AnalyzerTab from './AnalyzerTab.jsx';
import ExplainTab from './ExplainTab.jsx';
import { formatSQL } from '../../utils/formatSQL.js';
import { highlightTokens, splitHighlightedLines, SQL_COLORS } from '../../utils/sqlHighlight.js';
import { useCopy } from '../../utils/clipboard.js';

const ANALYZABLE = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER'];
const CALLABLE_TYPES = ['PROCEDURE', 'FUNCTION'];

export default function SourceDetail({ tab }) {
  const { dispatch, state } = useApp();
  const { schema, objectType, name } = tab.content;
  const connId = tab.connectionId;
  const canAnalyze = ANALYZABLE.includes(objectType);
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || (canAnalyze ? 'analyzer' : 'source'));
  const [source, setSource] = useState('');
  const [isFormatted, setIsFormatted] = useState(false);
  const [copySource, sourceCopied] = useCopy();
  const [formattedSource, setFormattedSource] = useState('');
  const [props, setProps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Ctrl+click navigation state
  const [acItems, setAcItems] = useState([]);
  const acSchemaRef = useRef(null);
  const ctrlHeldRef = useRef(false);
  const preRef = useRef(null);

  const highlightedLines = useMemo(() => {
    const code = isFormatted ? formattedSource : source;
    if (!code) return null;
    return splitHighlightedLines(highlightTokens(code));
  }, [source, formattedSource, isFormatted]);

  // Set of callable names for underline rendering
  const navigableCallableNames = useMemo(
    () => new Set(acItems.filter(it => CALLABLE_TYPES.includes(it.type)).map(it => it.name.toUpperCase())),
    [acItems]
  );

  // Load object list for schema (PROCEDURE + FUNCTION only needed here)
  const loadAcItems = useCallback(async () => {
    if (!connId || !schema) return [];
    if (acSchemaRef.current === `${connId}:${schema}` && acItems.length > 0) return acItems;
    try {
      const results = await Promise.all(
        CALLABLE_TYPES.map(type =>
          api.getObjects(connId, schema, type)
            .then(names => names.map(n => ({ name: n, type })))
            .catch(() => [])
        )
      );
      const flat = results.flat();
      acSchemaRef.current = `${connId}:${schema}`;
      setAcItems(flat);
      return flat;
    } catch { return []; }
  }, [connId, schema]);

  // Ctrl key tracking — toggles ctrl-mode class on <pre>
  useEffect(() => {
    function enableCtrl() {
      if (ctrlHeldRef.current) return;
      ctrlHeldRef.current = true;
      if (preRef.current) preRef.current.classList.add('ctrl-mode');
      if (acItems.length === 0) loadAcItems();
    }
    function disableCtrl() {
      ctrlHeldRef.current = false;
      if (preRef.current) preRef.current.classList.remove('ctrl-mode');
    }
    function onKeyDown(e) { if (e.key === 'Control') enableCtrl(); }
    function onKeyUp(e) { if (e.key === 'Control') disableCtrl(); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', disableCtrl);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', disableCtrl);
    };
  }, [acItems, loadAcItems]);

  useEffect(() => {
    if (activeTab === 'source' && !source) {
      setLoading(true); setError('');
      api.getSource(connId, schema, objectType, name)
        .then(r => setSource(r.source))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
    if (activeTab === 'properties' && !props) {
      api.getObjectProperties(connId, schema, objectType, name)
        .then(setProps)
        .catch(() => {});
    }
  }, [activeTab]);

  function navigateToObject(schemaName, objectName, objectType) {
    const s = schemaName || schema;
    if (!s || !objectName) return;
    const tabType = ['TABLE', 'VIEW'].includes(objectType) ? 'table'
      : objectType === 'SEQUENCE' ? 'sequence'
      : objectType === 'SYNONYM' ? 'synonym' : 'source';
    openTab(dispatch, state, {
      id: `${objectType}-${connId}-${s}-${objectName}`,
      type: tabType, title: objectName,
      connectionId: connId,
      content: { schema: s, objectType, name: objectName, activeTab: tabType === 'table' ? 'columns' : 'source' },
    });
  }

  function handleTableClick(e, tok, j, lineToks) {
    if (!e.ctrlKey) return;
    const skipWs = (arr, start, dir) => {
      let i = start + dir;
      while (i >= 0 && i < arr.length) {
        const t = arr[i];
        if (!(t.color === null && t.value.trim() === '')) return { tok: t, idx: i };
        i += dir;
      }
      return null;
    };
    const next = skipWs(lineToks, j, 1);
    if (next?.tok.value === '.') {
      const after = skipWs(lineToks, next.idx, 1);
      if (after?.tok.color === SQL_COLORS.table) {
        navigateToObject(tok.value.toUpperCase(), after.tok.value.toUpperCase(), 'TABLE');
        return;
      }
    }
    let schemaName = null;
    const prev = skipWs(lineToks, j, -1);
    if (prev?.tok.value === '.') {
      const before = skipWs(lineToks, prev.idx, -1);
      if (before?.tok.color === SQL_COLORS.table) schemaName = before.tok.value.toUpperCase();
    }
    navigateToObject(schemaName, tok.value.toUpperCase(), 'TABLE');
  }

  async function handleCallableClick(e, tokValue) {
    if (!e.ctrlKey) return;
    const up = tokValue.toUpperCase();
    let items = acItems;
    if (items.length === 0) items = await loadAcItems();
    const found = items.find(it => it.name.toUpperCase() === up);
    if (found) navigateToObject(schema, found.name, found.type);
  }

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
            connectionId={connId}
            schema={schema}
            objectType={objectType}
            name={name}
          />
        )}

        {activeTab === 'explain' && canAnalyze && (
          <ExplainTab
            connectionId={connId}
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
                onClick={() => copySource(isFormatted ? formattedSource : source)}
                style={{ padding: '2px 8px', fontSize: 11, minWidth: 56 }}
              >{sourceCopied ? '✓ 복사됨' : '📋 복사'}</button>
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
                <pre
                  ref={preRef}
                  className="sql-source-pre"
                  style={{ margin: 0, padding: 0, fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, background: 'var(--bg-primary)', minWidth: 'max-content' }}
                >
                  {(highlightedLines || []).map((lineToks, i) => (
                    <div key={i} style={{ display: 'flex' }}>
                      <span style={{ width: 44, minWidth: 44, color: 'var(--text-dim)', textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none', lineHeight: 1.5 }}>{i + 1}</span>
                      <span style={{ whiteSpace: 'pre', paddingLeft: 4 }}>
                        {lineToks.map((tok, j) => {
                          if (!tok.color) return tok.value;
                          if (tok.color === SQL_COLORS.table) {
                            return (
                              <span
                                key={j}
                                className="sql-table-token"
                                style={{ color: tok.color }}
                                title="Ctrl+Click: 테이블 상세 열기"
                                onClick={e => handleTableClick(e, tok, j, lineToks)}
                              >{tok.value}</span>
                            );
                          }
                          // Callable token (procedure/function name in source)
                          if (navigableCallableNames.has(tok.value.toUpperCase())) {
                            return (
                              <span
                                key={j}
                                className="sql-callable-token"
                                style={{ color: tok.color }}
                                title="Ctrl+Click: 상세 열기"
                                onClick={e => handleCallableClick(e, tok.value)}
                              >{tok.value}</span>
                            );
                          }
                          return <span key={j} style={{ color: tok.color }}>{tok.value}</span>;
                        })}
                      </span>
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
