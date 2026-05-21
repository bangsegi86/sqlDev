import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';
import DataGrid from '../Common/DataGrid.jsx';
import { formatSQL } from '../../utils/formatSQL.js';
import { renderHighlighted, getTableAtCursor } from '../../utils/sqlHighlight.js';
import { openTab } from '../../store/AppContext.jsx';

const LIMIT = 500;

// Splits sql by ';' that are not inside string literals.
function splitStatements(sql) {
  const segs = [];
  let start = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inStr && ch === "'") { inStr = true; }
    else if (inStr) {
      if (ch === "'" && sql[i + 1] === "'") { i++; }
      else if (ch === "'") { inStr = false; }
    } else if (ch === ';') {
      segs.push({ start, end: i });
      start = i + 1;
    }
  }
  segs.push({ start, end: sql.length });
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
  for (let i = segs.length - 1; i >= 0; i--) {
    const text = sql.slice(segs[i].start, segs[i].end).trim();
    if (text) return text;
  }
  return sql.trim().replace(/;+\s*$/, '');
}

export default function SqlEditor({ tab }) {
  const { state, dispatch } = useApp();
  const [sql, setSql] = useState(tab.content?.sql || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [splitPos, setSplitPos] = useState(50);

  // Accumulated result state
  const [resultCols, setResultCols] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [lastStmt, setLastStmt] = useState('');
  const [execMsg, setExecMsg] = useState('');    // for DML messages
  const [execTime, setExecTime] = useState(null);

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
    openTab(dispatch, state, {
      id: `TABLE-${connId}-${s}-${tableName}`,
      type: 'table', title: tableName,
      connectionId: connId,
      content: { schema: s, objectType: 'TABLE', name: tableName },
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      setSql(sql.slice(0, start) + '  ' + sql.slice(end));
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

  async function execute() {
    if (!connId) { setError('연결을 선택하세요.'); return; }
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const stmt = getStatementAtCursor(sql, cursorPos);
    if (!stmt) return;

    setLoading(true);
    setError('');
    setAllRows([]);
    setResultCols([]);
    setTotal(null);
    setHasMore(false);
    setNextPage(2);
    setExecMsg('');
    setExecTime(null);
    setLastStmt(stmt);

    try {
      const r = await api.executeQuery(connId, stmt, schema, 1, LIMIT);
      if (r.message) {
        setExecMsg(r.message);
        setExecTime(r.executionTime);
        dispatch({ type: 'SET_STATUS', payload: `${r.message} | ${r.executionTime}ms` });
      } else {
        setResultCols(r.columns || []);
        setAllRows(r.rows || []);
        setTotal(r.total ?? null);
        setHasMore((r.total ?? 0) > (r.rows?.length ?? 0));
        setNextPage(2);
        const statusMsg = `총 ${(r.total ?? r.rows?.length ?? 0).toLocaleString()}행 | ${r.executionTime}ms`;
        dispatch({ type: 'SET_STATUS', payload: statusMsg });
        setExecTime(r.executionTime);
      }
    } catch (e) {
      setError(e.message);
      dispatch({ type: 'SET_STATUS', payload: `Error: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !lastStmt || !connId) return;
    setLoadingMore(true);
    try {
      const r = await api.executeQuery(connId, lastStmt, schema, nextPage, LIMIT);
      const newRows = r.rows || [];
      setAllRows(prev => {
        const combined = [...prev, ...newRows];
        setHasMore(combined.length < (r.total ?? 0));
        return combined;
      });
      setNextPage(p => p + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function onDividerMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    function onMove(ev) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSplitPos(Math.min(85, Math.max(15, ((ev.clientY - rect.top) / rect.height) * 100)));
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const hasResult = resultCols.length > 0 || execMsg;

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
          title="SQL 코드 줄 맞추기"
        >≡ 줄 맞추기</button>
        {connId && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            {state.connections.find(c => c.id === connId)?.name}
            {schema && ` › ${schema}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
          커서 위치 구문 실행 · ';' 구문 구분
        </span>
      </div>

      {/* Editor overlay */}
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
          {highlightedSql}{'\n'}
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

        {hasResult && (
          <>
            {/* Result info bar */}
            <div style={{ padding: '3px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              {execMsg ? (
                <span>{execMsg}</span>
              ) : (
                <>
                  <span>
                    <b style={{ color: 'var(--text-primary)' }}>{allRows.length.toLocaleString()}</b>
                    {total != null && total !== allRows.length && (
                      <span style={{ color: 'var(--text-dim)' }}> / {total.toLocaleString()}행 로드됨</span>
                    )}
                    {total != null && total === allRows.length && (
                      <span style={{ color: 'var(--text-dim)' }}>행</span>
                    )}
                  </span>
                  {execTime != null && <span>{execTime}ms</span>}
                  {hasMore && (
                    <span style={{ color: 'var(--accent)', fontSize: 10 }}>
                      ↓ 스크롤하거나 버튼으로 추가 로드
                    </span>
                  )}
                </>
              )}
            </div>

            {resultCols.length > 0 && (
              <DataGrid
                columns={resultCols}
                rows={allRows}
                onLoadMore={loadMore}
                hasMore={hasMore}
                loadingMore={loadingMore}
              />
            )}
          </>
        )}

        {!hasResult && !error && !loading && (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
            SQL을 입력하고 F5 또는 ▶ 버튼으로 실행하세요. ';' 으로 여러 구문을 구분할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
