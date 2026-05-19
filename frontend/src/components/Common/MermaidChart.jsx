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

export default function MermaidChart({ chart, zoom = 1 }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${++chartSeq}`);

  useEffect(() => {
    initMermaid();
    if (!chart || !containerRef.current) return;
    setError('');

    mermaid.render(idRef.current, chart)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = 'none';
            svgEl.style.transform = `scale(${zoom})`;
            svgEl.style.transformOrigin = 'top left';
          }
        }
      })
      .catch(e => {
        setError(e.message || 'Diagram render error');
      });

    idRef.current = `mermaid-${++chartSeq}`;
  }, [chart, zoom]);

  if (error) {
    return (
      <div style={{ padding: 12, color: 'var(--danger)', fontSize: 12 }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>다이어그램 렌더링 오류</div>
        <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ padding: 16, overflow: 'auto', minHeight: 200 }}
    />
  );
}
