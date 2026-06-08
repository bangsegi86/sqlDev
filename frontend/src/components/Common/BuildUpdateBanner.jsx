import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp } from '../../store/AppContext.jsx';

const POLL_INTERVAL = 30_000; // 30 seconds

export default function BuildUpdateBanner() {
  const { state } = useApp();
  const [visible, setVisible] = useState(false);
  const baselineRef = useRef(null);

  useEffect(() => {
    let timer;

    async function checkVersion() {
      try {
        const { version } = await api.getBuildVersion();
        if (baselineRef.current === null) {
          baselineRef.current = version;
        } else if (version !== 0 && version !== baselineRef.current) {
          setVisible(true);
        }
      } catch { /* network error — ignore */ }
      timer = setTimeout(checkVersion, POLL_INTERVAL);
    }

    checkVersion();
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  function handleRefresh() {
    const sqlTabs = state.tabs.filter(t => t.type === 'sql');
    if (sqlTabs.length > 0) {
      const session = {
        savedAt: Date.now(),
        activeTabId: state.activeTabId,
        tabs: sqlTabs.map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          connectionId: t.connectionId,
          content: { sql: t.content?.sql || '' },
        })),
      };
      localStorage.setItem('sqldev.session', JSON.stringify(session));
    }
    window.location.reload();
  }

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'var(--bg-panel)', border: '1px solid var(--accent)',
      borderRadius: 8, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      fontSize: 13, color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--accent-bright)' }}>⚡</span>
      <span>새 버전이 빌드되었습니다.</span>
      <button
        className="btn-primary"
        style={{ padding: '3px 12px', fontSize: 12 }}
        onClick={handleRefresh}
      >
        저장 후 새로고침
      </button>
      <button
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
        title="닫기"
        onClick={() => setVisible(false)}
      >✕</button>
    </div>
  );
}
