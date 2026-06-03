import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';

export default function DdlTab({ connectionId, schema, name, objectType }) {
  const [ddl, setDdl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyDdl, ddlCopied] = useCopy();

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
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-secondary" onClick={() => copyDdl(ddl)} style={{ padding: '2px 8px', fontSize: 11, minWidth: 56 }}>{ddlCopied ? '✓ 복사됨' : '📋 복사'}</button>
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
