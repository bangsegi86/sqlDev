import React, { useEffect, useState } from 'react';
import { useApp, openTab } from '../../../store/AppContext.jsx';
import { api } from '../../../api/client.js';

const OBJECT_TYPES = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SEQUENCE', 'SYNONYM'];
const TYPE_ICONS = { TABLE: '▦', VIEW: '◧', PROCEDURE: '⊕', FUNCTION: 'ƒ', PACKAGE: '⊞', TRIGGER: '⚡', SEQUENCE: '∞', SYNONYM: '≡' };
const TYPE_LABELS = { TABLE: 'Tables', VIEW: 'Views', PROCEDURE: 'Procedures', FUNCTION: 'Functions', PACKAGE: 'Packages', TRIGGER: 'Triggers', SEQUENCE: 'Sequences', SYNONYM: 'Synonyms' };

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

  // Reset per-type collapsed state whenever the filter text changes
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

  // When object filter is active, auto-load all types for expanded schemas
  useEffect(() => {
    if (!objectFilter.trim() || !activeConnectionId) return;
    schemas.forEach(schema => {
      const schemaNodeId = `${activeConnectionId}-${schema}`;
      if (!expandedNodes.has(schemaNodeId)) return;
      OBJECT_TYPES.forEach(type => {
        const key = `${activeConnectionId}-${schema}-${type}`;
        if (!objects[key]) loadObjects(schema, type);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectFilter, expandedNodes, activeConnectionId]);

  if (!activeConnectionId || !isConnected) return null;

  function toggleNode(nodeId) {
    dispatch({ type: 'TOGGLE_NODE', payload: nodeId });
  }

  async function loadObjects(schema, type) {
    const key = `${activeConnectionId}-${schema}-${type}`;
    if (objects[key]) return;
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const list = await api.getObjects(activeConnectionId, schema, type);
      setObjects(o => ({ ...o, [key]: list }));
    } catch (e) {
      setObjects(o => ({ ...o, [key]: [] }));
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }

  function handleSchemaClick(schema) {
    const nodeId = `${activeConnectionId}-${schema}`;
    toggleNode(nodeId);
    dispatch({ type: 'SET_SELECTED_SCHEMA', payload: { connectionId: activeConnectionId, schemaName: schema } });
  }

  function handleTypeClick(schema, type) {
    const nodeId = `${activeConnectionId}-${schema}-${type}`;
    if (isObjFiltering) {
      // During filter: use local collapsed state so expand/collapse works independently
      setFilterCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    } else {
      if (!expandedNodes.has(nodeId)) loadObjects(schema, type);
      toggleNode(nodeId);
    }
  }

  function handleObjectClick(schema, type, name) {
    const tabType = ['TABLE', 'VIEW'].includes(type) ? 'table'
      : type === 'SEQUENCE' ? 'sequence'
      : type === 'SYNONYM' ? 'synonym' : 'source';
    openTab(dispatch, state, {
      id: `${type}-${activeConnectionId}-${schema}-${name}`,
      type: tabType,
      title: name,
      connectionId: activeConnectionId,
      content: { schema, objectType: type, name, activeTab: tabType === 'table' ? 'columns' : 'source' },
    });
  }

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

      {/* Schema filter */}
      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput
          placeholder="스키마 필터..."
          value={schemaFilter}
          onChange={setSchemaFilter}
        />
        {schemaFilter && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>
            {filteredSchemas.length} / {schemas.length}
          </div>
        )}
      </div>

      {/* Object filter */}
      <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-sidebar)', flexShrink: 0 }}>
        <FilterInput
          placeholder="오브젝트 필터..."
          value={objectFilter}
          onChange={setObjectFilter}
        />
        {isObjFiltering && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 2 }}>
            스키마를 펼치면 자동 검색
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading.schemas && <div style={{ padding: 8, color: 'var(--text-secondary)', fontSize: 12 }}>Loading schemas...</div>}
        {schemaError && (
          <div style={{ padding: '8px 10px', color: 'var(--danger)', fontSize: 11, wordBreak: 'break-word' }}>
            ⚠ {schemaError}
          </div>
        )}
        {!loading.schemas && schemaFilter && filteredSchemas.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>결과 없음</div>
        )}
        {filteredSchemas.map(schema => {
          const schemaNodeId = `${activeConnectionId}-${schema}`;
          const schemaExpanded = expandedNodes.has(schemaNodeId);
          return (
            <div key={schema}>
              <div style={treeNode(false)} onClick={() => handleSchemaClick(schema)}>
                <span style={{ marginRight: 4 }}>{schemaExpanded ? '▾' : '▸'}</span>
                <span style={{ fontSize: 13 }}>🗄</span>
                <span style={{ marginLeft: 4, fontSize: 12 }}>{schema}</span>
              </div>
              {schemaExpanded && OBJECT_TYPES.map(type => {
                const typeNodeId = `${activeConnectionId}-${schema}-${type}`;
                const typeExpanded = expandedNodes.has(typeNodeId);
                const objList = objects[typeNodeId];
                const isLoading = loading[typeNodeId];

                const filteredObjList = objList
                  ? (isObjFiltering ? objList.filter(n => n.toLowerCase().includes(objFilterLower)) : objList)
                  : null;

                // When object filter is active, hide types with no matches (unless still loading)
                if (isObjFiltering && !isLoading && filteredObjList && filteredObjList.length === 0) return null;

                // Filter mode: default expanded, but respect manual collapse via filterCollapsed
                const showObjects = isObjFiltering ? !filterCollapsed.has(typeNodeId) : typeExpanded;
                const displayList = isObjFiltering ? filteredObjList : objList;

                return (
                  <div key={type}>
                    <div style={treeNode(false, 16)} onClick={() => handleTypeClick(schema, type)}>
                      <span style={{ marginRight: 4 }}>{showObjects ? '▾' : '▸'}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{TYPE_ICONS[type]}</span>
                      <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {TYPE_LABELS[type]}
                        {isObjFiltering && filteredObjList
                          ? <span style={{ marginLeft: 4, color: 'var(--accent)' }}>({filteredObjList.length})</span>
                          : objList && <span style={{ marginLeft: 4, color: 'var(--text-dim)' }}>({objList.length})</span>
                        }
                      </span>
                    </div>
                    {showObjects && (
                      <div>
                        {isLoading && <div style={{ paddingLeft: 40, color: 'var(--text-dim)', fontSize: 11 }}>Loading...</div>}
                        {displayList?.map(name => {
                          const label = isObjFiltering
                            ? highlightMatch(name, objectFilter.trim())
                            : <span style={{ fontSize: 12 }}>{name}</span>;
                          return (
                            <div
                              key={name}
                              style={treeNode(false, 32)}
                              onClick={() => handleObjectClick(schema, type, name)}
                              onDoubleClick={() => handleObjectClick(schema, type, name)}
                            >
                              <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginRight: 4 }}>{TYPE_ICONS[type]}</span>
                              {label}
                            </div>
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
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text-primary)', fontSize: 12, minWidth: 0,
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
        >✕</button>
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

function treeNode(selected, indent = 0) {
  return {
    display: 'flex', alignItems: 'center', padding: `3px 8px 3px ${8 + indent}px`,
    cursor: 'pointer', background: selected ? 'var(--bg-selected)' : 'transparent',
    userSelect: 'none',
    ':hover': { background: 'var(--bg-hover)' },
  };
}
