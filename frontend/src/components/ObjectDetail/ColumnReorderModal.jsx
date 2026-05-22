import React, { useState, useRef } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';

function colTypeSummary(col) {
  const dt = col.DATA_TYPE;
  if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(dt))
    return `${dt}(${col.DATA_LENGTH})`;
  if (dt === 'NUMBER')
    return col.DATA_PRECISION != null
      ? `NUMBER(${col.DATA_PRECISION}${col.DATA_SCALE ? ',' + col.DATA_SCALE : ''})`
      : 'NUMBER';
  return dt;
}

export default function ColumnReorderModal({ connectionId, schema, tableName, columns, onClose }) {
  const [order, setOrder] = useState(() => columns.map(c => c.COLUMN_NAME));
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [script, setScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [copyScript, scriptCopied] = useCopy();
  const dragIdxRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const colMap = Object.fromEntries(columns.map(c => [c.COLUMN_NAME, c]));

  // ── Drag handlers ──────────────────────────────────────────
  function onDragStart(i) { dragIdxRef.current = i; }

  function onDragOver(e, i) {
    e.preventDefault();
    setDragOver(i);
  }

  function onDrop(i) {
    const from = dragIdxRef.current;
    if (from == null || from === i) { setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setOrder(next);
    setSelectedIdx(i);
    dragIdxRef.current = null;
    setDragOver(null);
    setScript('');
  }

  // ── Up / Down buttons ──────────────────────────────────────
  function moveUp() {
    if (selectedIdx == null || selectedIdx === 0) return;
    const next = [...order];
    [next[selectedIdx - 1], next[selectedIdx]] = [next[selectedIdx], next[selectedIdx - 1]];
    setOrder(next);
    setSelectedIdx(selectedIdx - 1);
    setScript('');
  }

  function moveDown() {
    if (selectedIdx == null || selectedIdx === order.length - 1) return;
    const next = [...order];
    [next[selectedIdx], next[selectedIdx + 1]] = [next[selectedIdx + 1], next[selectedIdx]];
    setOrder(next);
    setSelectedIdx(selectedIdx + 1);
    setScript('');
  }

  function reset() {
    setOrder(columns.map(c => c.COLUMN_NAME));
    setSelectedIdx(null);
    setScript('');
    setGenError('');
  }

  const isChanged = order.some((c, i) => c !== columns[i]?.COLUMN_NAME);

  // ── Script generation ─────────────────────────────────────
  async function generate() {
    setGenerating(true);
    setGenError('');
    try {
      const r = await api.generateReorderScript(connectionId, schema, tableName, order);
      setScript(r.script);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 6, width: 620, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13 }}>컬럼 순서 변경</span>
            <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
              {schema}.{tableName}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Instruction */}
          <div style={{ padding: '6px 14px 2px', color: 'var(--text-secondary)', fontSize: 11 }}>
            드래그하거나 ▲▼ 버튼으로 순서를 변경하세요.
          </div>

          {/* Column list */}
          <div style={{ padding: '4px 14px', flex: '0 0 auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}></th>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>컬럼명</th>
                  <th style={thStyle}>타입</th>
                  <th style={thStyle}>NULL</th>
                  <th style={thStyle}>Key</th>
                </tr>
              </thead>
              <tbody>
                {order.map((colName, i) => {
                  const col = colMap[colName];
                  if (!col) return null;
                  const isSelected = selectedIdx === i;
                  const isDragTarget = dragOver === i;
                  return (
                    <tr
                      key={colName}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={e => onDragOver(e, i)}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => onDrop(i)}
                      onClick={() => setSelectedIdx(i)}
                      style={{
                        background: isSelected ? 'var(--accent-dim, rgba(0,120,212,0.15))' : isDragTarget ? 'rgba(255,255,255,0.06)' : i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent',
                        cursor: 'grab',
                        borderTop: isDragTarget ? '2px solid var(--accent)' : '2px solid transparent',
                        userSelect: 'none',
                      }}
                    >
                      <td style={tdStyle({ color: 'var(--text-dim)', fontSize: 14, width: 20 })}>⠿</td>
                      <td style={tdStyle({ color: 'var(--text-dim)', width: 28, textAlign: 'right' })}>{i + 1}</td>
                      <td style={tdStyle({ fontWeight: col.IS_PK ? 700 : 400, color: col.IS_PK ? 'var(--pk-color, #ffd700)' : 'var(--text-primary)' })}>
                        {colName}
                      </td>
                      <td style={tdStyle({ color: 'var(--accent-bright)' })}>{colTypeSummary(col)}</td>
                      <td style={tdStyle({ textAlign: 'center', width: 36 })}>
                        {col.NULLABLE === 'N'
                          ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>N</span>
                          : <span style={{ color: 'var(--text-dim)' }}>Y</span>}
                      </td>
                      <td style={tdStyle({ textAlign: 'center', width: 36 })}>
                        {col.IS_PK && <span className="tag-pk" title="Primary Key">PK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Move buttons + reset */}
          <div style={{ padding: '4px 14px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn-secondary"
              onClick={moveUp}
              disabled={selectedIdx == null || selectedIdx === 0}
              style={{ padding: '2px 10px', fontSize: 12 }}
            >▲ 위로</button>
            <button
              className="btn-secondary"
              onClick={moveDown}
              disabled={selectedIdx == null || selectedIdx === order.length - 1}
              style={{ padding: '2px 10px', fontSize: 12 }}
            >▼ 아래로</button>
            <button
              className="btn-secondary"
              onClick={reset}
              style={{ padding: '2px 10px', fontSize: 12, marginLeft: 8 }}
            >↺ 초기화</button>
            {!isChanged && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
                순서가 변경되지 않았습니다
              </span>
            )}
          </div>

          {/* Script area */}
          {script && (
            <div style={{ padding: '0 14px 10px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600 }}>생성된 마이그레이션 스크립트</span>
                <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                  ⚠ 테이블 재생성 방식 (데이터 복사 포함)
                </span>
              </div>
              <textarea
                readOnly
                value={script}
                style={{
                  flex: 1, minHeight: 200, maxHeight: 320,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 3,
                  fontFamily: 'var(--code-font)', fontSize: 11, lineHeight: 1.5,
                  padding: 8, resize: 'vertical',
                }}
              />
            </div>
          )}

          {genError && (
            <div style={{ padding: '4px 14px 8px', color: 'var(--danger)', fontSize: 11 }}>
              오류: {genError}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className={isChanged ? 'btn-primary' : 'btn-secondary'}
            onClick={generate}
            disabled={generating || !isChanged}
            style={{ padding: '3px 12px', fontSize: 12 }}
          >
            {generating ? '생성 중...' : '⚙ 스크립트 생성'}
          </button>

          {script && (
            <button
              className="btn-secondary"
              onClick={() => copyScript(script)}
              style={{ padding: '3px 12px', fontSize: 12 }}
            >
              {scriptCopied ? '✓ 복사됨' : '📋 복사'}
            </button>
          )}

          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose} style={{ padding: '3px 12px', fontSize: 12 }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
  padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11,
};
function tdStyle(extra = {}) {
  return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra };
}


function colTypeSummary(col) {
  const dt = col.DATA_TYPE;
  if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(dt))
    return `${dt}(${col.DATA_LENGTH})`;
  if (dt === 'NUMBER')
    return col.DATA_PRECISION != null
      ? `NUMBER(${col.DATA_PRECISION}${col.DATA_SCALE ? ',' + col.DATA_SCALE : ''})`
      : 'NUMBER';
  return dt;
}

export default function ColumnReorderModal({ connectionId, schema, tableName, columns, onClose }) {
  const [order, setOrder] = useState(() => columns.map(c => c.COLUMN_NAME));
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [script, setScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [copyScript, scriptCopied] = useCopy();
  const dragIdxRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const colMap = Object.fromEntries(columns.map(c => [c.COLUMN_NAME, c]));

  // ── Drag handlers ──────────────────────────────────────────
  function onDragStart(i) { dragIdxRef.current = i; }

  function onDragOver(e, i) {
    e.preventDefault();
    setDragOver(i);
  }

  function onDrop(i) {
    const from = dragIdxRef.current;
    if (from == null || from === i) { setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setOrder(next);
    setSelectedIdx(i);
    dragIdxRef.current = null;
    setDragOver(null);
    setScript('');
  }

  // ── Up / Down buttons ──────────────────────────────────────
  function moveUp() {
    if (selectedIdx == null || selectedIdx === 0) return;
    const next = [...order];
    [next[selectedIdx - 1], next[selectedIdx]] = [next[selectedIdx], next[selectedIdx - 1]];
    setOrder(next);
    setSelectedIdx(selectedIdx - 1);
    setScript('');
  }

  function moveDown() {
    if (selectedIdx == null || selectedIdx === order.length - 1) return;
    const next = [...order];
    [next[selectedIdx], next[selectedIdx + 1]] = [next[selectedIdx + 1], next[selectedIdx]];
    setOrder(next);
    setSelectedIdx(selectedIdx + 1);
    setScript('');
  }

  function reset() {
    setOrder(columns.map(c => c.COLUMN_NAME));
    setSelectedIdx(null);
    setScript('');
    setGenError('');
    setExecResult(null);
  }

  // Check if order changed
  const isChanged = order.some((c, i) => c !== columns[i]?.COLUMN_NAME);

  // ── Script generation ─────────────────────────────────────
  async function generate() {
    setGenerating(true);
    setGenError('');
    setExecResult(null);
    try {
      const r = await api.generateReorderScript(connectionId, schema, tableName, order);
      setScript(r.script);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Execute ───────────────────────────────────────────────
  async function executeScript() {
    if (!window.confirm(
      '⚠ 경고: 이 스크립트는 테이블을 재생성합니다.\n' +
      '실행 전 반드시 전체 백업을 수행하세요.\n\n' +
      '계속 실행하시겠습니까?'
    )) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const stmts = splitStatements(script);
      const r = await api.executeScript(connectionId, stmts, schema);
      setExecResult(r);
    } catch (e) {
      setExecResult({ success: false, error: e.message, executedCount: 0 });
    } finally {
      setExecuting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 6, width: 620, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13 }}>컬럼 순서 변경</span>
            <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
              {schema}.{tableName}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Instruction */}
          <div style={{ padding: '6px 14px 2px', color: 'var(--text-secondary)', fontSize: 11 }}>
            드래그하거나 ▲▼ 버튼으로 순서를 변경하세요.
          </div>

          {/* Column list */}
          <div style={{ padding: '4px 14px', flex: '0 0 auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}></th>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>컬럼명</th>
                  <th style={thStyle}>타입</th>
                  <th style={thStyle}>NULL</th>
                  <th style={thStyle}>Key</th>
                </tr>
              </thead>
              <tbody>
                {order.map((colName, i) => {
                  const col = colMap[colName];
                  if (!col) return null;
                  const isSelected = selectedIdx === i;
                  const isDragTarget = dragOver === i;
                  return (
                    <tr
                      key={colName}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={e => onDragOver(e, i)}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => onDrop(i)}
                      onClick={() => setSelectedIdx(i)}
                      style={{
                        background: isSelected ? 'var(--accent-dim, rgba(0,120,212,0.15))' : isDragTarget ? 'rgba(255,255,255,0.06)' : i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent',
                        cursor: 'grab',
                        borderTop: isDragTarget ? '2px solid var(--accent)' : '2px solid transparent',
                        userSelect: 'none',
                      }}
                    >
                      <td style={tdStyle({ color: 'var(--text-dim)', fontSize: 14, width: 20 })}>⠿</td>
                      <td style={tdStyle({ color: 'var(--text-dim)', width: 28, textAlign: 'right' })}>{i + 1}</td>
                      <td style={tdStyle({ fontWeight: col.IS_PK ? 700 : 400, color: col.IS_PK ? 'var(--pk-color, #ffd700)' : 'var(--text-primary)' })}>
                        {colName}
                      </td>
                      <td style={tdStyle({ color: 'var(--accent-bright)' })}>{colTypeSummary(col)}</td>
                      <td style={tdStyle({ textAlign: 'center', width: 36 })}>
                        {col.NULLABLE === 'N'
                          ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>N</span>
                          : <span style={{ color: 'var(--text-dim)' }}>Y</span>}
                      </td>
                      <td style={tdStyle({ textAlign: 'center', width: 36 })}>
                        {col.IS_PK && <span className="tag-pk" title="Primary Key">PK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Move buttons + reset */}
          <div style={{ padding: '4px 14px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn-secondary"
              onClick={moveUp}
              disabled={selectedIdx == null || selectedIdx === 0}
              style={{ padding: '2px 10px', fontSize: 12 }}
            >▲ 위로</button>
            <button
              className="btn-secondary"
              onClick={moveDown}
              disabled={selectedIdx == null || selectedIdx === order.length - 1}
              style={{ padding: '2px 10px', fontSize: 12 }}
            >▼ 아래로</button>
            <button
              className="btn-secondary"
              onClick={reset}
              style={{ padding: '2px 10px', fontSize: 12, marginLeft: 8 }}
            >↺ 초기화</button>
            {!isChanged && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
                순서가 변경되지 않았습니다
              </span>
            )}
          </div>

          {/* Script area */}
          {script && (
            <div style={{ padding: '0 14px 10px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600 }}>생성된 마이그레이션 스크립트</span>
                <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                  ⚠ 테이블 재생성 방식 (데이터 복사 포함)
                </span>
              </div>
              <textarea
                readOnly
                value={script}
                style={{
                  flex: 1, minHeight: 200, maxHeight: 320,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 3,
                  fontFamily: 'var(--code-font)', fontSize: 11, lineHeight: 1.5,
                  padding: 8, resize: 'vertical',
                }}
              />
              {execResult && (
                <div style={{
                  marginTop: 6, padding: '4px 8px', borderRadius: 3, fontSize: 11,
                  background: execResult.success ? 'rgba(78,201,176,0.1)' : 'rgba(244,71,71,0.1)',
                  border: `1px solid ${execResult.success ? 'var(--status-connected)' : 'var(--danger)'}`,
                  color: execResult.success ? 'var(--status-connected)' : 'var(--danger)',
                }}>
                  {execResult.success
                    ? `✓ 실행 완료 (${execResult.executedCount}개 문장 실행됨)`
                    : `✗ 오류: ${execResult.error || '실행 중 오류가 발생했습니다'}`}
                </div>
              )}
            </div>
          )}

          {genError && (
            <div style={{ padding: '4px 14px 8px', color: 'var(--danger)', fontSize: 11 }}>
              오류: {genError}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={isChanged ? 'btn-primary' : 'btn-secondary'}
            onClick={generate}
            disabled={generating || !isChanged}
            style={{ padding: '3px 12px', fontSize: 12 }}
          >
            {generating ? '생성 중...' : '⚙ 스크립트 생성'}
          </button>

          {script && (
            <>
              <button
                className="btn-secondary"
                onClick={() => copyScript(script)}
                style={{ padding: '3px 12px', fontSize: 12 }}
              >
                {scriptCopied ? '✓ 복사됨' : '📋 복사'}
              </button>
              <button
                className="btn-secondary"
                onClick={executeScript}
                disabled={executing}
                style={{ padding: '3px 12px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                {executing ? '실행 중...' : '▶ 실행 (주의)'}
              </button>
            </>
          )}

          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose} style={{ padding: '3px 12px', fontSize: 12 }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600,
  padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11,
};
function tdStyle(extra = {}) {
  return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra };
}
