import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../api/client.js';

const LMODE_LABELS = { 0: '없음', 1: 'Null', 2: 'RS', 3: 'RX', 4: 'S', 5: 'SRX', 6: 'X' };
const REQUEST_LABELS = LMODE_LABELS;

function StatusDot({ status }) {
  const color = status === 'ACTIVE' ? '#4ade80' : status === 'KILLED' ? 'var(--danger)' : 'rgba(150,150,160,0.6)';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 5, flexShrink: 0, boxShadow: status === 'ACTIVE' ? '0 0 4px rgba(74,222,128,0.6)' : 'none' }} />;
}

function SessionsTable({ sessions, loading, error, note }) {
  if (loading) return <div className="pane-loading"><span className="spinner" />세션 로딩 중...</div>;
  if (error) return <div className="error-pane"><span className="error-pane-msg">{error}</span></div>;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {note && (
        <div style={{ padding: '8px 12px', background: 'rgba(234,179,8,0.12)', borderBottom: '1px solid rgba(234,179,8,0.3)', fontSize: 12, color: '#fbbf24' }}>
          {note}
        </div>
      )}
      {sessions.length === 0 && !note ? (
        <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>활성 세션이 없습니다.</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              {['SID', 'Username', 'Status', 'Machine', 'Program', 'Last Call (s)', 'Event', 'SQL 미리보기'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={`${s.SID}-${s['SERIAL#']}`} style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <td style={tdStyle}><span style={{ color: 'var(--text-dim)' }}>{s.SID}</span></td>
                <td style={tdStyle}><span style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>{s.USERNAME}</span></td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <StatusDot status={s.STATUS} />
                    <span style={{ color: s.STATUS === 'ACTIVE' ? '#4ade80' : s.STATUS === 'KILLED' ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 600, fontSize: 11 }}>{s.STATUS}</span>
                  </span>
                </td>
                <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.MACHINE}>{s.MACHINE}</td>
                <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.PROGRAM}>{s.PROGRAM}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: s.LAST_CALL_ET > 60 ? 'var(--warning)' : 'var(--text-dim)' }}>{s.LAST_CALL_ET}</td>
                <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={s.EVENT}>{s.EVENT}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 11 }} title={s.SQL_TEXT}>
                  {s.SQL_TEXT ? s.SQL_TEXT.slice(0, 80) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LocksTable({ locks, loading, error, note }) {
  if (loading) return <div className="pane-loading"><span className="spinner" />락 정보 로딩 중...</div>;
  if (error) return <div className="error-pane"><span className="error-pane-msg">{error}</span></div>;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {note && (
        <div style={{ padding: '8px 12px', background: 'rgba(234,179,8,0.12)', borderBottom: '1px solid rgba(234,179,8,0.3)', fontSize: 12, color: '#fbbf24' }}>
          {note}
        </div>
      )}
      {locks.length === 0 && !note ? (
        <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>락이 없습니다.</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              {['SID', 'Username', 'Lock Type', 'Object', 'Object Type', 'Mode', 'Request', 'Blocking'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locks.map((l, i) => {
              const isBlocking = l.BLOCK > 0;
              return (
                <tr key={`${l.SID}-${l.TYPE}-${l.ID1}-${l.ID2}-${i}`} style={{ background: isBlocking ? 'rgba(239,68,68,0.1)' : (i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent') }}>
                  <td style={tdStyle}><span style={{ color: 'var(--text-dim)' }}>{l.SID}</span></td>
                  <td style={tdStyle}><span style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>{l.USERNAME}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: l.TYPE === 'TX' ? 'rgba(234,179,8,0.2)' : 'rgba(99,102,241,0.2)', color: l.TYPE === 'TX' ? '#fbbf24' : '#818cf8' }}>
                      {l.TYPE}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.OBJECT_NAME}>{l.OBJECT_NAME}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 11 }}>{l.OBJECT_TYPE}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{LMODE_LABELS[l.LMODE] || l.LMODE}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: l.REQUEST > 0 ? 'var(--warning)' : 'var(--text-dim)' }}>{REQUEST_LABELS[l.REQUEST] || l.REQUEST}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {isBlocking ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 11 }}>BLOCKING</span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function SessionMonitor({ connectionId }) {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [locks, setLocks] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [locksLoading, setLocksLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [locksError, setLocksError] = useState('');
  const [sessionsNote, setSessionsNote] = useState('');
  const [locksNote, setLocksNote] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const intervalRef = useRef(null);

  const hasBlockingLocks = locks.some(l => l.BLOCK > 0);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true); setSessionsError('');
    try {
      const data = await api.getSessions(connectionId);
      setSessions(data.sessions || []);
      setSessionsNote(data.note || '');
    } catch (e) {
      setSessionsError(e.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [connectionId]);

  const fetchLocks = useCallback(async () => {
    setLocksLoading(true); setLocksError('');
    try {
      const data = await api.getLocks(connectionId);
      setLocks(data.locks || []);
      setLocksNote(data.note || '');
    } catch (e) {
      setLocksError(e.message);
    } finally {
      setLocksLoading(false);
    }
  }, [connectionId]);

  const refresh = useCallback(() => {
    fetchSessions();
    fetchLocks();
    setLastRefreshed(new Date());
  }, [fetchSessions, fetchLocks]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => refresh(), 10000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb header */}
      <div style={{
        padding: '5px 14px', background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 13 }}>📊</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>세션 / 락 모니터링</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefreshed && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              마지막 갱신: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            자동 갱신 (10초)
          </label>
          <button
            className="btn-secondary"
            style={{ padding: '2px 10px', fontSize: 11 }}
            onClick={refresh}
          >
            &#x21BB; 새로고침
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="inner-tabs" style={{ flexShrink: 0 }}>
        <div
          className={`inner-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          세션
          {sessions.length > 0 && (
            <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 8 }}>
              {sessions.length}
            </span>
          )}
        </div>
        <div
          className={`inner-tab ${activeTab === 'locks' ? 'active' : ''}`}
          onClick={() => setActiveTab('locks')}
        >
          락
          {hasBlockingLocks && (
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--danger)', padding: '1px 5px', borderRadius: 8 }}>
              락 있음
            </span>
          )}
          {!hasBlockingLocks && locks.length > 0 && (
            <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 8 }}>
              {locks.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'sessions' && (
          <SessionsTable
            sessions={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            note={sessionsNote}
          />
        )}
        {activeTab === 'locks' && (
          <LocksTable
            locks={locks}
            loading={locksLoading}
            error={locksError}
            note={locksNote}
          />
        )}
      </div>
    </div>
  );
}

const thStyle = {
  background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
  padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, userSelect: 'none', fontSize: 12,
};

const tdStyle = {
  padding: '3px 8px',
  borderBottom: '1px solid rgba(62,62,66,0.5)',
  borderRight: '1px solid rgba(62,62,66,0.3)',
};
