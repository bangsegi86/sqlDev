import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';
import DataGrid from '../Common/DataGrid.jsx';
import PlanViewer from './PlanViewer.jsx';
import AutocompleteDropdown from './AutocompleteDropdown.jsx';
import { formatSQL } from '../../utils/formatSQL.js';
import { renderHighlighted, getTableAtCursor, getCallableAtCursor } from '../../utils/sqlHighlight.js';
import { openTab } from '../../store/AppContext.jsx';

const LIMIT = 500;
// Object types to include in autocomplete
const AC_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'SEQUENCE'];

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

// Extract the word being typed at cursor position (alphanumeric + _ + $)
function getWordAtCursor(text, pos) {
  let start = pos;
  while (start > 0 && /[\w$]/.test(text[start - 1])) start--;
  const word = text.slice(start, pos);
  return { word, wordStart: start };
}

// Get the full identifier word that charPos falls inside (for Ctrl+click lookup)
function getRawWordAtPos(text, charPos) {
  if (!text) return '';
  let pos = charPos;
  // If not on a word char, try one step left (click lands just after the word)
  if (pos >= text.length || !/[\w$#]/.test(text[pos])) pos = charPos - 1;
  if (pos < 0 || !/[\w$#]/.test(text[pos])) return '';
  let start = pos;
  let end   = pos;
  while (start > 0    && /[\w$#]/.test(text[start - 1])) start--;
  while (end   < text.length - 1 && /[\w$#]/.test(text[end + 1]))   end++;
  return text.slice(start, end + 1).toUpperCase();
}

// Reusable canvas for text width measurement (avoids DOM mirror div bugs)
const _measureCanvas = document.createElement('canvas');

function getCaretPixelPos(textarea) {
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 20;
  const paddingTop  = parseFloat(style.paddingTop)  || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;

  // Measure text width using canvas (accurate for monospace fonts)
  const ctx = _measureCanvas.getContext('2d');
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  const textBeforeCursor = textarea.value.slice(0, textarea.selectionStart);
  const lines = textBeforeCursor.split('\n');
  const row = lines.length - 1;
  const colWidth = ctx.measureText(lines[row]).width;

  const caretTop    = rect.top  + paddingTop  + row * lineHeight - textarea.scrollTop;
  const caretLeft   = rect.left + paddingLeft + colWidth         - textarea.scrollLeft;
  const caretBottom = caretTop  + lineHeight;

  return {
    left:   Math.min(Math.max(caretLeft, rect.left), rect.right - 4),
    top:    Math.max(caretTop,    rect.top),
    bottom: Math.min(caretBottom, rect.bottom),
  };
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
  const [execMsg, setExecMsg] = useState('');
  const [execTime, setExecTime] = useState(null);

  // Result view mode: 'result' | 'plan'
  const [resultMode, setResultMode] = useState('result');
  const [planRaw, setPlanRaw] = useState('');
  const [planAnalysis, setPlanAnalysis] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acItems, setAcItems] = useState([]);       // full object list (cached)
  const [acFilter, setAcFilter] = useState('');     // current typed prefix
  const [acAnchor, setAcAnchor] = useState(null);   // { top, left, bottom }
  const acSchemaRef = useRef(null);                  // schema for which acItems was loaded

  const isDragging = useRef(false);
  const ctrlHeldRef = useRef(false);
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
      if (e.key === 'F6') { e.preventDefault(); explainPlan(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sql, connId, schema]);

  // Ctrl-held tracking: enable pointer-events on <pre> so CSS :hover fires
  useEffect(() => {
    function enableCtrl() {
      if (ctrlHeldRef.current) return;
      ctrlHeldRef.current = true;
      if (preRef.current) {
        preRef.current.style.pointerEvents = 'auto';
        preRef.current.classList.add('ctrl-mode');
      }
      if (textareaRef.current) {
        textareaRef.current.style.pointerEvents = 'none';
      }
    }
    function disableCtrl() {
      ctrlHeldRef.current = false;
      if (preRef.current) {
        preRef.current.style.pointerEvents = 'none';
        preRef.current.classList.remove('ctrl-mode');
      }
      if (textareaRef.current) {
        textareaRef.current.style.pointerEvents = '';
      }
    }
    function onKeyDown(e) { if (e.key === 'Control') enableCtrl(); }
    function onKeyUp(e)   { if (e.key === 'Control') disableCtrl(); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', disableCtrl);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', disableCtrl);
    };
  }, []);

  // Close autocomplete when clicking outside
  useEffect(() => {
    if (!acOpen) return;
    function onMouseDown(e) {
      if (!textareaRef.current?.contains(e.target)) setAcOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [acOpen]);

  // Load object list for current schema (cached per schema)
  const loadAcItems = useCallback(async () => {
    if (!connId || !schema) return [];
    if (acSchemaRef.current === `${connId}:${schema}` && acItems.length > 0) return acItems;
    try {
      const results = await Promise.all(
        AC_TYPES.map(type =>
          api.getObjects(connId, schema, type)
            .then(names => names.map(name => ({ name, type })))
            .catch(() => [])
        )
      );
      const flat = results.flat().sort((a, b) => a.name.localeCompare(b.name));
      acSchemaRef.current = `${connId}:${schema}`;
      setAcItems(flat);
      return flat;
    } catch { return []; }
  }, [connId, schema]);

  // Invalidate cache when schema changes
  useEffect(() => {
    acSchemaRef.current = null;
    setAcItems([]);
  }, [connId, schema]);

  const highlightedSql = useMemo(() => renderHighlighted(sql), [sql]);

  function syncScroll() {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  function openAutocomplete() {
    if (!connId || !schema) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const { word } = getWordAtCursor(ta.value, pos);
    const anchor = getCaretPixelPos(ta);
    setAcFilter(word);
    setAcAnchor(anchor);
    setAcOpen(true);
    // Load items (uses cache if available)
    loadAcItems();
  }

  function closeAutocomplete() {
    setAcOpen(false);
  }

  function applyAutocomplete(name) {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const { word, wordStart } = getWordAtCursor(ta.value, pos);
    const newSql = sql.slice(0, wordStart) + name + sql.slice(pos);
    setSql(newSql);
    // Move cursor to end of inserted word
    const newPos = wordStart + name.length;
    requestAnimationFrame(() => {
      if (ta) { ta.selectionStart = ta.selectionEnd = newPos; ta.focus(); }
    });
    closeAutocomplete();
  }

  function getCharPosFromPoint(x, y) {
    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(x, y);
      if (!caret) return -1;
      range = document.createRange();
      range.setStart(caret.offsetNode, caret.offset);
    }
    if (!range) return -1;
    const pre = preRef.current;
    if (!pre) return -1;
    const clickedNode = range.startContainer;
    const clickedOffset = range.startOffset;
    let charPos = 0;
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode === clickedNode) return charPos + clickedOffset;
      charPos += walker.currentNode.textContent.length;
    }
    return charPos;
  }

  function navigateToObject(schemaName, objectName, objectType) {
    const s = schemaName || schema;
    if (!s || !objectName) return;
    openTab(dispatch, state, {
      id: `${objectType}-${connId}-${s}-${objectName}`,
      type: 'table', title: objectName,
      connectionId: connId,
      content: { schema: s, objectType, name: objectName },
    });
  }

  async function handleObjectNavigation(charPos) {
    // 1. Try table/view (SQL-context colored token)
    const tableResult = getTableAtCursor(sql, charPos);
    if (tableResult) {
      navigateToObject(tableResult.schema, tableResult.table, 'TABLE');
      return;
    }
    // 2. Try procedure / function (builtin-colored or after EXECUTE)
    const callResult = getCallableAtCursor(sql, charPos);
    if (callResult) {
      const items = acItems.length > 0 ? acItems : await loadAcItems();
      const found = items.find(it => it.name.toUpperCase() === callResult.name);
      if (found && (found.type === 'PROCEDURE' || found.type === 'FUNCTION')) {
        navigateToObject(callResult.schema, found.name, found.type);
        return;
      }
    }
    // 3. Fallback: plain identifier — look up directly in object cache
    //    Handles the case where user types just "TABLE_NAME" or "PROC_NAME"
    const word = getRawWordAtPos(sql, charPos);
    if (word) {
      const items = acItems.length > 0 ? acItems : await loadAcItems();
      const found = items.find(it => it.name.toUpperCase() === word);
      if (found) navigateToObject(null, found.name, found.type);
    }
  }

  function handlePreClick(e) {
    if (!ctrlHeldRef.current) return;
    const charPos = getCharPosFromPoint(e.clientX, e.clientY);
    if (charPos < 0) return;
    handleObjectNavigation(charPos);
  }

  function handleKeyDown(e) {
    // Autocomplete trigger: Ctrl+Space
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      if (acOpen) { closeAutocomplete(); } else { openAutocomplete(); }
      return;
    }

    // If autocomplete is open, let the dropdown handle arrow/enter/tab/esc
    // (handled by the dropdown's own keydown listener with capture)
    if (acOpen && ['ArrowUp','ArrowDown','Enter','Tab','Escape'].includes(e.key)) return;

    // Close autocomplete on keys that break word context
    if (acOpen && (e.key === ' ' || e.key === '(' || e.key === ')' || e.key === ';')) {
      closeAutocomplete();
    }

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
      handleObjectNavigation(pos);
    }
  }

  function handleChange(e) {
    const newSql = e.target.value;
    setSql(newSql);

    // If autocomplete is open, update filter as user types
    if (acOpen) {
      const pos = e.target.selectionStart;
      const { word } = getWordAtCursor(newSql, pos);
      if (word.length === 0) {
        closeAutocomplete();
      } else {
        setAcFilter(word);
        setAcAnchor(getCaretPixelPos(e.target));
      }
    }
  }

  async function execute() {
    if (!connId) { setError('연결을 선택하세요.'); return; }
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const stmt = getStatementAtCursor(sql, cursorPos);
    if (!stmt) return;

    closeAutocomplete();
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
    setResultMode('result');

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

  async function explainPlan() {
    if (!connId) { setError('연결을 선택하세요.'); return; }
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const stmt = getStatementAtCursor(sql, cursorPos);
    if (!stmt) return;

    closeAutocomplete();
    setResultMode('plan');
    setPlanLoading(true);
    setPlanError('');
    setPlanRaw('');
    setPlanAnalysis(null);

    try {
      const { plan } = await api.explainQuery(connId, stmt, schema);
      setPlanRaw(plan);
      const analysis = await api.analyzeExplain(connId, plan);
      setPlanAnalysis(analysis);
      dispatch({ type: 'SET_STATUS', payload: `실행계획 조회 완료 — ${analysis.gradeLabel}` });
    } catch (e) {
      setPlanError(e.message);
      dispatch({ type: 'SET_STATUS', payload: `실행계획 오류: ${e.message}` });
    } finally {
      setPlanLoading(false);
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

  const hasResult = resultCols.length > 0 || execMsg || loading;

  const tabBtn = (mode, label) => (
    <button
      onClick={() => setResultMode(mode)}
      style={{
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: 'none',
        border: 'none', borderBottom: resultMode === mode ? '2px solid var(--accent-bright)' : '2px solid transparent',
        color: resultMode === mode ? 'var(--accent-bright)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-success" onClick={execute} disabled={loading} style={{ padding: '3px 12px' }}>
          {loading ? <span className="spinner" /> : '▶ 실행'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>F5</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button className="btn-secondary" onClick={explainPlan} disabled={planLoading} style={{ padding: '3px 10px' }}>
          {planLoading ? <span className="spinner" /> : '📊 실행계획'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>F6</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button
          className="btn-secondary"
          onClick={() => {
            const ta = textareaRef.current;
            if (!ta) return;
            const start = ta.selectionStart;
            const end   = ta.selectionEnd;
            if (start !== end) {
              // Format selected range only, preserve surrounding text
              const before    = sql.slice(0, start);
              const selected  = sql.slice(start, end);
              const after     = sql.slice(end);
              const formatted = formatSQL(selected);
              const newSql    = before + formatted + after;
              setSql(newSql);
              requestAnimationFrame(() => {
                if (ta) {
                  ta.selectionStart = start;
                  ta.selectionEnd   = start + formatted.length;
                  ta.focus();
                }
              });
            } else {
              setSql(prev => formatSQL(prev));
            }
          }}
          style={{ padding: '3px 10px' }}
          title="선택 영역만 줄 맞추기 (선택 없으면 전체)"
        >≡ 줄 맞추기</button>
        {connId && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            {state.connections.find(c => c.id === connId)?.name}
            {schema && ` › ${schema}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
          F5 실행 · F6 실행계획 · Ctrl+Space 자동완성 · Ctrl+클릭/F4 객체 이동
        </span>
      </div>

      {/* Editor overlay */}
      <div style={{ position: 'relative', height: `${splitPos}%`, overflow: 'hidden', background: 'var(--bg-primary)' }}>
        <pre
          ref={preRef}
          aria-hidden="true"
          className="sql-editor-pre"
          onClick={handlePreClick}
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
          onChange={handleChange}
          onScroll={() => { syncScroll(); if (acOpen) closeAutocomplete(); }}
          onKeyDown={e => { handleKeyDown(e); syncScroll(); }}
          onKeyUp={syncScroll}
          onBlur={() => { setTimeout(closeAutocomplete, 150); }}
          onClick={e => {
            syncScroll();
            if (acOpen) closeAutocomplete();
            if (e.ctrlKey) {
              const pos = Math.floor((e.target.selectionStart + e.target.selectionEnd) / 2);
              handleObjectNavigation(pos);
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

        {/* Autocomplete dropdown — rendered via portal-like fixed positioning */}
        {acOpen && acAnchor && (
          <AutocompleteDropdown
            items={acItems}
            filter={acFilter}
            anchorRect={acAnchor}
            onSelect={applyAutocomplete}
            onDismiss={closeAutocomplete}
          />
        )}
      </div>

      <div
        style={{ height: 5, background: 'var(--border)', cursor: 'row-resize', flexShrink: 0 }}
        onMouseDown={onDividerMouseDown}
      />

      {/* Result pane */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {/* Result/Plan tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, padding: '0 4px' }}>
          {tabBtn('result', '결과')}
          {tabBtn('plan', '실행계획')}
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(244,71,71,0.1)', borderBottom: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--code-font)', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* Result tab */}
        {resultMode === 'result' && (
          <>
            {hasResult && (
              <>
                {!loading && (
                  <div style={{ padding: '3px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                    {execMsg ? (
                      <span>{execMsg}</span>
                    ) : (
                      <>
                        <span>
                          <b style={{ color: 'var(--text-primary)' }}>{allRows.length.toLocaleString()}</b>
                          {total != null && total !== allRows.length
                            ? <span style={{ color: 'var(--text-dim)' }}> / {total.toLocaleString()}행 로드됨</span>
                            : <span style={{ color: 'var(--text-dim)' }}>행</span>
                          }
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
                )}

                {(resultCols.length > 0 || loading) && (
                  <DataGrid
                    columns={resultCols}
                    rows={allRows}
                    onLoadMore={loadMore}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    loading={loading || loadingMore}
                  />
                )}
              </>
            )}

            {!hasResult && !error && !loading && (
              <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>
                SQL을 입력하고 F5 또는 ▶ 버튼으로 실행하세요. ';' 으로 여러 구문을 구분할 수 있습니다.
              </div>
            )}
          </>
        )}

        {/* Plan tab */}
        {resultMode === 'plan' && (
          <PlanViewer
            rawPlan={planRaw}
            analysis={planAnalysis}
            loading={planLoading}
            error={planError}
          />
        )}
      </div>
    </div>
  );
}
