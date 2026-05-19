import React from 'react';
import { useApp } from '../../store/AppContext.jsx';
import TabBar from './TabBar.jsx';
import SqlEditor from '../SqlEditor/SqlEditor.jsx';
import TableDetail from '../ObjectDetail/TableDetail.jsx';
import SourceDetail from '../ObjectDetail/SourceDetail.jsx';
import SequenceDetail from '../ObjectDetail/SequenceDetail.jsx';

export default function RightPanel() {
  const { state } = useApp();
  const { tabs, activeTabId } = state;
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TabBar />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 48 }}>🗄</div>
            <div style={{ fontSize: 14 }}>연결을 선택하고 오브젝트를 클릭하거나 + 버튼으로 SQL 에디터를 여세요</div>
          </div>
        )}
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{ position: 'absolute', inset: 0, display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column' }}
          >
            <TabContent tab={tab} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabContent({ tab }) {
  if (tab.type === 'sql') return <SqlEditor tab={tab} />;
  if (tab.type === 'table') return <TableDetail tab={tab} />;
  if (tab.type === 'source') return <SourceDetail tab={tab} />;
  if (tab.type === 'sequence') return <SequenceDetail tab={tab} />;
  return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Unknown tab type: {tab.type}</div>;
}
