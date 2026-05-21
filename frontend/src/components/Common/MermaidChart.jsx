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

// Parse "flowchart-SEL1-5" → "SEL1", "flowchart-IF1-3" → "IF1"
function parseNodeKey(rawId) {
  if (!rawId.startsWith('flowchart-')) return null;
  const inner = rawId.slice('flowchart-'.length);         // "SEL1-5"
  const lastDash = inner.lastIndexOf('-');
  if (lastDash < 0) return null;
  const suffix = inner.slice(lastDash + 1);
  if (!/^\d+$/.test(suffix)) return null;                 // trailing part must be numeric
  return inner.slice(0, lastDash);                        // "SEL1"
}

export default function MermaidChart({ chart, zoom = 1, nodeCodeMap = {}, onNodeClick }) {
  const containerRef = useRef(null);
  const wrapRef = useRef(null);
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${++chartSeq}`);

  // Always-fresh refs so event listeners never capture stale props
  const nodeCodeMapRef = useRef(nodeCodeMap);
  const onNodeClickRef  = useRef(onNodeClick);
  useEffect(() => { nodeCodeMapRef.current = nodeCodeMap; }, [nodeCodeMap]);
  useEffect(() => { onNodeClickRef.current  = onNodeClick;  }, [onNodeClick]);

  // Render chart — re-runs only when the chart text changes
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

        // Style clickable nodes
        const styleClickable = () => {
          const map = nodeCodeMapRef.current;
          svgEl.querySelectorAll('[id^="flowchart-"]').forEach(el => {
            const key = parseNodeKey(el.id);
            if (key && map[key]) {
              el.style.cursor = 'pointer';
            }
          });
        };
        styleClickable();

        // Event delegation — walks up from the actual click target (rect/text/etc.)
        svgEl.addEventListener('click', (e) => {
          const map = nodeCodeMapRef.current;
          const handler = onNodeClickRef.current;
          if (!handler || !Object.keys(map).length) return;

          let el = e.target;
          while (el && el !== svgEl) {
            const key = parseNodeKey(el.id || '');
            if (key && map[key]) {
              handler(key, map[key]);
              return;
            }
            el = el.parentElement;
          }
        });

        // Hover highlight via event delegation
        svgEl.addEventListener('mousemove', (e) => {
          const map = nodeCodeMapRef.current;
          let el = e.target;
          let found = null;
          while (el && el !== svgEl) {
            const key = parseNodeKey(el.id || '');
            if (key && map[key]) { found = el; break; }
            el = el.parentElement;
          }
          svgEl.querySelectorAll('[id^="flowchart-"]').forEach(n => {
            n.style.opacity = (found && n === found) ? '0.72' : '1';
          });
        });
        svgEl.addEventListener('mouseleave', () => {
          svgEl.querySelectorAll('[id^="flowchart-"]').forEach(n => { n.style.opacity = '1'; });
        });
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
