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

export default function MermaidChart({ chart, zoom = 1, nodeCodeMap = {} }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${++chartSeq}`);

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
        svgEl.style.transform = `scale(${zoom})`;
        svgEl.style.transformOrigin = 'top left';

        // Mark clickable nodes so CSS can apply cursor:pointer
        const map = nodeCodeMap;
        svgEl.querySelectorAll('[data-id]').forEach(el => {
          if (map[el.getAttribute('data-id')]) el.classList.add('flow-clickable');
        });
        svgEl.querySelectorAll('[id^="flowchart-"]').forEach(el => {
          const inner = el.id.slice('flowchart-'.length);
          const lastDash = inner.lastIndexOf('-');
          if (lastDash > 0 && /^\d+$/.test(inner.slice(lastDash + 1))) {
            const key = inner.slice(0, lastDash);
            if (map[key]) el.classList.add('flow-clickable');
          }
        });
      })
      .catch(e => setError(e.message || 'Diagram render error'));

    idRef.current = `mermaid-${++chartSeq}`;
  }, [chart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update zoom without full re-render
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (svgEl) svgEl.style.transform = `scale(${zoom})`;
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
    <div style={{ padding: 16, overflow: 'auto', minHeight: 200 }}>
      <div ref={containerRef} />
    </div>
  );
}
