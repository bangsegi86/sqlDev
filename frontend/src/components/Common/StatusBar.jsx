import React from 'react';
import { useApp } from '../../store/AppContext.jsx';

export default function StatusBar() {
  const { state } = useApp();
  const activeConn = state.connections.find(c => c.id === state.activeConnectionId);
  const isConnected = activeConn && state.connectionStatuses[activeConn.id] === 'connected';

  return (
    <div style={{
      background: '#007acc', color: '#fff', padding: '2px 12px',
      fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0,
    }}>
      {activeConn ? (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: isConnected ? '#90ee90' : '#ffcc00', fontSize: 10 }}>●</span>
            {activeConn.name}
          </span>
          {state.selectedSchema && (
            <span>Schema: {state.selectedSchema.schemaName}</span>
          )}
        </>
      ) : (
        <span>Not connected</span>
      )}
      {state.statusMessage && (
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.8)' }}>{state.statusMessage}</span>
      )}
    </div>
  );
}
