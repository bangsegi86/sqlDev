import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../api/client.js';
import DataGrid from '../Common/DataGrid.jsx';

const DISPLAY_COLS = ['TABLE_NAME', 'COMMENTS', 'LAST_DDL_TIME'];
const EDITABLE_COLS = new Set(['TABLE_NAME', 'COMMENTS']);

export default function TableListTab({ connectionId, schema }) {
  const [rows, setRows] = useState(null);
  const [originalRows, setOriginalRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingChanges, setPendingChanges] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('ASC');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const gridRef = useRef(null);

  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleSort(col) {
    if (!rows) return;
    const newDir = sortCol === col ? (sortDir === 'ASC' ? 'DESC' : 'ASC') : 'ASC';
    setSortCol(col);
    setSortDir(newDir);

    const indexed = rows.map((r, i) => ({ row: r, origIdx: i }));
    indexed.sort((a, b) => {
      const av = a.row[col], bv = b.row[col];
      let cmp;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return newDir === 'ASC' ? cmp : -cmp;
    });
    const indexMap = new Map(indexed.map(({ origIdx }, newIdx) => [origIdx, newIdx]));
    setRows(indexed.map(({ row }) => row));
    setOriginalRows(prev => prev ? indexed.map(({ origIdx }) => prev[origIdx]) : prev);
    setPendingChanges(prev => prev.map(c => ({
      ...c,
      key: `${indexMap.get(c.rowIdx)}::${c.field}`,
      rowIdx: indexMap.get(c.rowIdx),
    })));
  }

  async function load() {
    setLoading(true); setError(''); setPendingChanges([]); setSortCol(null); setSortDir('ASC');
    try {
      const result = await api.getTableList(connectionId, schema);
      const data = result.rows || [];
      setRows(data);
      setOriginalRows(data.map(r => ({ ...r })));
      requestAnimationFrame(() => gridRef.current?.focus());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [connectionId, schema]);

  function handleCellEdit(rowIdx, col, oldVal, newVal) {
    if (newVal === oldVal || (newVal === '' && oldVal == null)) return;
    const key = `${rowIdx}::${col}`;
    const effectiveNew = newVal === '' ? null : newVal;

    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [col]: effectiveNew } : r));

    setPendingChanges(prev => {
      const existing = prev.find(c => c.key === key);
      // Keep original DB value as oldVal even if user edits multiple times
      const origOldVal = existing ? existing.oldVal : oldVal;
      const without = prev.filter(c => c.key !== key);
      if (effectiveNew === origOldVal || (effectiveNew == null && origOldVal == null)) return without;
      return [...without, { key, rowIdx, field: col, oldVal: origOldVal, newVal: effectiveNew }];
    });
  }

  function discardChange(key) {
    const change = pendingChanges.find(c => c.key === key);
    if (!change) return;
    setRows(prev => prev.map((r, i) => i === change.rowIdx ? { ...r, [change.field]: change.oldVal } : r));
    setPendingChanges(prev => prev.filter(c => c.key !== key));
  }

  function discardAll() {
    setRows(originalRows ? originalRows.map(r => ({ ...r })) : null);
    setPendingChanges([]);
  }

  function buildAllDDL() {
    const renames = [];
    const comments = [];

    for (const c of pendingChanges) {
      if (c.field === 'TABLE_NAME') {
        // Use original name (oldVal) for RENAME source
        renames.push(`ALTER TABLE "${schema}"."${c.oldVal}" RENAME TO "${c.newVal}"`);
      } else if (c.field === 'COMMENTS') {
        // Use current row TABLE_NAME (may reflect a rename edit)
        const currentTableName = rows?.[c.rowIdx]?.TABLE_NAME || originalRows?.[c.rowIdx]?.TABLE_NAME;
        const escaped = (c.newVal || '').replace(/'/g, "''");
        comments.push(`COMMENT ON TABLE "${schema}"."${currentTableName}" IS '${escaped}'`);
      }
    }

    // RENAMEs must come before COMMENTs so the table name exists when commenting
    return [...renames, ...comments];
  }

  const hasRename = pendingChanges.some(c => c.field === 'TABLE_NAME');

  async function doExecute() {
    const stmts = buildAllDDL();
    setExecuting(true); setConfirmOpen(false);
    try {
      const result = await api.executeScript(connectionId, stmts, schema);
      if (result.success) {
        showToast(`${result.executedCount}건 실행 완료`, 'success');
        setPendingChanges([]);
        load(); // Reload to reflect renames
      } else {
        const failed = result.results.find(r => !r.ok);
        showToast(`실패: ${failed?.error || '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`실행 실패: ${e.message}`, 'error');
    } finally {
      setExecuting(false);
    }
  }

  const ddlStatements = confirmOpen ? buildAllDDL() : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Toast */}
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

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', width: 640, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-bright)' }}>⚠ DDL 실행 확인</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              아래 {ddlStatements.length}건의 DDL이 즉시 실행됩니다. DDL은 자동 커밋됩니다.
            </div>
            {hasRename && (
              <div style={{ fontSize: 11, color: '#f07070', background: 'rgba(240,112,112,0.08)', border: '1px solid rgba(240,112,112,0.3)', borderRadius: 4, padding: '6px 10px' }}>
                ⚠ 테이블명 변경은 자동 커밋이며 롤백 불가합니다. FK · View · Synonym 등 참조 객체가 깨질 수 있습니다!
              </div>
            )}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', overflowY: 'auto', maxHeight: 320, fontFamily: 'var(--code-font)', fontSize: 12, lineHeight: 1.7 }}>
              {ddlStatements.map((s, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text-primary)' }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)} style={{ padding: '5px 16px', fontSize: 13 }}>취소</button>
              <button onClick={doExecute} style={{ padding: '5px 18px', fontSize: 13, fontWeight: 700, background: hasRename ? '#7d2e2e' : '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                {hasRename ? '⚠ 실행 (위험)' : '▶ 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ padding: '6px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>스키마: {schema}</span>
        <button className="btn-secondary" onClick={load} disabled={loading || executing} style={{ padding: '2px 8px' }}>
          ↻ 새로고침
        </button>
        {rows && <span style={{ color: 'var(--text-secondary)' }}>테이블 {rows.length}개</span>}
        {(loading || executing) && <span className="spinner" />}
      </div>

      {error && (
        <div className="error-pane">
          <span className="error-pane-msg">{error}</span>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={load}>↻ 재시도</button>
        </div>
      )}

      {/* Grid */}
      {rows && (
        <DataGrid
          ref={gridRef}
          key={`table-list-${schema}`}
          columns={DISPLAY_COLS}
          rows={rows}
          editableColumns={EDITABLE_COLS}
          primaryKeyColumns={[]}
          onCellEdit={handleCellEdit}
          pendingCellKeys={new Set(pendingChanges.map(c => c.key))}
          onSort={handleSort}
          sortColumn={sortCol}
          sortDir={sortDir}
        />
      )}

      {/* Pending changes panel */}
      {pendingChanges.length > 0 && (
        <div style={{ background: 'var(--bg-panel)', borderTop: '2px solid var(--accent)', padding: '8px 12px', flexShrink: 0, maxHeight: 180, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-bright)' }}>
              변경 예정 {pendingChanges.length}건
            </span>
            <button className="btn-primary" onClick={() => setConfirmOpen(true)} disabled={executing} style={{ padding: '2px 10px', fontSize: 12 }}>
              ▶ 변경사항 실행
            </button>
            <button className="btn-secondary" onClick={discardAll} disabled={executing} style={{ padding: '2px 8px', fontSize: 12, color: 'var(--danger)' }}>
              ✕ 전체 취소
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['필드', '이전 값', '→', '변경 값', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '2px 6px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingChanges.map(c => (
                <tr key={c.key} style={{ borderBottom: '1px solid rgba(62,62,66,0.4)' }}>
                  <td style={{ padding: '2px 6px', color: 'var(--accent-bright)' }}>{c.field}</td>
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
    </div>
  );
}
