import React from 'react';

export default function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width, maxHeight: '90vh', overflow: 'hidden' }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(90vh - 52px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
