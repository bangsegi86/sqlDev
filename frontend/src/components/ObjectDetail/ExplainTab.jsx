import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';

export default function ExplainTab({ connectionId, schema, objectType, name }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  function startExplain() {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setError('');
    setLoading(true);

    const url = api.explainProcedureUrl(connectionId, schema, objectType, name);
    const es = new EventSource(url);

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close();
        setLoading(false);
        return;
      }
      try {
        const { text: chunk, error: err } = JSON.parse(e.data);
        if (err) { setError(err); es.close(); setLoading(false); return; }
        if (chunk) setText(prev => prev + chunk);
      } catch { /* skip malformed */ }
    };

    es.onerror = () => {
      es.close();
      setLoading(false);
      if (!text) setError('AI 설명 생성에 실패했습니다. ANTHROPIC_API_KEY를 확인해 주세요.');
    };

    ctrl.signal.addEventListener('abort', () => es.close());
  }

  useEffect(() => {
    startExplain();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [connectionId, schema, objectType, name]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [text]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
          🤖 Claude AI가 프로시저의 비즈니스 목적을 분석합니다
        </span>
        {loading && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-bright)' }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            분석 중...
          </span>
        )}
        <button
          className="btn-secondary"
          onClick={startExplain}
          disabled={loading}
          style={{ padding: '3px 10px', fontSize: 12 }}
        >
          ↻ 재생성
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        {text ? (
          <MarkdownLike text={text} />
        ) : !loading && !error ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>내용이 없습니다.</div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MarkdownLike({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={h3Style}>{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={h2Style}>{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={h2Style}>{line.slice(2)}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={{ marginBottom: 4 }}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ margin: '6px 0 6px 20px', padding: 0 }}>{items}</ul>);
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} style={{ marginBottom: 4 }}>{renderInline(lines[i].replace(/^\d+\.\s/, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ margin: '6px 0 6px 20px', padding: 0 }}>{items}</ol>);
      continue;
    } else if (line === '') {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else {
      elements.push(<p key={i} style={pStyle}>{renderInline(line)}</p>);
    }
    i++;
  }

  return <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-primary)' }}>{elements}</div>;
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--accent-bright)' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ background: 'var(--bg-panel)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--code-font)', fontSize: 12 }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

const h2Style = { fontSize: 15, fontWeight: 700, color: 'var(--accent-bright)', margin: '16px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: 4 };
const h3Style = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 6px' };
const pStyle = { margin: '4px 0' };
