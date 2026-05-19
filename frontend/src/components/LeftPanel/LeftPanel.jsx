import React from 'react';
import ConnectionManager from './ConnectionManager/ConnectionManager.jsx';
import ObjectExplorer from './ObjectExplorer/ObjectExplorer.jsx';
import { useApp } from '../../store/AppContext.jsx';

export default function LeftPanel({ width }) {
  const { state } = useApp();
  const isConnected = state.activeConnectionId && state.connectionStatuses[state.activeConnectionId] === 'connected';

  return (
    <div style={{
      width, flexShrink: 0, background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <ConnectionManager />
      {isConnected && (
        <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--border)' }}>
          <ObjectExplorer />
        </div>
      )}
    </div>
  );
}
