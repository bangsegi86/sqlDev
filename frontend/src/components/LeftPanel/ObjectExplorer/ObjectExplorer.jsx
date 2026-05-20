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

  useEffect(() => {
    if (!activeConnectionId || !isConnected) { setSchemas([]); setSchemaError(null); return; }
    setLoading(l => ({ ...l, schemas: true }));
    setSchemaError(null);
    api.getSchemas(activeConnectionId)
      .then(s => { setSchemas(s); setObjects({}); })
      .catch(e => setSchemaError(e.message))
      .finally(() => setLoading(l => ({ ...l, schemas: false })));
  }, [activeConnectionId, isConnected]);

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
    if (!expandedNodes.has(nodeId)) loadObjects(schema, type);
    toggleNode(nodeId);
  }

  function handleObjectClick(schema, type, name) {
    const tabType = ['TABLE', 'VIEW'].includes(type) ? 'table'
      : type === 'SEQUENCE' ? 'sequence'
      : type === 'SYNONYM' ? 'synonym' : 'source';
    openTab(dispatch, state, {
      id: `${type}-${schema}-${name}`,
      type: tabType,
      title: name,
      connectionId: activeConnectionId,
      content: { schema, objectType: type, name, activeTab: tabType === 'table' ? 'columns' : 'source' },
    });
  }

  return (
    <div>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 1 }}>OBJECTS</span>
      </div>
      <div style={{ overflowY: 'auto' }}>
        {loading.schemas && <div style={{ padding: 8, color: 'var(--text-secondary)', fontSize: 12 }}>Loading schemas...</div>}
        {schemaError && (
          <div style={{ padding: '8px 10px', color: 'var(--danger)', fontSize: 11, wordBreak: 'break-word' }}>
            ⚠ {schemaError}
          </div>
        )}
        {schemas.map(schema => {
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
                return (
                  <div key={type}>
                    <div style={treeNode(false, 16)} onClick={() => handleTypeClick(schema, type)}>
                      <span style={{ marginRight: 4 }}>{typeExpanded ? '▾' : '▸'}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{TYPE_ICONS[type]}</span>
                      <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {TYPE_LABELS[type]}
                        {objList && <span style={{ marginLeft: 4, color: 'var(--text-dim)' }}>({objList.length})</span>}
                      </span>
                    </div>
                    {typeExpanded && (
                      <div>
                        {isLoading && <div style={{ paddingLeft: 40, color: 'var(--text-dim)', fontSize: 11 }}>Loading...</div>}
                        {objList?.map(name => (
                          <div
                            key={name}
                            style={treeNode(false, 32)}
                            onClick={() => handleObjectClick(schema, type, name)}
                            onDoubleClick={() => handleObjectClick(schema, type, name)}
                          >
                            <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginRight: 4 }}>{TYPE_ICONS[type]}</span>
                            <span style={{ fontSize: 12 }}>{name}</span>
                          </div>
                        ))}
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

function treeNode(selected, indent = 0) {
  return {
    display: 'flex', alignItems: 'center', padding: `3px 8px 3px ${8 + indent}px`,
    cursor: 'pointer', background: selected ? 'var(--bg-selected)' : 'transparent',
    userSelect: 'none',
    ':hover': { background: 'var(--bg-hover)' },
  };
}
