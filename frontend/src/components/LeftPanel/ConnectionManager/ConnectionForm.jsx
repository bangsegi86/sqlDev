import React, { useState } from 'react';
import Modal from '../../Common/Modal.jsx';
import { api } from '../../../api/client.js';
import { useApp } from '../../../store/AppContext.jsx';

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
  });
  const [showPw, setShowPw] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isPg = form.dbType === 'postgres';
  const targetKey = isPg ? 'database' : 'serviceName';
  const targetLabel = isPg ? '데이터베이스명' : '서비스명';

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setTestResult(null); setError(''); }

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
    if (!form.name || !form.host || !form[targetKey] || !form.username) {
      setError(`이름, 호스트, ${targetLabel}, 사용자명은 필수입니다.`);
      return;
    }
    if (!editing && !form.password) { setError('비밀번호는 필수입니다.'); return; }
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
        dispatch({ type: 'SET_STATUS', payload: `Connected to ${conn.name}` });
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
        <Field label={LABELS.name} value={form.name} onChange={v => set('name', v)} />
        <Field label={LABELS.host} value={form.host} onChange={v => set('host', v)} />
        <Field label={targetLabel} value={form[targetKey]} onChange={v => set(targetKey, v)} />
        <Field label={LABELS.username} value={form.username} onChange={v => set('username', v)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="포트" value={form.port} type="number" onChange={v => set('port', v)} />
          <div style={{ position: 'relative' }}>
            <Field
              label={editing ? '비밀번호 (변경 시만 입력)' : '비밀번호'}
              value={form.password}
              type={showPw ? 'text' : 'password'}
              onChange={v => set('password', v)}
            />
            <button
              onClick={() => setShowPw(s => !s)}
              style={{ position: 'absolute', right: 6, bottom: 6, background: 'none', color: 'var(--text-secondary)', padding: 2 }}
            >{showPw ? '🙈' : '👁'}</button>
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

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
