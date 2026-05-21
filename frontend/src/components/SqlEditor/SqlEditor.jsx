import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';
import DataGrid from '../Common/DataGrid.jsx';
import { formatSQL } from '../../utils/formatSQL.js';
import { renderHighlighted, getTableAtCursor } from '../../utils/sqlHighlight.js';
import { openTab } from '../../store/AppContext.jsx';

const LIMIT = 200;

// Splits sql by ';' that are not inside string literals.
// Returns [{start, end}] where end is the index of the ';' (or sql.length).
function splitStatements(sql) {
  const segs = [];
  let start = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inStr && ch === "'") { inStr = true; }
    else if (inStr) {
      if (ch === "'" && sql[i + 1] === "'") { i++; } // escaped ''
      else if (ch === "'") { inStr = false; }
    } else if (ch === ';') {
      segs.push({ start, end: i });
      start = i + 1;
    }
  }
  segs.push({ start, end: sql.length }); // remainder after last ';'
  return segs;
}

function getStatementAtCursor(sql, cursorPos) {
  const segs = splitStatements(sql);
  for (const { start, end } of segs) {
    if (cursorPos >= start && cursorPos <= end) {
      const text = sql.slice(start, end).trim();
      if (text) return text;
    }
  }
  // fallback: last non-empty segment
  for (let i = segs.length - 1; i >= 0; i--) {
    const text = sql.slice(segs[i].start, segs[i].end).trim();
    if (text) return text;
  }
  return sql.trim().replace(/;+\s*$/, '');
}

export default function SqlEditor({ tab }) {
  const { state, dispatch } = useApp();
  const [sql, setSql] = useState(tab.content?.sql || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [splitPos, setSplitPos] = useState(50);
  const [page, setPage] = useState(1);
  const [lastStmt, setLastStmt] = useState('');

  const isDragging = useRef(false);
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const preRef = useRef(null);

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

  const highlightedSql = useMemo(() => renderHighlighted(sql), [sql]);

  function syncScroll() {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  function navigateToTable(schemaName, tableName) {
    const s = schemaName || schema;
    if (!s || !tableName) return;
    const id = `table:${connId}:${s}:${tableName}`;
    openTab(dispatch, state, {
      id, type: 'table', title: tableName,
      connectionId: connId,
      content: { schema: s, objectType: 'TABLE', name: tableName },
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const next = sql.slice(0, start) + '  ' + sql.slice(end);
      setSql(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
    if (e.key === 'F4') {
      e.preventDefault();
      const pos = textareaRef.current?.selectionStart ?? 0;
      const r = getTableAtCursor(sql, pos);
      if (r) navigateToTable(r.schema, r.table);
    }
  }

  async function runQuery(stmt, pg) {
    if (!connId) { setError('연결을 선택하세요.'); return; }
    if (!stmt.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await api.executeQuery(connId, stmt, schema, pg, LIMIT);
      setResult(r);
      setPage(pg);
      const msg = r.message
        ? r.message
        : `${r.total != null ? r.total.toLocaleString() + '행' : r.rowCount + '행'} | ${r.executionTime}ms`;
      dispatch({ type: 'SET_STATUS', payload: msg });
    } catch (e) {
      setError(e.message);
      dispatch({ type: 'SET_STATUS', payload: `Error: ${e.message}` });
    } finally { setLoading(false); }
  }

  function execute() {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const stmt = getStatementAtCursor(sql, cursorPos);
    setLastStmt(stmt);
    runQuery(stmt, 1);
  }

  function goToPage(pg) {
    if (!lastStmt) return;
    runQuery(lastStmt, pg);
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
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const totalPages = result?.total != null ? Math.max(1, Math.ceil(result.total / LIMIT)) : null;

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-success" onClick={execute} disabled={loading} style={{ padding: '3px 12px' }}>
          {loading ? <span className="spinner" /> : '▶ 실행'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>F5</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button
          className="btn-secondary"
          onClick={() => setSql(prev => formatSQL(prev))}
          style={{ padding: '3px 10px' }}
          title="SQL 코드 줄 맞추기 (들여쓰기 정렬)"
        >≡ 줄 맞추기</button>
        {connId && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            {state.connections.find(c => c.id === connId)?.name}
            {schema && ` › ${schema}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
          커서 위치의 구문 실행 · ';' 으로 구문 구분
        </span>
      </div>

      {/* Editor: highlighted pre + transparent textarea overlay */}
      <div style={{ position: 'relative', height: `${splitPos}%`, overflow: 'hidden', background: 'var(--bg-primary)' }}>
        <pre
          ref={preRef}
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            margin: 0, padding: '10px 12px',
            fontFamily: 'var(--code-font)', fontSize: 13, lineHeight: 1.6,
            whiteSpace: 'pre', color: 'var(--text-primary)',
            background: 'var(--bg-primary)', pointerEvents: 'none',
          }}
        >
          {highlightedSql}
          {'\n'}
        </pre>
        {!sql && (
          <div style={{
            position: 'absolute', top: 0, left: 0, padding: '10px 12px',
            fontFamily: 'var(--code-font)', fontSize: 13, lineHeight: 1.6,
            color: 'var(--text-dim)', pointerEvents: 'none', userSelect: 'none',
          }}>
            SELECT * FROM TABLE_NAME;
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={e => { handleKeyDown(e); syncScroll(); }}
          onKeyUp={syncScroll}
          onClick={e => {
            syncScroll();
            if (e.ctrlKey) {
              const pos = Math.floor((e.target.selectionStart + e.target.selectionEnd) / 2);
              const r = getTableAtCursor(sql, pos);
              if (r) navigateToTable(r.schema, r.table);
            }
          }}
          style={{
            position: 'absolute', inset: 0,
            resize: 'none', border: 'none', borderRadius: 0, outline: 'none',
            fontFamily: 'var(--code-font)', fontSize: 13, lineHeight: 1.6,
            background: 'transparent', color: 'transparent',
            caretColor: 'var(--text-primary)', padding: '10px 12px',
            whiteSpace: 'pre', overflow: 'auto',
          }}
          spellCheck={false}
          wrap="off"
        />
      </div>

      <div
        style={{ height: 5, background: 'var(--border)', cursor: 'row-resize', flexShrink: 0 }}
        onMouseDown={onDividerMouseDown}
      />

      {/* Result pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(244,71,71,0.1)', borderBottom: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--code-font)', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {result && (
          <>
            {/* Result info bar */}
            <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              {result.message ? (
                <span>{result.message}</span>
              ) : (
                <>
                  <span>총 <b style={{ color: 'var(--text-primary)' }}>{result.total?.toLocaleString()}</b>행</span>
                  <span>{result.executionTime}ms</span>
                  {totalPages != null && totalPages > 1 && (
                    <span>Page {page} / {totalPages} ({LIMIT}행씩)</span>
                  )}
                </>
              )}
            </div>

            {result.columns?.length > 0 && (
              <DataGrid columns={result.columns} rows={result.rows} rowOffset={(page - 1) * LIMIT} />
            )}

            {/* Pagination */}
            {totalPages != null && totalPages > 1 && (
              <div style={{ display: 'flex', gap: 6, padding: '5px 8px', borderTop: '1px solid var(--border)', alignItems: 'center', fontSize: 12, background: 'var(--bg-panel)', flexShrink: 0 }}>
                <button className="btn-secondary" onClick={() => goToPage(1)} disabled={page === 1 || loading} style={{ padding: '2px 6px' }}>«</button>
                <button className="btn-secondary" onClick={() => goToPage(page - 1)} disabled={page === 1 || loading} style={{ padding: '2px 6px' }}>‹</button>
                <span style={{ color: 'var(--text-secondary)', minWidth: 80, textAlign: 'center' }}>
                  {page} / {totalPages}
                </span>
                <button className="btn-secondary" onClick={() => goToPage(page + 1)} disabled={page === totalPages || loading} style={{ padding: '2px 6px' }}>›</button>
                <button className="btn-secondary" onClick={() => goToPage(totalPages)} disabled={page === totalPages || loading} style={{ padding: '2px 6px' }}>»</button>
                {loading && <span className="spinner" style={{ marginLeft: 4 }} />}
              </div>
            )}
          </>
        )}

        {!result && !error && !loading && (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
            SQL을 입력하고 F5 또는 ▶ 버튼으로 실행하세요. ';' 으로 여러 구문을 구분할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
