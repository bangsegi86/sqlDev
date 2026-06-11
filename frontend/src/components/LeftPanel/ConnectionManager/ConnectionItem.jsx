import React, { useState } from 'react';
import { useApp } from '../../../store/AppContext.jsx';
import { api } from '../../../api/client.js';
import ConnectionForm from './ConnectionForm.jsx';

const DB_ICON = { oracle: '🔶', postgresql: '🐘', postgres: '🐘' };

export default function ConnectionItem({ conn }) {
  const { state, dispatch } = useApp();
  const status = state.connectionStatuses[conn.id];
  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const isActive = state.activeConnectionId === conn.id;
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleConnect() {
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connecting' } });
    try {
      await api.connect(conn.id);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connected' } });
      dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id });
      dispatch({ type: 'SET_STATUS', payload: `${conn.name} 연결됨` });
    } catch (e) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'disconnected' } });
      dispatch({ type: 'SET_STATUS', payload: `연결 실패: ${e.message}` });
    }
  }

  async function handleDisconnect() {
    try {
      await api.disconnect(conn.id);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'disconnected' } });
      if (state.activeConnectionId === conn.id) {
        dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: null });
        dispatch({ type: 'SET_SELECTED_SCHEMA', payload: null });
      }
      dispatch({ type: 'SET_STATUS', payload: `${conn.name} 연결 해제됨` });
    } catch (e) { dispatch({ type: 'SET_STATUS', payload: e.message }); }
    setShowMenu(false);
  }

  async function handleReconnect() {
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connecting' } });
    try {
      await api.reconnect(conn.id);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connected' } });
      dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id });
      dispatch({ type: 'SET_STATUS', payload: `${conn.name} 재연결됨` });
    } catch (e) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'disconnected' } });
      dispatch({ type: 'SET_STATUS', payload: `재연결 실패: ${e.message}` });
    }
    setShowMenu(false);
  }

  async function handleDelete() {
    if (!confirm(`'${conn.name}' 연결을 삭제하시겠습니까?`)) return;
    if (isConnected) await api.disconnect(conn.id).catch(() => {});
    await api.deleteConnection(conn.id);
    dispatch({ type: 'REMOVE_CONNECTION', payload: conn.id });
    setShowMenu(false);
  }

  const dotColor = isConnecting ? 'var(--warning)' : isConnected ? 'var(--success)' : '#555';
  const dbIcon   = DB_ICON[conn.type?.toLowerCase()] || '🗄';

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          cursor: 'pointer', borderRadius: 3, position: 'relative',
          background: isActive ? 'var(--bg-selected)' : 'transparent',
          transition: 'background var(--t)',
        }}
        onClick={() => { dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id }); if (!isConnected) handleConnect(); }}
        onContextMenu={e => { e.preventDefault(); setShowMenu(s => !s); }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Status dot */}
        <span
          title={isConnecting ? '연결 중...' : isConnected ? '연결됨' : '연결 안됨'}
          style={{
            width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0,
            boxShadow: isConnected ? '0 0 4px rgba(76,175,80,0.7)' : isConnecting ? '0 0 4px rgba(255,204,0,0.5)' : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
          }}
        />
        {/* DB type icon */}
        <span style={{ fontSize: 11, flexShrink: 0, lineHeight: 1 }}>{dbIcon}</span>
        {/* Environment color dot */}
        {conn.color && (
          <span
            title="환경 색상"
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: conn.color, flexShrink: 0, display: 'inline-block',
            }}
          />
        )}
        {/* Name */}
        <span title={conn.name} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
          {conn.name}
        </span>
        {/* Connecting spinner */}
        {isConnecting && <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2, flexShrink: 0 }} />}
        {/* Menu toggle */}
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(s => !s); }}
          style={{ background: 'none', color: 'var(--text-dim)', padding: '0 3px', fontSize: 16, lineHeight: 1 }}
          title="메뉴"
        >⋮</button>

        {showMenu && (
          <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 200, minWidth: 130 }} onMouseLeave={() => setShowMenu(false)}>
            {isConnected ? (
              <>
                <div className="ctx-menu-item" onClick={handleReconnect}>🔄 재연결</div>
                <div className="ctx-menu-item" onClick={handleDisconnect}>⏏ 연결 해제</div>
              </>
            ) : (
              <div className="ctx-menu-item" onClick={() => { handleConnect(); setShowMenu(false); }}>▶ 연결</div>
            )}
            <div className="ctx-menu-sep" />
            <div className="ctx-menu-item" onClick={() => { setEditing(true); setShowMenu(false); }}>✏ 편집</div>
            <div className="ctx-menu-item danger" onClick={handleDelete}>🗑 삭제</div>
          </div>
        )}
      </div>
      {editing && <ConnectionForm editing={conn} onClose={() => setEditing(false)} />}
    </>
  );
}
