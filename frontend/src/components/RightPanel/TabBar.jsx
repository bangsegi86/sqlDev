import React, { useRef } from 'react';
import { useApp, openTab } from '../../store/AppContext.jsx';

const TYPE_ICONS = { sql: '⊢', table: '▦', source: '{}', sequence: '∞', synonym: '≡' };

export default function TabBar() {
  const { state, dispatch } = useApp();
  const { tabs, activeTabId, activeConnectionId } = state;

  function addSqlTab() {
    const id = `sql-${Date.now()}`;
    openTab(dispatch, state, {
      id,
      type: 'sql',
      title: 'SQL Editor',
      connectionId: activeConnectionId,
      content: { sql: '' },
    });
  }

  return (
    <div style={{ display: 'flex', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
        {tabs.map(tab => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onActivate={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
            onClose={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', payload: tab.id }); }}
          />
        ))}
      </div>
      <button
        onClick={addSqlTab}
        title="새 SQL 에디터"
        style={{ padding: '0 10px', background: 'none', color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0, borderLeft: '1px solid var(--border)' }}
      >+</button>
    </div>
  );
}

function Tab({ tab, active, onActivate, onClose }) {
  return (
    <div
      onClick={onActivate}
      onAuxClick={e => e.button === 1 && onClose(e)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', cursor: 'pointer', flexShrink: 0,
        background: active ? 'var(--bg-tab-active)' : 'var(--bg-tab-inactive)',
        borderRight: '1px solid var(--border)',
        borderTop: active ? '2px solid var(--accent-bright)' : '2px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 12, maxWidth: 180,
      }}
    >
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{TYPE_ICONS[tab.type] || '○'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
      >×</button>
    </div>
  );
}
