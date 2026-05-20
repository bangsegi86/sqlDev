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

  const load = useCallback(() => {
    setLoading(true); setError('');
    api.getTableData(connectionId, schema, tableName, { page, limit, orderBy: sortCol, orderDir: sortDir })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName, page, limit, sortCol, sortDir]);

  useEffect(() => { load(); }, [load]);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortCol(col); setSortDir('ASC'); }
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
        <button className="btn-secondary" onClick={load} style={{ padding: '2px 8px' }}>↻ 새로고침</button>
        {data && <span style={{ color: 'var(--text-secondary)' }}>총 {data.total.toLocaleString()}행</span>}
        {loading && <span className="spinner" />}
      </div>

      {error && <div style={{ padding: 8, color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

      {data && (
        <DataGrid
          columns={data.columns}
          rows={data.rows}
          onSort={handleSort}
          sortColumn={sortCol}
          sortDir={sortDir}
          rowOffset={(page - 1) * limit}
        />
      )}

      {data && totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderTop: '1px solid var(--border)', alignItems: 'center', fontSize: 12, background: 'var(--bg-panel)' }}>
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
