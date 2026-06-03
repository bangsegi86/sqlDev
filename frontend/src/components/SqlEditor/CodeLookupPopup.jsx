import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client.js';

export default function CodeLookupPopup({ def, connId, schema, x, y, onClose }) {
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const popupRef = useRef(null);

  useEffect(() => {
    if (!connId) { setError('연결을 선택하세요.'); setLoading(false); return; }
    api.executeQuery(connId, def.query, schema, 1, 500)
      .then(r => { setCols(r.columns || []); setRows(r.rows || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [def.id, connId]);

  // Position: place popup near click, avoid viewport overflow
  const [pos, setPos] = useState({ left: x, top: y + 6 });
  useEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { width: pw, height: ph } = el.getBoundingClientRect();
    let left = x;
    let top  = y + 6;
    if (left + pw > vw - 8) left = Math.max(4, vw - pw - 8);
    if (top  + ph > vh - 8) top  = Math.max(4, y - ph - 6);
    setPos({ left, top });
  }, [x, y]);

  // Close on outside mousedown
  useEffect(() => {
    function handler(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed', zIndex: 2000,
        left: pos.left, top: pos.top,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
        width: 420, maxHeight: 340,
        display: 'flex', flexDirection: 'column',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '7px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>📖 {def.label}</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
            <div className="grid-spinner" style={{ margin: '0 auto 8px' }} />
            조회 중...
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 12, color: 'var(--danger)', fontFamily: 'var(--code-font)', fontSize: 11, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>데이터 없음</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)' }}>
                {cols.map(c => (
                  <th key={c} style={{
                    padding: '4px 10px', textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11,
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                  {cols.map(c => (
                    <td key={c} style={{
                      padding: '3px 10px',
                      borderBottom: '1px solid rgba(62,62,66,0.4)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                    }}>
                      {row[c] == null
                        ? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(null)</span>
                        : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && (
        <div style={{
          padding: '3px 10px', borderTop: '1px solid var(--border)',
          color: 'var(--text-dim)', fontSize: 10, flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {rows.length}건 · {def.query.length > 70 ? def.query.slice(0, 70) + '…' : def.query}
        </div>
      )}
    </div>
  );
}
