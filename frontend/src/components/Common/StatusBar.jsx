import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';

function DbTypeIcon({ dbType }) {
  if (!dbType) return <span style={{ fontSize: 11 }}>🗄</span>;
  if (dbType === 'postgresql') return <span title="PostgreSQL" style={{ fontSize: 11 }}>🐘</span>;
  return <span title="Oracle" style={{ fontSize: 11 }}>🔶</span>;
}

export default function StatusBar() {
  const { state } = useApp();
  const activeConn = state.connections.find(c => c.id === state.activeConnectionId);
  const connStatus  = activeConn ? state.connectionStatuses[activeConn.id] : null;
  const isConnected   = connStatus === 'connected';
  const isConnecting  = connStatus === 'connecting';

  // Fade animation on status message change
  const [visibleMsg, setVisibleMsg] = useState(state.statusMessage);
  const [msgKey, setMsgKey] = useState(0);
  const prevRef = useRef(state.statusMessage);
  useEffect(() => {
    if (state.statusMessage !== prevRef.current) {
      prevRef.current = state.statusMessage;
      setVisibleMsg(state.statusMessage);
      setMsgKey(k => k + 1);
    }
  }, [state.statusMessage]);

  const tabCount = state.tabs.length;

  const dotColor = isConnecting ? 'var(--warning)' : isConnected ? '#6be06b' : 'rgba(255,255,255,0.3)';
  const dotTitle = isConnecting ? '연결 중...' : isConnected ? '연결됨' : '연결 안됨';

  return (
    <div style={{
      background: '#007acc',
      color: '#fff',
      fontSize: 11,
      display: 'flex',
      alignItems: 'center',
      height: 22,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* ── Left: connection info ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, height: '100%' }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 12px', height: '100%',
          background: isConnected ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.12)',
          borderRight: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span
            style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: isConnected ? '0 0 4px rgba(107,224,107,0.6)' : 'none' }}
            title={dotTitle}
          />
          {activeConn ? (
            <>
              <DbTypeIcon dbType={activeConn.type} />
              <span style={{ fontWeight: 600 }}>{activeConn.name}</span>
              {activeConn.host && (
                <span style={{ opacity: 0.7 }}>({activeConn.host})</span>
              )}
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>연결 없음</span>
          )}
        </span>

        {state.selectedSchema && (
          <span style={{
            padding: '0 12px', height: '100%',
            display: 'flex', alignItems: 'center', gap: 4,
            borderRight: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.1)',
          }}>
            <span style={{ opacity: 0.7 }}>스키마</span>
            <span style={{ fontWeight: 600 }}>{state.selectedSchema.schemaName}</span>
          </span>
        )}

        {tabCount > 0 && (
          <span style={{
            padding: '0 10px', height: '100%',
            display: 'flex', alignItems: 'center', gap: 4,
            borderRight: '1px solid rgba(255,255,255,0.15)',
            opacity: 0.75,
          }}>
            탭 {tabCount}
          </span>
        )}
      </div>

      {/* ── Right: status message ── */}
      {visibleMsg && (
        <span
          key={msgKey}
          className="status-msg"
          style={{ marginLeft: 'auto', padding: '0 14px', opacity: 0.9, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {visibleMsg}
        </span>
      )}
    </div>
  );
}
