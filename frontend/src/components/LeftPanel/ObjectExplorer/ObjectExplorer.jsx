import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useApp, openTab } from '../../../store/AppContext.jsx';
import { api } from '../../../api/client.js';
import TableSpecModal from '../../ObjectDetail/TableSpecModal.jsx';

const OBJECT_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SEQUENCE', 'SYNONYM'];
const TYPE_ICONS = { TABLE: '▦', VIEW: '◧', PROCEDURE: '⊕', FUNCTION: 'ƒ', PACKAGE: '⊞', TRIGGER: '⚡', SEQUENCE: '∞', SYNONYM: '≡' };
const TYPE_LABELS = { TABLE: 'Tables', VIEW: 'Views', PROCEDURE: 'Procedures', FUNCTION: 'Functions', PACKAGE: 'Packages', TRIGGER: 'Triggers', SEQUENCE: 'Sequences', SYNONYM: 'Synonyms' };

// Static style objects — created once, not on every render
const STYLE_SCHEMA  = { display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer', userSelect: 'none' };
const STYLE_TYPE    = { display: 'flex', alignItems: 'center', padding: '3px 8px 3px 24px', cursor: 'pointer', userSelect: 'none' };
const STYLE_ITEM    = { display: 'flex', alignItems: 'center', padding: '3px 8px 3px 40px', cursor: 'pointer', userSelect: 'none' };
const STYLE_ICON_SM = { color: 'var(--text-secondary)', fontSize: 11, marginRight: 4 };

// Memoized leaf item — only re-renders when its own props change.
// Multi-select (TABLE): Ctrl+click toggles, Shift+click range-selects.
// No checkboxes — selection shown by background highlight only.
const ObjectItem = memo(function ObjectItem({
  name, type, isFiltering, objectFilter, onItemClick, isSelected, onContext,
}) {
  const label = isFiltering
    ? highlightMatch(name, objectFilter)
    : <span style={{ fontSize: 12 }}>{name}</span>;
  return (
    <div
      style={{ ...STYLE_ITEM, background: isSelected ? 'rgba(79,193,255,0.18)' : undefined }}
      onClick={(e) => onItemClick(e, name)}
      onContextMenu={onContext
        ? (e) => { e.preventDefault(); e.stopPropagation(); onContext(e, name); }
        : undefined
      }
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

  const [schemas, setSchemas] = useState([]);
  const [objects, setObjects] = useState({});
  const [loading, setLoading] = useState({});
  const [schemaError, setSchemaError] = useState(null);
  const [schemaFilter, setSchemaFilter] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [filterCollapsed, setFilterCollapsed] = useState(new Set());

  // Multi-select of tables (scoped to a single schema) for spec export
  const [sel, setSel] = useState({ schema: null, names: new Set() });
  const [ctxMenu, setCtxMenu] = useState(null);   // { x, y, schema, name }
  const [specModal, setSpecModal] = useState(null); // { schema, tables }

  // Tracks the last item clicked (for Shift+click range-select)
  const lastSelRef = useRef(null); // { schema, name }

  // Keep latest state accessible inside stable callbacks without re-creating them
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

  // Auto-load all types for expanded schemas when object filter is active
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

  // Close context menu on any outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  // Reset table selection when the active connection changes
  useEffect(() => { setSel({ schema: null, names: new Set() }); }, [activeConnectionId]);

  const openObjContext = useCallback((e, schema, name) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, schema, name });
  }, []);

  function openSpecFor(schema, name) {
    const selectedHere = sel.schema === schema ? sel.names : new Set();
    const tables = selectedHere.size
      ? (selectedHere.has(name) ? [...selectedHere] : [...selectedHere, name])
      : [name];
    setSpecModal({ schema, tables });
    setCtxMenu(null);
  }

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
    const tabType = ['TABLE', 'VIEW'].includes(type) ? 'table'
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

      {sel.names.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          background: 'rgba(79,193,255,0.12)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent-bright)', fontWeight: 700 }}>
            {sel.names.size}개 선택
          </span>
          <button
            className="btn-secondary"
            style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
            onClick={() => setSpecModal({ schema: sel.schema, tables: [...sel.names] })}
          >📑 명세서 만들기</button>
          <button
            onClick={() => setSel({ schema: null, names: new Set() })}
            title="선택 해제"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13 }}
          >✕</button>
        </div>
      )}

      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput placeholder="스키마 필터..." value={schemaFilter} onChange={setSchemaFilter} />
        {schemaFilter && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>
            {filteredSchemas.length} / {schemas.length}
          </div>
        )}
      </div>

      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput placeholder="오브젝트 필터..." value={objectFilter} onChange={setObjectFilter} />
        {isObjFiltering && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>스키마를 펼치면 자동 검색</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading.schemas && <div style={{ padding: 8, color: 'var(--text-secondary)', fontSize: 12 }}>Loading schemas...</div>}
        {schemaError && (
          <div style={{ padding: '8px 10px', color: 'var(--danger)', fontSize: 11, wordBreak: 'break-word' }}>⚠ {schemaError}</div>
        )}
        {!loading.schemas && schemaFilter && filteredSchemas.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>결과 없음</div>
        )}
        {filteredSchemas.map(schema => {
          const schemaNodeId = `${activeConnectionId}-${schema}`;
          const schemaExpanded = expandedNodes.has(schemaNodeId);
          const objectClickHandler = makeObjectClickHandler(schema);
          return (
            <div key={schema}>
              <div style={STYLE_SCHEMA} onClick={() => handleSchemaClick(schema)}>
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

                return (
                  <div key={type}>
                    <div style={STYLE_TYPE} onClick={() => handleTypeClick(schema, type, isObjFiltering, expandedNodes)}>
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
                        {isLoading && <div style={{ paddingLeft: 40, color: 'var(--text-dim)', fontSize: 11 }}>Loading...</div>}
                        {displayList?.map(name => {
                          if (type === 'TABLE') {
                            // TABLE: Ctrl+click toggles, Shift+click range-selects, plain click opens tab
                            const isSelected = sel.schema === schema && sel.names.has(name);
                            const handleClick = (e, n) => {
                              if (e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                                setSel(prev => {
                                  const names = prev.schema === schema ? new Set(prev.names) : new Set();
                                  if (names.has(n)) names.delete(n); else names.add(n);
                                  if (names.size === 0) return { schema: null, names: new Set() };
                                  return { schema, names };
                                });
                                lastSelRef.current = { schema, name: n };
                              } else if (e.shiftKey) {
                                e.preventDefault();
                                const list = displayList;
                                const last = lastSelRef.current;
                                const fromIdx = (last?.schema === schema && list) ? list.indexOf(last.name) : -1;
                                const toIdx = list ? list.indexOf(n) : -1;
                                if (fromIdx !== -1 && toIdx !== -1) {
                                  const [s, t] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
                                  const range = list.slice(s, t + 1);
                                  setSel(prev => {
                                    const names = prev.schema === schema ? new Set(prev.names) : new Set();
                                    range.forEach(rn => names.add(rn));
                                    return { schema, names };
                                  });
                                } else {
                                  // No anchor yet — just select this one
                                  setSel({ schema, names: new Set([n]) });
                                  lastSelRef.current = { schema, name: n };
                                }
                              } else {
                                lastSelRef.current = { schema, name: n };
                                objectClickHandler('TABLE', n);
                              }
                            };
                            return (
                              <ObjectItem
                                key={name}
                                name={name}
                                type={type}
                                isFiltering={isObjFiltering}
                                objectFilter={isObjFiltering ? objectFilter.trim() : ''}
                                onItemClick={handleClick}
                                isSelected={isSelected}
                                onContext={(e, n) => openObjContext(e, schema, n)}
                              />
                            );
                          }
                          // Non-TABLE: plain click opens tab, no selection
                          return (
                            <ObjectItem
                              key={name}
                              name={name}
                              type={type}
                              isFiltering={isObjFiltering}
                              objectFilter={isObjFiltering ? objectFilter.trim() : ''}
                              onItemClick={(e, n) => objectClickHandler(type, n)}
                              isSelected={false}
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

      {/* Right-click context menu on a table */}
      {ctxMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9000,
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            minWidth: 200, paddingBlock: 4,
          }}
        >
          <div
            onClick={() => openSpecFor(ctxMenu.schema, ctxMenu.name)}
            style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            📑 테이블 명세서 만들기
            {sel.schema === ctxMenu.schema && sel.names.size > 0 && (
              <span style={{ color: 'var(--accent-bright)', marginLeft: 6 }}>
                ({sel.names.has(ctxMenu.name) ? sel.names.size : sel.names.size + 1}개)
              </span>
            )}
          </div>
        </div>
      )}

      {specModal && (
        <TableSpecModal
          connectionId={activeConnectionId}
          schema={specModal.schema}
          initialTables={specModal.tables}
          onClose={() => setSpecModal(null)}
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
