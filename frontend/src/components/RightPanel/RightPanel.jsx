import React, { useRef } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import TabBar from './TabBar.jsx';
import SqlEditor from '../SqlEditor/SqlEditor.jsx';
import TableDetail from '../ObjectDetail/TableDetail.jsx';
import SourceDetail from '../ObjectDetail/SourceDetail.jsx';
import SequenceDetail from '../ObjectDetail/SequenceDetail.jsx';
import ErdViewer from '../ObjectDetail/ErdViewer.jsx';
import SessionMonitor from '../ObjectDetail/SessionMonitor.jsx';

export default function RightPanel() {
  const { state } = useApp();
  const { tabs, activeTabId } = state;

  // Lazy-mount: only render a tab's content after it has been active at least once.
  // Once mounted it stays in the DOM (hidden) so its state is preserved on tab switch.
  const mountedRef = useRef(new Set());
  if (activeTabId) mountedRef.current.add(activeTabId);
  // Clean up IDs for closed tabs to avoid memory leak
  for (const id of mountedRef.current) {
    if (!tabs.find(t => t.id === id)) mountedRef.current.delete(id);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TabBar />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 52, opacity: 0.35 }}>🗄</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>SQLDev</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>
              왼쪽 패널에서 연결을 선택하고<br />
              오브젝트를 더블클릭하거나<br />
              <span style={{ color: 'var(--accent-bright)' }}>+</span> 버튼으로 SQL 에디터를 여세요
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              {[
                { icon: '⊢', label: 'SQL 에디터' },
                { icon: '▦', label: '테이블/뷰' },
                { icon: '{}', label: '프로시저/함수' },
              ].map(({ icon, label }) => (
                <div key={label} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                  <div style={{ fontSize: 18, marginBottom: 4, opacity: 0.6 }}>{icon}</div>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
        {tabs.map(tab => {
          if (!mountedRef.current.has(tab.id)) return null;
          return (
            <div
              key={tab.id}
              style={{ position: 'absolute', inset: 0, display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column' }}
            >
              <TabContent tab={tab} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabContent({ tab }) {
  if (tab.type === 'sql') return <SqlEditor tab={tab} />;
  if (tab.type === 'table') return <TableDetail tab={tab} />;
  if (tab.type === 'source') return <SourceDetail tab={tab} />;
  if (tab.type === 'sequence') return <SequenceDetail tab={tab} />;
  if (tab.type === 'erd') return <ErdViewer tab={tab} />;
  if (tab.type === 'monitor') return <SessionMonitor connectionId={tab.connectionId} />;
  return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Unknown tab type: {tab.type}</div>;
}
