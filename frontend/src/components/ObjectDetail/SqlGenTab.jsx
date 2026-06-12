import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';
import {
  buildSelectTemplate,
  buildInsertTemplate,
  buildUpdateTemplate,
  buildDeleteTemplate,
  buildMergeTemplate,
} from '../../utils/sqlTemplates.js';

export default function SqlGenTab({ connectionId, schema, tableName }) {
  const [columns, setColumns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStmt, setActiveStmt] = useState('select');

  useEffect(() => {
    setLoading(true); setError('');
    api.getColumns(connectionId, schema, tableName)
      .then(setColumns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div className="pane-loading"><span className="spinner" />로딩 중...</div>;
  if (error) return <div className="error-pane"><span className="error-pane-msg">{error}</span></div>;
  if (!columns) return null;

  const stmts = [
    { id: 'select', label: 'SELECT', sql: buildSelectTemplate(schema, tableName, columns) },
    { id: 'insert', label: 'INSERT', sql: buildInsertTemplate(schema, tableName, columns) },
    { id: 'update', label: 'UPDATE', sql: buildUpdateTemplate(schema, tableName, columns) },
    { id: 'delete', label: 'DELETE', sql: buildDeleteTemplate(schema, tableName, columns) },
    { id: 'merge',  label: 'MERGE',  sql: buildMergeTemplate(schema, tableName, columns) },
  ];
  const current = stmts.find(s => s.id === activeStmt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '4px 8px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {stmts.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveStmt(s.id)}
              style={{
                padding: '3px 14px', borderRadius: 0, border: 'none',
                background: activeStmt === s.id ? 'var(--accent)' : 'var(--bg-input)',
                color: activeStmt === s.id ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <CopyBtn text={current?.sql || ''} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <pre style={{
          margin: 0, padding: 14,
          fontFamily: 'var(--code-font)', fontSize: 12,
          color: 'var(--text-primary)', lineHeight: 1.7,
          background: 'var(--bg-primary)',
          whiteSpace: 'pre',
        }}>
          {current?.sql}
        </pre>
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [copyFn, copied] = useCopy();
  return (
    <button
      className="btn-secondary"
      onClick={() => copyFn(text)}
      style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, minWidth: 56 }}
    >
      {copied ? '✓ 복사됨' : '복사'}
    </button>
  );
}
