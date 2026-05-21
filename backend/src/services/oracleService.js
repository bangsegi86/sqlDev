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

export async function getSequenceInfo(id, schema, name) {
  const r = await execute(id,
    `SELECT * FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = :schema AND SEQUENCE_NAME = :name`,
    { schema, name }
  );
  return r.rows[0] || null;
}

export async function executeSQL(id, sql, schema, { page = 1, limit = 200 } = {}) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });

  // Strip trailing semicolons / whitespace
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const isSelect = /^\s*(SELECT|WITH)\b/i.test(cleanSql);
  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(2000, Math.max(1, Number(limit) || 200));
  const offset = (pg - 1) * lim;

  if (entry.type === 'jdbc') {
    const start = Date.now();
    const result = await jdbcExecute(id, cleanSql, {});
    const elapsed = Date.now() - start;
    if (result.metaData) {
      const allRows = result.rows || [];
      const pageRows = allRows.slice(offset, offset + lim);
      return {
        columns: result.metaData.map(m => m.name),
        rows: pageRows,
        rowCount: pageRows.length,
        total: allRows.length,
        page: pg, limit: lim,
        executionTime: elapsed,
      };
    }
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
      const pagedSql = `SELECT * FROM (${cleanSql}) OFFSET :offset ROWS FETCH NEXT :lim ROWS ONLY`;
      const countSql = `SELECT COUNT(*) AS CNT FROM (${cleanSql})`;
      const [dataRes, countRes] = await Promise.all([
        conn.execute(pagedSql, { offset, lim }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
        conn.execute(countSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      ]);
      const elapsed = Date.now() - start;
      return {
        columns: dataRes.metaData.map(m => m.name),
        rows: dataRes.rows || [],
        rowCount: dataRes.rows?.length || 0,
        total: countRes.rows[0].CNT,
        page: pg, limit: lim,
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

process.on('SIGTERM', async () => {
  for (const [, entry] of pools) {
    try { await entry.pool.close(0); } catch {}
  }
});
