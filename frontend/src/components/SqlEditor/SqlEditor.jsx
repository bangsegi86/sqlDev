import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';
import DataGrid from '../Common/DataGrid.jsx';
import { formatSQL } from '../../utils/formatSQL.js';

const PAGE_SIZE = 100;

export default function SqlEditor({ tab }) {
  const { state, dispatch } = useApp();
  const [sql, setSql] = useState(tab.content?.sql || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [splitPos, setSplitPos] = useState(50);
  const [page, setPage] = useState(1);
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  const connId = tab.connectionId || state.activeConnectionId;
  const schema = state.selectedSchema?.schemaName;

  useEffect(() => {
    dispatch({ type: 'UPDATE_TAB_CONTENT', payload: { tabId: tab.id, content: { sql } } });
  }, [sql]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'F5') { e.preventDefault(); execute(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sql, connId, schema]);

  async function execute() {
    if (!connId) { setError('연결을 선택하세요.'); return; }
    if (!sql.trim()) return;
    setLoading(true); setError(''); setResult(null); setPage(1);
    try {
      const r = await api.executeQuery(connId, sql.trim(), schema);
      setResult(r);
      const msg = r.message || `${r.rowCount} rows | ${r.executionTime}ms`;
      dispatch({ type: 'SET_STATUS', payload: msg });
    } catch (e) {
      setError(e.message);
      dispatch({ type: 'SET_STATUS', payload: `Error: ${e.message}` });
    } finally { setLoading(false); }
  }

  function onDividerMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    function onMove(ev) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitPos(Math.min(85, Math.max(15, pct)));
    }
    function onUp() { isDragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE)) : 1;
  const currentRows = result ? result.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];
  const rowOffset = (page - 1) * PAGE_SIZE;

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button className="btn-success" onClick={execute} disabled={loading} style={{ padding: '3px 12px' }}>
          {loading ? <span className="spinner" /> : '▶ 실행'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>F5</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button
          className="btn-secondary"
          onClick={() => setSql(prev => formatSQL(prev))}
          style={{ padding: '3px 10px' }}
          title="SQL 코드 줄 맞추기"
        >≡ 줄 맞추기</button>
        {connId && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            {state.connections.find(c => c.id === connId)?.name}
            {schema && ` › ${schema}`}
          </span>
        )}
      </div>

      {/* Editor */}
      <textarea
        value={sql}
        onChange={e => setSql(e.target.value)}
        placeholder="SELECT * FROM TABLE_NAME;"
        style={{
          height: `${splitPos}%`, resize: 'none', border: 'none', borderRadius: 0,
          fontFamily: 'var(--code-font)', fontSize: 13, lineHeight: 1.6,
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          padding: '10px 12px', flexShrink: 0,
        }}
        spellCheck={false}
      />

      {/* Divider */}
      <div
        style={{ height: 5, background: 'var(--border)', cursor: 'row-resize', flexShrink: 0 }}
        onMouseDown={onDividerMouseDown}
      />

      {/* Results pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', minHeight: 0 }}>
        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(244,71,71,0.1)', borderBottom: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--code-font)', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {result && (
          <>
            {/* Result info bar */}
            <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              {result.message
                ? <span>{result.message}</span>
                : <>
                  <span>{result.rowCount.toLocaleString()} rows</span>
                  <span>{result.executionTime}ms</span>
                </>}
            </div>

            {result.columns.length > 0 && (
              <DataGrid
                key={`${tab.id}-p${page}`}
                columns={result.columns}
                rows={currentRows}
                rowOffset={rowOffset}
              />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderTop: '1px solid var(--border)', alignItems: 'center', fontSize: 12, background: 'var(--bg-panel)', flexShrink: 0 }}>
                <button className="btn-secondary" onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '2px 6px' }}>«</button>
                <button className="btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1} style={{ padding: '2px 6px' }}>‹</button>
                <span style={{ color: 'var(--text-secondary)' }}>Page {page} / {totalPages}</span>
                <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={{ padding: '2px 6px' }}>›</button>
                <button className="btn-secondary" onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '2px 6px' }}>»</button>
                <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
                  ({(rowOffset + 1).toLocaleString()}–{Math.min(rowOffset + PAGE_SIZE, result.rows.length).toLocaleString()} / {result.rows.length.toLocaleString()})
                </span>
              </div>
            )}
          </>
        )}

        {!result && !error && !loading && (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
            SQL을 입력하고 F5 또는 ▶ 버튼으로 실행하세요.
          </div>
        )}
      </div>
    </div>
  );
}
