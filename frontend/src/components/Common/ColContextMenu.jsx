import React from 'react';

export default function ColContextMenu({ menu, onClose, onFitData, onFitHeader, onFitScreen, onReset, hasWidths }) {
  if (!menu) return null;
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minWidth: 170, fontSize: 12, padding: '3px 0',
      }}>
        <div style={{ padding: '2px 12px 5px', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700, letterSpacing: 1, userSelect: 'none' }}>
          열 너비 조정
        </div>
        {onFitData && <Item onClick={() => { onFitData(); onClose(); }}>데이터에 맞추기</Item>}
        <Item onClick={() => { onFitHeader(); onClose(); }}>컬럼명에 맞추기</Item>
        <Item onClick={() => { onFitScreen(); onClose(); }}>화면에 맞추기</Item>
        {hasWidths && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <Item onClick={() => { onReset(); onClose(); }} dim>너비 초기화</Item>
          </>
        )}
      </div>
    </>
  );
}

function Item({ onClick, children, dim }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '6px 14px', cursor: 'pointer', color: dim ? 'var(--text-secondary)' : 'var(--text-primary)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </div>
  );
}
