import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../api/client.js';
import DataGrid from '../Common/DataGrid.jsx';

// txStatus: 'idle' | 'executing' | 'pending_commit' | 'committing' | 'rolling_back'

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

  const [pkColumns, setPkColumns] = useState([]);
  const [editMode, setEditMode] = useState(false);

  // Staged changes: { key: `${rowIdx}::${col}`, rowIdx, col, oldVal, newVal, sql, binds }
  const [pendingChanges, setPendingChanges] = useState([]);

  // Active transaction
  const [txId, setTxId] = useState(null);
  const [txStatus, setTxStatus] = useState('idle'); // idle | executing | pending_commit | committing | rolling_back
  const [txResults, setTxResults] = useState([]); // { sql, rowsAffected?, error? }

  const isTable = objectType === 'TABLE';
  const hasPk = pkColumns.length > 0;
  const canEdit = isTable && hasPk;

  useEffect(() => {
    if (!isTable) return;
    api.getColumns(connectionId, schema, tableName)
      .then(cols => setPkColumns(cols.filter(c => c.IS_PK).map(c => c.COLUMN_NAME)))
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

  // Reset edit state when table/connection changes
  useEffect(() => {
    setEditMode(false);
    setPendingChanges([]);
    setTxId(null);
    setTxStatus('idle');
    setTxResults([]);
  }, [connectionId, schema, tableName]);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortCol(col); setSortDir('ASC'); }
    setPage(1);
  }

  function applyFilter() { setFilter(filterInput.trim()); setPage(1); }
  function clearFilter() { setFilterInput(''); setFilter(''); setPage(1); }

  // Called by DataGrid on double-click edit commit — stages the change instead of executing
  function handleCellEdit(rowIdx, col, oldVal, newVal) {
    if (!data) return;
    if (newVal === oldVal || (newVal === '' && oldVal == null)) return;
    const row = data.rows[rowIdx];
    const binds = { newVal: newVal === '' ? null : newVal };
    const whereParts = pkColumns.map(pk => {
      const bk = `pk_${pk}`;
      binds[bk] = row[pk];
      return `"${pk}" = :${bk}`;
    });
    const sql = `UPDATE "${schema}"."${tableName}" SET "${col}" = :newVal WHERE ${whereParts.join(' AND ')}`;
    const changeKey = `${rowIdx}::${col}`;

    setPendingChanges(prev => {
      const without = prev.filter(c => c.key !== changeKey);
      // If value reverted to original, just remove
      if (String(newVal) === String(oldVal) || (newVal === '' && oldVal == null)) return without;
      return [...without, { key: changeKey, rowIdx, col, oldVal, newVal: newVal === '' ? null : newVal, sql, binds }];
    });

    // Reflect change in local grid state immediately
    setData(prev => {
      if (!prev) return prev;
      const newRows = prev.rows.map((r, i) =>
        i === rowIdx ? { ...r, [col]: newVal === '' ? null : newVal } : r
      );
      return { ...prev, rows: newRows };
    });
  }

  function discardChange(key) {
    const change = pendingChanges.find(c => c.key === key);
    if (!change) return;
    // Revert grid row
    setData(prev => {
      if (!prev) return prev;
      const newRows = prev.rows.map((r, i) =>
        i === change.rowIdx ? { ...r, [change.col]: change.oldVal } : r
      );
      return { ...prev, rows: newRows };
    });
    setPendingChanges(prev => prev.filter(c => c.key !== key));
  }

  function discardAll() {
    // Revert all grid rows
    setData(prev => {
      if (!prev) return prev;
      let rows = [...prev.rows];
      for (const c of pendingChanges) {
        rows = rows.map((r, i) => i === c.rowIdx ? { ...r, [c.col]: c.oldVal } : r);
      }
      return { ...prev, rows };
    });
    setPendingChanges([]);
  }

  async function executeChanges() {
    if (pendingChanges.length === 0) return;
    setTxStatus('executing');
    setTxResults([]);
    let newTxId;
    try {
      const { txId: id } = await api.beginTransaction(connectionId);
      newTxId = id;
      setTxId(id);
    } catch (e) {
      setTxStatus('idle');
      alert(`트랜잭션 시작 실패: ${e.message}`);
      return;
    }

    const results = [];
    for (const change of pendingChanges) {
      try {
        const r = await api.executeInTransaction(connectionId, newTxId, change.sql, change.binds);
        results.push({ sql: change.sql, rowsAffected: r.rowsAffected });
      } catch (e) {
        results.push({ sql: change.sql, error: e.message });
      }
    }
    setTxResults(results);
    setTxStatus('pending_commit');
  }

  async function handleCommit() {
    if (!txId) return;
    setTxStatus('committing');
    try {
      await api.commitTransaction(connectionId, txId);
      setTxId(null);
      setPendingChanges([]);
      setTxStatus('idle');
      setTxResults([]);
      // Reload to confirm server-side state
      load();
    } catch (e) {
      alert(`COMMIT 실패: ${e.message}`);
      setTxStatus('pending_commit');
    }
  }

  async function handleRollback() {
    if (!txId) return;
    setTxStatus('rolling_back');
    try {
      await api.rollbackTransaction(connectionId, txId);
      setTxId(null);
      setTxStatus('idle');
      setTxResults([]);
      // Revert grid to pre-execution state via reload
      setPendingChanges([]);
      load();
    } catch (e) {
      alert(`ROLLBACK 실패: ${e.message}`);
      setTxStatus('pending_commit');
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;
  const editableColumns = canEdit && editMode && data
    ? new Set(data.columns.filter(c => !pkColumns.includes(c)))
    : new Set();

  // Set of highlighted cells from pending changes
  const pendingCellKeys = new Set(pendingChanges.map(c => c.key));

  const hasErrors = txResults.some(r => r.error);
  const isBusy = txStatus === 'executing' || txStatus === 'committing' || txStatus === 'rolling_back';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{
        padding: '4px 8px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, flexWrap: 'wrap',
      }}>
        <button className="btn-secondary" onClick={load}
          disabled={txStatus === 'pending_commit' || isBusy}
          style={{ padding: '2px 8px', flexShrink: 0 }}
          title={txStatus === 'pending_commit' ? 'COMMIT 또는 ROLLBACK 후 새로고침 가능합니다' : ''}
        >↻ 새로고침</button>

        <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 200 }}>
          <input
            type="text" value={filterInput}
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
            <button className="btn-secondary" onClick={clearFilter}
              style={{ padding: '2px 6px', flexShrink: 0, color: 'var(--danger)' }}>✕</button>
          )}
        </div>

        {data && <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>총 {data.total.toLocaleString()}행</span>}

        {canEdit && txStatus === 'idle' && (
          <button
            className={editMode ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              if (editMode && pendingChanges.length > 0) {
                if (!window.confirm('편집 모드를 종료하면 미반영 변경사항이 모두 취소됩니다. 계속하시겠습니까?')) return;
                discardAll();
              }
              setEditMode(e => !e);
            }}
            style={{ padding: '2px 8px', flexShrink: 0 }}
          >
            {editMode ? '✏ 편집 중' : '✏ 편집 모드'}
          </button>
        )}

        {loading && <span className="spinner" />}
      </div>

      {error && (
        <div className="error-pane">
          <span className="error-pane-msg">{error}</span>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={load}>↻ 재시도</button>
        </div>
      )}

      {/* ── Grid ── */}
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
          pendingCellKeys={pendingCellKeys}
        />
      )}

      {/* ── Pending Changes Panel ── */}
      {editMode && pendingChanges.length > 0 && txStatus === 'idle' && (
        <div style={{
          background: 'var(--bg-panel)', borderTop: '2px solid var(--accent)',
          padding: '8px 12px', flexShrink: 0, maxHeight: 180, overflow: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-bright)' }}>
              변경 예정 {pendingChanges.length}건
            </span>
            <button className="btn-primary" onClick={executeChanges}
              style={{ padding: '2px 10px', fontSize: 12 }}>
              ▶ 변경사항 실행
            </button>
            <button className="btn-secondary" onClick={discardAll}
              style={{ padding: '2px 8px', fontSize: 12, color: 'var(--danger)' }}>
              ✕ 전체 취소
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['행', '컬럼', '이전 값', '→', '변경 값', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '2px 6px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingChanges.map(c => (
                <tr key={c.key} style={{ borderBottom: '1px solid rgba(62,62,66,0.4)' }}>
                  <td style={{ padding: '2px 6px', color: 'var(--text-dim)' }}>{c.rowIdx + 1}</td>
                  <td style={{ padding: '2px 6px', color: 'var(--accent-bright)' }}>{c.col}</td>
                  <td style={{ padding: '2px 6px', color: 'var(--danger)', fontFamily: 'var(--code-font)' }}>
                    {c.oldVal == null ? <em style={{ opacity: 0.5 }}>null</em> : String(c.oldVal)}
                  </td>
                  <td style={{ padding: '2px 6px', color: 'var(--text-dim)' }}>→</td>
                  <td style={{ padding: '2px 6px', color: 'var(--success, #7ec87e)', fontFamily: 'var(--code-font)' }}>
                    {c.newVal == null ? <em style={{ opacity: 0.5 }}>null</em> : String(c.newVal)}
                  </td>
                  <td style={{ padding: '2px 4px' }}>
                    <button onClick={() => discardChange(c.key)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                      title="이 변경 취소">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Executing indicator ── */}
      {txStatus === 'executing' && (
        <div style={{
          background: 'rgba(79,193,255,0.1)', borderTop: '2px solid var(--accent)',
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span className="spinner" />
          <span style={{ fontSize: 12, color: 'var(--accent-bright)' }}>변경사항 실행 중...</span>
        </div>
      )}

      {/* ── Commit / Rollback Panel ── */}
      {txStatus === 'pending_commit' && (
        <div style={{
          background: hasErrors ? 'rgba(220,80,80,0.08)' : 'rgba(80,200,80,0.08)',
          borderTop: `2px solid ${hasErrors ? 'var(--danger)' : '#4caf50'}`,
          padding: '8px 12px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: txResults.length ? 6 : 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: hasErrors ? 'var(--danger)' : '#7ec87e' }}>
              {hasErrors
                ? `⚠ ${txResults.filter(r => r.error).length}건 오류 — ROLLBACK을 권장합니다`
                : `✓ ${txResults.length}건 실행 완료 — 조회로 검증 후 COMMIT 또는 ROLLBACK`}
            </span>
            <button
              onClick={handleCommit}
              disabled={isBusy}
              style={{
                padding: '3px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 3,
                opacity: isBusy ? 0.5 : 1,
              }}
            >
              {txStatus === 'committing' ? '...' : '✓ COMMIT'}
            </button>
            <button
              onClick={handleRollback}
              disabled={isBusy}
              style={{
                padding: '3px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: '#c62828', color: '#fff', border: 'none', borderRadius: 3,
                opacity: isBusy ? 0.5 : 1,
              }}
            >
              {txStatus === 'rolling_back' ? '...' : '↩ ROLLBACK'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              트랜잭션이 열려 있습니다 — 새로고침으로 현재 서버 데이터를 확인할 수 있습니다
            </span>
          </div>

          {txResults.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 4 }}>
              <tbody>
                {txResults.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(62,62,66,0.3)' }}>
                    <td style={{ padding: '2px 6px', width: 20 }}>
                      {r.error
                        ? <span style={{ color: 'var(--danger)' }}>✕</span>
                        : <span style={{ color: '#7ec87e' }}>✓</span>}
                    </td>
                    <td style={{ padding: '2px 6px', fontFamily: 'var(--code-font)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{r.sql}</td>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', color: r.error ? 'var(--danger)' : 'var(--text-dim)' }}>
                      {r.error ? r.error : `${r.rowsAffected}행`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Pagination ── */}
      {data && totalPages > 1 && (
        <div style={{
          display: 'flex', gap: 8, padding: '6px 8px',
          borderTop: '1px solid var(--border)', alignItems: 'center',
          fontSize: 12, background: 'var(--bg-panel)', flexShrink: 0,
        }}>
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
