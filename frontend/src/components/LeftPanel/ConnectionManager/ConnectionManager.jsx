import React, { useState } from 'react';
import { useApp } from '../../../store/AppContext.jsx';
import ConnectionItem from './ConnectionItem.jsx';
import ConnectionForm from './ConnectionForm.jsx';

export default function ConnectionManager() {
  const { state } = useApp();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div style={sectionHeader}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 1 }}>CONNECTIONS</span>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: 'none', color: 'var(--accent-bright)', fontSize: 16, padding: '0 2px' }}
          title="새 연결 추가"
        >+</button>
      </div>

      {state.connections.length === 0 ? (
        <div style={{ padding: '12px 10px', color: 'var(--text-dim)', fontSize: 11 }}>
          + 버튼으로 연결을 추가하세요
        </div>
      ) : (
        <div style={{ padding: '2px 4px' }}>
          {state.connections.map(c => <ConnectionItem key={c.id} conn={c} />)}
        </div>
      )}

      {showForm && <ConnectionForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

const sectionHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '6px 10px', borderBottom: '1px solid var(--border)',
};
