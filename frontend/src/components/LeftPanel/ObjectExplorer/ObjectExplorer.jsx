import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useApp, openTab } from '../../../store/AppContext.jsx';
import { api } from '../../../api/client.js';
import TableSpecModal from '../../ObjectDetail/TableSpecModal.jsx';
import ScriptViewModal from '../../ObjectDetail/ScriptViewModal.jsx';

const ORACLE_OBJECT_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SEQUENCE', 'SYNONYM'];
const POSTGRES_OBJECT_TYPES = ['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'FUNCTION', 'PROCEDURE', 'SEQUENCE', 'TRIGGER'];
const TYPE_ICONS = {
  TABLE: '▦', VIEW: '◧', 'MATERIALIZED VIEW': '◫',
  PROCEDURE: '⊕', FUNCTION: 'ƒ', PACKAGE: '⊞',
  TRIGGER: '⚡', SEQUENCE: '∞', SYNONYM: '≡',
};
const TYPE_LABELS = {
  TABLE: 'Tables', VIEW: 'Views', 'MATERIALIZED VIEW': 'Materialized Views',
  PROCEDURE: 'Procedures', FUNCTION: 'Functions', PACKAGE: 'Packages',
  TRIGGER: 'Triggers', SEQUENCE: 'Sequences', SYNONYM: 'Synonyms',
};

function objectTypesFor(dbType) {
  return dbType === 'postgres' ? POSTGRES_OBJECT_TYPES : ORACLE_OBJECT_TYPES;
}

const STYLE_SCHEMA  = { display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer', userSelect: 'none' };
const STYLE_TYPE    = { display: 'flex', alignItems: 'center', padding: '3px 8px 3px 24px', cursor: 'pointer', userSelect: 'none' };
const STYLE_ITEM    = { display: 'flex', alignItems: 'center', padding: '3px 8px 3px 40px', cursor: 'pointer', userSelect: 'none' };
const STYLE_ICON_SM = { color: 'var(--text-secondary)', fontSize: 11, marginRight: 4 };

// schema, type, name 은 모두 primitive → memo 비교가 정확하게 동작한다.
// onEvent 는 컴포넌트 외부에서 useCallback 으로 안정화되므로 재렌더가 발생하지 않는다.
const ObjectItem = memo(function ObjectItem({
  name, type, schema, isFiltering, objectFilter, onEvent, isSelected,
}) {
  const label = isFiltering
    ? highlightMatch(name, objectFilter)
    : <span style={{ fontSize: 12 }}>{name}</span>;
  return (
    <div
      style={{ ...STYLE_ITEM, background: isSelected ? 'rgba(79,193,255,0.18)' : undefined }}
      onClick={e => onEvent(e, schema, type, name, 'click')}
      onDoubleClick={e => onEvent(e, schema, type, name, 'dblclick')}
      onContextMenu={e => onEvent(e, schema, type, name, 'context')}
    >
      <span style={STYLE_ICON_SM}>{TYPE_ICONS[type]}</span>
      {label}
    </div>
  );
});

export default function ObjectExplorer() {
  const { state, dispatch } = useApp();
  const { activeConnectionId, connectionStatuses, expandedNodes } = state;
  const isConnected = connectionStatuses[activeConnectionId] === 'connected';

  const activeConn = state.connections.find(c => c.id === activeConnectionId);
  const OBJECT_TYPES = objectTypesFor(activeConn?.dbType);
  const dbType = activeConn?.dbType || 'oracle';

  const [schemas, setSchemas] = useState([]);
  const [objects, setObjects] = useState({});
  const [loading, setLoading] = useState({});
  const [schemaError, setSchemaError] = useState(null);
  const [schemaFilter, setSchemaFilter] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [filterCollapsed, setFilterCollapsed] = useState(new Set());

  // Multi-select: scoped to same schema + same type
  // { schema: string|null, type: string|null, names: Set<string> }
  const [sel, setSel] = useState({ schema: null, type: null, names: new Set() });
  const selRef = useRef(sel);
  selRef.current = sel;

  const [ctxMenu, setCtxMenu] = useState(null);   // { x, y, schema, type, name }
  const [specModal, setSpecModal] = useState(null); // { schema, tables[] }
  const [scriptModal, setScriptModal] = useState(null); // { schema, type, names[] }

  // Anchor for Shift+click range-select: { schema, type, name }
  const lastSelRef = useRef(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { setFilterCollapsed(new Set()); }, [objectFilter]);

  useEffect(() => {
    if (!activeConnectionId || !isConnected) {
      setSchemas([]); setSchemaError(null); setSchemaFilter(''); setObjectFilter('');
      return;
    }
    setLoading(l => ({ ...l, schemas: true }));
    setSchemaError(null);
    api.getSchemas(activeConnectionId)
      .then(s => { setSchemas(s); setObjects({}); })
      .catch(e => setSchemaError(e.message))
      .finally(() => setLoading(l => ({ ...l, schemas: false })));
  }, [activeConnectionId, isConnected]);

  useEffect(() => {
    if (!objectFilter.trim() || !activeConnectionId) return;
    schemas.forEach(schema => {
      const schemaNodeId = `${activeConnectionId}-${schema}`;
      if (!expandedNodes.has(schemaNodeId)) return;
      OBJECT_TYPES.forEach(type => {
        const key = `${activeConnectionId}-${schema}-${type}`;
        if (!objects[key]) loadObjects(schema, type);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [objectFilter, expandedNodes, activeConnectionId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  useEffect(() => {
    setSel({ schema: null, type: null, names: new Set() });
  }, [activeConnectionId]);

  if (!activeConnectionId || !isConnected) return null;

  function loadObjects(schema, type) {
    const key = `${activeConnectionId}-${schema}-${type}`;
    if (objects[key]) return;
    setLoading(l => ({ ...l, [key]: true }));
    api.getObjects(activeConnectionId, schema, type)
      .then(list => setObjects(o => ({ ...o, [key]: list })))
      .catch(() => setObjects(o => ({ ...o, [key]: [] })))
      .finally(() => setLoading(l => ({ ...l, [key]: false })));
  }

  function refreshObjects(schema, type) {
    const key = `${activeConnectionId}-${schema}-${type}`;
    setObjects(o => { const next = { ...o }; delete next[key]; return next; });
    setLoading(l => ({ ...l, [key]: true }));
    api.getObjects(activeConnectionId, schema, type)
      .then(list => setObjects(o => ({ ...o, [key]: list })))
      .catch(() => setObjects(o => ({ ...o, [key]: [] })))
      .finally(() => setLoading(l => ({ ...l, [key]: false })));
  }

  function openErd(schema) {
    openTab(dispatch, stateRef.current, {
      id: `ERD-${activeConnectionId}-${schema}`,
      type: 'erd', title: `ERD: ${schema}`,
      connectionId: activeConnectionId,
      content: { schema },
    });
  }

  const handleSchemaClick = useCallback((schema) => {
    const nodeId = `${activeConnectionId}-${schema}`;
    dispatch({ type: 'TOGGLE_NODE', payload: nodeId });
    dispatch({ type: 'SET_SELECTED_SCHEMA', payload: { connectionId: activeConnectionId, schemaName: schema } });
  }, [dispatch, activeConnectionId]);

  const handleTypeClick = useCallback((schema, type, isObjFiltering, expandedNodes) => {
    const nodeId = `${activeConnectionId}-${schema}-${type}`;
    if (isObjFiltering) {
      setFilterCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
        return next;
      });
    } else {
      if (!expandedNodes.has(nodeId)) loadObjects(schema, type);
      dispatch({ type: 'TOGGLE_NODE', payload: nodeId });
    }
  }, [dispatch, activeConnectionId]);

  const makeObjectClickHandler = useCallback((schema) => (type, name) => {
    const s = stateRef.current;
    const tabType = ['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(type) ? 'table'
      : type === 'SEQUENCE' ? 'sequence'
      : type === 'SYNONYM' ? 'synonym' : 'source';
    openTab(dispatch, s, {
      id: `${type}-${activeConnectionId}-${schema}-${name}`,
      type: tabType,
      title: name,
      connectionId: activeConnectionId,
      content: { schema, objectType: type, name, activeTab: tabType === 'table' ? 'columns' : 'source' },
    });
  }, [dispatch, activeConnectionId]);

  // displayListsRef: 렌더 시 각 (schema::type) 의 현재 displayList 를 저장.
  // handleItemEvent 안에서 Shift+클릭 범위 선택에 사용한다.
  const displayListsRef = useRef({});

  // 단일 안정적 이벤트 핸들러 — ObjectItem 의 모든 인터랙션을 처리한다.
  // deps 가 [dispatch, activeConnectionId, makeObjectClickHandler] 이므로
  // 연결 전환 없이는 함수 참조가 유지 → ObjectItem memo 가 실제로 작동한다.
  const handleItemEvent = useCallback((e, schema, type, name, action) => {
    if (action === 'context') {
      e.preventDefault(); e.stopPropagation();
      const cur = selRef.current;
      if (cur.schema !== schema || cur.type !== type || !cur.names.has(name)) {
        setSel({ schema, type, names: new Set([name]) });
        lastSelRef.current = { schema, type, name };
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, schema, type, name });
      return;
    }
    if (action === 'dblclick') {
      makeObjectClickHandler(schema)(type, name);
      return;
    }
    // click
    if (e.detail > 1) return;
    const displayList = displayListsRef.current[`${schema}::${type}`];
    if (e.shiftKey) {
      e.preventDefault();
      const last = lastSelRef.current;
      const fromIdx = (last?.schema === schema && last?.type === type && displayList)
        ? displayList.indexOf(last.name) : -1;
      const toIdx = displayList ? displayList.indexOf(name) : -1;
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const range = displayList.slice(lo, hi + 1);
        setSel(prev => {
          const names = (prev.schema === schema && prev.type === type) ? new Set(prev.names) : new Set();
          range.forEach(rn => names.add(rn));
          return { schema, type, names };
        });
      } else {
        setSel({ schema, type, names: new Set([name]) });
        lastSelRef.current = { schema, type, name };
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSel(prev => {
        const names = (prev.schema === schema && prev.type === type) ? new Set(prev.names) : new Set();
        if (names.has(name)) names.delete(name); else names.add(name);
        if (names.size === 0) return { schema: null, type: null, names: new Set() };
        return { schema, type, names };
      });
      lastSelRef.current = { schema, type, name };
    } else {
      setSel({ schema, type, names: new Set([name]) });
      lastSelRef.current = { schema, type, name };
    }
  }, [dispatch, activeConnectionId, makeObjectClickHandler]);

  // ── Derived selection info ──
  const selCount = sel.names.size;
  const selNames = selCount > 0 ? [...sel.names] : [];

  function openScriptForCtx() {
    const cur = selRef.current;
    const names = (ctxMenu && cur.schema === ctxMenu.schema && cur.type === ctxMenu.type && cur.names.size > 0)
      ? [...cur.names]
      : [ctxMenu.name];
    setScriptModal({ schema: ctxMenu.schema, type: ctxMenu.type, names });
    setCtxMenu(null);
  }

  function openSpecForCtx() {
    const cur = selRef.current;
    const allNames = (cur.schema === ctxMenu.schema && cur.type === 'TABLE' && cur.names.size > 0)
      ? (cur.names.has(ctxMenu.name) ? [...cur.names] : [...cur.names, ctxMenu.name])
      : [ctxMenu.name];
    setSpecModal({ schema: ctxMenu.schema, tables: allNames });
    setCtxMenu(null);
  }

  // ── render ──
  const filteredSchemas = schemaFilter.trim()
    ? schemas.filter(s => s.toLowerCase().includes(schemaFilter.toLowerCase()))
    : schemas;
  const objFilterLower = objectFilter.toLowerCase().trim();
  const isObjFiltering = !!objFilterLower;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 1 }}>OBJECTS</span>
      </div>

      {/* Selection banner */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          background: 'rgba(79,193,255,0.12)', borderBottom: '1px solid var(--border)', flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent-bright)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {selCount}개 선택 · {TYPE_LABELS[sel.type] || sel.type}
          </span>
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
            {sel.type === 'TABLE' && (
              <button
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => setSpecModal({ schema: sel.schema, tables: selNames })}
              >📑 명세서</button>
            )}
            <button
              className="btn-secondary"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setScriptModal({ schema: sel.schema, type: sel.type, names: selNames })}
            >📄 스크립트</button>
            <button
              onClick={() => setSel({ schema: null, type: null, names: new Set() })}
              title="선택 해제"
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}
            >✕</button>
          </div>
        </div>
      )}

      {/* Schema filter */}
      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput placeholder="스키마 필터..." value={schemaFilter} onChange={setSchemaFilter} />
        {schemaFilter && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>
            {filteredSchemas.length} / {schemas.length}
          </div>
        )}
      </div>

      {/* Object filter */}
      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput placeholder="오브젝트 필터..." value={objectFilter} onChange={setObjectFilter} />
        {isObjFiltering && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>스키마를 펼치면 자동 검색</div>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading.schemas && <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12 }}><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />스키마 로딩 중...</div>}
        {schemaError && (
          <div style={{ padding: '8px 10px', color: 'var(--danger)', fontSize: 11, wordBreak: 'break-word' }}>⚠ {schemaError}</div>
        )}
        {!loading.schemas && schemaFilter && filteredSchemas.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>결과 없음</div>
        )}
        {filteredSchemas.map(schema => {
          const schemaNodeId = `${activeConnectionId}-${schema}`;
          const schemaExpanded = expandedNodes.has(schemaNodeId);
          return (
            <div key={schema}>
              <div
                style={STYLE_SCHEMA}
                onClick={() => handleSchemaClick(schema)}
                onContextMenu={e => {
                  e.preventDefault(); e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, schema, type: null, name: null, isSchema: true });
                }}
              >
                <span style={{ marginRight: 4 }}>{schemaExpanded ? '▾' : '▸'}</span>
                <span style={{ fontSize: 13 }}>🗄</span>
                <span style={{ marginLeft: 4, fontSize: 12 }}>{schema}</span>
              </div>
              {schemaExpanded && OBJECT_TYPES.map(type => {
                const typeNodeId = `${activeConnectionId}-${schema}-${type}`;
                const typeExpanded = expandedNodes.has(typeNodeId);
                const key = typeNodeId;
                const objList = objects[key];
                const isLoading = loading[key];
                const filteredObjList = objList
                  ? (isObjFiltering ? objList.filter(n => n.toLowerCase().includes(objFilterLower)) : objList)
                  : null;

                if (isObjFiltering && !isLoading && filteredObjList && filteredObjList.length === 0) return null;

                const showObjects = isObjFiltering ? !filterCollapsed.has(typeNodeId) : typeExpanded;
                const displayList = isObjFiltering ? filteredObjList : objList;

                // Shift+클릭 범위 선택을 위해 현재 displayList 를 ref 에 저장
                displayListsRef.current[`${schema}::${type}`] = displayList;

                return (
                  <div key={type}>
                    <div
                      style={STYLE_TYPE}
                      onClick={() => handleTypeClick(schema, type, isObjFiltering, expandedNodes)}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtxMenu({ x: e.clientX, y: e.clientY, schema, type, name: null });
                      }}
                    >
                      <span style={{ marginRight: 4 }}>{showObjects ? '▾' : '▸'}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{TYPE_ICONS[type]}</span>
                      <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {TYPE_LABELS[type]}
                        {isObjFiltering && filteredObjList
                          ? <span style={{ marginLeft: 4, color: 'var(--accent)' }}>({filteredObjList.length})</span>
                          : objList && <span style={{ marginLeft: 4, color: 'var(--text-dim)' }}>({objList.length})</span>}
                      </span>
                    </div>
                    {showObjects && (
                      <div>
                        {isLoading && <div style={{ paddingLeft: 40, color: 'var(--text-dim)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} />로딩 중...</div>}
                        {displayList?.map(name => {
                          const isSelected = sel.schema === schema && sel.type === type && sel.names.has(name);
                          return (
                            <ObjectItem
                              key={name}
                              name={name}
                              type={type}
                              schema={schema}
                              isFiltering={isObjFiltering}
                              objectFilter={isObjFiltering ? objectFilter.trim() : ''}
                              onEvent={handleItemEvent}
                              isSelected={isSelected}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="ctx-menu"
          onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9000, minWidth: 210 }}
        >
          {ctxMenu.isSchema ? (
            <div className="ctx-menu-item" onClick={() => { openErd(ctxMenu.schema); setCtxMenu(null); }}>
              🔗 ERD 다이어그램 보기
            </div>
          ) : <>
          {(() => {
            const cur = selRef.current;
            const count = (cur.schema === ctxMenu.schema && cur.type === ctxMenu.type)
              ? cur.names.size : 1;
            return count > 1 ? (
              <div style={{ padding: '4px 14px 2px', fontSize: 11, color: 'var(--accent-bright)', fontWeight: 700 }}>
                {count}개 선택됨
              </div>
            ) : null;
          })()}
          <div className="ctx-menu-item" onClick={() => {
            refreshObjects(ctxMenu.schema, ctxMenu.type);
            setCtxMenu(null);
          }}>↻ 새로고침</div>
          {ctxMenu.name === null && (() => {
            const key = `${activeConnectionId}-${ctxMenu.schema}-${ctxMenu.type}`;
            const list = objects[key];
            if (!list?.length) return null;
            return (
              <>
                <div className="ctx-menu-sep" />
                <div className="ctx-menu-item" onClick={() => {
                  setScriptModal({ schema: ctxMenu.schema, type: ctxMenu.type, names: list });
                  setCtxMenu(null);
                }}>📄 스크립트 보기 ({list.length}개)</div>
              </>
            );
          })()}
          {ctxMenu.name !== null && <>
            <div className="ctx-menu-sep" />
            <div className="ctx-menu-item" onClick={() => {
              makeObjectClickHandler(ctxMenu.schema)(ctxMenu.type, ctxMenu.name);
              setCtxMenu(null);
            }}>🔗 탭으로 열기</div>
            <div className="ctx-menu-item" onClick={openScriptForCtx}>📄 스크립트 보기</div>
            {ctxMenu.type === 'TABLE' && (
              <div className="ctx-menu-item" onClick={openSpecForCtx}>
                📑 테이블 명세서 만들기
                {(() => {
                  const cur = selRef.current;
                  const count = (cur.schema === ctxMenu.schema && cur.type === 'TABLE') ? cur.names.size : 1;
                  return count > 1 ? <span style={{ color: 'var(--accent-bright)', marginLeft: 6 }}>({count}개)</span> : null;
                })()}
              </div>
            )}
          </>}
          </>}
        </div>
      )}

      {/* Modals */}
      {specModal && (
        <TableSpecModal
          connectionId={activeConnectionId}
          schema={specModal.schema}
          initialTables={specModal.tables}
          onClose={() => setSpecModal(null)}
        />
      )}
      {scriptModal && (
        <ScriptViewModal
          connectionId={activeConnectionId}
          schema={scriptModal.schema}
          type={scriptModal.type}
          names={scriptModal.names}
          dbType={dbType}
          onClose={() => setScriptModal(null)}
        />
      )}
    </div>
  );
}


function FilterInput({ placeholder, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', gap: 4 }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>🔍</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12, minWidth: 0 }}
      />
      {value && (
        <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
      )}
    </div>
  );
}

function highlightMatch(name, query) {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span style={{ fontSize: 12 }}>{name}</span>;
  return (
    <span style={{ fontSize: 12 }}>
      {name.slice(0, idx)}
      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{name.slice(idx, idx + query.length)}</span>
      {name.slice(idx + query.length)}
    </span>
  );
}
