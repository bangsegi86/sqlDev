import React, { useEffect, useState } from 'react';
import Modal from '../Common/Modal.jsx';
import { api } from '../../api/client.js';
import { downloadText } from '../../utils/clipboard.js';

const TYPE_LABELS = {
  TABLE: 'Table', VIEW: 'View', 'MATERIALIZED VIEW': 'Materialized View',
  PROCEDURE: 'Procedure', FUNCTION: 'Function', PACKAGE: 'Package',
  TRIGGER: 'Trigger', SEQUENCE: 'Sequence', SYNONYM: 'Synonym',
};

async function fetchScript(connectionId, schema, type, name, dbType) {
  switch (type) {
    case 'TABLE':
      return api.getTableDDL(connectionId, schema, name).then(r => r.ddl || '');
    case 'VIEW':
    case 'MATERIALIZED VIEW':
      return api.getViewDDL(connectionId, schema, name).then(r => r.ddl || '');
    case 'SEQUENCE':
      return api.getSequenceInfo(connectionId, schema, name).then(info => {
        if (!info) return `-- 시퀀스 정보 없음: ${name}`;
        if (dbType === 'postgres') {
          return [
            `CREATE SEQUENCE "${schema}"."${name}"`,
            `  START WITH ${info.START_VALUE}`,
            `  INCREMENT BY ${info.INCREMENT_BY}`,
            `  MINVALUE ${info.MIN_VALUE}`,
            `  MAXVALUE ${info.MAX_VALUE}`,
            `  ${info.CYCLE === 'YES' ? 'CYCLE' : 'NO CYCLE'};`,
          ].join('\n');
        }
        return [
          `CREATE SEQUENCE "${schema}"."${name}"`,
          `  START WITH ${info.MIN_VALUE || 1}`,
          `  INCREMENT BY ${info.INCREMENT_BY || 1}`,
          `  MINVALUE ${info.MIN_VALUE || 1}`,
          `  MAXVALUE ${info.MAX_VALUE || 9999999999999999999999999999}`,
          `  ${info.CYCLE_FLAG === 'Y' ? 'CYCLE' : 'NOCYCLE'}`,
          `  CACHE ${info.CACHE_SIZE || 20};`,
        ].join('\n');
      });
    default:
      return api.getSource(connectionId, schema, type, name).then(r => r.source || '');
  }
}

export default function ScriptViewModal({ connectionId, schema, type, names, dbType, onClose }) {
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      names.map(name =>
        fetchScript(connectionId, schema, type, name, dbType)
          .then(s => `-- ════ ${type}: ${schema}.${name} ════\n${s}`)
          .catch(e => `-- [오류] ${name}: ${e.message}`)
      )
    ).then(fetched => {
      if (cancelled) return;
      setScript(fetched.join('\n\n'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, schema, type, names.join(','), dbType]);

  async function handleCopy() {
    try { await navigator.clipboard.writeText(script); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const label = TYPE_LABELS[type] || type;
  const title = `${label} 스크립트${names.length > 1 ? ` (${names.length}개)` : ` — ${names[0]}`}`;

  return (
    <Modal title={title} onClose={onClose} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: 8 }}>스크립트 불러오는 중...</div>
        ) : (
          <textarea
            readOnly
            value={script}
            style={{
              width: '100%', height: 440, fontFamily: 'monospace', fontSize: 12,
              background: 'var(--bg-editor, #1a1a1a)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 3,
              padding: 10, resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            className="btn-secondary"
            disabled={loading}
            onClick={() => {
              const filename = names.length === 1
                ? `${schema}_${names[0]}.sql`
                : `${schema}_${type}_script.sql`;
              downloadText(filename, script);
            }}
          >⬇ 다운로드</button>
          <button className="btn-secondary" onClick={handleCopy} disabled={loading}>
            {copied ? '✓ 복사됨' : '📋 복사'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
