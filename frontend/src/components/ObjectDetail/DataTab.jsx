import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import DataGrid from '../Common/DataGrid.jsx';

export default function DataTab({ connectionId, schema, tableName, objectType }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('ASC');
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');

  // PK columns for WHERE clause in UPDATE
  const [pkColumns, setPkColumns] = useState([]);

  const isTable = objectType === 'TABLE';

  // Load PK columns when viewing a TABLE
  useEffect(() => {
    if (!isTable) return;
    api.getColumns(connectionId, schema, tableName)
      .then(cols => {
        const pks = cols.filter(c => c.IS_PK).map(c => c.COLUMN_NAME);
        setPkColumns(pks);
      })
      .catch(() => setPkColumns([]));
  }, [connectionId, schema, tableName, isTable]);

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

  // Build inline-edit props only for TABLEs with PK columns
  const editableColumns = isTable && pkColumns.length > 0 && data
    ? new Set(data.columns.filter(c => !pkColumns.includes(c)))
    : new Set();

  async function handleCellEdit(rowIdx, col, oldVal, newVal) {
    if (!data) return;
    const row = data.rows[rowIdx];

    // Build bind variables: :newVal plus one per PK column
    const binds = { newVal: newVal === '' ? null : newVal };
    const whereParts = pkColumns.map(pk => {
      const bindName = `pk_${pk}`;
      binds[bindName] = row[pk];
      return `"${pk}" = :${bindName}`;
    });

    const sql = `UPDATE "${schema}"."${tableName}" SET "${col}" = :newVal WHERE ${whereParts.join(' AND ')}`;

    const confirmed = window.confirm(`다음 SQL을 실행하시겠습니까?\n\n${sql}`);
    if (!confirmed) return;

    try {
      await api.executeDml(connectionId, sql, binds);
      // Update local row state to reflect the change
      setData(prev => {
        if (!prev) return prev;
        const newRows = prev.rows.map((r, i) => {
          if (i !== rowIdx) return r;
          return { ...r, [col]: newVal === '' ? null : newVal };
        });
        return { ...prev, rows: newRows };
      });
    } catch (e) {
      alert(`오류: ${e.message}`);
    }
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
        {isTable && pkColumns.length > 0 && (
          <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>셀 더블클릭으로 편집</span>
        )}
        {loading && <span className="spinner" />}
      </div>

      {error && (
        <div className="error-pane">
          <span className="error-pane-msg">{error}</span>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={load}>↻ 재시도</button>
        </div>
      )}

      {data && (
        <DataGrid
          key={`${schema}.${tableName}`}
          columns={data.columns}
          rows={data.rows}
          onSort={handleSort}
          sortColumn={sortCol}
          sortDir={sortDir}
          rowOffset={(page - 1) * limit}
          editableColumns={editableColumns}
          primaryKeyColumns={pkColumns}
          onCellEdit={handleCellEdit}
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
