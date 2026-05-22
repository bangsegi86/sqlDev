import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useCopy } from '../../utils/clipboard.js';

export default function SqlGenTab({ connectionId, schema, tableName }) {
  const [columns, setColumns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStmt, setActiveStmt] = useState('insert');

  useEffect(() => {
    setLoading(true); setError('');
    api.getColumns(connectionId, schema, tableName)
      .then(setColumns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;
  if (!columns) return null;

  const pkCols = columns.filter(c => c.IS_PK === 'Y');
  const nonPkCols = columns.filter(c => c.IS_PK !== 'Y');
  const fullName = `${schema}.${tableName}`;

  const stmts = [
    { id: 'insert', label: 'INSERT', sql: genInsert(fullName, columns) },
    { id: 'update', label: 'UPDATE', sql: genUpdate(fullName, pkCols, nonPkCols, columns) },
    { id: 'merge',  label: 'MERGE',  sql: genMerge(fullName, pkCols, nonPkCols, columns) },
  ];
  const current = stmts.find(s => s.id === activeStmt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: '4px 8px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {stmts.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveStmt(s.id)}
              style={{
                padding: '3px 14px', borderRadius: 0, border: 'none',
                background: activeStmt === s.id ? 'var(--accent)' : 'var(--bg-input)',
                color: activeStmt === s.id ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <CopyBtn text={current?.sql || ''} />
      </div>

      {/* SQL output */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <pre style={{
          margin: 0, padding: 14,
          fontFamily: 'var(--code-font)', fontSize: 12,
          color: 'var(--text-primary)', lineHeight: 1.7,
          background: 'var(--bg-primary)',
          whiteSpace: 'pre',
        }}>
          {current?.sql}
        </pre>
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [copyFn, copied] = useCopy();
  return (
    <button
      className="btn-secondary"
      onClick={() => copyFn(text)}
      style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, minWidth: 56 }}
    >
      {copied ? '✓ 복사됨' : '📋 복사'}
    </button>
  );
}

// ── SQL generators ──────────────────────────────────────────────────────────────

function bindVar(name) { return ':' + name.toLowerCase(); }

function typeHint(col) {
  const dt = col.DATA_TYPE || '';
  const prec = col.DATA_PRECISION != null && col.DATA_SCALE != null
    ? `(${col.DATA_PRECISION},${col.DATA_SCALE})`
    : col.DATA_LENGTH ? `(${col.DATA_LENGTH})` : '';
  const nullable = col.NULLABLE === 'N' ? ' NOT NULL' : '';
  return `-- ${dt}${prec}${nullable}`;
}

function pad(name, maxLen) { return name.padEnd(maxLen); }

function genInsert(fullName, cols) {
  if (!cols.length) return `INSERT INTO ${fullName} (...) VALUES (...);`;

  const maxLen = Math.max(...cols.map(c => c.COLUMN_NAME.length));
  const colLines = cols.map((c, i) =>
    `  ${i === 0 ? ' ' : ','} ${c.COLUMN_NAME}`
  ).join('\n');
  const valLines = cols.map((c, i) =>
    `  ${i === 0 ? ' ' : ','} ${pad(bindVar(c.COLUMN_NAME), maxLen + 1)} ${typeHint(c)}`
  ).join('\n');

  return [
    `INSERT INTO ${fullName}`,
    `(`,
    colLines,
    `)`,
    `VALUES`,
    `(`,
    valLines,
    `);`,
  ].join('\n');
}

function genUpdate(fullName, pkCols, nonPkCols, allCols) {
  const setCols = nonPkCols.length > 0 ? nonPkCols : allCols;
  const maxSet = Math.max(...setCols.map(c => c.COLUMN_NAME.length));

  const setLines = setCols.map((c, i) =>
    `${i === 0 ? '   SET' : '      ,'} ${pad(c.COLUMN_NAME, maxSet)} = ${pad(bindVar(c.COLUMN_NAME), maxSet + 1)} ${typeHint(c)}`
  ).join('\n');

  if (!pkCols.length) {
    return [
      `UPDATE ${fullName}`,
      setLines,
      ` WHERE 1=1  -- PK 컬럼이 없습니다. WHERE 조건을 직접 지정하세요`,
      `;`,
    ].join('\n');
  }

  const maxWhere = Math.max(...pkCols.map(c => c.COLUMN_NAME.length));
  const whereLines = pkCols.map((c, i) =>
    `${i === 0 ? ' WHERE' : '   AND'} ${pad(c.COLUMN_NAME, maxWhere)} = ${bindVar(c.COLUMN_NAME)}`
  ).join('\n');

  return [
    `UPDATE ${fullName}`,
    setLines,
    whereLines,
    `;`,
  ].join('\n');
}

function genMerge(fullName, pkCols, nonPkCols, allCols) {
  const T = 'T';

  if (!pkCols.length) {
    return [
      `-- PK 컬럼이 없습니다. ON 조건을 직접 지정하세요`,
      `MERGE INTO ${fullName} ${T}`,
      `USING DUAL`,
      `   ON (1=1)`,
      ` WHEN MATCHED THEN`,
      `   UPDATE SET ...`,
      ` WHEN NOT MATCHED THEN`,
      `   INSERT (...)`,
      `   VALUES (...)`,
      `;`,
    ].join('\n');
  }

  // ON: PK 조건
  const maxPk = Math.max(...pkCols.map(c => c.COLUMN_NAME.length));
  const onLines = pkCols.map((c, i) =>
    `       ${i === 0 ? '   ' : 'AND '}${T}.${pad(c.COLUMN_NAME, maxPk)} = ${bindVar(c.COLUMN_NAME)}`
  ).join('\n');

  // UPDATE SET: PK 제외 전체 컬럼
  const updCols = nonPkCols.length > 0 ? nonPkCols : allCols;
  const maxUpd = Math.max(...updCols.map(c => c.COLUMN_NAME.length));
  const updLines = updCols.map((c, i) =>
    `          ${i === 0 ? 'SET' : '  ,'} ${T}.${pad(c.COLUMN_NAME, maxUpd)} = ${pad(bindVar(c.COLUMN_NAME), maxUpd + 1)} ${typeHint(c)}`
  ).join('\n');

  // INSERT: 전체 컬럼
  const maxIns = Math.max(...allCols.map(c => c.COLUMN_NAME.length));
  const insColLines = allCols.map((c, i) =>
    `          ${i === 0 ? ' ' : ','} ${c.COLUMN_NAME}`
  ).join('\n');
  const insValLines = allCols.map((c, i) =>
    `          ${i === 0 ? ' ' : ','} ${pad(bindVar(c.COLUMN_NAME), maxIns + 1)} ${typeHint(c)}`
  ).join('\n');

  return [
    `MERGE INTO ${fullName} ${T}`,
    `USING DUAL`,
    `   ON (`,
    onLines,
    `       )`,
    ` WHEN MATCHED THEN`,
    `   UPDATE`,
    updLines,
    ` WHEN NOT MATCHED THEN`,
    `   INSERT`,
    `   (`,
    insColLines,
    `   )`,
    `   VALUES`,
    `   (`,
    insValLines,
    `   )`,
    `;`,
  ].join('\n');
}
