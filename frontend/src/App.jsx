import React, { useRef, useState, useEffect } from 'react';
import { AppProvider, useApp, openTab } from './store/AppContext.jsx';
import LeftPanel from './components/LeftPanel/LeftPanel.jsx';
import RightPanel from './components/RightPanel/RightPanel.jsx';
import StatusBar from './components/Common/StatusBar.jsx';
import SettingsModal from './components/Settings/SettingsModal.jsx';
import BuildUpdateBanner from './components/Common/BuildUpdateBanner.jsx';
import ShortcutsModal from './components/Common/ShortcutsModal.jsx';
import GlobalSearch from './components/Common/GlobalSearch.jsx';

function Layout() {
  const { state, dispatch } = useApp();
  const { leftCollapsed, tabs } = state;
  const [leftWidth, setLeftWidth] = useState(240);
  const [showSearch, setShowSearch] = useState(false);
  const isDragging = useRef(false);

  // Track last closed tabs for Ctrl+Shift+T (reopen)
  const closedTabsRef = useRef([]);
  const prevTabsRef = useRef(tabs);

  useEffect(() => {
    const prev = prevTabsRef.current;
    if (prev.length > tabs.length) {
      // Find which tabs were removed
      const removed = prev.filter(pt => !tabs.find(t => t.id === pt.id));
      removed.forEach(tab => {
        closedTabsRef.current = [tab, ...closedTabsRef.current].slice(0, 5);
      });
    }
    prevTabsRef.current = tabs;
  }, [tabs]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      // Ctrl+P / Cmd+P — global search
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setShowSearch(s => !s);
        return;
      }
      // Escape — close search
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        return;
      }
      // Ctrl+Shift+T — reopen last closed tab
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        const last = closedTabsRef.current[0];
        if (last) {
          closedTabsRef.current = closedTabsRef.current.slice(1);
          openTab(dispatch, state, last);
        }
        return;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch, state, showSearch]);

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
      <BuildUpdateBanner />
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
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
        padding: '0 12px', height: 38, display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        {/* Left panel toggle */}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_LEFT_PANEL' })}
          title="패널 접기/펼치기"
          style={{ background: 'none', color: 'var(--text-secondary)', padding: '3px 6px', fontSize: 15, border: 'none', cursor: 'pointer', lineHeight: 1 }}
        >☰</button>
        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ fontSize: 15 }}>🗄</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: 0.4 }}>SQLDev</span>
        <span style={{ color: 'var(--border-light)', fontSize: 12 }}>|</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Oracle · PostgreSQL Database Manager</span>
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
