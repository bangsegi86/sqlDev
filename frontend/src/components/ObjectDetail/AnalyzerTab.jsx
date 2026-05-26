import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../../api/client.js';
import MermaidChart from '../Common/MermaidChart.jsx';
import { useCopy } from '../../utils/clipboard.js';
import { renderHighlighted } from '../../utils/sqlHighlight.js';
import { formatSQL } from '../../utils/formatSQL.js';

const NODE_TYPE_LABEL = {
  SEL: '📖 SELECT', DML: '✏️ DML', CALL: '🔧 프로시저 호출', SYS: '📦 시스템 호출',
  DYN: '⚡ 동적 SQL', CMT: '💾 트랜잭션', RBK: '↩ ROLLBACK', RET: '↪ RETURN',
  RAISE: '⚠️ RAISE', CUR: '커서 연산', IF: '⬦ IF 조건', LOOP: '🔄 반복문',
};

function getNodeTypeLabel(key) {
  const prefix = key.replace(/\d+$/, '');
  return NODE_TYPE_LABEL[prefix] || key;
}

export default function AnalyzerTab({ connectionId, schema, objectType, name }) {
  const [result, setResult] = useState(null);
  const [copyMermaid, mermaidCopied] = useCopy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [activeSection, setActiveSection] = useState('diagram');

  // Code panel state
  const [selectedNode, setSelectedNode] = useState(null); // { key, code }
  const [panelWidth, setPanelWidth] = useState(340);

  // Full-script panel state
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState(null); // { line, nonce } — drives scroll/highlight
  const scriptOpenRef = useRef(false);
  scriptOpenRef.current = scriptOpen;
  const svgRef = useRef(null);

  function onPanelResizeMouseDown(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    function onMove(ev) {
      setPanelWidth(Math.max(220, Math.min(700, startW + (startX - ev.clientX))));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Pan mode: 'toggle' button or spacebar hold
  const [panMode, setPanMode] = useState(false);   // locked by button
  const [spacePan, setSpacePan] = useState(false); // held by spacebar
  const isPanning = useRef(false);
  const panStart = useRef(null);
  const panScrollStart = useRef(null);

  const diagramWrapRef = useRef(null);
  const resultRef = useRef(null);      // always-fresh result for SVG callbacks

  const effectivePan = panMode || spacePan;

  const analyze = useCallback(() => {
    setLoading(true); setError(''); setResult(null); setSelectedNode(null);
    api.analyzeProcedure(connectionId, schema, objectType, name)
      .then(r => { resultRef.current = r; setResult(r); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, objectType, name]);

  // Called by MermaidChart after SVG is injected into DOM
  const handleSvgReady = useCallback((svgEl) => {
    svgRef.current = svgEl;
    const map = resultRef.current?.nodeCodeMap || {};
    const keys = Object.keys(map);
    if (!keys.length) return;

    const ns = 'http://www.w3.org/2000/svg';

    // Mermaid v11 node IDs: "{chartId}-flowchart-{nodeKey}-{num}"
    keys.forEach(key => {
      const el = svgEl.querySelector(`[id*="-flowchart-${key}-"]`);
      if (!el) return;
      el.style.cursor = 'pointer';

      // Add magnifying glass badge at top-right of the node
      try {
        const bbox = el.getBBox();
        const cx = bbox.x + bbox.width - 2;
        const cy = bbox.y + 2;

        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', '9');
        circle.setAttribute('fill', '#0d47a1');
        circle.setAttribute('stroke', '#4fc1ff');
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('pointer-events', 'none');

        const icon = document.createElementNS(ns, 'text');
        icon.setAttribute('x', cx);
        icon.setAttribute('y', cy + 4);
        icon.setAttribute('text-anchor', 'middle');
        icon.setAttribute('font-size', '10');
        icon.setAttribute('fill', '#4fc1ff');
        icon.setAttribute('pointer-events', 'none');
        icon.textContent = '🔍';

        el.appendChild(circle);
        el.appendChild(icon);
      } catch (_) { /* getBBox can fail if element is not rendered */ }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (scriptOpenRef.current) {
          // Script panel open → scroll the full script to this node's source line
          const ln = resultRef.current?.nodeLineMap?.[key];
          if (ln) setScrollTarget({ line: ln, nonce: Date.now() });
        } else {
          setSelectedNode({ key, code: formatSQL(map[key]) || map[key] });
        }
      });
    });
  }, []);

  useEffect(() => { analyze(); }, [analyze]);

  // ── Export: download the rendered flowchart as SVG or PNG ──────────────────
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function svgDimensions(svg) {
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
    const r = svg.getBoundingClientRect();
    return { w: r.width / zoom, h: r.height / zoom };
  }

  function cloneCleanSvg() {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.style.transform = '';        // strip zoom
    clone.style.maxWidth = 'none';
    const { w, h } = svgDimensions(svg);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    return { clone, w, h };
  }

  function exportSVG() {
    const r = cloneCleanSvg();
    if (!r) return;
    const data = new XMLSerializer().serializeToString(r.clone);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', data], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${name}_flowchart.svg`);
  }

  function exportPNG() {
    const r = cloneCleanSvg();
    if (!r) return;
    const { clone, w, h } = r;
    const data = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // hi-res export
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => { if (b) downloadBlob(b, `${name}_flowchart.png`); }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  // Spacebar → temporary pan mode (ignore when focused on inputs)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      setSpacePan(true);
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Update cursor when pan mode changes
  useEffect(() => {
    if (diagramWrapRef.current) {
      diagramWrapRef.current.style.cursor = effectivePan ? 'grab' : 'default';
    }
  }, [effectivePan]);

  // Ctrl+Wheel zoom — must use non-passive listener
  useEffect(() => {
    const el = diagramWrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.min(3, Math.max(0.2, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeSection]);

  // Pan drag handlers — cursor updated directly to avoid re-render overhead
  function setCursor(cur) {
    if (diagramWrapRef.current) diagramWrapRef.current.style.cursor = cur;
  }

  function onDiagramMouseDown(e) {
    if (!effectivePan) return;
    e.preventDefault();
    isPanning.current = true;
    setCursor('grabbing');
    panStart.current = { x: e.clientX, y: e.clientY };
    panScrollStart.current = {
      left: diagramWrapRef.current.scrollLeft,
      top:  diagramWrapRef.current.scrollTop,
    };
  }

  function onDiagramMouseMove(e) {
    if (!isPanning.current || !panStart.current || !diagramWrapRef.current) return;
    diagramWrapRef.current.scrollLeft = panScrollStart.current.left - (e.clientX - panStart.current.x);
    diagramWrapRef.current.scrollTop  = panScrollStart.current.top  - (e.clientY - panStart.current.y);
  }

  function onDiagramMouseUp() {
    if (!isPanning.current) return;
    isPanning.current = false;
    panStart.current = null;
    setCursor(effectivePan ? 'grab' : 'default');
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-secondary)' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      <div>PL/SQL 분석 중...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 20 }}>
      <div style={{ color: 'var(--danger)', marginBottom: 8, fontWeight: 600 }}>분석 실패</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{error}</div>
      <button className="btn-secondary" onClick={analyze} style={{ marginTop: 12 }}>재시도</button>
    </div>
  );

  if (!result) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 10px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {['diagram', 'summary', 'source'].map(s => (
            <button
              key={s}
              onClick={() => { setActiveSection(s); if (s !== 'diagram') setSelectedNode(null); }}
              style={{
                padding: '3px 10px', borderRadius: 0, border: 'none',
                background: activeSection === s ? 'var(--accent)' : 'var(--bg-input)',
                color: activeSection === s ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
              }}
            >
              {s === 'diagram' ? '📊 흐름도' : s === 'summary' ? '📋 요약' : '🔤 Mermaid'}
            </button>
          ))}
        </div>

        {activeSection === 'diagram' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
            {/* Pan toggle button */}
            <button
              onClick={() => setPanMode(m => !m)}
              title={panMode ? '이동 모드 해제 (Space 키로도 전환)' : '이동 모드 (Space 키로도 전환)'}
              style={{
                padding: '2px 9px', fontSize: 15, lineHeight: 1.4, cursor: 'pointer',
                border: `1px solid ${panMode || spacePan ? 'var(--accent-bright)' : 'var(--border)'}`,
                background: panMode ? 'rgba(79,193,255,0.15)' : spacePan ? 'rgba(79,193,255,0.08)' : 'var(--bg-input)',
                color: panMode || spacePan ? 'var(--accent-bright)' : 'var(--text-secondary)',
                borderRadius: 4,
              }}
            >✋</button>

            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

            {/* Zoom controls */}
            <button className="btn-secondary" onClick={() => setZoom(z => Math.max(0.2, +(z - 0.15).toFixed(2)))} style={{ padding: '2px 8px', fontSize: 14 }}>−</button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button className="btn-secondary" onClick={() => setZoom(z => Math.min(3, +(z + 0.15).toFixed(2)))} style={{ padding: '2px 8px', fontSize: 14 }}>+</button>
            <button className="btn-secondary" onClick={() => setZoom(1)} style={{ padding: '2px 6px', fontSize: 11 }}>리셋</button>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>Ctrl+휠</span>

            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />

            {/* Full-script panel toggle */}
            <button
              onClick={() => { setScriptOpen(o => !o); setSelectedNode(null); }}
              title="전체 스크립트 패널 표시 (켜짐: 노드 클릭 시 해당 위치로 스크롤)"
              style={{
                padding: '2px 9px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                border: `1px solid ${scriptOpen ? 'var(--accent-bright)' : 'var(--border)'}`,
                background: scriptOpen ? 'rgba(79,193,255,0.15)' : 'var(--bg-input)',
                color: scriptOpen ? 'var(--accent-bright)' : 'var(--text-secondary)',
              }}
            >📜 스크립트 {scriptOpen ? 'ON' : 'OFF'}</button>

            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />

            {/* Export */}
            <button className="btn-secondary" onClick={exportPNG} title="PNG 이미지로 내보내기" style={{ padding: '2px 8px', fontSize: 11 }}>⬇ PNG</button>
            <button className="btn-secondary" onClick={exportSVG} title="SVG 벡터로 내보내기" style={{ padding: '2px 8px', fontSize: 11 }}>⬇ SVG</button>
          </div>
        )}

        <button className="btn-secondary" onClick={analyze} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }}>↻ 재분석</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {activeSection === 'diagram' && (
          <>
            {/* Diagram area */}
            <div
              ref={diagramWrapRef}
              style={{
                flex: 1, overflow: 'auto', background: 'var(--bg-primary)', minWidth: 0,
                userSelect: effectivePan ? 'none' : 'auto',
              }}
              onMouseDown={onDiagramMouseDown}
              onMouseMove={onDiagramMouseMove}
              onMouseUp={onDiagramMouseUp}
              onMouseLeave={onDiagramMouseUp}
            >
              <MermaidChart
                chart={result.mermaid}
                zoom={zoom}
                nodeCodeMap={result.nodeCodeMap || {}}
                onRenderComplete={handleSvgReady}
              />
            </div>

            {/* Full-script panel (toggle ON) */}
            {scriptOpen && (
              <ScriptPanel
                source={result.source || ''}
                scrollTarget={scrollTarget}
                panelWidth={panelWidth}
                onResizeMouseDown={onPanelResizeMouseDown}
                onClose={() => setScriptOpen(false)}
              />
            )}

            {/* Code side panel (snippet popup — only when script panel is OFF) */}
            {!scriptOpen && selectedNode && (
              <div style={{
                position: 'relative',
                width: panelWidth, flexShrink: 0,
                borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-panel)',
                overflow: 'hidden',
              }}>
                {/* Resize handle on left edge */}
                <div
                  onMouseDown={onPanelResizeMouseDown}
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
                    cursor: 'col-resize', zIndex: 10, background: 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,193,255,0.45)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                />

                {/* Panel header */}
                <div style={{
                  padding: '7px 12px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--accent-bright)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getNodeTypeLabel(selectedNode.key)}
                  </span>
                  <button
                    onClick={() => setSelectedNode(n => n ? { ...n, code: formatSQL(n.code) } : n)}
                    style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 3, cursor: 'pointer' }}
                    title="줄 맞추기"
                  >≡</button>
                  <button
                    onClick={() => navigator.clipboard?.writeText(selectedNode.code)}
                    style={{ fontSize: 11, padding: '2px 7px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 3, cursor: 'pointer' }}
                    title="복사"
                  >📋</button>
                  <button
                    onClick={() => setSelectedNode(null)}
                    style={{ fontSize: 13, padding: '2px 6px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', lineHeight: 1 }}
                    title="닫기"
                  >✕</button>
                </div>

                {/* Code content — foldable + SQL highlighted */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <FoldableCode code={selectedNode.code} />
                </div>

                <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
                  도형을 클릭하면 해당 코드를 표시합니다
                </div>
              </div>
            )}
          </>
        )}

        {activeSection === 'summary' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <AnalysisSummary result={result} />
          </div>
        )}

        {activeSection === 'source' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mermaid 다이어그램 소스</span>
              <button className="btn-secondary" onClick={() => copyMermaid(result.mermaid)} style={{ padding: '2px 8px', fontSize: 11, minWidth: 56 }}>{mermaidCopied ? '✓ 복사됨' : '📋 복사'}</button>
            </div>
            <pre style={{ fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-panel)', padding: 12, borderRadius: 4, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {result.mermaid}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full-script panel (line numbers + syntax highlight + click-to-scroll) ──────

function ScriptPanel({ source, scrollTarget, panelWidth, onResizeMouseDown, onClose }) {
  const lines = useMemo(() => (source ? source.replace(/\r\n/g, '\n').split('\n') : []), [source]);
  const scrollRef = useRef(null);
  const lineRefs = useRef({});
  const [activeLine, setActiveLine] = useState(null);

  useEffect(() => {
    if (!scrollTarget?.line) return;
    setActiveLine(scrollTarget.line);
    const el = lineRefs.current[scrollTarget.line];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [scrollTarget]);

  return (
    <div style={{
      position: 'relative', width: panelWidth, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-panel)', overflow: 'hidden',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10, background: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,193,255,0.45)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      />
      {/* Header */}
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--accent-bright)', fontWeight: 600, flex: 1 }}>📜 전체 스크립트</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>노드 클릭 → 위치 이동</span>
        <button onClick={onClose} style={{ fontSize: 13, padding: '2px 6px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', lineHeight: 1 }} title="닫기">✕</button>
      </div>
      {/* Code */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        <pre style={{ margin: 0, padding: 0, fontFamily: 'var(--code-font)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6, background: 'var(--bg-primary)', minWidth: 'max-content' }}>
          {lines.map((line, i) => {
            const lineNo = i + 1;
            const isActive = activeLine === lineNo;
            return (
              <div
                key={i}
                ref={el => { lineRefs.current[lineNo] = el; }}
                style={{ display: 'flex', background: isActive ? 'rgba(79,193,255,0.18)' : 'transparent' }}
              >
                <span style={{ width: 44, minWidth: 44, color: isActive ? 'var(--accent-bright)' : 'var(--text-dim)', textAlign: 'right', paddingRight: 12, flexShrink: 0, userSelect: 'none', borderRight: isActive ? '2px solid var(--accent-bright)' : '2px solid transparent' }}>{lineNo}</span>
                <span style={{ whiteSpace: 'pre-wrap', paddingLeft: 8, flex: 1 }}>{renderHighlighted(line)}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

// ── Foldable code viewer ───────────────────────────────────────────────────────

const FOLD_TRIGGER = /(\b(THEN|LOOP|ELSE|EXCEPTION|BEGIN)\s*$|^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b)/i;

function getIndentLen(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function buildFoldableSet(lines) {
  const s = new Set();
  for (let i = 0; i < lines.length - 1; i++) {
    const stripped = lines[i].trimEnd().replace(/--.*$/, '').trimEnd();
    if (!FOLD_TRIGGER.test(stripped)) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length && getIndentLen(lines[j]) > getIndentLen(lines[i])) s.add(i);
  }
  return s;
}

function FoldableCode({ code }) {
  const lines = useMemo(() => code ? code.split('\n') : [], [code]);
  const foldableSet = useMemo(() => buildFoldableSet(lines), [lines]);
  const [folded, setFolded] = useState(new Set());

  // Reset fold state when code changes (e.g. after format)
  useEffect(() => { setFolded(new Set()); }, [code]);

  const toggle = useCallback((idx) => {
    setFolded(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  }, []);

  // Build visible line list respecting fold state
  const visible = [];
  let skipDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const ind = getIndentLen(lines[i]);
    if (skipDepth >= 0) {
      if (lines[i].trim() === '' || ind > skipDepth) continue;
      skipDepth = -1;
    }
    const isF = foldableSet.has(i);
    const isCol = isF && folded.has(i);
    if (isCol) skipDepth = ind;
    visible.push({ lineIdx: i, isFoldable: isF, isCollapsed: isCol });
  }

  return (
    <pre style={{
      margin: 0, padding: '10px 0',
      fontFamily: 'var(--code-font)', fontSize: 12,
      color: 'var(--text-primary)', lineHeight: 1.7,
      background: 'transparent',
    }}>
      {visible.map(({ lineIdx, isFoldable, isCollapsed }) => {
        const line = lines[lineIdx];
        return (
          <div key={lineIdx} style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, flexShrink: 0, color: '#4fc1ff', fontSize: 8,
                cursor: isFoldable ? 'pointer' : 'default',
                userSelect: 'none', paddingTop: 1,
              }}
              onClick={isFoldable ? () => toggle(lineIdx) : undefined}
            >
              {isFoldable ? (isCollapsed ? '▶' : '▼') : ''}
            </span>
            <span style={{ flex: 1, paddingRight: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderHighlighted(line)}
              {isCollapsed && <span style={{ color: '#555', fontStyle: 'italic' }}> ···</span>}
            </span>
          </div>
        );
      })}
    </pre>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function AnalysisSummary({ result }) {
  const { params, reads, writes, calls, exceptions, cursors, variables } = result;
  const inParams = params.filter(p => p.direction === 'IN' || p.direction === 'IN OUT');
  const outParams = params.filter(p => p.direction === 'OUT' || p.direction === 'IN OUT');

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, fontSize: 13 }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatChip label="입력 파라미터" value={inParams.length} color="#3498db" />
        <StatChip label="출력 파라미터" value={outParams.length} color="#2ecc71" />
        <StatChip label="읽기 테이블" value={reads.length} color="#d4ac0d" />
        <StatChip label="쓰기 테이블" value={writes.length} color="#e74c3c" />
        <StatChip label="커서" value={cursors.length} color="#f39c12" />
        <StatChip label="호출" value={calls.length} color="#5dade2" />
        <StatChip label="예외" value={exceptions.length} color="#9e9e9e" />
      </div>

      {/* Parameters */}
      {params.length > 0 && (
        <Section title="파라미터">
          <table style={tableStyle}>
            <thead>
              <tr>
                {['이름', '방향', '데이터 타입'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {params.map(p => (
                <tr key={p.name}>
                  <td style={tdStyle}><code style={{ color: 'var(--accent-bright)' }}>{p.name}</code></td>
                  <td style={tdStyle}>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: dirBg(p.direction), color: '#fff' }}>
                      {p.direction}
                    </span>
                  </td>
                  <td style={tdStyle}><code style={{ color: 'var(--text-secondary)' }}>{p.dataType}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Read Tables */}
      {reads.length > 0 && (
        <Section title="📖 읽기 테이블 (SELECT)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {reads.map(t => {
              const cur = cursors.find(c => c.table === t);
              return (
                <span key={t} style={{ padding: '4px 10px', background: 'rgba(212,172,13,0.15)', border: '1px solid #d4ac0d', borderRadius: 4, fontSize: 12 }}>
                  🗄 {t} {cur && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>(CURSOR: {cur.name})</span>}
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {/* Write Tables */}
      {writes.length > 0 && (
        <Section title="✏️ 쓰기 테이블 (DML)">
          <table style={tableStyle}>
            <thead>
              <tr>
                {['테이블', '작업'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {writes.map((w, i) => (
                <tr key={i}>
                  <td style={tdStyle}><code style={{ color: '#e74c3c' }}>{w.table}</code></td>
                  <td style={tdStyle}>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, background: opBg(w.op), color: '#fff' }}>
                      {w.op}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Procedure Calls */}
      {calls.length > 0 && (
        <Section title="🔧 프로시저/함수/패키지 호출">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {calls.map(c => (
              <div key={c.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 11, background: callBg(c.type), color: '#fff', minWidth: 64, textAlign: 'center' }}>
                  {callLabel(c.type)}
                </span>
                <code style={{ color: 'var(--accent-bright)', fontSize: 12 }}>{c.name}</code>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <Section title="⚠️ 예외 처리">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {exceptions.map(e => (
              <span key={e} style={{ padding: '3px 10px', background: 'rgba(158,158,158,0.15)', border: '1px solid #9e9e9e', borderRadius: 4, fontSize: 12 }}>
                {e}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Variables (if any) */}
      {variables.length > 0 && (
        <Section title="📦 로컬 변수 (주요)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {variables.map(v => (
              <span key={v.name} style={{ padding: '3px 8px', background: 'rgba(79,193,255,0.1)', border: '1px solid rgba(79,193,255,0.3)', borderRadius: 4, fontSize: 11 }}>
                <code style={{ color: 'var(--accent-bright)' }}>{v.name}</code>
                <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{v.type}</span>
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 14px', background: 'var(--bg-panel)', border: `1px solid ${color}33`, borderRadius: 6, minWidth: 80 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

function dirBg(dir) {
  if (dir === 'IN') return '#1a4a72';
  if (dir === 'OUT') return '#1a5e3a';
  return '#512e5f';
}

function opBg(op) {
  const m = { INSERT: '#1a5e3a', UPDATE: '#7d6608', DELETE: '#7b241c', MERGE: '#512e5f' };
  return m[op] || '#333';
}

function callBg(type) {
  if (type === 'system') return '#2e4057';
  if (type === 'dynamic') return '#4a235a';
  return '#1b3a5c';
}

function callLabel(type) {
  if (type === 'system') return '시스템';
  if (type === 'dynamic') return '동적SQL';
  return '사용자';
}

const tableStyle = { borderCollapse: 'collapse', width: '100%', fontSize: 12 };
const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' };
const tdStyle = { padding: '5px 10px', borderBottom: '1px solid rgba(62,62,66,0.5)' };
