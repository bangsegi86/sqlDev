import oracledb from 'oracledb';
import { getSettings, autoDetectOracleClient } from './settingsService.js';
import { getJdbcStatus, jdbcConnect, jdbcDisconnect, jdbcExecute, jdbcTestConnection } from './jdbcService.js';

// Determine Oracle Client directory: settings.json → env var → auto-detect
const settings = getSettings();
const oracleClientDir =
  settings.oracleClientDir ||
  process.env.ORACLE_CLIENT_LIB_DIR ||
  autoDetectOracleClient();

if (oracleClientDir) {
  try {
    oracledb.initOracleClient({ libDir: oracleClientDir });
    console.log(`[Oracle] Thick Mode: ${oracleClientDir}`);
  } catch (e) {
    console.warn(`[Oracle] Thick Mode 실패, Thin Mode로 계속: ${e.message}`);
  }
} else {
  console.log('[Oracle] Thin Mode (Oracle Instant Client 미설정)');
}

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const pools = new Map();

function connectString(host, port, serviceName) {
  return `${host}:${port}/${serviceName}`;
}

export async function testConnection(params) {
  let conn;
  const start = Date.now();
  try {
    conn = await oracledb.getConnection({
      user: params.username,
      password: params.password,
      connectString: connectString(params.host, params.port, params.serviceName),
    });
    const result = await conn.execute('SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1');
    const banner = result.rows?.[0]?.BANNER || 'Oracle Database';
    return { success: true, latencyMs: Date.now() - start, serverVersion: banner, mode: 'thin' };
  } catch (e) {
    const isVerifierError = e.message.includes('NJS-116') || e.message.includes('password verifier');
    if (isVerifierError && getJdbcStatus().available) {
      try {
        const result = await jdbcTestConnection(params);
        return { ...result, mode: 'jdbc' };
      } catch (jdbcErr) {
        throw new Error(`JDBC 연결 실패: ${jdbcErr.message}`);
      }
    }
    if (isVerifierError && !getJdbcStatus().available) {
      throw new Error('NJS-116: 구형 Oracle 10g 인증 방식입니다. ⚙ 설정에서 JDBC 드라이버를 다운로드하면 자동으로 해결됩니다.');
    }
    throw e;
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

export async function connect(connInfo) {
  if (pools.has(connInfo.id)) {
    const existing = pools.get(connInfo.id);
    if (existing.type === 'jdbc') return { status: 'connected', mode: 'jdbc' };
    if (existing.pool?.status === oracledb.POOL_STATUS_OPEN) return { status: 'connected', mode: 'thin' };
  }
  let pool;
  try {
    pool = await oracledb.createPool({
      user: connInfo.username,
      password: connInfo.password,
      connectString: connectString(connInfo.host, connInfo.port, connInfo.serviceName),
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1,
    });
    // createPool() does NOT establish a real connection — getConnection() does.
    // We must probe here so NJS-116 is caught before we declare success.
    const probe = await pool.getConnection();
    await probe.close();
    pools.set(connInfo.id, { type: 'oracledb', pool, connectedAt: new Date().toISOString() });
    return { status: 'connected', mode: 'thin' };
  } catch (e) {
    if (pool) { try { await pool.close(0); } catch {} }
    if ((e.message.includes('NJS-116') || e.message.includes('password verifier')) && getJdbcStatus().available) {
      await jdbcConnect(connInfo);
      pools.set(connInfo.id, { type: 'jdbc', pool: null, connectedAt: new Date().toISOString() });
      return { status: 'connected', mode: 'jdbc' };
    }
    throw e;
  }
}

export async function disconnect(id) {
  const entry = pools.get(id);
  if (entry) {
    if (entry.type === 'jdbc') {
      await jdbcDisconnect(id);
    } else {
      await entry.pool.close(0);
    }
    pools.delete(id);
  }
  return { status: 'disconnected' };
}

export async function reconnect(connInfo) {
  await disconnect(connInfo.id);
  return connect(connInfo);
}

export function getStatus() {
  const result = {};
  for (const [id, entry] of pools) {
    result[id] = {
      connected: entry.type === 'jdbc' ? true : entry.pool.status === oracledb.POOL_STATUS_OPEN,
      connectedAt: entry.connectedAt,
      mode: entry.type === 'jdbc' ? 'jdbc' : 'thin',
    };
  }
  return result;
}

async function execute(id, sql, params = {}) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });
  if (entry.type === 'jdbc') {
    return jdbcExecute(id, sql, params);
  }
  const conn = await entry.pool.getConnection();
  try {
    return await conn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  } finally {
    await conn.close();
  }
}

export async function getSchemas(id) {
  const r = await execute(id,
    `SELECT USERNAME FROM ALL_USERS ORDER BY USERNAME`);
  return r.rows.map(r => r.USERNAME);
}

export async function searchObjects(id, schema, q, types) {
  const defaultTypes = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'SEQUENCE', 'SYNONYM'];
  const rawTypes = (types && types.length > 0) ? types : defaultTypes;
  const pattern = q.startsWith('*')
    ? `%${q.slice(1).toUpperCase()}%`
    : `${q.toUpperCase()}%`;

  // oracledb does not support array binds in IN clauses; build placeholders manually
  const placeholders = rawTypes.map((_, i) => `:type${i}`).join(', ');
  const sql = `
    SELECT OBJECT_NAME, OBJECT_TYPE, OWNER AS SCHEMA_NAME
    FROM ALL_OBJECTS
    WHERE OWNER = :schema
      AND OBJECT_NAME LIKE :pattern
      AND OBJECT_TYPE IN (${placeholders})
      AND STATUS = 'VALID'
    ORDER BY OBJECT_TYPE, OBJECT_NAME
    FETCH FIRST 50 ROWS ONLY
  `;
  const binds = { schema, pattern };
  rawTypes.forEach((t, i) => { binds[`type${i}`] = t; });
  const r = await execute(id, sql, binds);
  return r.rows.map(row => ({
    objectName: row.OBJECT_NAME,
    objectType: row.OBJECT_TYPE,
    schemaName: row.SCHEMA_NAME,
  }));
}

export async function getObjects(id, schema, type) {
  let sql, params = { schema };
  switch (type) {
    case 'TABLE':
      sql = `SELECT TABLE_NAME AS NAME FROM ALL_TABLES WHERE OWNER = :schema ORDER BY TABLE_NAME`;
      break;
    case 'VIEW':
      sql = `SELECT VIEW_NAME AS NAME FROM ALL_VIEWS WHERE OWNER = :schema ORDER BY VIEW_NAME`;
      break;
    case 'SEQUENCE':
      sql = `SELECT SEQUENCE_NAME AS NAME FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = :schema ORDER BY SEQUENCE_NAME`;
      break;
    default:
      sql = `SELECT OBJECT_NAME AS NAME FROM ALL_OBJECTS WHERE OWNER = :schema AND OBJECT_TYPE = :type ORDER BY OBJECT_NAME`;
      params = { schema, type };
  }
  const r = await execute(id, sql, params);
  return r.rows.map(r => r.NAME);
}

export async function getColumns(id, schema, tableName) {
  const [colResult, pkResult] = await Promise.all([
    execute(id,
      `SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.DATA_PRECISION, c.DATA_SCALE,
              c.NULLABLE, c.DATA_DEFAULT, c.COLUMN_ID, cc.COMMENTS
       FROM ALL_TAB_COLUMNS c
       LEFT JOIN ALL_COL_COMMENTS cc
         ON c.OWNER = cc.OWNER AND c.TABLE_NAME = cc.TABLE_NAME AND c.COLUMN_NAME = cc.COLUMN_NAME
       WHERE c.OWNER = :schema AND c.TABLE_NAME = :table
       ORDER BY c.COLUMN_ID`,
      { schema, table: tableName }
    ),
    execute(id,
      `SELECT c.COLUMN_NAME FROM ALL_CONSTRAINTS con
       JOIN ALL_CONS_COLUMNS c ON con.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND con.OWNER = c.OWNER
       WHERE con.OWNER = :schema AND con.TABLE_NAME = :table AND con.CONSTRAINT_TYPE = 'P'`,
      { schema, table: tableName }
    ),
  ]);
  const pkSet = new Set(pkResult.rows.map(r => r.COLUMN_NAME));
  return colResult.rows.map(col => ({ ...col, IS_PK: pkSet.has(col.COLUMN_NAME) }));
}

export async function getTableData(id, schema, tableName, { page = 1, limit = 100, orderBy, orderDir = 'ASC', filter } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const orderClause = orderBy ? `ORDER BY "${orderBy}" ${orderDir === 'DESC' ? 'DESC' : 'ASC'}` : 'ORDER BY 1';
  const whereClause = filter ? `WHERE ${filter}` : '';
  const dataSql = `SELECT * FROM "${schema}"."${tableName}" ${whereClause} ${orderClause} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
  const countSql = `SELECT COUNT(*) AS CNT FROM "${schema}"."${tableName}" ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    execute(id, dataSql, { offset, limit: Number(limit) }),
    execute(id, countSql),
  ]);
  const columns = dataResult.metaData?.map(m => m.name) || [];
  return {
    columns,
    rows: dataResult.rows,
    total: countResult.rows[0].CNT,
    page: Number(page),
    limit: Number(limit),
  };
}

export async function getTableDDL(id, schema, tableName) {
  const r = await execute(id,
    `SELECT DBMS_METADATA.GET_DDL('TABLE', :name, :schema) AS DDL FROM DUAL`,
    { name: tableName, schema }
  );
  return r.rows[0]?.DDL || '';
}

export async function getTableReferences(id, schema, tableName) {
  const r = await execute(id,
    `SELECT c.CONSTRAINT_NAME, cols.COLUMN_NAME, c.R_OWNER,
            rcols.TABLE_NAME AS R_TABLE, rcols.COLUMN_NAME AS R_COLUMN
     FROM ALL_CONSTRAINTS c
     JOIN ALL_CONS_COLUMNS cols
       ON c.CONSTRAINT_NAME = cols.CONSTRAINT_NAME AND c.OWNER = cols.OWNER
     JOIN ALL_CONS_COLUMNS rcols
       ON c.R_CONSTRAINT_NAME = rcols.CONSTRAINT_NAME AND c.R_OWNER = rcols.OWNER
     WHERE c.OWNER = :schema AND c.TABLE_NAME = :table AND c.CONSTRAINT_TYPE = 'R'
     ORDER BY cols.COLUMN_NAME`,
    { schema, table: tableName }
  );
  return r.rows;
}

// Gather full specification metadata for a single table:
//   table comment, columns (with PK flag + comments), indexes, foreign keys.
export async function getTableSpec(id, schema, tableName) {
  const [tabComment, columns, idxRows, fkRows] = await Promise.all([
    execute(id,
      `SELECT COMMENTS FROM ALL_TAB_COMMENTS WHERE OWNER = :schema AND TABLE_NAME = :table`,
      { schema, table: tableName }
    ).then(r => r.rows[0]?.COMMENTS || '').catch(() => ''),
    getColumns(id, schema, tableName),
    execute(id,
      `SELECT i.INDEX_NAME, i.UNIQUENESS, ic.COLUMN_NAME, ic.COLUMN_POSITION, ic.DESCEND
       FROM ALL_INDEXES i
       JOIN ALL_IND_COLUMNS ic
         ON i.INDEX_NAME = ic.INDEX_NAME AND i.OWNER = ic.INDEX_OWNER
       WHERE i.TABLE_OWNER = :schema AND i.TABLE_NAME = :table
       ORDER BY i.INDEX_NAME, ic.COLUMN_POSITION`,
      { schema, table: tableName }
    ).then(r => r.rows).catch(() => []),
    getTableReferences(id, schema, tableName).catch(() => []),
  ]);

  // Group index columns by index name
  const idxMap = new Map();
  for (const r of idxRows) {
    if (!idxMap.has(r.INDEX_NAME)) {
      idxMap.set(r.INDEX_NAME, { name: r.INDEX_NAME, unique: r.UNIQUENESS === 'UNIQUE', columns: [] });
    }
    idxMap.get(r.INDEX_NAME).columns.push(
      r.DESCEND === 'DESC' ? `${r.COLUMN_NAME} DESC` : r.COLUMN_NAME
    );
  }

  return {
    schema,
    name: tableName,
    comment: tabComment,
    columns,
    indexes: [...idxMap.values()],
    foreignKeys: fkRows.map(r => ({
      constraint: r.CONSTRAINT_NAME,
      column: r.COLUMN_NAME,
      refOwner: r.R_OWNER,
      refTable: r.R_TABLE,
      refColumn: r.R_COLUMN,
    })),
  };
}

// Schema-wide ERD: tables (with columns, PK/FK flags) + FK relationships.
export async function getSchemaErd(id, schema) {
  const [colRes, pkRes, fkRes] = await Promise.all([
    execute(id,
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
       FROM ALL_TAB_COLUMNS WHERE OWNER = :schema ORDER BY TABLE_NAME, COLUMN_ID`,
      { schema }),
    execute(id,
      `SELECT con.TABLE_NAME, cc.COLUMN_NAME
       FROM ALL_CONSTRAINTS con
       JOIN ALL_CONS_COLUMNS cc ON con.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND con.OWNER = cc.OWNER
       WHERE con.OWNER = :schema AND con.CONSTRAINT_TYPE = 'P'`,
      { schema }),
    execute(id,
      `SELECT c.TABLE_NAME AS CHILD_TABLE, cc.COLUMN_NAME AS CHILD_COLUMN,
              rc.TABLE_NAME AS PARENT_TABLE, rcc.COLUMN_NAME AS PARENT_COLUMN,
              c.CONSTRAINT_NAME
       FROM ALL_CONSTRAINTS c
       JOIN ALL_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
       JOIN ALL_CONSTRAINTS rc ON rc.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND rc.OWNER = c.R_OWNER
       JOIN ALL_CONS_COLUMNS rcc ON rcc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND rcc.OWNER = rc.OWNER
            AND rcc.POSITION = cc.POSITION
       WHERE c.OWNER = :schema AND c.CONSTRAINT_TYPE = 'R'
       ORDER BY c.CONSTRAINT_NAME, cc.POSITION`,
      { schema }),
  ]);

  const tables = new Map();
  for (const r of colRes.rows) {
    if (!tables.has(r.TABLE_NAME)) tables.set(r.TABLE_NAME, { name: r.TABLE_NAME, columns: [] });
    tables.get(r.TABLE_NAME).columns.push({
      name: r.COLUMN_NAME,
      type: buildColTypePart(r),
      nullable: r.NULLABLE === 'Y',
      pk: false, fk: false,
    });
  }

  const pkSet = new Set(pkRes.rows.map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
  const fkSet = new Set();
  const edgeMap = new Map();
  const edges = [];
  for (const r of fkRes.rows) {
    fkSet.add(`${r.CHILD_TABLE}.${r.CHILD_COLUMN}`);
    let e = edgeMap.get(r.CONSTRAINT_NAME);
    if (!e) {
      e = { name: r.CONSTRAINT_NAME, from: r.CHILD_TABLE, to: r.PARENT_TABLE, columns: [] };
      edgeMap.set(r.CONSTRAINT_NAME, e);
      edges.push(e);
    }
    e.columns.push({ from: r.CHILD_COLUMN, to: r.PARENT_COLUMN });
  }

  for (const [tname, t] of tables) {
    for (const c of t.columns) {
      if (pkSet.has(`${tname}.${c.name}`)) c.pk = true;
      if (fkSet.has(`${tname}.${c.name}`)) c.fk = true;
    }
  }

  return { schema, tables: [...tables.values()], edges };
}

export async function getViewDDL(id, schema, viewName) {
  const r = await execute(id,
    `SELECT DBMS_METADATA.GET_DDL('VIEW', :name, :schema) AS DDL FROM DUAL`,
    { name: viewName, schema }
  );
  return r.rows[0]?.DDL || '';
}

export async function getSource(id, schema, type, name) {
  const r = await execute(id,
    `SELECT TEXT FROM ALL_SOURCE
     WHERE OWNER = :schema AND NAME = :name AND TYPE = :type
     ORDER BY LINE`,
    { schema, name, type }
  );
  return r.rows.map(r => r.TEXT).join('');
}

export async function getObjectProperties(id, schema, type, name) {
  const r = await execute(id,
    `SELECT OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
     FROM ALL_OBJECTS
     WHERE OWNER = :schema AND OBJECT_NAME = :name AND OBJECT_TYPE = :type`,
    { schema, name, type }
  );
  return r.rows[0] || null;
}

export async function compileObject(id, schema, type, name) {
  // Oracle compile syntax differs for PACKAGE BODY
  const compileType = type === 'PACKAGE BODY' ? 'PACKAGE' : type;
  const compileSpec = type === 'PACKAGE BODY' ? 'COMPILE BODY' : 'COMPILE';
  await execute(id, `ALTER ${compileType} "${schema}"."${name}" ${compileSpec}`, {});
  const r = await execute(id,
    `SELECT LINE, POSITION, TEXT, ATTRIBUTE FROM ALL_ERRORS
     WHERE OWNER = :schema AND NAME = :name AND TYPE = :type
     ORDER BY SEQUENCE`,
    { schema, name, type },
  );
  const errors = (r.rows || []).map(row => ({
    line: row.LINE, position: row.POSITION, text: row.TEXT, attribute: row.ATTRIBUTE,
  }));
  return { success: errors.filter(e => e.attribute === 'ERROR').length === 0, errors };
}

export async function saveSource(id, schema, type, name, source) {
  const trimmed = source.trimStart();
  // ALL_SOURCE rows don't include "CREATE OR REPLACE", so we prepend if missing
  const hasCR = /^CREATE\s+OR\s+REPLACE\s+/i.test(trimmed);
  let ddl = hasCR ? trimmed : `CREATE OR REPLACE ${trimmed}`;
  // node-oracledb requires PL/SQL block to end with ';'
  // Do NOT strip it — stripping causes Oracle to store END without ';' in ALL_SOURCE
  if (!/;\s*$/.test(ddl)) ddl += ';';
  await execute(id, ddl, {});
  return { success: true };
}

export async function getSequenceInfo(id, schema, name) {
  const r = await execute(id,
    `SELECT * FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = :schema AND SEQUENCE_NAME = :name`,
    { schema, name }
  );
  return r.rows[0] || null;
}

// Strip leading line/block comments to correctly detect statement type
function stripLeadingComments(s) {
  let cur = s.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (cur.startsWith('--')) {
      const nl = cur.indexOf('\n');
      cur = (nl === -1 ? '' : cur.slice(nl + 1)).trim();
      changed = true;
    }
    if (cur.startsWith('/*')) {
      const end = cur.indexOf('*/');
      cur = (end === -1 ? '' : cur.slice(end + 2)).trim();
      changed = true;
    }
  }
  return cur;
}

export async function executeSQL(id, sql, schema, { page = 1, limit = 200 } = {}) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  // Strip trailing semicolons / whitespace
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const isSelect = /^\s*(SELECT|WITH)\b/i.test(stripLeadingComments(cleanSql));
  const pageNum = Math.max(1, Number(page) || 1);
  const lim = Math.min(2000, Math.max(1, Number(limit) || 200));
  const offset = (pageNum - 1) * lim;

  if (entry.type === 'jdbc') {
    const start = Date.now();
    if (isSelect) {
      // DBeaver-style: only pull this page (+1 probe row to detect "more"),
      // never fetch the whole result set. No COUNT(*) — keeps it instant.
      const probe = lim + 1;
      const pagedSql = `SELECT * FROM (${cleanSql}) OFFSET ${offset} ROWS FETCH NEXT ${probe} ROWS ONLY`;
      const result = await jdbcExecute(id, pagedSql, {});
      const elapsed = Date.now() - start;
      const rows = result.rows || [];
      const hasMore = rows.length > lim;
      if (hasMore) rows.length = lim; // drop the probe row
      return {
        columns: (result.metaData || []).map(m => m.name),
        rows,
        rowCount: rows.length,
        total: null,        // not counted — use countSQL() on demand
        hasMore,
        page: pageNum, limit: lim,
        executionTime: elapsed,
      };
    }
    const result = await jdbcExecute(id, cleanSql, {});
    const elapsed = Date.now() - start;
    return {
      columns: [], rows: [],
      rowCount: result.rowsAffected || 0,
      executionTime: elapsed,
      message: `${result.rowsAffected || 0} row(s) affected`,
    };
  }

  const conn = await entry.pool.getConnection();
  const start = Date.now();
  try {
    if (schema) await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`);

    if (isSelect) {
      // DBeaver-style fetch: pull only this page plus a single probe row to
      // detect whether more rows exist. We deliberately skip COUNT(*) — counting
      // a 100k+ row result forces Oracle to run the whole query and is the main
      // reason large queries felt slow. Exact total is available on demand via
      // countSQL() (the "전체 건수" button).
      const probe = lim + 1;
      const pagedSql = `SELECT * FROM (${cleanSql}) OFFSET :offset ROWS FETCH NEXT :probe ROWS ONLY`;
      const dataRes = await conn.execute(
        pagedSql,
        { offset, probe },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: probe }
      );
      const elapsed = Date.now() - start;
      const rows = dataRes.rows || [];
      const hasMore = rows.length > lim;
      if (hasMore) rows.length = lim; // drop the probe row
      return {
        columns: dataRes.metaData.map(m => m.name),
        rows,
        rowCount: rows.length,
        total: null,        // not counted — use countSQL() on demand
        hasMore,
        page: pageNum, limit: lim,
        executionTime: elapsed,
      };
    }

    const result = await conn.execute(cleanSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const elapsed = Date.now() - start;
    await conn.commit();
    return {
      columns: [], rows: [],
      rowCount: result.rowsAffected || 0,
      executionTime: elapsed,
      message: `${result.rowsAffected || 0} row(s) affected`,
    };
  } finally {
    await conn.close();
  }
}

// On-demand exact row count for a SELECT (the "전체 건수" button).
// Kept separate from executeSQL so normal query execution stays instant.
export async function countSQL(id, sql, schema) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  if (!/^\s*(SELECT|WITH)\b/i.test(cleanSql))
    throw Object.assign(new Error('COUNT is only available for SELECT statements'), { status: 400 });

  const countSql = `SELECT COUNT(*) AS CNT FROM (${cleanSql})`;
  const start = Date.now();

  if (entry.type === 'jdbc') {
    const result = await jdbcExecute(id, countSql, {});
    const row = (result.rows && result.rows[0]) || {};
    const total = Number(row.CNT ?? Object.values(row)[0] ?? 0);
    return { total, executionTime: Date.now() - start };
  }

  const conn = await entry.pool.getConnection();
  try {
    if (schema) await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`);
    const res = await conn.execute(countSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return { total: Number(res.rows[0].CNT), executionTime: Date.now() - start };
  } finally {
    await conn.close();
  }
}

// ──────────────────────────────────────────────────────────────
// Column Reorder Script Generator
// Oracle does not support in-place column reordering;
// we must recreate the table with the desired column order.
// ──────────────────────────────────────────────────────────────

function buildColTypePart(col) {
  const dt = col.DATA_TYPE;
  if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(dt))
    return `${dt}(${col.DATA_LENGTH})`;
  if (dt === 'NUMBER')
    return col.DATA_PRECISION != null
      ? `NUMBER(${col.DATA_PRECISION}${col.DATA_SCALE ? ',' + col.DATA_SCALE : ''})`
      : 'NUMBER';
  if (dt === 'FLOAT')
    return col.DATA_PRECISION != null ? `FLOAT(${col.DATA_PRECISION})` : 'FLOAT';
  if (dt === 'RAW')
    return `RAW(${col.DATA_LENGTH})`;
  if (dt.startsWith('TIMESTAMP') && col.DATA_SCALE != null && col.DATA_SCALE !== 6)
    return `TIMESTAMP(${col.DATA_SCALE})`;
  return dt;
}

function buildColDef(col) {
  const typePart = buildColTypePart(col);
  const defPart  = col.DATA_DEFAULT != null ? ` DEFAULT ${col.DATA_DEFAULT.trim()}` : '';
  const nullPart = col.NULLABLE === 'N' ? ' NOT NULL' : '';
  return `  ${col.COLUMN_NAME.padEnd(32)}${typePart}${defPart}${nullPart}`;
}

export async function generateColumnReorderScript(id, schema, tableName, newColumnOrder) {
  const tmpName = `${tableName}_REORDER_TMP`;

  // ── Parallel metadata queries ──────────────────────────────
  const [colResult, conResult, refFkResult, idxResult, cmtResult, grantResult] = await Promise.all([
    execute(id,
      `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
       FROM ALL_TAB_COLUMNS
       WHERE OWNER = :schema AND TABLE_NAME = :table
       ORDER BY COLUMN_ID`,
      { schema, table: tableName }),

    execute(id,
      `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, c.GENERATED,
              c.R_OWNER, c.DELETE_RULE,
              rc.TABLE_NAME AS R_TABLE_NAME,
              cc.COLUMN_NAME, cc.POSITION,
              rcc.COLUMN_NAME AS R_COLUMN_NAME
       FROM ALL_CONSTRAINTS c
       JOIN ALL_CONS_COLUMNS cc
         ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
       LEFT JOIN ALL_CONSTRAINTS rc
         ON rc.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND rc.OWNER = c.R_OWNER
       LEFT JOIN ALL_CONS_COLUMNS rcc
         ON rcc.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND rcc.OWNER = c.R_OWNER
            AND rcc.POSITION = cc.POSITION
       WHERE c.OWNER = :schema AND c.TABLE_NAME = :table
         AND c.CONSTRAINT_TYPE IN ('P','U','R','C')
       ORDER BY c.CONSTRAINT_TYPE, c.CONSTRAINT_NAME, cc.POSITION`,
      { schema, table: tableName }),

    execute(id,
      `SELECT c.OWNER, c.TABLE_NAME, c.CONSTRAINT_NAME, c.STATUS, c.DELETE_RULE,
              cc.COLUMN_NAME, cc.POSITION,
              rcc.COLUMN_NAME AS R_COLUMN_NAME
       FROM ALL_CONSTRAINTS c
       JOIN ALL_CONS_COLUMNS cc
         ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
       JOIN ALL_CONSTRAINTS rc
         ON rc.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND rc.OWNER = c.R_OWNER
       JOIN ALL_CONS_COLUMNS rcc
         ON rcc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND rcc.OWNER = rc.OWNER
            AND rcc.POSITION = cc.POSITION
       WHERE c.CONSTRAINT_TYPE = 'R'
         AND rc.OWNER = :schema AND rc.TABLE_NAME = :table
         AND (c.OWNER != :schema OR c.TABLE_NAME != :table)
       ORDER BY c.OWNER, c.TABLE_NAME, c.CONSTRAINT_NAME, cc.POSITION`,
      { schema, table: tableName }),

    execute(id,
      `SELECT i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS,
              ic.COLUMN_NAME, ic.COLUMN_POSITION, ic.DESCEND
       FROM ALL_INDEXES i
       JOIN ALL_IND_COLUMNS ic
         ON i.INDEX_NAME = ic.INDEX_NAME AND i.OWNER = ic.INDEX_OWNER
       WHERE i.OWNER = :schema AND i.TABLE_NAME = :table
         AND NOT EXISTS (
           SELECT 1 FROM ALL_CONSTRAINTS con
           WHERE con.OWNER = i.OWNER AND con.INDEX_NAME = i.INDEX_NAME
         )
       ORDER BY i.INDEX_NAME, ic.COLUMN_POSITION`,
      { schema, table: tableName }),

    execute(id,
      `SELECT COLUMN_NAME, COMMENTS FROM ALL_COL_COMMENTS
       WHERE OWNER = :schema AND TABLE_NAME = :table AND COMMENTS IS NOT NULL`,
      { schema, table: tableName }),

    execute(id,
      `SELECT GRANTEE, PRIVILEGE, GRANTABLE FROM ALL_TAB_PRIVS
       WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table
       ORDER BY GRANTEE, PRIVILEGE`,
      { schema, table: tableName }).catch(() => ({ rows: [] })),
  ]);

  // Try to get CHECK constraint conditions (LONG type in old Oracle; wrap with try-catch)
  const checkConditions = {};
  try {
    const ckr = await execute(id,
      `SELECT CONSTRAINT_NAME, TO_CHAR(SEARCH_CONDITION) AS COND
       FROM ALL_CONSTRAINTS
       WHERE OWNER = :schema AND TABLE_NAME = :table
         AND CONSTRAINT_TYPE = 'C' AND GENERATED = 'USER NAME'`,
      { schema, table: tableName });
    for (const r of ckr.rows) if (r.COND) checkConditions[r.CONSTRAINT_NAME] = r.COND;
  } catch { /* ignore */ }

  // ── Group constraint rows by name ──────────────────────────
  const conMap = {};
  for (const row of conResult.rows) {
    if (!conMap[row.CONSTRAINT_NAME]) {
      conMap[row.CONSTRAINT_NAME] = {
        type: row.CONSTRAINT_TYPE,
        status: row.STATUS,
        generated: row.GENERATED,
        r_owner: row.R_OWNER,
        r_table: row.R_TABLE_NAME,
        delete_rule: row.DELETE_RULE,
        cols: [],
        r_cols: [],
      };
    }
    conMap[row.CONSTRAINT_NAME].cols.push(row.COLUMN_NAME);
    if (row.R_COLUMN_NAME) conMap[row.CONSTRAINT_NAME].r_cols.push(row.R_COLUMN_NAME);
  }

  // Group ref-FK rows by key
  const refFkMap = {};
  for (const row of refFkResult.rows) {
    const key = `${row.OWNER}.${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`;
    if (!refFkMap[key]) {
      refFkMap[key] = {
        owner: row.OWNER, table_name: row.TABLE_NAME, constraint_name: row.CONSTRAINT_NAME,
        status: row.STATUS, delete_rule: row.DELETE_RULE, cols: [], r_cols: [],
      };
    }
    refFkMap[key].cols.push(row.COLUMN_NAME);
    refFkMap[key].r_cols.push(row.R_COLUMN_NAME);
  }

  // Group index rows by name
  const idxMap = {};
  for (const row of idxResult.rows) {
    if (!idxMap[row.INDEX_NAME])
      idxMap[row.INDEX_NAME] = { unique: row.UNIQUENESS === 'UNIQUE', cols: [], descends: [] };
    idxMap[row.INDEX_NAME].cols.push(row.COLUMN_NAME);
    idxMap[row.INDEX_NAME].descends.push(row.DESCEND);
  }

  // Column definition map
  const colDefs = Object.fromEntries(colResult.rows.map(c => [c.COLUMN_NAME, c]));

  // Validate newColumnOrder contains all columns
  const allCols = colResult.rows.map(c => c.COLUMN_NAME);
  const orderedCols = newColumnOrder.filter(c => allCols.includes(c));
  // Add any missing columns at the end (defensive)
  for (const c of allCols) if (!orderedCols.includes(c)) orderedCols.push(c);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const qSchema = `"${schema}"`;
  const qTable  = `"${tableName}"`;
  const qTmp    = `"${tmpName}"`;

  const lines = [];
  const ln  = s => lines.push(s);
  const sep = () => ln('');

  // ── Header ────────────────────────────────────────────────
  ln(`-- ${'='.repeat(60)}`);
  ln(`-- 컬럼 순서 변경 마이그레이션 스크립트`);
  ln(`-- 대상 테이블 : ${schema}.${tableName}`);
  ln(`-- 생성 시각   : ${now}`);
  ln(`-- ${'='.repeat(60)}`);
  ln(`-- ⚠  주의: 테이블 재생성 방식입니다.`);
  ln(`--    실행 전 반드시 전체 백업을 수행하세요.`);
  ln(`-- ${'='.repeat(60)}`);

  // ── Step 1: Drop referencing FKs from other tables ────────
  const refFkEntries = Object.values(refFkMap);
  if (refFkEntries.length > 0) {
    sep();
    ln(`-- [Step 1] 이 테이블을 참조하는 외래키(FK) 삭제`);
    for (const fk of refFkEntries) {
      ln(`ALTER TABLE "${fk.owner}"."${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}";`);
    }
  }

  // ── Step 2: Create temp table ─────────────────────────────
  sep();
  ln(`-- [Step 2] 임시 테이블 생성 (새 컬럼 순서)`);
  ln(`CREATE TABLE ${qSchema}.${qTmp} (`);
  const colLines = orderedCols.map((cname, idx) => {
    const def = buildColDef(colDefs[cname]);
    return def + (idx < orderedCols.length - 1 ? ',' : '');
  });
  for (const cl of colLines) ln(cl);
  ln(`);`);

  // ── Step 3: Copy data ─────────────────────────────────────
  sep();
  ln(`-- [Step 3] 데이터 복사`);
  const colList = orderedCols.map(c => `"${c}"`).join(', ');
  ln(`INSERT /*+ APPEND */ INTO ${qSchema}.${qTmp} (${colList})`);
  ln(`  SELECT ${colList} FROM ${qSchema}.${qTable};`);
  ln(`COMMIT;`);

  // ── Step 4: Drop original table ───────────────────────────
  sep();
  ln(`-- [Step 4] 원본 테이블 삭제`);
  ln(`DROP TABLE ${qSchema}.${qTable} PURGE;`);

  // ── Step 5: Rename temp table ─────────────────────────────
  sep();
  ln(`-- [Step 5] 임시 테이블 이름 변경`);
  ln(`ALTER TABLE ${qSchema}.${qTmp} RENAME TO "${tableName}";`);

  // ── Step 6: Recreate PK ───────────────────────────────────
  const pkEntries = Object.entries(conMap).filter(([, v]) => v.type === 'P');
  if (pkEntries.length > 0) {
    sep();
    ln(`-- [Step 6] PRIMARY KEY 재생성`);
    for (const [cname, con] of pkEntries) {
      const cols = con.cols.map(c => `"${c}"`).join(', ');
      ln(`ALTER TABLE ${qSchema}.${qTable} ADD CONSTRAINT "${cname}" PRIMARY KEY (${cols});`);
    }
  }

  // ── Step 7: Recreate UNIQUE constraints ───────────────────
  const ukEntries = Object.entries(conMap).filter(([, v]) => v.type === 'U');
  if (ukEntries.length > 0) {
    sep();
    ln(`-- [Step 7] UNIQUE 제약조건 재생성`);
    for (const [cname, con] of ukEntries) {
      const cols = con.cols.map(c => `"${c}"`).join(', ');
      ln(`ALTER TABLE ${qSchema}.${qTable} ADD CONSTRAINT "${cname}" UNIQUE (${cols});`);
    }
  }

  // ── Step 8: Recreate CHECK constraints ────────────────────
  const ckEntries = Object.entries(conMap).filter(([cname, v]) =>
    v.type === 'C' && v.generated !== 'GENERATED NAME' && checkConditions[cname]);
  if (ckEntries.length > 0) {
    sep();
    ln(`-- [Step 8] CHECK 제약조건 재생성`);
    for (const [cname] of ckEntries) {
      ln(`ALTER TABLE ${qSchema}.${qTable} ADD CONSTRAINT "${cname}" CHECK (${checkConditions[cname]});`);
    }
  }

  // ── Step 9: Recreate FK constraints on this table ─────────
  const fkEntries = Object.entries(conMap).filter(([, v]) => v.type === 'R');
  if (fkEntries.length > 0) {
    sep();
    ln(`-- [Step 9] 외래키(FK) 재생성`);
    for (const [cname, con] of fkEntries) {
      const localCols = con.cols.map(c => `"${c}"`).join(', ');
      const refCols   = con.r_cols.map(c => `"${c}"`).join(', ');
      const refOwner  = con.r_owner || schema;
      const onDelete  = con.delete_rule && con.delete_rule !== 'NO ACTION'
        ? ` ON DELETE ${con.delete_rule}` : '';
      ln(`ALTER TABLE ${qSchema}.${qTable} ADD CONSTRAINT "${cname}"`);
      ln(`  FOREIGN KEY (${localCols}) REFERENCES "${refOwner}"."${con.r_table}" (${refCols})${onDelete};`);
    }
  }

  // ── Step 10: Recreate non-constraint indexes ──────────────
  if (Object.keys(idxMap).length > 0) {
    sep();
    ln(`-- [Step 10] 인덱스 재생성`);
    for (const [idxName, idx] of Object.entries(idxMap)) {
      const colParts = idx.cols.map((c, i) =>
        `"${c}"${idx.descends[i] === 'DESC' ? ' DESC' : ''}`).join(', ');
      const unique = idx.unique ? 'UNIQUE ' : '';
      ln(`CREATE ${unique}INDEX "${schema}"."${idxName}" ON ${qSchema}.${qTable} (${colParts});`);
    }
  }

  // ── Step 11: Recreate referencing FKs from other tables ───
  if (refFkEntries.length > 0) {
    sep();
    ln(`-- [Step 11] 이 테이블을 참조하는 외래키(FK) 재생성`);
    for (const fk of refFkEntries) {
      const localCols = fk.cols.map(c => `"${c}"`).join(', ');
      const refCols   = fk.r_cols.map(c => `"${c}"`).join(', ');
      const onDelete  = fk.delete_rule && fk.delete_rule !== 'NO ACTION'
        ? ` ON DELETE ${fk.delete_rule}` : '';
      ln(`ALTER TABLE "${fk.owner}"."${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}"`);
      ln(`  FOREIGN KEY (${localCols}) REFERENCES ${qSchema}.${qTable} (${refCols})${onDelete};`);
    }
  }

  // ── Step 12: Column comments ──────────────────────────────
  if (cmtResult.rows.length > 0) {
    sep();
    ln(`-- [Step 12] 컬럼 주석 재생성`);
    for (const r of cmtResult.rows) {
      const escaped = (r.COMMENTS || '').replace(/'/g, "''");
      ln(`COMMENT ON COLUMN ${qSchema}.${qTable}."${r.COLUMN_NAME}" IS '${escaped}';`);
    }
  }

  // ── Step 13: Grants ───────────────────────────────────────
  if (grantResult.rows.length > 0) {
    sep();
    ln(`-- [Step 13] 권한 재생성`);
    for (const r of grantResult.rows) {
      const withGrant = r.GRANTABLE === 'YES' ? ' WITH GRANT OPTION' : '';
      ln(`GRANT ${r.PRIVILEGE} ON ${qSchema}.${qTable} TO "${r.GRANTEE}"${withGrant};`);
    }
  }

  sep();
  ln(`-- 완료`);

  return lines.join('\n');
}

// Execute a list of SQL statements sequentially, stopping on first error
export async function executeScriptStatements(id, statements, schema) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  const results = [];
  let conn;
  try {
    if (entry.type === 'jdbc') {
      if (schema) await jdbcExecute(id, `ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`, {}).catch(() => {});
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;
        try {
          await jdbcExecute(id, stmt, {});
          results.push({ index: i, ok: true });
        } catch (e) {
          results.push({ index: i, ok: false, error: e.message, statement: stmt });
          return { success: false, executedCount: i, results };
        }
      }
      return { success: true, executedCount: statements.length, results };
    }

    conn = await entry.pool.getConnection();
    if (schema) await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`).catch(() => {});
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      try {
        await conn.execute(stmt);
        results.push({ index: i, ok: true });
      } catch (e) {
        results.push({ index: i, ok: false, error: e.message, statement: stmt });
        return { success: false, executedCount: i, results };
      }
    }
    return { success: true, executedCount: statements.length, results };
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}

export async function explainSQL(id, sql, schema) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const stmtId = `SD${Date.now()}`;

  if (entry.type === 'jdbc') {
    // JDBC path: run EXPLAIN PLAN then query PLAN_TABLE
    try {
      await jdbcExecute(id, `EXPLAIN PLAN SET STATEMENT_ID = '${stmtId}' FOR ${cleanSql}`, {});
      const r = await jdbcExecute(id,
        `SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE','${stmtId}','ALL'))`, {});
      const planText = (r.rows || []).map(row => Object.values(row)[0]).join('\n');
      jdbcExecute(id, `DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = '${stmtId}'`, {}).catch(() => {});
      return planText;
    } catch (e) {
      throw new Error(`실행계획 조회 실패: ${e.message}`);
    }
  }

  const conn = await entry.pool.getConnection();
  try {
    if (schema) await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`);

    await conn.execute(`EXPLAIN PLAN SET STATEMENT_ID = '${stmtId}' FOR ${cleanSql}`);

    const result = await conn.execute(
      `SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', :sid, 'ALL'))`,
      { sid: stmtId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const planText = (result.rows || []).map(r => r.PLAN_TABLE_OUTPUT).join('\n');

    // Clean up plan table entry (best-effort)
    conn.execute(`DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = '${stmtId}'`)
      .then(() => conn.commit()).catch(() => {});

    return planText;
  } finally {
    await conn.close();
  }
}

// ── DML 단일 문장 실행 (UPDATE / INSERT / DELETE) ──
export async function executeDml(id, sql, binds = {}) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  if (entry.type === 'jdbc') {
    const result = await jdbcExecute(id, sql, binds);
    return { rowsAffected: result.rowsAffected || 0 };
  }

  const conn = await entry.pool.getConnection();
  try {
    const result = await conn.execute(sql, binds, {
      autoCommit: true,
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return { rowsAffected: result.rowsAffected };
  } finally {
    await conn.close();
  }
}

// Raw query execution — exposed for routes that need ad-hoc queries
export async function executeRaw(id, sql, params = {}) {
  return execute(id, sql, params);
}

// ── 트랜잭션 관리 (Thin/Thick 모드 전용) ──
const transactions = new Map(); // txId → { conn, id }

export async function beginTransaction(id) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });
  if (entry.type === 'jdbc') throw Object.assign(new Error('트랜잭션 제어는 JDBC 모드에서 지원되지 않습니다'), { status: 400 });

  const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const conn = await entry.pool.getConnection();
  transactions.set(txId, { conn, id });
  return { txId };
}

export async function executeInTransaction(txId, sql, binds = {}) {
  const tx = transactions.get(txId);
  if (!tx) throw Object.assign(new Error('트랜잭션을 찾을 수 없습니다'), { status: 404 });
  const result = await tx.conn.execute(sql, binds, {
    autoCommit: false,
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return { rowsAffected: result.rowsAffected ?? 0 };
}

export async function commitTransaction(txId) {
  const tx = transactions.get(txId);
  if (!tx) throw Object.assign(new Error('트랜잭션을 찾을 수 없습니다'), { status: 404 });
  try {
    await tx.conn.commit();
  } finally {
    await tx.conn.close().catch(() => {});
    transactions.delete(txId);
  }
  return { success: true };
}

export async function rollbackTransaction(txId) {
  const tx = transactions.get(txId);
  if (!tx) throw Object.assign(new Error('트랜잭션을 찾을 수 없습니다'), { status: 404 });
  try {
    await tx.conn.rollback();
  } finally {
    await tx.conn.close().catch(() => {});
    transactions.delete(txId);
  }
  return { success: true };
}

process.on('SIGTERM', async () => {
  for (const [, entry] of pools) {
    try { await entry.pool.close(0); } catch {}
  }
});
