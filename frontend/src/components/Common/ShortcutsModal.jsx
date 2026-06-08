import React, { useEffect } from 'react';

const SHORTCUT_GROUPS = [
  {
    title: 'SQL 에디터',
    items: [
      { keys: 'Ctrl+Enter',       desc: '현재 쿼리 실행' },
      { keys: 'Ctrl+Shift+Enter', desc: '전체 실행' },
      { keys: 'Ctrl+F',           desc: '찾기' },
      { keys: 'Ctrl+H',           desc: '찾기/바꾸기' },
      { keys: 'Ctrl+/',           desc: '줄 주석 토글' },
    ],
  },
  {
    title: '소스 뷰어',
    items: [
      { keys: 'Ctrl+C',   desc: '선택 텍스트 복사 (plain text)' },
      { keys: 'Ctrl+F',   desc: '찾기' },
      { keys: 'Escape',   desc: '하이라이트 해제' },
    ],
  },
  {
    title: '그리드',
    items: [
      { keys: 'Ctrl+A',   desc: '전체 선택' },
      { keys: 'Ctrl+C',   desc: '선택 셀 값 복사' },
      { keys: 'Escape',   desc: '선택 해제' },
    ],
  },
  {
    title: '일반',
    items: [
      { keys: 'Ctrl+W',   desc: '현재 탭 닫기' },
    ],
  },
];

export default function ShortcutsModal({ onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        width: 480,
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            키보드 단축키
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 0 16px' }}>
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title} style={{ marginBottom: 4 }}>
              {/* Group title */}
              <div style={{
                padding: '8px 16px 4px',
                fontSize: 11, fontWeight: 700,
                color: 'var(--accent-bright)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {group.title}
              </div>
              {/* Items */}
              {group.items.map(item => (
                <div
                  key={item.keys}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '5px 16px',
                    gap: 12,
                  }}
                >
                  <span style={{
                    flex: 1, fontSize: 12, color: 'var(--text-secondary)',
                  }}>
                    {item.desc}
                  </span>
                  <kbd style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: 'var(--bg-header)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 0 var(--border)',
                  }}>
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
