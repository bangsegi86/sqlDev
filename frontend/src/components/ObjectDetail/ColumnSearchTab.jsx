import React, { useState, useRef } from 'react';
import { api } from '../../api/client.js';
import DataGrid from '../Common/DataGrid.jsx';

const DISPLAY_COLS = ['TABLE_NAME', 'COLUMN_NAME', 'TYPE', 'NULLABLE', 'DATA_DEFAULT', 'COMMENTS'];
const EDITABLE_COLS = new Set(['TYPE', 'NULLABLE', 'DATA_DEFAULT', 'COMMENTS']);

function buildDisplayType(row) {
  const dt = (row.DATA_TYPE || '').toUpperCase();
  if (['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR'].includes(dt)) {
    const len = row.CHAR_USED === 'C' && row.CHAR_LENGTH
      ? `${row.CHAR_LENGTH} CHAR` : row.DATA_LENGTH;
    return `${dt}(${len})`;
  }
  if (dt === 'NUMBER') {
    if (row.DATA_PRECISION != null) {
      return `NUMBER(${row.DATA_PRECISION}${row.DATA_SCALE != null ? ',' + row.DATA_SCALE : ''})`;
    }
    return 'NUMBER';
  }
  return dt;
}

export default function ColumnSearchTab({ connectionId, schema }) {
  const [colInput, setColInput] = useState('');
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

  async function handleSearch() {
    const trimmed = colInput.trim();
    if (!trimmed) return;
    setLoading(true); setError(''); setPendingChanges([]); setSortCol(null); setSortDir('ASC');
    try {
      const result = await api.searchColumns(connectionId, schema, trimmed.toUpperCase());
      const processed = (result.rows || []).map(row => ({
        ...row,
        TYPE: buildDisplayType(row),
      }));
      setRows(processed);
      setOriginalRows(processed.map(r => ({ ...r })));
      requestAnimationFrame(() => gridRef.current?.focus());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCellEdit(rowIdx, col, oldVal, newVal) {
    if (newVal === oldVal || (newVal === '' && oldVal == null)) return;
    const key = `${rowIdx}::${col}`;
    const effectiveNew = newVal === '' ? null : newVal;

    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [col]: effectiveNew } : r));

    setPendingChanges(prev => {
      const existing = prev.find(c => c.key === key);
      const origOldVal = existing ? existing.oldVal : oldVal;
      const without = prev.filter(c => c.key !== key);
      if (String(effectiveNew) === String(origOldVal) || (effectiveNew == null && origOldVal == null)) return without;
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
    if (!rows) return [];
    const byRow = new Map();
    for (const c of pendingChanges) {
      if (!byRow.has(c.rowIdx)) byRow.set(c.rowIdx, new Set());
      byRow.get(c.rowIdx).add(c.field);
    }
    const stmts = [];
    for (const [rowIdx, changedFields] of byRow) {
      const row = rows[rowIdx];
      const tRef = `"${schema}"."${row.TABLE_NAME}"`;
      const cRef = `"${row.COLUMN_NAME}"`;

      if (changedFields.has('TYPE')) {
        const typeVal = (row.TYPE || '').trim();
        if (typeVal) stmts.push(`ALTER TABLE ${tRef} MODIFY (${cRef} ${typeVal})`);
      }
      if (changedFields.has('NULLABLE')) {
        const nullPart = row.NULLABLE === 'N' ? 'NOT NULL' : 'NULL';
        stmts.push(`ALTER TABLE ${tRef} MODIFY (${cRef} ${nullPart})`);
      }
      if (changedFields.has('DATA_DEFAULT')) {
        const defVal = row.DATA_DEFAULT == null || String(row.DATA_DEFAULT).trim() === ''
          ? 'DEFAULT NULL'
          : `DEFAULT ${String(row.DATA_DEFAULT).trim()}`;
        stmts.push(`ALTER TABLE ${tRef} MODIFY (${cRef} ${defVal})`);
      }
      if (changedFields.has('COMMENTS')) {
        const escaped = (row.COMMENTS || '').replace(/'/g, "''");
        stmts.push(`COMMENT ON COLUMN ${tRef}.${cRef} IS '${escaped}'`);
      }
    }
    return stmts;
  }

  async function doExecute() {
    const stmts = buildAllDDL();
    setExecuting(true); setConfirmOpen(false);
    try {
      const result = await api.executeScript(connectionId, stmts, schema);
      if (result.success) {
        showToast(`${result.executedCount}건 실행 완료`, 'success');
        setPendingChanges([]);
        setOriginalRows(rows.map(r => ({ ...r })));
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
            {ddlStatements.some(s => s.includes('MODIFY')) && (
              <div style={{ fontSize: 11, color: '#f07070', background: 'rgba(240,112,112,0.08)', border: '1px solid rgba(240,112,112,0.3)', borderRadius: 4, padding: '6px 10px' }}>
                ⚠ TYPE/NULLABLE/DEFAULT 변경은 기존 데이터와 호환되지 않으면 실패할 수 있습니다.
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
              <button onClick={doExecute} style={{ padding: '5px 18px', fontSize: 13, fontWeight: 700, background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>▶ 실행</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ padding: '6px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>스키마: {schema}</span>
        <input
          type="text" value={colInput}
          onChange={e => setColInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="컬럼명 (예: CUST_NO 또는 CUST%)"
          style={{ padding: '2px 7px', fontSize: 11, background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 3, outline: 'none', width: 240 }}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading || !colInput.trim()} style={{ padding: '2px 10px', flexShrink: 0 }}>
          🔍 검색
        </button>
        {rows && <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>결과 {rows.length}건</span>}
        {(loading || executing) && <span className="spinner" />}
      </div>

      {error && (
        <div className="error-pane">
          <span className="error-pane-msg">{error}</span>
        </div>
      )}

      {/* Grid */}
      {rows && (
        <DataGrid
          ref={gridRef}
          key={`col-search-${colInput}`}
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

      {!rows && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          컬럼명을 입력하고 검색하세요 (% 와일드카드 사용 가능)
        </div>
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
                {['테이블', '컬럼', '필드', '이전 값', '→', '변경 값', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '2px 6px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingChanges.map(c => {
                const row = rows?.[c.rowIdx];
                return (
                  <tr key={c.key} style={{ borderBottom: '1px solid rgba(62,62,66,0.4)' }}>
                    <td style={{ padding: '2px 6px', color: 'var(--text-dim)' }}>{row?.TABLE_NAME}</td>
                    <td style={{ padding: '2px 6px', color: 'var(--accent-bright)' }}>{row?.COLUMN_NAME}</td>
                    <td style={{ padding: '2px 6px', color: 'var(--text-secondary)' }}>{c.field}</td>
                    <td style={{ padding: '2px 6px', color: 'var(--danger)', fontFamily: 'var(--code-font)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.oldVal == null ? <em style={{ opacity: 0.5 }}>null</em> : String(c.oldVal)}
                    </td>
                    <td style={{ padding: '2px 6px', color: 'var(--text-dim)' }}>→</td>
                    <td style={{ padding: '2px 6px', color: '#7ec87e', fontFamily: 'var(--code-font)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.newVal == null ? <em style={{ opacity: 0.5 }}>null</em> : String(c.newVal)}
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <button onClick={() => discardChange(c.key)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                        title="이 변경 취소">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
