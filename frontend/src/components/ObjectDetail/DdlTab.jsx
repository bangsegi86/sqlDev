import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function DdlTab({ connectionId, schema, name, objectType }) {
  const [ddl, setDdl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  function copy() {
    navigator.clipboard.writeText(ddl).then(() => {}).catch(() => {});
  }

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading DDL...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-secondary" onClick={copy} style={{ padding: '2px 8px', fontSize: 11 }}>📋 복사</button>
      </div>
      <pre style={{
        flex: 1, overflow: 'auto', padding: 12,
        fontFamily: 'var(--code-font)', fontSize: 12,
        color: 'var(--text-primary)', background: 'var(--bg-primary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
      }}>{ddl}</pre>
    </div>
  );
}
