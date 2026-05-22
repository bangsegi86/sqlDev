import React, { useState } from 'react';
import ColumnsTab from './ColumnsTab.jsx';
import DataTab from './DataTab.jsx';
import DdlTab from './DdlTab.jsx';
import ReferencesTab from './ReferencesTab.jsx';
import SqlGenTab from './SqlGenTab.jsx';
import { useApp } from '../../store/AppContext.jsx';

const TABS_TABLE = ['columns', 'data', 'ddl', 'references', 'sqlgen'];
const TABS_VIEW = ['columns', 'data', 'ddl'];
const TAB_LABELS = { columns: 'Columns', data: 'Data', ddl: 'DDL', references: 'References', sqlgen: 'SQL 생성' };

export default function TableDetail({ tab }) {
  const { dispatch } = useApp();
  const { schema, objectType, name } = tab.content;
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || 'columns');
  const tabs = objectType === 'VIEW' ? TABS_VIEW : TABS_TABLE;

  function switchTab(t) {
    setActiveTab(t);
    dispatch({ type: 'UPDATE_TAB_CONTENT', payload: { tabId: tab.id, content: { activeTab: t } } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{objectType}</span>
        <span style={{ margin: '0 6px', color: 'var(--text-dim)' }}>›</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{schema}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-dim)' }}>.</span>
        <span style={{ fontWeight: 700 }}>{name}</span>
      </div>

      <div className="inner-tabs">
        {tabs.map(t => (
          <div key={t} className={`inner-tab ${activeTab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'columns' && <ColumnsTab connectionId={tab.connectionId} schema={schema} tableName={name} objectType={objectType} />}
        {activeTab === 'data' && <DataTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
        {activeTab === 'ddl' && <DdlTab connectionId={tab.connectionId} schema={schema} name={name} objectType={objectType} />}
        {activeTab === 'references' && <ReferencesTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
        {activeTab === 'sqlgen' && <SqlGenTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
      </div>
    </div>
  );
}
