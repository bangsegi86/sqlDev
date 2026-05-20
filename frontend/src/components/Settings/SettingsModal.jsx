import React, { useEffect, useState } from 'react';
import Modal from '../Common/Modal.jsx';
import { api } from '../../api/client.js';

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [clientDir, setClientDir] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [jdbcStatus, setJdbcStatus] = useState(null);
  const [jdbcDownloading, setJdbcDownloading] = useState(false);
  const [jdbcError, setJdbcError] = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s);
      setClientDir(s.oracleClientDir || '');
    }).catch(() => {});
    api.getJdbcStatus().then(setJdbcStatus).catch(() => {});
  }, []);

  async function handleDownloadJdbc() {
    setJdbcDownloading(true); setJdbcError('');
    try {
      const result = await api.downloadJdbc();
      setJdbcStatus(result);
    } catch (e) {
      setJdbcError(e.message);
    } finally {
      setJdbcDownloading(false);
    }
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.updateSettings({ oracleClientDir: clientDir.trim() });
      setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function handleAutoDetect() {
    if (settings?.autoDetected) setClientDir(settings.autoDetected);
  }

  const isThick = settings?.currentMode === 'thick';

  return (
    <Modal title="⚙ 설정" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Current Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>현재 모드:</span>
          <span style={{
            padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: isThick ? 'rgba(46,204,113,0.2)' : 'rgba(255,165,0,0.2)',
            color: isThick ? '#2ecc71' : '#f39c12',
            border: `1px solid ${isThick ? '#2ecc71' : '#f39c12'}`,
          }}>
            {isThick ? '✓ Thick Mode (전체 호환)' : '⚠ Thin Mode (구형 Oracle 인증 불가)'}
          </span>
          {isThick && settings?.currentClientDir && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{settings.currentClientDir}</span>
          )}
        </div>

        {/* Info Box */}
        <div style={{ padding: '10px 14px', background: 'rgba(79,193,255,0.08)', border: '1px solid rgba(79,193,255,0.3)', borderRadius: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--accent-bright)' }}>Thick Mode</strong>란?<br />
          Oracle Instant Client 라이브러리를 사용해 <strong>모든 Oracle 인증 방식</strong>을 지원합니다.<br />
          DBeaver에서 연결되는 DB가 Thin Mode에서 <code style={{ background: 'var(--bg-panel)', padding: '0 4px', borderRadius: 3 }}>NJS-116</code> 오류가 날 때 Thick Mode로 해결됩니다.
        </div>

        {/* Oracle Client Path */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Oracle Instant Client 경로
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={clientDir}
              onChange={e => { setClientDir(e.target.value); setSaved(false); }}
              placeholder={settings?.autoDetected || '예: /opt/oracle/instantclient_21_1'}
              style={{ flex: 1 }}
            />
            {settings?.autoDetected && (
              <button className="btn-secondary" onClick={handleAutoDetect} style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>
                자동 감지 적용
              </button>
            )}
          </div>
          {settings?.autoDetected && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#2ecc71' }}>
              ✓ 자동 감지됨: {settings.autoDetected}
            </div>
          )}
          {!settings?.autoDetected && (
            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-dim)' }}>
              자동 감지 실패 — 경로를 직접 입력하거나 비워두면 Thin Mode로 동작합니다.
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
            저장 후 서버가 자동으로 재시작되어 적용됩니다.
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
        {saved && (
          <div style={{ padding: '8px 12px', background: 'rgba(46,204,113,0.15)', border: '1px solid #2ecc71', borderRadius: 4, fontSize: 12, color: '#2ecc71' }}>
            ✓ 저장되었습니다. 서버가 재시작됩니다 (개발 모드에서 자동). 이후 재연결 테스트를 해보세요.
          </div>
        )}

        {/* JDBC Section */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            JDBC 드라이버 (구형 Oracle 10g 인증 지원)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>상태:</span>
            <span style={{
              padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: jdbcStatus?.available ? 'rgba(46,204,113,0.2)' : 'rgba(255,165,0,0.15)',
              color: jdbcStatus?.available ? '#2ecc71' : '#f39c12',
              border: `1px solid ${jdbcStatus?.available ? '#2ecc71' : '#f39c12'}`,
            }}>
              {jdbcStatus?.available ? '✓ 준비됨 (ojdbc11.jar)' : jdbcStatus?.driverDownloaded ? '⚠ 컴파일 필요' : '⚠ 미설치'}
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
            NJS-116 오류 발생 시 자동으로 JDBC로 전환합니다. DBeaver와 동일한 Oracle JDBC 드라이버(ojdbc11)를 사용합니다.<br/>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>다운로드 경로: Maven Central (repo1.maven.org) · 약 7MB</span>
          </div>

          {jdbcError && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{jdbcError}</div>}

          <button
            className={jdbcStatus?.available ? 'btn-secondary' : 'btn-primary'}
            onClick={handleDownloadJdbc}
            disabled={jdbcDownloading}
            style={{ padding: '5px 14px', fontSize: 12 }}
          >
            {jdbcDownloading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                다운로드 중... (약 7MB)
              </span>
            ) : jdbcStatus?.available ? '↻ 재다운로드' : '⬇ JDBC 드라이버 자동 다운로드'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
