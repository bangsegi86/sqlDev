import React, { useState } from 'react';
import ColumnsTab from './ColumnsTab.jsx';
import DataTab from './DataTab.jsx';
import DdlTab from './DdlTab.jsx';
import ReferencesTab from './ReferencesTab.jsx';
import SqlGenTab from './SqlGenTab.jsx';
import IndexesTab from './IndexesTab.jsx';
import { useApp } from '../../store/AppContext.jsx';

const TABS_TABLE = ['columns', 'indexes', 'data', 'ddl', 'references', 'sqlgen'];
const TABS_VIEW  = ['columns', 'data', 'ddl'];
const TABS_MATVIEW = ['columns', 'data', 'ddl'];
const TAB_LABELS = { columns: '컬럼', indexes: '인덱스', data: '데이터', ddl: 'DDL', references: '참조', sqlgen: 'SQL 생성' };
const TYPE_ICON  = { TABLE: '▦', VIEW: '◫', 'MATERIALIZED VIEW': '◫', SYNONYM: '≡' };

export default function TableDetail({ tab }) {
  const { dispatch } = useApp();
  const { schema, objectType, name } = tab.content;
  const [activeTab, setActiveTab] = useState(tab.content.activeTab || 'columns');
  const tabList = objectType === 'VIEW' || objectType === 'MATERIALIZED VIEW' ? TABS_MATVIEW : TABS_TABLE;

  function switchTab(t) {
    setActiveTab(t);
    dispatch({ type: 'UPDATE_TAB_CONTENT', payload: { tabId: tab.id, content: { activeTab: t } } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb header */}
      <div style={{
        padding: '5px 14px', background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{TYPE_ICON[objectType] || '▦'}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: 0.3 }}>{objectType}</span>
        <span style={{ color: 'var(--border-light)', fontSize: 12 }}>›</span>
        <span style={{ color: 'var(--accent-bright)', fontSize: 12 }}>{schema}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>.</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{name}</span>
      </div>

      <div className="inner-tabs">
        {tabList.map(t => (
          <div key={t} className={`inner-tab ${activeTab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'columns' && <ColumnsTab connectionId={tab.connectionId} schema={schema} tableName={name} objectType={objectType} />}
        {activeTab === 'indexes' && <IndexesTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
        {activeTab === 'data' && <DataTab connectionId={tab.connectionId} schema={schema} tableName={name} objectType={objectType} />}
        {activeTab === 'ddl' && <DdlTab connectionId={tab.connectionId} schema={schema} name={name} objectType={objectType} />}
        {activeTab === 'references' && <ReferencesTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
        {activeTab === 'sqlgen' && <SqlGenTab connectionId={tab.connectionId} schema={schema} tableName={name} />}
      </div>
    </div>
  );
}
