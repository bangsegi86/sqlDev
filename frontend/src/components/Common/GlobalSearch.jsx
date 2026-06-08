import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';

const TYPE_ICONS = {
  TABLE: '▦', VIEW: '◧', 'MATERIALIZED VIEW': '◫',
  PROCEDURE: '⊕', FUNCTION: 'ƒ', PACKAGE: '⊞',
  TRIGGER: '⚡', SEQUENCE: '∞', SYNONYM: '≡',
};

const ALL_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SEQUENCE', 'SYNONYM'];

function tabTypeFor(objectType) {
  if (['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(objectType)) return 'table';
  if (objectType === 'SEQUENCE') return 'sequence';
  if (objectType === 'SYNONYM') return 'synonym';
  return 'source';
}

export default function GlobalSearch({ onClose }) {
  const { state, dispatch } = useApp();
  const { activeConnectionId, selectedSchema, connections } = state;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [error, setError] = useState('');

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Determine active schema
  const schema = selectedSchema?.schemaName || selectedSchema;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  const doSearch = useCallback((q, tf) => {
    if (!activeConnectionId || !schema || q.length < 2) {
      setResults([]); setError(''); return;
    }
    const types = tf !== 'ALL' ? tf : undefined;
    setLoading(true); setError('');
    api.searchObjects(activeConnectionId, schema, q, types)
      .then(data => { setResults(data.results || []); setActiveIndex(0); })
      .catch(e => { setError(e.message); setResults([]); })
      .finally(() => setLoading(false));
  }, [activeConnectionId, schema]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setError(''); return; }
    debounceRef.current = setTimeout(() => doSearch(query, typeFilter), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, typeFilter, doSearch]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function openResult(result) {
    const { objectName, objectType, schemaName } = result;
    const connId = activeConnectionId;
    const tabType = tabTypeFor(objectType);
    openTab(dispatch, stateRef.current, {
      id: `${objectType}-${connId}-${schemaName}-${objectName}`,
      type: tabType,
      title: objectName,
      connectionId: connId,
      content: { schema: schemaName, objectType, name: objectName, activeTab: tabType === 'table' ? 'columns' : 'source' },
    });
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      openResult(results[activeIndex]);
    }
  }

  const hasConnection = !!activeConnectionId;
  const hasSchema = !!schema;
  const canSearch = hasConnection && hasSchema;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          width: 580, maxWidth: '92vw',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: '70vh',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 16, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSearch ? `오브젝트 이름 검색... (${schema})` : '연결 및 스키마를 먼저 선택하세요'}
            disabled={!canSearch}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 14,
            }}
          />
          {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
          <kbd style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {['ALL', ...ALL_TYPES].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '2px 8px', fontSize: 11, borderRadius: 10,
                background: typeFilter === t ? 'var(--accent)' : 'var(--bg-input)',
                color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${typeFilter === t ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {t !== 'ALL' && <span style={{ marginRight: 4 }}>{TYPE_ICONS[t]}</span>}
              {t === 'ALL' ? 'ALL' : t}
            </button>
          ))}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!canSearch && (
            <div style={{ padding: '20px 16px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              왼쪽 패널에서 연결 후 스키마를 선택하세요
            </div>
          )}
          {canSearch && query.length < 2 && (
            <div style={{ padding: '20px 16px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              2자 이상 입력하세요...
            </div>
          )}
          {error && (
            <div style={{ padding: '12px 16px', color: 'var(--danger)', fontSize: 12 }}>
              오류: {error}
            </div>
          )}
          {!error && !loading && query.length >= 2 && results.length === 0 && (
            <div style={{ padding: '20px 16px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              결과 없음 — "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.schemaName}.${r.objectType}.${r.objectName}`}
              onClick={() => openResult(r)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                background: i === activeIndex ? 'var(--bg-selected)' : 'transparent',
                color: i === activeIndex ? '#fff' : 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0, color: i === activeIndex ? '#fff' : 'var(--text-secondary)' }}>
                {TYPE_ICONS[r.objectType] || '○'}
              </span>
              <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.objectName}
              </span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                background: i === activeIndex ? 'rgba(255,255,255,0.2)' : 'var(--bg-input)',
                color: i === activeIndex ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${i === activeIndex ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
                flexShrink: 0,
              }}>
                {r.objectType}
              </span>
              <span style={{ fontSize: 11, color: i === activeIndex ? 'rgba(255,255,255,0.65)' : 'var(--text-dim)', flexShrink: 0 }}>
                {r.schemaName}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div style={{ padding: '5px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-dim)' }}>
            <span><kbd style={kbdStyle}>↑↓</kbd> 이동</span>
            <span><kbd style={kbdStyle}>Enter</kbd> 열기</span>
            <span><kbd style={kbdStyle}>Esc</kbd> 닫기</span>
            <span style={{ marginLeft: 'auto' }}>{results.length}개 결과</span>
          </div>
        )}
      </div>
    </div>
  );
}

const kbdStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 3, padding: '1px 4px', fontSize: 10,
};
