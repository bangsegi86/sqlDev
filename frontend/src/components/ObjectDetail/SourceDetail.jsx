import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';
import AnalyzerTab from './AnalyzerTab.jsx';
import ExplainTab from './ExplainTab.jsx';
import SavePreviewModal from './SavePreviewModal.jsx';
import SyntaxTextarea from '../Common/SyntaxTextarea.jsx';
import { formatSQL } from '../../utils/formatSQL.js';
import { highlightTokens, splitHighlightedLines, SQL_COLORS } from '../../utils/sqlHighlight.js';
import { useCopy } from '../../utils/clipboard.js';

// Isolated copy button — owns its own state so re-renders never touch the source view.
// Falls back to a modal textarea when the async Clipboard API is unavailable (HTTP/LAN).
function CopyBtn({ getText }) {
  const [copy, copied, fallbackText, clearFallback] = useCopy();
  const taRef = React.useRef(null);

  React.useEffect(() => {
    if (fallbackText && taRef.current) {
      taRef.current.focus();
      taRef.current.select();
    }
  }, [fallbackText]);

  return (
    <>
      <button
        className="btn-secondary"
        onClick={() => copy(getText())}
        style={{ padding: '2px 8px', fontSize: 11, minWidth: 56 }}
      >{copied ? '✓ 복사됨' : '📋 복사'}</button>

      {fallbackText && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={clearFallback}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 20, width: '70vw', maxWidth: 800,
            display: 'flex', flexDirection: 'column', gap: 10,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                📋 소스 복사 — <span style={{ color: 'var(--accent-bright)' }}>Ctrl+C</span>를 눌러 복사하세요
              </span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}
                onClick={clearFallback}
              >✕</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              HTTP 환경에서는 브라우저 보안 정책으로 자동 복사가 제한됩니다. 텍스트가 선택되어 있습니다.
            </div>
            <textarea
              ref={taRef}
              readOnly
              value={fallbackText}
              style={{
                width: '100%', height: '50vh', resize: 'vertical',
                fontFamily: 'var(--code-font)', fontSize: 12,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: 10, boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Escape') clearFallback(); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
import { useCodeLookup } from '../../hooks/useCodeLookup.js';
import CodeLookupMenu from '../Common/CodeLookupMenu.jsx';
import CodeLookupPopup from '../SqlEditor/CodeLookupPopup.jsx';
import CodeDictModal from '../SqlEditor/CodeDictModal.jsx';
import FindBar from '../Common/FindBar.jsx';
import { findMatches } from '../../utils/findReplace.js';

const ANALYZABLE = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER'];
const CALLABLE_TYPES = ['PROCEDURE', 'FUNCTION'];

export default function SourceDetail({ tab }) {
  const { dispatch, state } = useApp();
  const { schema, objectType, name } = tab.content;
  const connId = tab.connectionId;
  const canAnalyze = ANALYZABLE.includes(objectType);
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || (canAnalyze ? 'analyzer' : 'source'));
  const [source, setSource] = useState('');
  const [editedSource, setEditedSource] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isFormatted, setIsFormatted] = useState(false);
  // CopyBtn below owns the `copied` state — do NOT hoist it here
  const [formattedSource, setFormattedSource] = useState('');
  const [props, setProps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [compileResult, setCompileResult] = useState(null);
  const [compileLoading, setCompileLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Code lookup feature
  const {
    ctxMenu: codeLookupCtx,
    lookup: codeLookup,
    dictOpen: codeDictOpen,
    setDictOpen: setCodeDictOpen,
    openContextMenu,
    openLookup,
    closeCtxMenu,
    closeLookup,
  } = useCodeLookup();

  // Word highlight on double-click
  const [hlWord, setHlWord] = useState('');
  const clearHlTimerRef = useRef(null);

  // Active line highlight
  const [activeLine, setActiveLine] = useState(null);

  // Ctrl+click navigation state
  const [acItems, setAcItems] = useState([]);
  const acSchemaRef = useRef(null);
  const ctrlHeldRef = useRef(false);
  const preRef = useRef(null);

  // Find & Replace
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findCase, setFindCase] = useState(false);
  const [findRegex, setFindRegex] = useState(false);
  const [findMatchIdx, setFindMatchIdx] = useState(0);
  const findInputRef = useRef(null);
  const syntaxTextareaRef = useRef(null);   // ref → SyntaxTextarea's inner <textarea>
  const findScrollRef = useRef(null);        // ref → read-only pre's scroll container
  const replaceUndoRef = useRef(null);       // snapshot before last replace (for Ctrl+Z)

  const highlightedLines = useMemo(() => {
    const code = isFormatted ? formattedSource : source;
    if (!code) return null;
    return splitHighlightedLines(highlightTokens(code));
  }, [source, formattedSource, isFormatted]);

  // Find & Replace — compute matches from current visible text
  const findCurrentText = editMode ? editedSource : (isFormatted ? formattedSource : source);
  const findMatches_ = useMemo(
    () => findMatches(findCurrentText, findText, { caseSensitive: findCase, useRegex: findRegex }),
    [findCurrentText, findText, findCase, findRegex]
  );
  useEffect(() => { setFindMatchIdx(0); }, [findText, findCase, findRegex]);

  // Scroll to match: textarea selection in edit mode, pre scroll in read-only
  function scrollToFindMatch(i, ms) {
    const m = (ms || findMatches_)[i];
    if (!m) return;
    const lineNum = findCurrentText.slice(0, m.start).split('\n').length - 1;
    setActiveLine(lineNum);
    if (editMode && syntaxTextareaRef.current) {
      const ta = syntaxTextareaRef.current;
      ta.setSelectionRange(m.start, m.end);
      ta.focus();
      const lineH = 12 * 1.55;
      ta.scrollTop = Math.max(0, lineNum * lineH - ta.clientHeight / 2);
    } else if (findScrollRef.current) {
      const lineH = 12 * 1.5;
      findScrollRef.current.scrollTop = Math.max(0, lineNum * lineH - findScrollRef.current.clientHeight / 2);
    }
  }

  function findNext() {
    if (!findMatches_.length) return;
    const i = (findMatchIdx + 1) % findMatches_.length;
    setFindMatchIdx(i); scrollToFindMatch(i);
  }
  function findPrev() {
    if (!findMatches_.length) return;
    const i = (findMatchIdx - 1 + findMatches_.length) % findMatches_.length;
    setFindMatchIdx(i); scrollToFindMatch(i);
  }
  function replaceOne() {
    if (!editMode || !findMatches_.length) return;
    const m = findMatches_[findMatchIdx];
    replaceUndoRef.current = editedSource;
    const next = editedSource.slice(0, m.start) + replaceText + editedSource.slice(m.end);
    setEditedSource(next);
    requestAnimationFrame(() => {
      const ta = syntaxTextareaRef.current;
      if (ta) {
        const caret = m.start + replaceText.length;
        ta.setSelectionRange(caret, caret);
        ta.focus();
      }
      const nm = findMatches(next, findText, { caseSensitive: findCase, useRegex: findRegex });
      const ni = Math.max(0, Math.min(findMatchIdx, nm.length - 1));
      setFindMatchIdx(ni);
      if (nm.length) scrollToFindMatch(ni, nm);
    });
  }
  function replaceAll() {
    if (!editMode || !findMatches_.length) return;
    replaceUndoRef.current = editedSource;
    let result = '', last = 0;
    for (const m of findMatches_) { result += editedSource.slice(last, m.start) + replaceText; last = m.end; }
    setEditedSource(result + editedSource.slice(last));
    setFindMatchIdx(0);
  }
  function openFind(withReplace) {
    setFindOpen(true);
    requestAnimationFrame(() => { findInputRef.current?.focus(); findInputRef.current?.select(); });
  }
  function closeFind() {
    setFindOpen(false);
    if (editMode) syntaxTextareaRef.current?.focus();
    else preRef.current?.focus();
  }

  // Ctrl+F / Ctrl+H shortcut — active when the source tab is visible
  useEffect(() => {
    if (activeTab !== 'source') return;
    function handler(e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openFind(false); }
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); openFind(true); }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab]);

  // Set of callable names for underline rendering
  const navigableCallableNames = useMemo(
    () => new Set(acItems.filter(it => CALLABLE_TYPES.includes(it.type)).map(it => it.name.toUpperCase())),
    [acItems]
  );

  const NAV_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION'];

  // Load object list for schema — TABLE/VIEW needed for right-click nav, PROCEDURE/FUNCTION for underline
  const loadAcItems = useCallback(async () => {
    if (!connId || !schema) return [];
    if (acSchemaRef.current === `${connId}:${schema}` && acItems.length > 0) return acItems;
    try {
      const results = await Promise.all(
        NAV_TYPES.map(type =>
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

  // Eagerly load nav items so right-click works without Ctrl being pressed first
  useEffect(() => {
    acSchemaRef.current = null;
    setAcItems([]);
    loadAcItems();
  }, [connId, schema]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function loadSource() {
    setLoading(true); setError(''); setCompileResult(null); setActiveLine(null); setHlWord('');
    api.getSource(connId, schema, objectType, name)
      .then(r => { setSource(r.source); setEditedSource(r.source); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (activeTab === 'source' && !source) loadSource();
    if (activeTab === 'properties' && !props) {
      api.getObjectProperties(connId, schema, objectType, name)
        .then(setProps)
        .catch(() => {});
    }
  }, [activeTab]);

  async function handleCompile() {
    setCompileLoading(true); setCompileResult(null);
    try {
      const r = await api.compileSource(connId, schema, objectType, name);
      setCompileResult(r);
    } catch (e) {
      setCompileResult({ success: false, errors: [{ text: e.message, attribute: 'ERROR' }] });
    } finally { setCompileLoading(false); }
  }

  function handleSave() {
    // Show SQL preview modal; actual API call happens inside the modal on Execute
    setShowSaveModal(true);
  }

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
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
            {/* Find & Replace overlay */}
            {findOpen && (
              <FindBar
                findInputRef={findInputRef}
                findText={findText} replaceText={replaceText}
                findCase={findCase} findRegex={findRegex}
                matchIdx={findMatchIdx} matchCount={findMatches_.length}
                onFindChange={setFindText} onReplaceChange={setReplaceText}
                onToggleCase={() => setFindCase(v => !v)} onToggleRegex={() => setFindRegex(v => !v)}
                onNext={findNext} onPrev={findPrev}
                onReplaceOne={replaceOne} onReplaceAll={replaceAll}
                onClose={closeFind}
                showReplace={editMode}
              />
            )}
            {/* Top toolbar */}
            <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <CopyBtn getText={() => editMode ? editedSource : (isFormatted ? formattedSource : source)} />
              {!editMode && (
                <button
                  className={isFormatted ? 'btn-success' : 'btn-secondary'}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => {
                    if (!isFormatted) { setFormattedSource(formatSQL(source)); setIsFormatted(true); }
                    else { setIsFormatted(false); }
                  }}
                  title="SQL/PL-SQL 코드 줄 맞추기"
                >{isFormatted ? '✓ 원본 보기' : '≡ 줄 맞추기'}</button>
              )}
              <button
                className={editMode ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => { setEditMode(m => !m); setIsFormatted(false); }}
                title={editMode ? '읽기 모드로 전환' : '편집 모드로 전환'}
              >{editMode ? '👁 보기' : '✏️ 편집'}</button>
              {isFormatted && !editMode && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>포맷 적용됨</span>}
            </div>

            {loading && <div className="pane-loading"><span className="spinner" />소스 로딩 중...</div>}
            {error && <div className="error-pane"><span className="error-pane-msg">{error}</span></div>}
            {!loading && !error && (() => {
              const hlUp = hlWord ? hlWord.toUpperCase() : null;
              const wordRe = /^[\w$#]+$/;
              const hlBg = { background: 'rgba(255,235,30,0.55)', borderRadius: 2 };
              const isHl = (val) => hlUp && wordRe.test(val) && val.toUpperCase() === hlUp;

              function renderTok(tok, j, lineToks) {
                const hl = isHl(tok.value) ? hlBg : {};
                if (!tok.color) {
                  return isHl(tok.value)
                    ? <span key={j} style={hlBg}>{tok.value}</span>
                    : tok.value;
                }
                if (tok.color === SQL_COLORS.table) {
                  return (
                    <span key={j} className="sql-table-token"
                      style={{ color: tok.color, ...hl }}
                      title="Ctrl+Click: 테이블 상세 열기"
                      onClick={e => handleTableClick(e, tok, j, lineToks)}
                    >{tok.value}</span>
                  );
                }
                if (navigableCallableNames.has(tok.value.toUpperCase())) {
                  return (
                    <span key={j} className="sql-callable-token"
                      style={{ color: tok.color, ...hl }}
                      title="Ctrl+Click: 상세 열기"
                      onClick={e => handleCallableClick(e, tok.value)}
                    >{tok.value}</span>
                  );
                }
                return <span key={j} style={{ color: tok.color, ...hl }}>{tok.value}</span>;
              }

              return editMode ? (
                <SyntaxTextarea
                  ref={syntaxTextareaRef}
                  value={editedSource}
                  onChange={setEditedSource}
                  onContextMenu={e => openContextMenu(e, editedSource)}
                  onDoubleClick={e => {
                    const ta = e.target;
                    const word = editedSource.slice(ta.selectionStart, ta.selectionEnd).trim();
                    if (word && /^[\w$#]+$/.test(word)) setHlWord(word);
                  }}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openFind(false); return; }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); openFind(true); return; }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && replaceUndoRef.current !== null) {
                      e.preventDefault();
                      const prev = replaceUndoRef.current;
                      replaceUndoRef.current = null;
                      setEditedSource(prev);
                    }
                  }}
                  style={{ borderBottom: '1px solid var(--border)' }}
                />
              ) : (
                <div ref={findScrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <pre
                    ref={preRef}
                    className="sql-source-pre"
                    onContextMenu={openContextMenu}
                    onMouseDown={() => {
                      clearTimeout(clearHlTimerRef.current);
                      if (hlWord) {
                        clearHlTimerRef.current = setTimeout(() => setHlWord(''), 300);
                      }
                    }}
                    onDoubleClick={() => {
                      clearTimeout(clearHlTimerRef.current);
                      const word = window.getSelection()?.toString().trim() ?? '';
                      if (word && /^[\w$#]+$/.test(word)) setHlWord(word);
                      else setHlWord('');
                    }}
                    onKeyDown={e => { if (e.key === 'Escape') setHlWord(''); }}
                    tabIndex={-1}
                    style={{ margin: 0, padding: 0, fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, background: 'var(--bg-primary)', minWidth: 'max-content' }}
                  >
                    {(highlightedLines || []).map((lineToks, i) => (
                      <div
                        key={i}
                        onClick={() => setActiveLine(i)}
                        style={{
                          display: 'flex',
                          background: activeLine === i ? 'rgba(255,255,255,0.07)' : 'transparent',
                        }}
                      >
                        <span style={{ width: 44, minWidth: 44, color: activeLine === i ? 'var(--accent-bright)' : 'var(--text-dim)', textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none', lineHeight: 1.5 }}>{i + 1}</span>
                        <span style={{ whiteSpace: 'pre', paddingLeft: 4, flex: 1 }}>
                          {lineToks.map((tok, j) => renderTok(tok, j, lineToks))}
                        </span>
                      </div>
                    ))}
                  </pre>
                </div>
              );
            })()}

            {/* Compile result */}
            {compileResult && (
              <div style={{
                padding: '4px 10px', borderTop: '1px solid var(--border)',
                background: compileResult.success ? 'rgba(30,90,30,0.25)' : 'rgba(90,20,20,0.25)',
                fontSize: 11, flexShrink: 0, maxHeight: 100, overflowY: 'auto',
              }}>
                <span style={{ fontWeight: 700, color: compileResult.success ? '#66bb6a' : 'var(--danger)' }}>
                  {compileResult.success ? `✅ ${compileResult.message || '컴파일 성공'}` : '❌ 컴파일 오류'}
                </span>
                {(compileResult.errors || []).map((e, i) => (
                  <div key={i} style={{ color: e.attribute === 'ERROR' ? 'var(--danger)' : '#ffa726', marginTop: 2 }}>
                    {e.line ? `L${e.line}:${e.position}  ` : ''}{e.text}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom toolbar: Refresh / Compile / Save */}
            {canAnalyze && (
              <div style={{ padding: '5px 8px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="btn-secondary"
                  onClick={loadSource}
                  disabled={loading}
                  style={{ padding: '2px 10px', fontSize: 11 }}
                >↻ 새로고침</button>
                <button
                  className="btn-secondary"
                  onClick={handleCompile}
                  disabled={compileLoading || loading}
                  style={{ padding: '2px 10px', fontSize: 11 }}
                >{compileLoading ? '컴파일 중...' : '🔨 컴파일'}</button>
                <button
                  className={editMode ? 'btn-primary' : 'btn-secondary'}
                  onClick={handleSave}
                  disabled={loading || !editMode}
                  style={{ padding: '2px 10px', fontSize: 11 }}
                  title={editMode ? 'SQL 미리보기 후 저장' : '편집 모드에서만 저장 가능'}
                >💾 저장</button>
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

      {/* Save preview modal */}
      {showSaveModal && (
        <SavePreviewModal
          connectionId={connId}
          schema={schema}
          objectType={objectType}
          name={name}
          source={editedSource}
          onClose={() => setShowSaveModal(false)}
          onSuccess={() => { setEditMode(false); loadSource(); }}
        />
      )}

      {/* Code lookup feature */}
      {codeLookupCtx && (() => {
        const up = codeLookupCtx.word?.toUpperCase();
        const navItems = [];
        if (up && acItems.length > 0) {
          const found = acItems.find(it => it.name.toUpperCase() === up);
          if (found) {
            const typeLabel = { TABLE: '테이블', VIEW: '뷰', PROCEDURE: '프로시저', FUNCTION: '함수' };
            const typeIcon  = { TABLE: '🗃', VIEW: '👁', PROCEDURE: '⚙', FUNCTION: 'ƒ' };
            navItems.push({
              icon: typeIcon[found.type] || '📄',
              label: `${typeLabel[found.type] || found.type} 열기: ${found.name}`,
              onClick: () => { closeCtxMenu(); navigateToObject(null, found.name, found.type); },
            });
          }
        }
        return (
          <CodeLookupMenu
            x={codeLookupCtx.x}
            y={codeLookupCtx.y}
            word={codeLookupCtx.word}
            matchingDefs={codeLookupCtx.matchingDefs}
            navItems={navItems}
            onLookup={openLookup}
            onManage={() => { closeCtxMenu(); setCodeDictOpen(true); }}
            onClose={closeCtxMenu}
          />
        );
      })()}
      {codeLookup && (
        <CodeLookupPopup
          def={codeLookup.def}
          word={codeLookup.word}
          connId={connId}
          schema={schema}
          x={codeLookup.x}
          y={codeLookup.y}
          onClose={closeLookup}
        />
      )}
      {codeDictOpen && (
        <CodeDictModal onClose={() => setCodeDictOpen(false)} />
      )}
    </div>
  );
}
