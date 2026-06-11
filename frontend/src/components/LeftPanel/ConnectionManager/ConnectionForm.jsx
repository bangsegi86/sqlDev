import React, { useState } from 'react';
import Modal from '../../Common/Modal.jsx';
import { api } from '../../../api/client.js';
import { useApp } from '../../../store/AppContext.jsx';

const ENV_COLORS = [
  { value: null,      label: '없음',       bg: '#555555' },
  { value: '#e05555', label: '운영(Red)',   bg: '#e05555' },
  { value: '#e08844', label: '스테이징(Orange)', bg: '#e08844' },
  { value: '#c8b440', label: 'UAT(Yellow)', bg: '#c8b440' },
  { value: '#44a855', label: '개발(Green)', bg: '#44a855' },
  { value: '#4488cc', label: '로컬(Blue)',  bg: '#4488cc' },
];

export default function ConnectionForm({ onClose, editing = null }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    dbType: editing?.dbType || 'oracle',
    name: editing?.name || '',
    host: editing?.host || '',
    port: editing?.port || (editing?.dbType === 'postgres' ? 5432 : 1521),
    serviceName: editing?.serviceName || '',
    database: editing?.database || '',
    username: editing?.username || '',
    password: '',
    color: editing?.color || null,
  });
  const [showPw, setShowPw] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const isPg = form.dbType === 'postgres';
  const targetKey = isPg ? 'database' : 'serviceName';
  const targetLabel = isPg ? '데이터베이스명' : '서비스명';

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setTestResult(null);
    setError('');
    setFieldErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  }

  // DB 종류 변경 시 기본 포트를 알맞게 맞춰준다 (사용자가 손대지 않은 경우).
  function setDbType(v) {
    setForm(f => {
      const wasDefault = String(f.port) === '1521' || String(f.port) === '5432' || !f.port;
      const nextPort = wasDefault ? (v === 'postgres' ? 5432 : 1521) : f.port;
      return { ...f, dbType: v, port: nextPort };
    });
    setTestResult(null); setError('');
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setError('');
    try {
      const res = await api.testConnection({ ...form, port: Number(form.port) });
      setTestResult({ success: true, msg: `연결 성공! (${res.latencyMs}ms) — ${res.serverVersion}` });
    } catch (e) {
      setTestResult({ success: false, msg: friendlyError(e.message, form.username) });
    } finally { setTesting(false); }
  }

  async function handleSave(andConnect = false) {
    const missing = {};
    if (!form.name) missing.name = true;
    if (!form.host) missing.host = true;
    if (!form[targetKey]) missing[targetKey] = true;
    if (!form.username) missing.username = true;
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setError(`이름, 호스트, ${targetLabel}, 사용자명은 필수입니다.`);
      return;
    }
    if (!editing && !form.password) {
      setFieldErrors({ password: true });
      setError('비밀번호는 필수입니다.');
      return;
    }
    setFieldErrors({});
    setSaving(true); setError('');
    try {
      const payload = { ...form, port: Number(form.port) || (isPg ? 5432 : 1521) };
      if (!payload.password) delete payload.password;
      let conn;
      if (editing) {
        conn = await api.updateConnection(editing.id, payload);
        dispatch({ type: 'UPDATE_CONNECTION', payload: conn });
      } else {
        conn = await api.createConnection(payload);
        dispatch({ type: 'ADD_CONNECTION', payload: conn });
      }
      if (andConnect) {
        dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connecting' } });
        await api.connect(conn.id);
        dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connected' } });
        dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id });
        dispatch({ type: 'SET_STATUS', payload: `${conn.name} 연결됨` });
      }
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={editing ? '연결 편집' : '새 연결'} onClose={onClose} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>데이터베이스 종류</label>
          <select value={form.dbType} onChange={e => setDbType(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-input, #1e1e1e)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 3 }}>
            <option value="oracle">Oracle</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>
        <Field label={LABELS.name} value={form.name} onChange={v => set('name', v)} required hasError={!!fieldErrors.name} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
          <Field label={LABELS.host} value={form.host} onChange={v => set('host', v)} required hasError={!!fieldErrors.host} />
          <Field label="포트" value={form.port} type="number" onChange={v => set('port', v)} />
        </div>
        <Field label={targetLabel} value={form[targetKey]} onChange={v => set(targetKey, v)} required hasError={!!fieldErrors[targetKey]} />
        <Field label={LABELS.username} value={form.username} onChange={v => set('username', v)} required hasError={!!fieldErrors.username} />
        <div style={{ position: 'relative' }}>
          <Field
            label={editing ? '비밀번호 (변경 시만 입력)' : '비밀번호'}
            value={form.password}
            type={showPw ? 'text' : 'password'}
            onChange={v => set('password', v)}
            required={!editing}
            hasError={!!fieldErrors.password}
          />
          <button
            onClick={() => setShowPw(s => !s)}
            title={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
            style={{ position: 'absolute', right: 6, bottom: 6, background: 'none', color: 'var(--text-secondary)', padding: '1px 5px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 2, cursor: 'pointer' }}
          >{showPw ? '숨김' : '표시'}</button>
        </div>

        {/* Color picker */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--text-secondary)' }}>환경 색상 <span style={{ opacity: 0.6 }}>(선택)</span></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {ENV_COLORS.map(c => (
              <button
                key={String(c.value)}
                title={c.label}
                onClick={() => set('color', c.value)}
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: c.bg,
                  border: form.color === c.value ? '2px solid #fff' : '2px solid transparent',
                  outline: form.color === c.value ? `2px solid ${c.bg || '#888'}` : 'none',
                  outlineOffset: 1,
                  cursor: 'pointer', padding: 0, flexShrink: 0,
                  transition: 'outline 0.15s, border 0.15s',
                }}
              />
            ))}
          </div>
        </div>

        {testResult && (
          <div style={{ padding: '8px 10px', borderRadius: 3, fontSize: 12, background: testResult.success ? 'rgba(76,175,80,0.15)' : 'rgba(244,71,71,0.15)', color: testResult.success ? 'var(--success)' : 'var(--danger)', border: `1px solid ${testResult.success ? 'var(--success-dim)' : 'var(--danger)'}`, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {testResult.msg}
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? '테스트 중...' : '연결 테스트'}
          </button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}>저장</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>저장 및 연결</button>
        </div>
      </div>
    </Modal>
  );
}

const LABELS = { name: '연결 이름', host: 'Host (IP)', serviceName: '서비스명', username: '사용자명' };

function friendlyError(msg, username = '') {
  if (msg.includes('NJS-116') || msg.includes('password verifier')) {
    return `[인증 방식 비호환] Oracle DB가 구형 10g 비밀번호 방식을 사용 중입니다.\noracledb Thin Mode와 호환되지 않습니다.\n\nDBA에게 아래 SQL 실행을 요청하세요 (비밀번호 동일 유지):\n\nALTER USER ${username || '<username>'} IDENTIFIED BY <현재비밀번호>;`;
  }
  if (msg.includes('ORA-12541') || msg.includes('TNS:no listener')) {
    return `[연결 실패] Oracle 리스너에 연결할 수 없습니다.\nHost IP / Port 번호를 확인하거나 방화벽 설정을 확인하세요.`;
  }
  if (msg.includes('ORA-12514')) {
    return `[서비스명 오류] 서비스명이 잘못되었습니다.\n서버에서 서비스명을 확인 후 다시 입력하세요.`;
  }
  if (msg.includes('ORA-01017') || msg.includes('invalid username/password')) {
    return `[인증 실패] 사용자명 또는 비밀번호가 올바르지 않습니다.`;
  }
  if (msg.includes('ORA-28000') || msg.includes('account is locked')) {
    return `[계정 잠김] DB 계정이 잠겨 있습니다. DBA에게 계정 잠금 해제를 요청하세요.\n\nALTER USER <username> ACCOUNT UNLOCK;`;
  }
  return msg;
}

function Field({ label, value, onChange, type = 'text', required = false, hasError = false }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 8px',
          background: 'var(--bg-input, #1e1e1e)', color: 'var(--text-primary)',
          border: `1px solid ${hasError ? 'var(--danger)' : 'var(--border)'}`,
          borderRadius: 3, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  );
}
