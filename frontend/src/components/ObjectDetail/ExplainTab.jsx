import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { generateExplanation } from '../../utils/explainGenerator.js';

export default function ExplainTab({ connectionId, schema, objectType, name }) {
  const [sections, setSections] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true); setError(''); setSections(null);
    api.analyzeProcedure(connectionId, schema, objectType, name)
      .then(result => setSections(generateExplanation(name, objectType, result)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [connectionId, schema, objectType, name]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
      분석 중...
    </div>
  );

  if (error) return (
    <div style={{ padding: 20 }}>
      <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>
      <button className="btn-secondary" onClick={load} style={{ fontSize: 12 }}>재시도</button>
    </div>
  );

  if (!sections) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
          📝 PL/SQL 분석 결과를 바탕으로 자동 생성된 설명입니다
        </span>
        <button className="btn-secondary" onClick={load} style={{ padding: '3px 10px', fontSize: 12 }}>↻ 새로고침</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sections.map((sec, i) => (
          <ExplainSection key={i} title={sec.title} content={sec.content} lines={sec.lines} />
        ))}
      </div>
    </div>
  );
}

function ExplainSection({ title, content, lines }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 3, height: 12, background: 'var(--accent)', borderRadius: 2 }} />
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)', paddingLeft: 10 }}>
        {content && <p style={{ margin: 0 }}>{renderInline(content)}</p>}
        {lines && lines.map((line, i) => (
          <div key={i} style={{ marginBottom: 2 }}>{renderInline(line)}</div>
        ))}
      </div>
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ background: 'var(--bg-panel)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--code-font)', fontSize: 11, color: '#ce9178' }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} style={{ color: 'var(--text-secondary)' }}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
