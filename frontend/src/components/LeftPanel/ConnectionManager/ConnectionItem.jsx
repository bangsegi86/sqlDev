import React, { useState } from 'react';
import { useApp } from '../../../store/AppContext.jsx';
import { api } from '../../../api/client.js';
import ConnectionForm from './ConnectionForm.jsx';

export default function ConnectionItem({ conn }) {
  const { state, dispatch } = useApp();
  const status = state.connectionStatuses[conn.id];
  const isConnected = status === 'connected';
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
      dispatch({ type: 'SET_STATUS', payload: `Connected to ${conn.name}` });
    } catch (e) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'disconnected' } });
      dispatch({ type: 'SET_STATUS', payload: `Failed: ${e.message}` });
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
      dispatch({ type: 'SET_STATUS', payload: `Disconnected from ${conn.name}` });
    } catch (e) { dispatch({ type: 'SET_STATUS', payload: e.message }); }
    setShowMenu(false);
  }

  async function handleReconnect() {
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connecting' } });
    try {
      await api.reconnect(conn.id);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'connected' } });
      dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id });
      dispatch({ type: 'SET_STATUS', payload: `Reconnected to ${conn.name}` });
    } catch (e) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { id: conn.id, status: 'disconnected' } });
      dispatch({ type: 'SET_STATUS', payload: `Reconnect failed: ${e.message}` });
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

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          cursor: 'pointer', background: isActive ? 'var(--bg-selected)' : 'transparent',
          borderRadius: 3, position: 'relative',
        }}
        onClick={() => {
          dispatch({ type: 'SET_ACTIVE_CONNECTION', payload: conn.id });
          if (!isConnected) handleConnect();
        }}
        onContextMenu={e => { e.preventDefault(); setShowMenu(s => !s); }}
      >
        <span style={{ color: dotColor, fontSize: 10, flexShrink: 0 }}>
          {isConnecting ? '◌' : '●'}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
          {conn.name}
        </span>
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(s => !s); }}
          style={{ background: 'none', color: 'var(--text-secondary)', padding: '0 3px', fontSize: 14 }}
        >⋮</button>

        {showMenu && (
          <div style={menuStyle} onMouseLeave={() => setShowMenu(false)}>
            {isConnected ? (
              <>
                <MenuItem onClick={handleReconnect}>재연결</MenuItem>
                <MenuItem onClick={handleDisconnect}>연결 해제</MenuItem>
              </>
            ) : (
              <MenuItem onClick={() => { handleConnect(); setShowMenu(false); }}>연결</MenuItem>
            )}
            <MenuItem onClick={() => { setEditing(true); setShowMenu(false); }}>편집</MenuItem>
            <MenuItem danger onClick={handleDelete}>삭제</MenuItem>
          </div>
        )}
      </div>
      {editing && <ConnectionForm editing={conn} onClose={() => setEditing(false)} />}
    </>
  );
}

function MenuItem({ onClick, danger, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 12px', cursor: 'pointer', fontSize: 12,
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</div>
  );
}

const menuStyle = {
  position: 'absolute', right: 0, top: '100%', zIndex: 100,
  background: 'var(--bg-panel)', border: '1px solid var(--border)',
  borderRadius: 4, minWidth: 120, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
};
