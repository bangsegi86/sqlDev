import React, { useState } from 'react';

const LEVEL_META = {
  critical: { color: '#f44747', bg: 'rgba(244,71,71,0.10)', icon: '✕', label: '심각' },
  warning:  { color: '#e5c07b', bg: 'rgba(229,192,123,0.10)', icon: '⚠', label: '주의' },
  info:     { color: '#61afef', bg: 'rgba(97,175,239,0.10)', icon: 'ℹ', label: '정보' },
  good:     { color: '#4ec9b0', bg: 'rgba(78,201,176,0.10)', icon: '✔', label: '양호' },
};

const GRADE_META = {
  critical: { color: '#f44747', bg: 'rgba(244,71,71,0.15)', label: '심각' },
  warning:  { color: '#e5c07b', bg: 'rgba(229,192,123,0.15)', label: '주의' },
  good:     { color: '#4ec9b0', bg: 'rgba(78,201,176,0.15)', label: '양호' },
  unknown:  { color: '#858585', bg: 'rgba(133,133,133,0.15)', label: '알 수 없음' },
};

function GradeBadge({ grade, gradeLabel }) {
  const m = GRADE_META[grade] || GRADE_META.unknown;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 10,
      fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
      color: m.color, background: m.bg, border: `1px solid ${m.color}`,
    }}>
      {gradeLabel}
    </span>
  );
}

function FindingCard({ f }) {
  const m = LEVEL_META[f.level] || LEVEL_META.info;
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderLeft: `3px solid ${m.color}`, background: m.bg, borderRadius: 4, marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ color: m.color, fontSize: 13, width: 16, textAlign: 'center' }}>{m.icon}</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>{f.title}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 10px 8px 34px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: f.suggestion ? 5 : 0, lineHeight: 1.5 }}>
            {f.description}
          </div>
          {f.suggestion && (
            <pre style={{
              margin: 0, padding: '5px 8px', borderRadius: 3,
              background: 'rgba(0,0,0,0.25)', fontSize: 11,
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'var(--code-font)',
            }}>
              {f.suggestion}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function OpsTable({ operations }) {
  if (!operations?.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--code-font)' }}>
        <thead>
          <tr style={{ background: 'var(--bg-panel)' }}>
            {['Id', 'Operation', 'Name', 'Rows', 'Bytes', 'Cost'].map(h => (
              <th key={h} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, textAlign: h === 'Id' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operations.map(op => (
            <tr key={op.id} style={{ background: op.hasFilter ? 'rgba(229,192,123,0.05)' : 'transparent' }}>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--text-dim)', textAlign: 'right' }}>
                {op.hasFilter ? <span style={{ color: '#e5c07b' }}>*</span> : ''}{op.id}
              </td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--text-primary)', paddingLeft: 8 + op.depth * 16 }}>
                {op.operation}
              </td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--accent-bright)' }}>{op.name}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--text-secondary)', textAlign: 'right' }}>{op.rows?.toLocaleString()}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--text-secondary)', textAlign: 'right' }}>{op.bytes?.toLocaleString()}</td>
              <td style={{ padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.4)', color: 'var(--text-secondary)', textAlign: 'right' }}>{op.cost?.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlanViewer({ rawPlan, analysis, loading, error }) {
  const [tab, setTab] = useState('analysis');

  const tabStyle = (active) => ({
    padding: '4px 12px', fontSize: 11, cursor: 'pointer', userSelect: 'none',
    borderBottom: active ? '2px solid var(--accent-bright)' : '2px solid transparent',
    color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent-bright)' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0, padding: '0 8px' }}>
        <button style={tabStyle(tab === 'analysis')} onClick={() => setTab('analysis')}>분석</button>
        <button style={tabStyle(tab === 'raw')} onClick={() => setTab('raw')}>실행계획 원문</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)', fontSize: 12 }}>
            <span className="spinner" /> 실행계획 조회 중...
          </div>
        )}

        {error && !loading && (
          <div style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--code-font)' }}>{error}</div>
        )}

        {!loading && !error && tab === 'raw' && (
          <pre style={{
            margin: 0, fontFamily: 'var(--code-font)', fontSize: 12,
            color: 'var(--text-primary)', whiteSpace: 'pre', lineHeight: 1.5,
          }}>
            {rawPlan || '실행계획이 없습니다.'}
          </pre>
        )}

        {!loading && !error && tab === 'analysis' && analysis && (
          <div style={{ maxWidth: 860 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <GradeBadge grade={analysis.grade} gradeLabel={analysis.gradeLabel} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</span>
            </div>

            {/* Meta */}
            {(analysis.planHash || analysis.notes?.length > 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12, display: 'flex', gap: 12 }}>
                {analysis.planHash && <span>Hash: {analysis.planHash}</span>}
                {analysis.notes?.map((n, i) => <span key={i}>Note: {n}</span>)}
              </div>
            )}

            {/* Findings */}
            {analysis.findings?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  진단 결과 ({analysis.findings.length}건)
                </div>
                {analysis.findings.map((f, i) => <FindingCard key={i} f={f} />)}
              </div>
            )}

            {/* Operations table */}
            {analysis.operations?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  실행 단계 ({analysis.operations.length}개)
                </div>
                <OpsTable operations={analysis.operations} />
              </div>
            )}
          </div>
        )}

        {!loading && !error && tab === 'analysis' && !analysis && rawPlan && (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>분석 결과가 없습니다.</div>
        )}

        {!loading && !error && !rawPlan && (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            SQL을 입력하고 📊 실행계획 버튼을 눌러 실행계획을 조회하세요.
          </div>
        )}
      </div>
    </div>
  );
}
