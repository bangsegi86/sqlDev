import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';

const BOX_W = 220;
const HEADER_H = 30;
const ROW_H = 20;
const PAD = 8;

function boxHeight(table) {
  return HEADER_H + table.columns.length * ROW_H + PAD;
}

// Simple grid auto-layout
function gridLayout(tables) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const pos = {};
  let x = 40, y = 40, colIdx = 0, rowMaxH = 0;
  for (const t of tables) {
    pos[t.name] = { x, y };
    const h = boxHeight(t);
    rowMaxH = Math.max(rowMaxH, h);
    colIdx++;
    if (colIdx >= cols) {
      colIdx = 0; x = 40; y += rowMaxH + 50; rowMaxH = 0;
    } else {
      x += BOX_W + 70;
    }
  }
  return pos;
}

export default function ErdViewer({ tab }) {
  const { state, dispatch } = useApp();
  const connId = tab.connectionId || state.activeConnectionId;
  const schema = tab.content?.schema;

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState({});
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState('');
  const [hover, setHover] = useState(null);   // hovered table name
  const [focusedTable, setFocusedTable] = useState(null); // focus mode table name

  useEffect(() => {
    setLoading(true); setError('');
    api.getSchemaErd(connId, schema)
      .then(d => { setData(d); setPositions(gridLayout(d.tables)); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connId, schema]);

  // Tables relevant to the filter (highlight, not hide)
  const f = filter.trim().toLowerCase();

  // Adjacency for highlight on hover and focus mode
  const adjacency = useMemo(() => {
    const m = {};
    if (data) for (const e of data.edges) {
      (m[e.from] ||= new Set()).add(e.to);
      (m[e.to] ||= new Set()).add(e.from);
    }
    return m;
  }, [data]);

  // Focus mode: set of visible tables (focused + direct FK neighbors)
  const focusVisibleSet = useMemo(() => {
    if (!focusedTable) return null;
    const s = new Set([focusedTable]);
    (adjacency[focusedTable] || new Set()).forEach(n => s.add(n));
    return s;
  }, [focusedTable, adjacency]);

  function onHeaderMouseDown(e, name) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const orig = positions[name] || { x: 0, y: 0 };
    function move(ev) {
      setPositions(p => ({
        ...p,
        [name]: { x: orig.x + (ev.clientX - start.x) / zoom, y: orig.y + (ev.clientY - start.y) / zoom },
      }));
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function openTable(name) {
    openTab(dispatch, state, {
      id: `TABLE-${connId}-${schema}-${name}`,
      type: 'table', title: name, connectionId: connId,
      content: { schema, objectType: 'TABLE', name, activeTab: 'columns' },
    });
  }

  if (loading) return <div className="pane-loading"><span className="spinner" />ERD 로딩 중...</div>;
  if (error) return <div className="error-pane"><span className="error-pane-msg">{error}</span></div>;
  if (!data || data.tables.length === 0)
    return <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>이 스키마에는 테이블이 없습니다.</div>;

  // Canvas bounds
  const sizes = {};
  data.tables.forEach(t => { sizes[t.name] = { w: BOX_W, h: boxHeight(t) }; });
  let maxX = 0, maxY = 0;
  for (const t of data.tables) {
    const p = positions[t.name] || { x: 0, y: 0 };
    maxX = Math.max(maxX, p.x + BOX_W);
    maxY = Math.max(maxY, p.y + sizes[t.name].h);
  }
  const canvasW = maxX + 80, canvasH = maxY + 80;

  // Edge lines: anchor at box centers, clipped visually by opaque boxes
  function anchor(name) {
    const p = positions[name]; const s = sizes[name];
    if (!p || !s) return null;
    return { cx: p.x + s.w / 2, cy: p.y + s.h / 2, x: p.x, y: p.y, w: s.w, h: s.h };
  }

  // Compute a side-anchored path (right/left of boxes) for cleaner look
  function edgePath(from, to) {
    const a = anchor(from), b = anchor(to);
    if (!a || !b) return null;
    const fromRight = a.cx <= b.cx;
    const x1 = fromRight ? a.x + a.w : a.x;
    const y1 = a.cy;
    const x2 = fromRight ? b.x : b.x + b.w;
    const y2 = b.cy;
    const dx = Math.abs(x2 - x1) / 2 + 20;
    const c1x = x1 + (fromRight ? dx : -dx);
    const c2x = x2 + (fromRight ? -dx : dx);
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  }

  const highlightSet = hover ? new Set([hover, ...(adjacency[hover] || [])]) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>🔗 ERD</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{schema} · {data.tables.length}개 테이블 · {data.edges.length}개 관계</span>
        <input
          placeholder="테이블 검색..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ marginLeft: 8, width: 160, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '3px 8px', outline: 'none' }}
        />
        {focusedTable && (
          <button
            className="btn-secondary"
            style={{ padding: '2px 10px', fontSize: 11, background: 'rgba(79,193,255,0.15)', borderColor: 'var(--accent)' }}
            onClick={() => setFocusedTable(null)}
          >전체 보기</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="btn-secondary" style={zBtn} onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))}>－</button>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="btn-secondary" style={zBtn} onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}>＋</button>
          <button className="btn-secondary" style={{ ...zBtn, width: 'auto', padding: '2px 8px' }} onClick={() => { setZoom(1); setPositions(gridLayout(data.tables)); }}>정렬</button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', position: 'relative' }}>
        <div style={{ width: canvasW * zoom, height: canvasH * zoom, position: 'relative' }}>
          <div style={{ width: canvasW, height: canvasH, position: 'relative', transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            {/* Edges */}
            <svg width={canvasW} height={canvasH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
              <defs>
                <marker id="erd-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,3 L0,6 Z" fill="var(--accent)" />
                </marker>
              </defs>
              {data.edges.map((e, i) => {
                const d = edgePath(e.from, e.to);
                if (!d) return null;
                const dimByHover = highlightSet && !(highlightSet.has(e.from) && highlightSet.has(e.to));
                const dimByFocus = focusVisibleSet && !(focusVisibleSet.has(e.from) && focusVisibleSet.has(e.to));
                const dim = dimByHover || dimByFocus;
                return (
                  <path key={i} d={d} fill="none"
                    stroke={dim ? 'rgba(120,120,130,0.25)' : 'var(--accent)'}
                    strokeWidth={dim ? 1 : 1.6}
                    markerEnd="url(#erd-arrow)" />
                );
              })}
            </svg>

            {/* Tables */}
            {data.tables.map(t => {
              const p = positions[t.name] || { x: 0, y: 0 };
              const isMatch = f && t.name.toLowerCase().includes(f);
              const isFocused = focusedTable === t.name;
              const dimByFilter = f && !isMatch;
              const dimByHover = highlightSet && !highlightSet.has(t.name);
              const dimByFocus = focusVisibleSet && !focusVisibleSet.has(t.name);
              const dim = dimByFilter || dimByHover || dimByFocus;
              return (
                <div
                  key={t.name}
                  onMouseEnter={() => setHover(t.name)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    position: 'absolute', left: p.x, top: p.y, width: BOX_W,
                    background: 'var(--bg-panel)',
                    border: `1px solid ${isMatch || isFocused ? 'var(--accent-bright)' : 'var(--border)'}`,
                    borderRadius: 6, zIndex: 1, opacity: dim ? 0.2 : 1,
                    boxShadow: isFocused ? '0 0 0 2px var(--accent-bright), 0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div
                    onMouseDown={e => onHeaderMouseDown(e, t.name)}
                    onDoubleClick={() => openTable(t.name)}
                    title="드래그: 이동 · 더블클릭: 테이블 열기"
                    style={{
                      height: HEADER_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
                      background: isFocused ? 'rgba(79,193,255,0.30)' : isMatch ? 'rgba(79,193,255,0.22)' : 'rgba(79,193,255,0.10)',
                      borderBottom: '1px solid var(--border)', cursor: 'grab', userSelect: 'none',
                      fontWeight: 700, fontSize: 12, color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-bright)' }}>▦</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.name}</span>
                    <button
                      title="이 테이블 중심으로 보기"
                      onClick={e => { e.stopPropagation(); setFocusedTable(isFocused ? null : t.name); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                        fontSize: 13, opacity: isFocused ? 1 : 0.5, color: 'var(--accent-bright)',
                        lineHeight: 1, flexShrink: 0,
                      }}
                    >🎯</button>
                  </div>
                  <div>
                    {t.columns.map(c => (
                      <div key={c.name} style={{
                        height: ROW_H, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
                        fontSize: 11, fontFamily: 'var(--code-font)', whiteSpace: 'nowrap',
                      }}>
                        <span style={{ width: 14, flexShrink: 0, color: c.pk ? 'var(--pk-color, gold)' : 'var(--accent)' }}>
                          {c.pk ? '🔑' : c.fk ? '🔗' : ''}
                        </span>
                        <span style={{ color: c.pk ? 'var(--pk-color, gold)' : 'var(--text-primary)', fontWeight: c.pk ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name}
                        </span>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 10 }}>{c.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const zBtn = { padding: '2px 0', fontSize: 13, width: 26, textAlign: 'center' };
