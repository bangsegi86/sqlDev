import React, { useState } from 'react';

const STORAGE_KEY = 'queryBookmarks';

export function loadBookmarks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBookmarks(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function addBookmark(name, sql) {
  const list = loadBookmarks();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    name,
    sql,
    createdAt: Date.now(),
  };
  list.unshift(entry);
  saveBookmarks(list);
  return list;
}

export function removeBookmark(id) {
  const list = loadBookmarks().filter(b => b.id !== id);
  saveBookmarks(list);
  return list;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * QueryBookmarks panel/modal.
 *
 * Props:
 *   currentSql  — the SQL currently in the editor (used for "save current query")
 *   onPick(sql) — called when user clicks a bookmark to insert it into the editor
 *   onClose()   — called when the panel should be closed
 */
export default function QueryBookmarks({ currentSql, onPick, onClose }) {
  const [list, setList] = useState(() => loadBookmarks());

  function handleSave() {
    const name = window.prompt('북마크 이름을 입력하세요:', '');
    if (!name || !name.trim()) return;
    const trimmedSql = (currentSql || '').trim();
    if (!trimmedSql) {
      window.alert('저장할 SQL이 없습니다.');
      return;
    }
    setList(addBookmark(name.trim(), trimmedSql));
  }

  function handleDelete(id) {
    setList(removeBookmark(id));
  }

  function handlePick(sql) {
    onPick(sql);
    onClose();
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '8vh',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '92vw', maxHeight: '80vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>★ 쿼리 북마크</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{list.length}건</span>
          <button
            className="btn-primary"
            style={{ marginLeft: 'auto', padding: '3px 12px', fontSize: 11 }}
            onClick={handleSave}
          >
            + 현재 쿼리 저장
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {list.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              저장된 북마크가 없습니다. 현재 쿼리를 저장해 보세요.
            </div>
          )}
          {list.map(b => (
            <div
              key={b.id}
              onDoubleClick={() => handlePick(b.sql)}
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}
              onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {b.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--code-font)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.sql.slice(0, 80)}{b.sql.length > 80 ? '…' : ''}
                </div>
                <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-dim)' }}>
                  {timeAgo(b.createdAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={() => handlePick(b.sql)}
                >불러오기</button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13 }}
                  title="삭제"
                  onClick={() => handleDelete(b.id)}
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
          더블클릭 또는 [불러오기] 로 에디터에 삽입됩니다.
        </div>
      </div>
    </div>
  );
}
