import React, { useRef, useState } from 'react';
import { AppProvider, useApp } from './store/AppContext.jsx';
import LeftPanel from './components/LeftPanel/LeftPanel.jsx';
import RightPanel from './components/RightPanel/RightPanel.jsx';
import StatusBar from './components/Common/StatusBar.jsx';
import SettingsModal from './components/Settings/SettingsModal.jsx';

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
        <LeftPanel width={leftWidth} hidden={leftCollapsed} />
        <div
          style={{ width: 4, background: 'var(--border)', cursor: 'col-resize', flexShrink: 0, display: leftCollapsed ? 'none' : undefined }}
          onMouseDown={onDividerMouseDown}
        />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

function Header() {
  const [showSettings, setShowSettings] = useState(false);
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
        <button
          onClick={() => setShowSettings(true)}
          style={{ marginLeft: 'auto', background: 'none', color: 'var(--text-secondary)', padding: '4px 8px', fontSize: 16, border: 'none', cursor: 'pointer' }}
          title="설정"
        >⚙</button>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
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
