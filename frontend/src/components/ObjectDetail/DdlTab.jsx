import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';

// Build DROP statement for the given object type
function buildDrop(objectType, schema, name) {
  const fullName = schema ? `${schema}.${name}` : name;
  switch (objectType) {
    case 'TABLE':     return `DROP TABLE ${fullName} PURGE;`;
    case 'VIEW':      return `DROP VIEW ${fullName};`;
    case 'PROCEDURE': return `DROP PROCEDURE ${fullName};`;
    case 'FUNCTION':  return `DROP FUNCTION ${fullName};`;
    case 'SEQUENCE':  return `DROP SEQUENCE ${fullName};`;
    default:          return `DROP ${objectType} ${fullName};`;
  }
}

// Transform DDL based on selected mode
function transformDdl(rawDdl, mode, objectType, schema, name) {
  if (!rawDdl) return rawDdl;

  if (mode === 'drop_create') {
    const drop = buildDrop(objectType, schema, name);
    return `${drop}\n\n${rawDdl}`;
  }

  if (mode === 'create_or_replace') {
    if (objectType === 'VIEW' || objectType === 'PROCEDURE' || objectType === 'FUNCTION') {
      // Simple: change CREATE to CREATE OR REPLACE
      return rawDdl.replace(/^(\s*CREATE\s+)/i, '$1OR REPLACE ');
    }
    if (objectType === 'TABLE') {
      // Wrap in EXECUTE IMMEDIATE block for safe create
      const escapedDdl = rawDdl.replace(/'/g, "''");
      return `BEGIN\n  EXECUTE IMMEDIATE '${escapedDdl}';\nEXCEPTION\n  WHEN OTHERS THEN NULL;\nEND;`;
    }
    // Fallback: same as create
    return rawDdl;
  }

  // mode === 'create' (default)
  return rawDdl;
}

const MODES = [
  { key: 'create', label: 'CREATE' },
  { key: 'drop_create', label: 'DROP + CREATE' },
  { key: 'create_or_replace', label: 'CREATE OR REPLACE' },
];

export default function DdlTab({ connectionId, schema, name, objectType }) {
  const [ddl, setDdl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyDdl, ddlCopied] = useCopy();
  const [mode, setMode] = useState('create');

  useEffect(() => {
    setLoading(true); setError('');
    const fetcher = objectType === 'VIEW'
      ? api.getViewDDL(connectionId, schema, name)
      : api.getTableDDL(connectionId, schema, name);
    fetcher
      .then(r => setDdl(r.ddl))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, name, objectType]);

  const displayDdl = useMemo(
    () => transformDdl(ddl, mode, objectType, schema, name),
    [ddl, mode, objectType, schema, name]
  );

  if (loading) return (
    <div className="pane-loading">
      <span className="spinner" />
      DDL 로딩 중...
    </div>
  );
  if (error) return (
    <div className="error-pane">
      <span className="error-pane-msg">{error}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <button
            key={m.key}
            className={mode === m.key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setMode(m.key)}
            style={{ padding: '2px 10px', fontSize: 11 }}
          >
            {m.label}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button className="btn-secondary" onClick={() => copyDdl(displayDdl)} style={{ padding: '2px 8px', fontSize: 11, minWidth: 56 }}>
          {ddlCopied ? '✓ 복사됨' : '📋 복사'}
        </button>
      </div>
      <pre style={{
        flex: 1, overflow: 'auto', padding: 12,
        fontFamily: 'var(--code-font)', fontSize: 12,
        color: 'var(--text-primary)', background: 'var(--bg-primary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
      }}>{displayDdl}</pre>
    </div>
  );
}
