import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client.js';

function buildQuery(query, word) {
  if (!word) return query;
  const escaped = word.replace(/'/g, "''");
  return query.replace(/:VALUE\b/gi, `'${escaped}'`);
}

export default function CodeLookupPopup({ def, word, connId, schema, x, y, onClose }) {
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const popupRef = useRef(null);

  const finalQuery = buildQuery(def.query, word);
  const hasFilter = /:VALUE\b/i.test(def.query) && !!word;

  useEffect(() => {
    if (!connId) { setError('연결을 선택하세요.'); setLoading(false); return; }
    api.executeQuery(connId, finalQuery, schema, 1, 500)
      .then(r => { setCols(r.columns || []); setRows(r.rows || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [finalQuery, connId]);

  // Initial position: place popup near click, avoid viewport overflow
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

  // Drag state
  const dragRef = useRef(null); // { startX, startY, initLeft, initTop }

  function onHeaderMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, initLeft: pos.left, initTop: pos.top };

    function onMove(ev) {
      const { startX, startY, initLeft, initTop } = dragRef.current;
      const el = popupRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = el ? el.offsetWidth  : 420;
      const ph = el ? el.offsetHeight : 340;
      const left = Math.max(0, Math.min(vw - pw, initLeft + ev.clientX - startX));
      const top  = Math.max(0, Math.min(vh - ph, initTop  + ev.clientY - startY));
      setPos({ left, top });
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Close on outside mousedown (skip when dragging)
  useEffect(() => {
    function handler(e) {
      if (dragRef.current) return;
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
      {/* Header — drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          padding: '7px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, cursor: 'move', userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          📖 {def.label}
          {hasFilter && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--accent-bright)' }}>
              = '{word}'
            </span>
          )}
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
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
          {rows.length}건 · {finalQuery.length > 70 ? finalQuery.slice(0, 70) + '…' : finalQuery}
        </div>
      )}
    </div>
  );
}
