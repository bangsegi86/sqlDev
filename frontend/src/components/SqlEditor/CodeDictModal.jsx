import React, { useState } from 'react';

const STORAGE_KEY = 'sqldev:codeDefs';

export function loadCodeDefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveCodeDefsToStorage(defs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const EMPTY_FORM = { label: '', patterns: '', query: '', description: '' };

export default function CodeDictModal({ onClose }) {
  const [defs, setDefs] = useState(loadCodeDefs);
  const [editing, setEditing] = useState(null); // null | 'new' | def object
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');

  function openNew() {
    setForm(EMPTY_FORM);
    setFormErr('');
    setEditing('new');
  }

  function openEdit(def) {
    setForm({
      label: def.label,
      patterns: def.patterns.join(', '),
      query: def.query,
      description: def.description || '',
    });
    setFormErr('');
    setEditing(def);
  }

  function handleSave() {
    const patterns = form.patterns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!form.label.trim()) { setFormErr('이름을 입력하세요.'); return; }
    if (patterns.length === 0) { setFormErr('컬럼 패턴을 하나 이상 입력하세요.'); return; }
    if (!form.query.trim()) { setFormErr('조회 쿼리를 입력하세요.'); return; }

    const newDef = {
      id: editing === 'new' ? makeId() : editing.id,
      label: form.label.trim(),
      patterns,
      query: form.query.trim(),
      description: form.description.trim(),
    };
    const newDefs = editing === 'new'
      ? [...defs, newDef]
      : defs.map(d => d.id === newDef.id ? newDef : d);
    setDefs(newDefs);
    saveCodeDefsToStorage(newDefs);
    setEditing(null);
  }

  function handleDelete(id) {
    if (!window.confirm('이 코드 정의를 삭제하시겠습니까?')) return;
    const newDefs = defs.filter(d => d.id !== id);
    setDefs(newDefs);
    saveCodeDefsToStorage(newDefs);
  }

  return (
    <div style={OVERLAY_STYLE}>
      <div style={MODAL_STYLE}>
        {/* Header */}
        <div style={HEADER_STYLE}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>📚 코드 사전 관리</span>
          <button onClick={onClose} style={CLOSE_BTN_STYLE}>×</button>
        </div>

        {editing ? (
          /* ── Edit / New form ── */
          <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {editing === 'new' ? '새 코드 정의 추가' : '코드 정의 수정'}
            </div>

            <Field label="이름 (표시용)">
              <input
                style={INPUT_STYLE}
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="예: 상태코드, 처리구분코드"
                autoFocus
              />
            </Field>

            <Field
              label="컬럼 패턴 (콤마로 구분)"
              hint="우클릭한 단어가 이 패턴과 일치하면 코드값 팝업이 뜹니다. * 와일드카드 지원 (예: *_CD)"
            >
              <input
                style={INPUT_STYLE}
                value={form.patterns}
                onChange={e => setForm(f => ({ ...f, patterns: e.target.value }))}
                placeholder="예: STATUS_CD, STAT_CD, *_CD"
              />
            </Field>

            <Field
              label="조회 쿼리"
              hint="현재 활성 연결로 실행됩니다. SELECT 문만 입력하세요."
            >
              <textarea
                style={{ ...INPUT_STYLE, height: 90, resize: 'vertical', fontFamily: 'var(--code-font)', fontSize: 12 }}
                value={form.query}
                onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
                placeholder="SELECT CODE, CODE_NM FROM COM_CODE WHERE GRP = 'STATUS' ORDER BY SEQ"
              />
            </Field>

            <Field label="설명 (선택)">
              <input
                style={INPUT_STYLE}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="이 코드 정의에 대한 메모"
              />
            </Field>

            {formErr && (
              <div style={{ color: 'var(--danger)', fontSize: 11 }}>{formErr}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn-secondary" onClick={() => setEditing(null)}>취소</button>
              <button className="btn-success" onClick={handleSave}>저장</button>
            </div>
          </div>
        ) : (
          /* ── List ── */
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {defs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8 }}>
                등록된 코드 정의가 없습니다.<br />
                아래 버튼으로 추가해주세요.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)' }}>
                    <th style={TH}>이름</th>
                    <th style={TH}>컬럼 패턴</th>
                    <th style={TH}>조회 쿼리</th>
                    <th style={TH}>설명</th>
                    <th style={{ ...TH, width: 88 }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map(def => (
                    <tr key={def.id}>
                      <td style={TD}><b>{def.label}</b></td>
                      <td style={{ ...TD, color: 'var(--accent-bright)', fontFamily: 'var(--code-font)', fontSize: 11 }}>
                        {def.patterns.join(', ')}
                      </td>
                      <td style={{ ...TD, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--code-font)', fontSize: 11, color: 'var(--accent)' }}>
                        {def.query}
                      </td>
                      <td style={{ ...TD, color: 'var(--text-dim)' }}>{def.description}</td>
                      <td style={TD}>
                        <button className="btn-secondary" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => openEdit(def)}>수정</button>
                        {' '}
                        <button className="btn-danger" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => handleDelete(def.id)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Footer (only in list mode) */}
        {!editing && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              SQL 에디터에서 우클릭 → 코드값 조회로 사용합니다.
            </span>
            <button className="btn-success" style={{ padding: '4px 14px' }} onClick={openNew}>
              + 코드 정의 추가
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hint}</span>}
    </label>
  );
}

const OVERLAY_STYLE = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const MODAL_STYLE = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)',
  borderRadius: 8, width: 740, maxHeight: '80vh',
  overflow: 'hidden', display: 'flex', flexDirection: 'column',
};
const HEADER_STYLE = {
  padding: '12px 16px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  flexShrink: 0,
};
const CLOSE_BTN_STYLE = {
  background: 'none', border: 'none', color: 'var(--text-dim)',
  cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px',
};
const INPUT_STYLE = {
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 4, color: 'var(--text-primary)', padding: '5px 8px',
  fontSize: 12, outline: 'none', width: '100%',
};
const TH = {
  padding: '6px 10px', textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11,
};
const TD = {
  padding: '6px 10px', borderBottom: '1px solid rgba(62,62,66,0.5)', verticalAlign: 'top',
};
