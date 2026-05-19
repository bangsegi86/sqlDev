import React, { useState } from 'react';
import Modal from '../../Common/Modal.jsx';
import { api } from '../../../api/client.js';
import { useApp } from '../../../store/AppContext.jsx';

export default function ConnectionForm({ onClose, editing = null }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: editing?.name || '',
    host: editing?.host || '',
    port: editing?.port || 1521,
    serviceName: editing?.serviceName || '',
    username: editing?.username || '',
    password: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setTestResult(null); setError(''); }

  async function handleTest() {
    setTesting(true); setTestResult(null); setError('');
    try {
      const res = await api.testConnection({ ...form, port: Number(form.port) });
      setTestResult({ success: true, msg: `연결 성공! (${res.latencyMs}ms) — ${res.serverVersion}` });
    } catch (e) {
      setTestResult({ success: false, msg: e.message });
    } finally { setTesting(false); }
  }

  async function handleSave(andConnect = false) {
    if (!form.name || !form.host || !form.serviceName || !form.username) {
      setError('이름, 호스트, 서비스명, 사용자명은 필수입니다.');
      return;
    }
    if (!editing && !form.password) { setError('비밀번호는 필수입니다.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form, port: Number(form.port) || 1521 };
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
        {['name', 'host', 'serviceName', 'username'].map(k => (
          <Field key={k} label={LABELS[k]} value={form[k]} onChange={v => set(k, v)} />
        ))}
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
          <div style={{ padding: '6px 10px', borderRadius: 3, fontSize: 12, background: testResult.success ? 'rgba(76,175,80,0.15)' : 'rgba(244,71,71,0.15)', color: testResult.success ? 'var(--success)' : 'var(--danger)', border: `1px solid ${testResult.success ? 'var(--success-dim)' : 'var(--danger)'}` }}>
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

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
