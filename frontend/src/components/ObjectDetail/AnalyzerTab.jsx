import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import MermaidChart from '../Common/MermaidChart.jsx';
import { useCopy } from '../../utils/clipboard.js';

export default function AnalyzerTab({ connectionId, schema, objectType, name }) {
  const [result, setResult] = useState(null);
  const [copyMermaid, mermaidCopied] = useCopy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [activeSection, setActiveSection] = useState('diagram');
  const [mermaidSrc, setMermaidSrc] = useState(false);

  const analyze = useCallback(() => {
    setLoading(true); setError(''); setResult(null);
    api.analyzeProcedure(connectionId, schema, objectType, name)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, objectType, name]);

  useEffect(() => { analyze(); }, [analyze]);

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
              onClick={() => setActiveSection(s)}
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
            <button className="btn-secondary" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2)))} style={{ padding: '2px 8px', fontSize: 14 }}>−</button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button className="btn-secondary" onClick={() => setZoom(z => Math.min(2.5, +(z + 0.15).toFixed(2)))} style={{ padding: '2px 8px', fontSize: 14 }}>+</button>
            <button className="btn-secondary" onClick={() => setZoom(1)} style={{ padding: '2px 6px', fontSize: 11 }}>리셋</button>
          </div>
        )}

        <button className="btn-secondary" onClick={analyze} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }}>↻ 재분석</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeSection === 'diagram' && (
          <div style={{ minHeight: '100%', background: 'var(--bg-primary)' }}>
            <MermaidChart chart={result.mermaid} zoom={zoom} />
          </div>
        )}

        {activeSection === 'summary' && <AnalysisSummary result={result} />}

        {activeSection === 'source' && (
          <div style={{ padding: 12 }}>
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
