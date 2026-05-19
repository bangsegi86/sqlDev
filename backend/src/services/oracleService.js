import oracledb from 'oracledb';

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const pools = new Map();

function connectString(host, port, serviceName) {
  return `${host}:${port}/${serviceName}`;
}

export async function testConnection({ host, port, serviceName, username, password }) {
  let conn;
  const start = Date.now();
  try {
    conn = await oracledb.getConnection({
      user: username,
      password,
      connectString: connectString(host, port, serviceName),
    });
    const result = await conn.execute('SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1');
    const banner = result.rows?.[0]?.BANNER || 'Oracle Database';
    return { success: true, latencyMs: Date.now() - start, serverVersion: banner };
  } finally {
    if (conn) await conn.close();
  }
}

export async function connect(connInfo) {
  if (pools.has(connInfo.id)) {
    const existing = pools.get(connInfo.id);
    if (existing.pool.status === oracledb.POOL_STATUS_OPEN) return { status: 'connected' };
  }
  const pool = await oracledb.createPool({
    user: connInfo.username,
    password: connInfo.password,
    connectString: connectString(connInfo.host, connInfo.port, connInfo.serviceName),
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
  });
  pools.set(connInfo.id, { pool, connectedAt: new Date().toISOString() });
  return { status: 'connected' };
}

export async function disconnect(id) {
  const entry = pools.get(id);
  if (entry) {
    await entry.pool.close(0);
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
      connected: entry.pool.status === oracledb.POOL_STATUS_OPEN,
      connectedAt: entry.connectedAt,
    };
  }
  return result;
}

async function execute(id, sql, params = {}) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });
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
      `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
              NULLABLE, DATA_DEFAULT, COLUMN_ID
       FROM ALL_TAB_COLUMNS
       WHERE OWNER = :schema AND TABLE_NAME = :table
       ORDER BY COLUMN_ID`,
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

export async function getTableData(id, schema, tableName, { page = 1, limit = 100, orderBy, orderDir = 'ASC' } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const orderClause = orderBy ? `ORDER BY "${orderBy}" ${orderDir === 'DESC' ? 'DESC' : 'ASC'}` : 'ORDER BY 1';
  const dataSql = `SELECT * FROM "${schema}"."${tableName}" ${orderClause} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
  const countSql = `SELECT COUNT(*) AS CNT FROM "${schema}"."${tableName}"`;

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

export async function executeSQL(id, sql, schema) {
  const entry = pools.get(id);
  if (!entry) throw Object.assign(new Error('Not connected'), { status: 400 });
  const conn = await entry.pool.getConnection();
  const start = Date.now();
  try {
    if (schema) {
      await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${schema}"`);
    }
    const result = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const elapsed = Date.now() - start;

    if (result.metaData) {
      return {
        columns: result.metaData.map(m => m.name),
        rows: result.rows || [],
        rowCount: result.rows?.length || 0,
        executionTime: elapsed,
      };
    }
    await conn.commit();
    return {
      columns: [],
      rows: [],
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
