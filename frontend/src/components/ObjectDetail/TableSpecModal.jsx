import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';

// Popup to review/adjust the list of tables, then export a table-specification
// document as Excel (.xlsx) or PDF.
export default function TableSpecModal({ connectionId, schema, initialTables = [], onClose }) {
  const [list, setList] = useState(() => [...new Set(initialTables)]);
  const [allTables, setAllTables] = useState(null); // full schema table list for the "add" picker
  const [addQuery, setAddQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  useEffect(() => {
    api.getObjects(connectionId, schema, 'TABLE')
      .then(setAllTables)
      .catch(() => setAllTables([]));
  }, [connectionId, schema]);

  const addable = useMemo(() => {
    if (!allTables) return [];
    const inList = new Set(list);
    const q = addQuery.trim().toLowerCase();
    return allTables
      .filter(t => !inList.has(t) && (!q || t.toLowerCase().includes(q)))
      .slice(0, 200);
  }, [allTables, list, addQuery]);

  function remove(name) { setList(l => l.filter(t => t !== name)); }
  function add(name) { setList(l => l.includes(name) ? l : [...l, name]); }

  async function handleExecute() {
    if (!list.length) return;
    setBusy(true); setResult(null);
    try {
      const { filename } = await api.exportTableSpec(connectionId, schema, list, format);
      setResult({ ok: true, message: `${filename} 다운로드를 시작했습니다.` });
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
        width: 640, maxWidth: '95vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Title */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-header)', borderRadius: '6px 6px 0 0',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-bright)' }}>
            📑 테이블 명세서 만들기 — {schema}
          </span>
          <button onClick={onClose} style={xBtn}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              대상 테이블 ({list.length})
            </span>
            <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 11 }}
              onClick={() => setShowAdd(s => !s)}>
              {showAdd ? '닫기' : '+ 테이블 추가'}
            </button>
          </div>

          {/* Selected list */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-primary)',
            maxHeight: 220, overflow: 'auto',
          }}>
            {list.length === 0 && (
              <div style={{ padding: 14, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
                대상 테이블이 없습니다. "+ 테이블 추가"로 선택하세요.
              </div>
            )}
            {list.map((name, i) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', borderBottom: '1px solid rgba(62,62,66,0.4)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-dim)', width: 22, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>▦ {name}</span>
                <button onClick={() => remove(name)} title="제외"
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Add picker */}
          {showAdd && (
            <div style={{ marginTop: 10, border: '1px solid var(--accent)', borderRadius: 4, padding: 8, background: 'var(--bg-primary)' }}>
              <input
                autoFocus
                value={addQuery}
                onChange={e => setAddQuery(e.target.value)}
                placeholder="테이블 검색..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: 12,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', borderRadius: 3, outline: 'none', marginBottom: 6,
                }}
              />
              <div style={{ maxHeight: 180, overflow: 'auto' }}>
                {allTables == null && <div style={{ padding: 8, fontSize: 12, color: 'var(--text-dim)' }}>로딩 중...</div>}
                {allTables != null && addable.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: 'var(--text-dim)' }}>추가할 테이블이 없습니다.</div>
                )}
                {addable.map(name => (
                  <div key={name}
                    onClick={() => add(name)}
                    style={{ padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', borderRadius: 3 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >+ ▦ {name}</div>
                ))}
              </div>
            </div>
          )}

          {/* Format choice */}
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
            출력 형식
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <FormatCard
              active={format === 'xlsx'} onClick={() => setFormat('xlsx')}
              icon="📊" title="Excel (.xlsx)"
              desc="첫 시트는 목록(하이퍼링크), 테이블마다 시트 분리"
            />
            <FormatCard
              active={format === 'pdf'} onClick={() => setFormat('pdf')}
              icon="📄" title="PDF"
              desc="목차 + 테이블별 페이지, 좌측 북마크로 이동"
            />
          </div>

          {result && (
            <div style={{
              marginTop: 12, padding: '7px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              background: result.ok ? 'rgba(30,100,30,0.3)' : 'rgba(100,20,20,0.3)',
              color: result.ok ? '#66bb6a' : 'var(--danger)',
              border: `1px solid ${result.ok ? '#66bb6a55' : 'var(--danger)55'}`,
            }}>
              {result.ok ? '✅ ' : '❌ '}{result.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          <button className="btn-secondary" onClick={onClose} disabled={busy} style={{ padding: '4px 16px', fontSize: 12 }}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleExecute}
            disabled={busy || list.length === 0}
            style={{ padding: '4px 22px', fontSize: 12, minWidth: 110 }}>
            {busy ? '생성 중...' : `Execute (${format === 'pdf' ? 'PDF' : 'Excel'})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatCard({ active, onClick, icon, title, desc }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, cursor: 'pointer', padding: '10px 12px', borderRadius: 5,
      border: `1px solid ${active ? 'var(--accent-bright)' : 'var(--border)'}`,
      background: active ? 'rgba(79,193,255,0.12)' : 'var(--bg-primary)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent-bright)' : 'var(--text-primary)' }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

const xBtn = { background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' };
