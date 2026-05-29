import React, { useEffect, useState } from 'react';
import Modal from '../Common/Modal.jsx';
import { api } from '../../api/client.js';

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
  const [parts, setParts] = useState([]); // per-object script strings
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExecResult(null);
    Promise.all(
      names.map(name =>
        fetchScript(connectionId, schema, type, name, dbType)
          .then(s => `-- ════ ${type}: ${schema}.${name} ════\n${s}`)
          .catch(e => `-- [오류] ${name}: ${e.message}`)
      )
    ).then(fetched => {
      if (cancelled) return;
      setParts(fetched);
      setScript(fetched.join('\n\n'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, schema, type, names.join(','), dbType]);

  async function handleExecute() {
    setExecuting(true);
    setExecResult(null);
    try {
      // Each part = one object's script → execute as separate statements
      const statements = parts.map(p => {
        // Strip our separator comment header
        return p.replace(/^--.*\n/, '').trim().replace(/;\s*$/, '');
      }).filter(Boolean);

      if (statements.length === 1) {
        const r = await api.executeQuery(connectionId, statements[0], schema);
        setExecResult({ success: true, message: r.message || `완료 (${r.rowCount ?? 0} rows)` });
      } else {
        const r = await api.executeScript(connectionId, statements, schema);
        const failed = r.results?.find(x => !x.ok);
        setExecResult({
          success: r.success,
          message: r.success
            ? `${r.executedCount}개 구문 실행 완료`
            : `구문 ${(failed?.index ?? '?') + 1} 실행 오류: ${failed?.error || ''}`,
        });
      }
    } catch (e) {
      setExecResult({ success: false, message: e.message });
    } finally {
      setExecuting(false);
    }
  }

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
              width: '100%', height: 420, fontFamily: 'monospace', fontSize: 12,
              background: 'var(--bg-editor, #1a1a1a)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 3,
              padding: 10, resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
        )}

        {execResult && (
          <div style={{
            padding: '8px 12px', borderRadius: 3, fontSize: 12,
            background: execResult.success ? 'rgba(76,175,80,0.15)' : 'rgba(244,71,71,0.15)',
            color: execResult.success ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${execResult.success ? 'var(--success-dim, #4caf50)' : 'var(--danger)'}`,
          }}>
            {execResult.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={handleCopy} disabled={loading}>
            {copied ? '✓ 복사됨' : '📋 복사'}
          </button>
          <button
            className="btn-primary"
            onClick={handleExecute}
            disabled={loading || executing}
            title="스크립트를 DB에 실행합니다"
          >
            {executing ? '실행 중...' : '▶ Execute'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
