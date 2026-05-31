import React, { useState } from 'react';
import Modal from '../Common/Modal.jsx';
import {
  DEFAULT_ALIAS_OPTIONS, CONTEXT_LABELS, METHOD_LABELS,
} from '../../utils/aliasRewriter.js';

const STORAGE_KEY = 'sqldev.aliasOptions';
const CONTEXT_ORDER = ['main', 'join', 'sub', 'scalar'];
const METHODS = ['abbrev', 'prefixSeq', 'truncate'];

export function loadAliasOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_ALIAS_OPTIONS);
    const saved = JSON.parse(raw);
    // 누락 컨텍스트는 기본값으로 보충
    const merged = structuredClone(DEFAULT_ALIAS_OPTIONS);
    for (const ctx of CONTEXT_ORDER) {
      if (saved.contexts?.[ctx]) merged.contexts[ctx] = { ...merged.contexts[ctx], ...saved.contexts[ctx] };
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_ALIAS_OPTIONS);
  }
}

export function saveAliasOptions(opts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch { /* ignore */ }
}

export default function AliasOptionsModal({ onClose, onSaved }) {
  const [opts, setOpts] = useState(() => loadAliasOptions());
  const [saved, setSaved] = useState(false);

  function setRule(ctx, key, value) {
    setOpts(o => ({
      ...o,
      contexts: { ...o.contexts, [ctx]: { ...o.contexts[ctx], [key]: value } },
    }));
    setSaved(false);
  }

  function handleSave() {
    saveAliasOptions(opts);
    setSaved(true);
    onSaved?.(opts);
    setTimeout(() => onClose(), 400);
  }

  function handleReset() {
    setOpts(structuredClone(DEFAULT_ALIAS_OPTIONS));
    setSaved(false);
  }

  // 미리보기 샘플
  const preview = previewExamples(opts);

  return (
    <Modal title="테이블 Alias 명명 규칙 설정" onClose={onClose} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          쿼리 위치(컨텍스트)별로 테이블 alias 를 자동 생성하는 규칙을 정합니다.
          <br />· <b>단어 첫글자 축약</b>: USER_ORDER → UO &nbsp; · <b>접두문자+순번</b>: S1, S2 &nbsp; · <b>앞 N글자</b>: CUSTOMER → CUS
        </div>

        {CONTEXT_ORDER.map(ctx => {
          const rule = opts.contexts[ctx];
          return (
            <div key={ctx} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-bright)', marginBottom: 8 }}>
                {CONTEXT_LABELS[ctx]}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div>
                  <label style={LBL}>생성 방식</label>
                  <select value={rule.method} onChange={e => setRule(ctx, 'method', e.target.value)} style={SEL}>
                    {METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                  </select>
                </div>

                {rule.method === 'prefixSeq' && (
                  <div>
                    <label style={LBL}>접두 문자</label>
                    <input value={rule.prefix} onChange={e => setRule(ctx, 'prefix', e.target.value)}
                      style={{ ...INP, width: 70 }} placeholder="예: T" />
                  </div>
                )}

                {rule.method === 'truncate' && (
                  <div>
                    <label style={LBL}>글자 수 (N)</label>
                    <input type="number" min={1} max={10} value={rule.truncLen}
                      onChange={e => setRule(ctx, 'truncLen', Number(e.target.value) || 3)}
                      style={{ ...INP, width: 70 }} />
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!rule.upper} onChange={e => setRule(ctx, 'upper', e.target.checked)} />
                  대문자
                </label>

                <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                  예시: <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{preview[ctx]}</span>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={handleReset} style={{ fontSize: 11 }}>기본값으로 초기화</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span style={{ color: 'var(--success)', fontSize: 12 }}>✓ 저장됨</span>}
            <button className="btn-secondary" onClick={onClose}>취소</button>
            <button className="btn-primary" onClick={handleSave}>저장</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// 컨텍스트별 샘플 테이블명으로 예시 alias 미리보기
function previewExamples(opts) {
  const samples = { main: 'USER_ORDER', join: 'ORDER_DETAIL', sub: 'BIG_TABLE', scalar: 'PAYMENT' };
  const seq = { main: 1, join: 1, sub: 1, scalar: 1 };
  const out = {};
  for (const ctx of CONTEXT_ORDER) {
    const rule = opts.contexts[ctx];
    const t = samples[ctx];
    let a;
    if (rule.method === 'prefixSeq') a = `${rule.prefix || 'T'}${seq[ctx]}`;
    else if (rule.method === 'truncate') a = t.replace(/_/g, '').slice(0, Math.max(1, rule.truncLen || 3));
    else a = t.split('_').map(w => w[0]).join('');
    out[ctx] = rule.upper ? a.toUpperCase() : a.toLowerCase();
  }
  return out;
}

const LBL = { display: 'block', marginBottom: 3, fontSize: 10, color: 'var(--text-secondary)' };
const SEL = { padding: '4px 6px', background: 'var(--bg-input, #1e1e1e)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 12 };
const INP = { padding: '4px 6px', background: 'var(--bg-input, #1e1e1e)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 12 };
