import React, { useEffect, useState, useCallback, useRef } from 'react';
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

  const [pkColumns, setPkColumns] = useState([]);
  const [editMode, setEditMode] = useState(false);

  // Staged changes: { key, rowIdx, col, oldVal, newVal, sql, binds }
  const [pendingChanges, setPendingChanges] = useState([]);

  // Confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

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

  useEffect(() => {
    setEditMode(false);
    setPendingChanges([]);
    setConfirmOpen(false);
  }, [connectionId, schema, tableName]);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortCol(col); setSortDir('ASC'); }
    setPage(1);
  }

  function applyFilter() { setFilter(filterInput.trim()); setPage(1); }
  function clearFilter() { setFilterInput(''); setFilter(''); setPage(1); }

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
      if (String(newVal) === String(oldVal) || (newVal === '' && oldVal == null)) return without;
      return [...without, { key: changeKey, rowIdx, col, oldVal, newVal: newVal === '' ? null : newVal, sql, binds }];
    });

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

  async function doExecute() {
    setExecuting(true);
    setConfirmOpen(false);
    let successCount = 0;
    const errors = [];
    for (const change of pendingChanges) {
      try {
        await api.executeDml(connectionId, change.sql, change.binds);
        successCount++;
      } catch (e) {
        errors.push({ sql: change.sql, error: e.message });
      }
    }
    setExecuting(false);
    setPendingChanges([]);
    load();
    if (errors.length > 0) {
      showToast(`${successCount}건 저장, ${errors.length}건 실패: ${errors[0].error}`, 'error');
    } else {
      showToast(`${successCount}건 저장되었습니다`, 'success');
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;
  const editableColumns = canEdit && editMode && data
    ? new Set(data.columns.filter(c => !pkColumns.includes(c)))
    : new Set();
  const pendingCellKeys = new Set(pendingChanges.map(c => c.key));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500,
          background: toast.type === 'success' ? '#1e4d2b' : '#4d1e1e',
          color: toast.type === 'success' ? '#7ec87e' : '#f07070',
          border: `1px solid ${toast.type === 'success' ? '#3a7a4a' : '#7a3a3a'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', pointerEvents: 'none',
        }}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.msg}
        </div>
      )}

      {/* ── 실행 확인 모달 ── */}
      {confirmOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '20px 24px', width: 600, maxWidth: '90vw',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-bright)' }}>
              ⚠ 변경사항 실행 확인
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              아래 {pendingChanges.length}건의 SQL이 즉시 실행됩니다. 계속하시겠습니까?
            </div>
            <div style={{
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '10px 12px', overflowY: 'auto', maxHeight: 340,
              fontFamily: 'var(--code-font)', fontSize: 12, lineHeight: 1.7,
            }}>
              {pendingChanges.map((c, i) => (
                <div key={c.key} style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text-primary)' }}>{c.sql}</span>
                  <div style={{ paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 11 }}>
                    {Object.entries(c.binds).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 12 }}>:{k} = <em style={{ color: 'var(--accent-bright)' }}>{v == null ? 'NULL' : String(v)}</em></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}
                style={{ padding: '5px 16px', fontSize: 13 }}>
                취소
              </button>
              <button onClick={doExecute}
                style={{
                  padding: '5px 18px', fontSize: 13, fontWeight: 700,
                  background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                }}>
                ▶ 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        padding: '4px 8px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, flexWrap: 'wrap',
      }}>
        <button className="btn-secondary" onClick={load} disabled={executing}
          style={{ padding: '2px 8px', flexShrink: 0 }}>↻ 새로고침</button>

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

        {canEdit && (
          <button
            className={editMode ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              if (editMode && pendingChanges.length > 0) {
                if (!window.confirm('편집 모드를 종료하면 미반영 변경사항이 모두 취소됩니다. 계속하시겠습니까?')) return;
                discardAll();
              }
              setEditMode(e => !e);
            }}
            disabled={executing}
            style={{ padding: '2px 8px', flexShrink: 0 }}
          >
            {editMode ? '✏ 편집 중' : '✏ 편집 모드'}
          </button>
        )}

        {(loading || executing) && <span className="spinner" />}
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
      {editMode && pendingChanges.length > 0 && (
        <div style={{
          background: 'var(--bg-panel)', borderTop: '2px solid var(--accent)',
          padding: '8px 12px', flexShrink: 0, maxHeight: 180, overflow: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-bright)' }}>
              변경 예정 {pendingChanges.length}건
            </span>
            <button className="btn-primary" onClick={() => setConfirmOpen(true)} disabled={executing}
              style={{ padding: '2px 10px', fontSize: 12 }}>
              ▶ 변경사항 실행
            </button>
            <button className="btn-secondary" onClick={discardAll} disabled={executing}
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
                  <td style={{ padding: '2px 6px', color: '#7ec87e', fontFamily: 'var(--code-font)' }}>
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
