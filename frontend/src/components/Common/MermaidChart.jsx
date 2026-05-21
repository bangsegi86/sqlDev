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

export default function MermaidChart({ chart, zoom = 1, nodeCodeMap = {}, onNodeClick }) {
  const containerRef = useRef(null);
  const wrapRef = useRef(null);
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${++chartSeq}`);

  // Render chart and attach node click handlers
  useEffect(() => {
    initMermaid();
    if (!chart || !containerRef.current) return;
    setError('');

    mermaid.render(idRef.current, chart)
      .then(({ svg }) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = 'none';
          svgEl.style.transform = `scale(${zoom})`;
          svgEl.style.transformOrigin = 'top left';

          // Attach click handlers to all flowchart nodes
          if (onNodeClick && Object.keys(nodeCodeMap).length > 0) {
            const nodeEls = svgEl.querySelectorAll('g.node');
            nodeEls.forEach(el => {
              // SVG node IDs look like: "flowchart-SEL1-5"
              const rawId = el.id || '';
              const parts = rawId.split('-');
              // strip leading "flowchart" and trailing numeric suffix
              const nodeKey = parts.slice(1, -1).join('-');
              const code = nodeCodeMap[nodeKey];
              if (code) {
                el.style.cursor = 'pointer';
                el.style.transition = 'opacity 0.15s';
                el.addEventListener('mouseenter', () => { el.style.opacity = '0.75'; });
                el.addEventListener('mouseleave', () => { el.style.opacity = '1'; });
                el.addEventListener('click', () => onNodeClick(nodeKey, code));
              }
            });
          }
        }
      })
      .catch(e => {
        setError(e.message || 'Diagram render error');
      });

    idRef.current = `mermaid-${++chartSeq}`;
  }, [chart]); // re-render only when chart changes

  // Update zoom without re-rendering
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (svgEl) {
      svgEl.style.transform = `scale(${zoom})`;
    }
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
    <div ref={wrapRef} style={{ padding: 16, overflow: 'auto', minHeight: 200 }}>
      <div ref={containerRef} />
    </div>
  );
}
