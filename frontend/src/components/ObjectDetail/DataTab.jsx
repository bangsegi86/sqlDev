import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import DataGrid from '../Common/DataGrid.jsx';

export default function DataTab({ connectionId, schema, tableName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('ASC');
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    api.getTableData(connectionId, schema, tableName, {
      page, limit, orderBy: sortCol, orderDir: sortDir,
      filter: filter || undefined,
    })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName, page, limit, sortCol, sortDir, filter]);

  useEffect(() => { load(); }, [load]);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortCol(col); setSortDir('ASC'); }
    setPage(1);
  }

  function applyFilter() {
    setFilter(filterInput.trim());
    setPage(1);
  }

  function clearFilter() {
    setFilterInput('');
    setFilter('');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={load} style={{ padding: '2px 8px', flexShrink: 0 }}>↻ 새로고침</button>
        <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 200 }}>
          <input
            type="text"
            value={filterInput}
            onChange={e => setFilterInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilter()}
            placeholder="WHERE 조건 (예: STATUS = 'Y' AND NAME LIKE '%test%')"
            style={{
              flex: 1, padding: '2px 7px', fontSize: 11,
              background: 'var(--input-bg)', border: `1px solid ${filter ? 'var(--accent)' : 'var(--border)'}`,
              color: 'var(--text-primary)', borderRadius: 3, outline: 'none',
            }}
          />
          <button className="btn-secondary" onClick={applyFilter} style={{ padding: '2px 8px', flexShrink: 0 }}>필터</button>
          {filter && (
            <button className="btn-secondary" onClick={clearFilter} style={{ padding: '2px 6px', flexShrink: 0, color: 'var(--danger)' }}>✕</button>
          )}
        </div>
        {data && <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>총 {data.total.toLocaleString()}행</span>}
        {loading && <span className="spinner" />}
      </div>

      {error && <div style={{ padding: 8, color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

      {data && (
        <DataGrid
          key={`${schema}.${tableName}`}
          columns={data.columns}
          rows={data.rows}
          onSort={handleSort}
          sortColumn={sortCol}
          sortDir={sortDir}
          rowOffset={(page - 1) * limit}
        />
      )}

      {data && totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderTop: '1px solid var(--border)', alignItems: 'center', fontSize: 12, background: 'var(--bg-panel)', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '2px 6px' }}>«</button>
          <button className="btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1} style={{ padding: '2px 6px' }}>‹</button>
          <span style={{ color: 'var(--text-secondary)' }}>Page {page} / {totalPages}</span>
          <button className="btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={{ padding: '2px 6px' }}>›</button>
          <button className="btn-secondary" onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '2px 6px' }}>»</button>
        </div>
      )}
    </div>
  );
}
