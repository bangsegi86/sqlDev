import React, { useRef, useState } from 'react';
import { AppProvider, useApp, openTab } from './store/AppContext.jsx';
import LeftPanel from './components/LeftPanel/LeftPanel.jsx';
import RightPanel from './components/RightPanel/RightPanel.jsx';
import StatusBar from './components/Common/StatusBar.jsx';
import SettingsModal from './components/Settings/SettingsModal.jsx';
import ShortcutsModal from './components/Common/ShortcutsModal.jsx';

function Layout() {
  const { state } = useApp();
  const { leftCollapsed } = state;
  const [leftWidth, setLeftWidth] = useState(240);
  const isDragging = useRef(false);

  function onDividerMouseDown(e) {
    e.preventDefault();
    isDragging.current = true;
    function onMove(ev) {
      if (!isDragging.current) return;
      setLeftWidth(Math.max(160, Math.min(500, ev.clientX)));
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!leftCollapsed && <LeftPanel width={leftWidth} />}
        {!leftCollapsed && (
          <div
            style={{ width: 4, background: 'var(--border)', cursor: 'col-resize', flexShrink: 0 }}
            onMouseDown={onDividerMouseDown}
          />
        )}
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

function Header() {
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { state, dispatch } = useApp();
  const isConnected = state.activeConnectionId && state.connectionStatuses[state.activeConnectionId] === 'connected';

  function openMonitor() {
    if (!state.activeConnectionId) return;
    openTab(dispatch, state, {
      id: `monitor-${state.activeConnectionId}`,
      type: 'monitor',
      title: '세션/락 모니터링',
      connectionId: state.activeConnectionId,
      content: {},
    });
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-header)', borderBottom: '1px solid var(--border)',
        padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>🗄</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: 0.5 }}>SQLDev</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Oracle Database Manager</span>
        {isConnected && (
          <button
            onClick={openMonitor}
            style={{ marginLeft: 'auto', background: 'none', color: 'var(--text-secondary)', padding: '4px 8px', fontSize: 11, border: 'none', cursor: 'pointer' }}
            title="세션/락 모니터링"
          >&#128202; 모니터링</button>
        )}
        <button
          onClick={() => setShowShortcuts(true)}
          style={{ marginLeft: isConnected ? 0 : 'auto', background: 'none', color: 'var(--text-secondary)', padding: '4px 8px', fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
          title="키보드 단축키"
        >?</button>
        <button
          onClick={() => setShowSettings(true)}
          style={{ background: 'none', color: 'var(--text-secondary)', padding: '4px 8px', fontSize: 16, border: 'none', cursor: 'pointer' }}
          title="설정"
        >⚙</button>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
