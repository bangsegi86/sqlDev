import React from 'react';

export default function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyle, width }}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 16, padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalStyle = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)',
  borderRadius: 6, maxHeight: '90vh', overflow: 'auto',
};

const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 16px', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-header)',
};
