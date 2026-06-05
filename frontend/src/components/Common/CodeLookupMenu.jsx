import React, { useState, useEffect, useRef } from 'react';

export default function CodeLookupMenu({ x, y, word, matchingDefs, navItems, onLookup, onManage, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width: mw, height: mh } = el.getBoundingClientRect();
    setPos({
      left: x + mw > window.innerWidth  ? Math.max(4, window.innerWidth  - mw - 4) : x,
      top:  y + mh > window.innerHeight ? Math.max(4, y - mh)                       : y,
    });
  }, [x, y]);

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed', zIndex: 1500,
        left: pos.left, top: pos.top,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minWidth: 200, fontSize: 12,
        padding: '4px 0',
      }}
    >
      {word && (
        <div style={{ padding: '3px 12px 6px', color: 'var(--text-dim)', fontSize: 10, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
          <b style={{ color: 'var(--text-secondary)' }}>{word}</b>
        </div>
      )}
      {navItems && navItems.length > 0 && (
        <>
          {navItems.map((item, i) => (
            <MenuItem key={i} icon={item.icon} label={item.label} onClick={item.onClick} />
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
        </>
      )}
      {matchingDefs.length > 0 ? (
        matchingDefs.map(def => (
          <MenuItem key={def.id} icon="📖" label={def.label} desc={def.description} onClick={() => onLookup(def)} />
        ))
      ) : (
        <div style={{ padding: '4px 14px', color: 'var(--text-dim)', fontSize: 11 }}>
          {word ? `'${word}' 에 일치하는 코드 정의 없음` : '단어를 클릭 후 우클릭하세요'}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
      <MenuItem icon="📚" label="코드 사전 관리" onClick={onManage} />
    </div>
  );
}

function MenuItem({ icon, label, desc, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 14px', cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      <span>{icon}</span>
      <span style={{ flex: 1 }}>
        {label}
        {desc && <span style={{ color: 'var(--text-dim)', fontSize: 10, marginLeft: 6 }}>{desc}</span>}
      </span>
    </div>
  );
}
