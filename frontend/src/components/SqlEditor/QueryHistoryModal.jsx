import React, { useState } from 'react';
import { loadHistory, removeHistory, clearHistory } from '../../utils/queryHistory.js';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function QueryHistoryModal({ onPick, onClose, connectionId }) {
  const [list, setList] = useState(() => loadHistory(connectionId));
  const [filter, setFilter] = useState('');

  const f = filter.trim().toLowerCase();
  const shown = f ? list.filter(e => e.sql.toLowerCase().includes(f)) : list;

  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh' }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ width: 720, maxWidth: '92vw', maxHeight: '80vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🕘 쿼리 실행 히스토리</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{shown.length}건</span>
          <input
            autoFocus
            placeholder="검색..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginLeft: 'auto', width: 200, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '4px 8px', outline: 'none' }}
          />
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => { setList(clearHistory(connectionId)); }}>전체 삭제</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {shown.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              {list.length === 0 ? '아직 실행한 쿼리가 없습니다.' : '검색 결과 없음'}
            </div>
          )}
          {shown.map(e => (
            <div
              key={e.ts}
              onDoubleClick={() => { onPick(e.sql); onClose(); }}
              style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
              onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <pre style={{ margin: 0, fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden' }}>
                  {e.sql}
                </pre>
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{timeAgo(e.ts)}</span>
                  {e.connName && <span>· {e.connName}{e.schema ? ` / ${e.schema}` : ''}</span>}
                  {e.ok === false ? <span style={{ color: 'var(--danger)' }}>· 오류</span>
                    : e.rowCount != null ? <span>· {e.rowCount.toLocaleString()}행</span> : null}
                  {e.ms != null && <span>· {e.ms}ms</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={() => { onPick(e.sql); onClose(); }}>불러오기</button>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13 }}
                  title="삭제"
                  onClick={() => setList(removeHistory(e.ts, connectionId))}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
          더블클릭 또는 [불러오기] 로 에디터에 추가됩니다.
        </div>
      </div>
    </div>
  );
}
