import React, { useRef, useState } from 'react';
import { AppProvider } from './store/AppContext.jsx';
import LeftPanel from './components/LeftPanel/LeftPanel.jsx';
import RightPanel from './components/RightPanel/RightPanel.jsx';
import StatusBar from './components/Common/StatusBar.jsx';

function Layout() {
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
        <LeftPanel width={leftWidth} />
        <div
          style={{ width: 4, background: 'var(--border)', cursor: 'col-resize', flexShrink: 0 }}
          onMouseDown={onDividerMouseDown}
        />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

function Header() {
  return (
    <div style={{
      background: 'var(--bg-header)', borderBottom: '1px solid var(--border)',
      padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', gap: 8,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 16 }}>🗄</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: 0.5 }}>SQLDev</span>
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Oracle Database Manager</span>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
