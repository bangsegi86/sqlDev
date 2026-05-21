import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let initialized = false;

function initMermaid() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    flowchart: { curve: 'basis', padding: 24, useMaxWidth: false },
    themeVariables: {
      darkMode: true,
      background: '#1e1e1e',
      primaryColor: '#0d47a1',
      primaryBorderColor: '#4fc1ff',
      primaryTextColor: '#e3f2fd',
      secondaryColor: '#252526',
      tertiaryColor: '#2d2d30',
      lineColor: '#9e9e9e',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '13px',
      edgeLabelBackground: '#252526',
    },
  });
}

let chartSeq = 0;

function applyZoom(svgEl, wrapEl, zoom) {
  if (!svgEl || !wrapEl) return;
  svgEl.style.transform = `scale(${zoom})`;
  svgEl.style.transformOrigin = 'top left';
  // Make the wrapper match the visual (scaled) size so the scroll container
  // knows the true content dimensions — CSS transform alone doesn't affect layout.
  const vb = svgEl.viewBox?.baseVal;
  const origW = (vb && vb.width > 0) ? vb.width : svgEl.getBoundingClientRect().width / zoom;
  const origH = (vb && vb.height > 0) ? vb.height : svgEl.getBoundingClientRect().height / zoom;
  wrapEl.style.width  = `${origW * zoom + 32}px`;   // +32 for padding
  wrapEl.style.height = `${origH * zoom + 32}px`;
}

export default function MermaidChart({ chart, zoom = 1, nodeCodeMap = {}, onRenderComplete }) {
  const wrapRef = useRef(null);       // outer padding div — sets scroll content size
  const containerRef = useRef(null);  // inner div holding the SVG
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${++chartSeq}`);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Re-render SVG when chart text changes
  useEffect(() => {
    initMermaid();
    if (!chart || !containerRef.current) return;
    setError('');

    mermaid.render(idRef.current, chart)
      .then(({ svg }) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (!svgEl) return;

        svgEl.style.maxWidth = 'none';
        applyZoom(svgEl, wrapRef.current, zoomRef.current);

        if (onRenderComplete) onRenderComplete(svgEl);
      })
      .catch(e => setError(e.message || 'Diagram render error'));

    idRef.current = `mermaid-${++chartSeq}`;
  }, [chart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update zoom without full re-render
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    applyZoom(svgEl, wrapRef.current, zoom);
  }, [zoom]);

  if (error) {
    return (
      <div style={{ padding: 12, color: 'var(--danger)', fontSize: 12 }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>다이어그램 렌더링 오류</div>
        <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ padding: 16, minHeight: 200, display: 'inline-block', minWidth: '100%' }}>
      <div ref={containerRef} />
    </div>
  );
}
