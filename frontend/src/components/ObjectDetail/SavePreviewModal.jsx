import React, { useState, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';

export default function SavePreviewModal({
  connectionId, schema, objectType, name,
  source,          // edited source text (may or may not start with CREATE OR REPLACE)
  onClose,
  onSuccess,       // () → called after successful execute
}) {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null); // { success, errors, message }
  const [copyPreview, previewCopied] = useCopy();

  const previewSql = useMemo(() => {
    const trimmed = (source || '').trimStart();
    const hasCR = /^CREATE\s+OR\s+REPLACE\s+/i.test(trimmed);
    const ddl = hasCR ? trimmed : `CREATE OR REPLACE ${trimmed}`;
    return `ALTER SESSION SET CURRENT_SCHEMA=${schema};\n${ddl.replace(/;\s*$/, '')};\n/`;
  }, [source, schema]);

  async function handleExecute() {
    setExecuting(true);
    setResult(null);
    try {
      await api.saveSource(connectionId, schema, objectType, name, source);
      setResult({ success: true, message: '저장이 완료되었습니다.' });
      setTimeout(() => { onSuccess?.(); onClose(); }, 800);
    } catch (e) {
      setResult({ success: false, message: e.message });
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 5,
        width: 720, maxWidth: '95vw',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Title bar */}
        <div style={{
          padding: '9px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-header)', borderRadius: '5px 5px 0 0',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-bright)' }}>
            {name} - 변경사항 저장
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>

        {/* SQL Preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
            SQL Preview:
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <pre style={{
              margin: 0,
              padding: '10px 12px',
              fontFamily: 'var(--code-font)', fontSize: 12,
              lineHeight: 1.55,
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              minHeight: 120,
            }}>
              {previewSql.split('\n').map((line, i) => {
                // Line numbers
                return (
                  <div key={i} style={{ display: 'flex' }}>
                    <span style={{
                      width: 36, minWidth: 36, textAlign: 'right', paddingRight: 12,
                      color: 'var(--text-dim)', userSelect: 'none', flexShrink: 0,
                    }}>{i + 1}</span>
                    <span style={{ flex: 1 }}>{line}</span>
                  </div>
                );
              })}
            </pre>
          </div>

          {/* Warning */}
          <div style={{
            marginTop: 8, fontSize: 11, color: '#ffa726',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ⚠ Execute를 누르면 데이터베이스에 즉시 적용됩니다. 변경사항을 반드시 확인하세요.
          </div>

          {/* Result message */}
          {result && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 3, fontSize: 12,
              background: result.success ? 'rgba(30,100,30,0.3)' : 'rgba(100,20,20,0.3)',
              color: result.success ? '#66bb6a' : 'var(--danger)',
              border: `1px solid ${result.success ? '#66bb6a55' : 'var(--danger)55'}`,
              fontWeight: 600,
            }}>
              {result.success ? '✅ ' : '❌ '}{result.message}
            </div>
          )}
        </div>

        {/* Bottom buttons — mirroring the image layout */}
        <div style={{
          padding: '9px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          <button
            className="btn-secondary"
            onClick={() => copyPreview(previewSql)}
            style={{ padding: '4px 16px', fontSize: 12 }}
          >{previewCopied ? '✓ 복사됨' : 'Copy'}</button>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={executing}
            style={{ padding: '4px 16px', fontSize: 12 }}
          >Cancel</button>
          <button
            className="btn-primary"
            onClick={handleExecute}
            disabled={executing || (result?.success)}
            style={{ padding: '4px 20px', fontSize: 12, minWidth: 90 }}
          >{executing ? '실행 중...' : 'Execute'}</button>
        </div>
      </div>
    </div>
  );
}
