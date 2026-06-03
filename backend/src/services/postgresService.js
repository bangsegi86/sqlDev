// ─────────────────────────────────────────────────────────────────────────
// PostgreSQL 서비스
//
// oracleService.js 와 동일한 인터페이스를 PostgreSQL 용으로 구현합니다.
// 라우트(dbService 디스패처)는 연결의 dbType 에 따라 이 모듈로 위임합니다.
//
// 프론트엔드 호환을 위해 컬럼/시퀀스 등의 결과 필드명은 Oracle 과 동일하게
// 대문자 별칭("COLUMN_NAME" 등)으로 맞춥니다. (pg 는 기본적으로 식별자를
// 소문자로 반환하므로 별칭에 큰따옴표를 사용해 대문자를 유지합니다.)
// ─────────────────────────────────────────────────────────────────────────
import pg from 'pg';

const { Pool } = pg;

// 숫자/날짜형이 문자열로 깨지지 않도록 기본 파서를 사용한다.
// (대량 컬럼 호환을 위해 NUMERIC 은 문자열 그대로 두는 pg 기본 동작 유지)

const pools = new Map(); // id → { pool, connectedAt }

function pgConfig(c) {
  return {
    host: c.host,
    port: Number(c.port) || 5432,
    database: c.database || c.serviceName || 'postgres',
    user: c.username,
    password: c.password,
  };
}

function entryOf(id) {
  const e = pools.get(id);
  if (!e) throw Object.assign(new Error('Not connected'), { status: 400 });
  return e;
}

// 한 번의 질의 실행 (풀에서 클라이언트 획득 → 반환)
async function q(id, text, values = []) {
  const { pool } = entryOf(id);
  const client = await pool.connect();
  try {
    return await client.query({ text, values });
  } finally {
    client.release();
  }
}

const qIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

// ── 연결 테스트 ──
export async function testConnection(params) {
  const pool = new Pool({ ...pgConfig(params), max: 1, connectionTimeoutMillis: 8000 });
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      const r = await client.query('SELECT version() AS v');
      return {
        success: true,
        latencyMs: Date.now() - start,
        serverVersion: r.rows[0]?.v || 'PostgreSQL',
        mode: 'pg',
      };
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── 연결 ──
export async function connect(connInfo) {
  if (pools.has(connInfo.id)) return { status: 'connected', mode: 'pg' };
  const pool = new Pool({
    ...pgConfig(connInfo),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  // 풀 생성만으로는 실제 연결이 검증되지 않으므로 한 번 프로브한다.
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } catch (e) {
    client.release();
    await pool.end().catch(() => {});
    throw e;
  }
  client.release();
  pools.set(connInfo.id, { pool, connectedAt: new Date().toISOString() });
  return { status: 'connected', mode: 'pg' };
}

export async function disconnect(id) {
  const e = pools.get(id);
  if (e) {
    await e.pool.end().catch(() => {});
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
  for (const [id, e] of pools) {
    result[id] = { connected: true, connectedAt: e.connectedAt, mode: 'pg' };
  }
  return result;
}

// ── 스키마 목록 ──
export async function getSchemas(id) {
  const r = await q(id,
    `SELECT schema_name AS "NAME"
     FROM information_schema.schemata
     WHERE schema_name NOT LIKE 'pg_temp%'
       AND schema_name NOT LIKE 'pg_toast%'
       AND schema_name NOT IN ('pg_catalog', 'information_schema')
     ORDER BY schema_name`);
  return r.rows.map(row => row.NAME);
}

// ── 오브젝트 목록 ──
export async function getObjects(id, schema, type) {
  let sql, values = [schema];
  switch (type) {
    case 'TABLE':
      sql = `SELECT table_name AS "NAME" FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'
             ORDER BY table_name`;
      break;
    case 'VIEW':
      sql = `SELECT table_name AS "NAME" FROM information_schema.views
             WHERE table_schema = $1 ORDER BY table_name`;
      break;
    case 'SEQUENCE':
      sql = `SELECT sequence_name AS "NAME" FROM information_schema.sequences
             WHERE sequence_schema = $1 ORDER BY sequence_name`;
      break;
    case 'FUNCTION':
      sql = `SELECT p.proname AS "NAME"
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND p.prokind = 'f'
             ORDER BY p.proname`;
      break;
    case 'PROCEDURE':
      sql = `SELECT p.proname AS "NAME"
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1 AND p.prokind = 'p'
             ORDER BY p.proname`;
      break;
    case 'TRIGGER':
      sql = `SELECT DISTINCT trigger_name AS "NAME" FROM information_schema.triggers
             WHERE trigger_schema = $1 ORDER BY trigger_name`;
      break;
    case 'MATERIALIZED VIEW':
      sql = `SELECT matviewname AS "NAME" FROM pg_matviews
             WHERE schemaname = $1 ORDER BY matviewname`;
      break;
    default:
      return [];
  }
  const r = await q(id, sql, values);
  return r.rows.map(row => row.NAME);
}

// ── 컬럼 목록 (PK 플래그 포함) ──
export async function getColumns(id, schema, tableName) {
  const [colResult, pkResult] = await Promise.all([
    q(id,
      `SELECT c.column_name AS "COLUMN_NAME",
              CASE
                WHEN c.data_type = 'character varying' THEN 'VARCHAR2'
                WHEN c.data_type = 'character' THEN 'CHAR'
                ELSE upper(c.data_type)
              END AS "DATA_TYPE",
              c.character_maximum_length AS "DATA_LENGTH",
              c.numeric_precision AS "DATA_PRECISION",
              c.numeric_scale AS "DATA_SCALE",
              CASE WHEN c.is_nullable = 'YES' THEN 'Y' ELSE 'N' END AS "NULLABLE",
              c.column_default AS "DATA_DEFAULT",
              c.ordinal_position AS "COLUMN_ID",
              pgd.description AS "COMMENTS"
       FROM information_schema.columns c
       LEFT JOIN pg_catalog.pg_statio_all_tables st
              ON st.schemaname = c.table_schema AND st.relname = c.table_name
       LEFT JOIN pg_catalog.pg_description pgd
              ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [schema, tableName]),
    q(id,
      `SELECT kcu.column_name AS "COLUMN_NAME"
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'`,
      [schema, tableName]),
  ]);
  const pkSet = new Set(pkResult.rows.map(r => r.COLUMN_NAME));
  return colResult.rows.map(col => ({ ...col, IS_PK: pkSet.has(col.COLUMN_NAME) }));
}

// ── 테이블 데이터 조회 (페이지네이션) ──
export async function getTableData(id, schema, tableName, { page = 1, limit = 100, orderBy, orderDir = 'ASC', filter } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const orderClause = orderBy ? `ORDER BY ${qIdent(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}` : '';
  const whereClause = filter ? `WHERE ${filter}` : '';
  const tbl = `${qIdent(schema)}.${qIdent(tableName)}`;
  const dataSql = `SELECT * FROM ${tbl} ${whereClause} ${orderClause} LIMIT $1 OFFSET $2`;
  const countSql = `SELECT COUNT(*) AS "CNT" FROM ${tbl} ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    q(id, dataSql, [Number(limit), offset]),
    q(id, countSql),
  ]);
  const columns = dataResult.fields.map(f => f.name);
  return {
    columns,
    rows: dataResult.rows,
    total: Number(countResult.rows[0].CNT),
    page: Number(page),
    limit: Number(limit),
  };
}

// ── 테이블 DDL (카탈로그로부터 구성) ──
export async function getTableDDL(id, schema, tableName) {
  const cols = await getColumns(id, schema, tableName);
  if (cols.length === 0) return '';

  const colLines = cols.map(c => `    ${qIdent(c.COLUMN_NAME)} ${columnTypeText(c)}` +
    (c.DATA_DEFAULT != null ? ` DEFAULT ${c.DATA_DEFAULT}` : '') +
    (c.NULLABLE === 'N' ? ' NOT NULL' : ''));

  // 제약조건 (PK/UNIQUE/CHECK/FK) — pg_get_constraintdef 로 정의 추출
  const conRes = await q(id,
    `SELECT con.conname AS "NAME", pg_get_constraintdef(con.oid) AS "DEF"
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = $1 AND rel.relname = $2
     ORDER BY con.contype DESC, con.conname`,
    [schema, tableName]);

  const conLines = conRes.rows.map(r => `    CONSTRAINT ${qIdent(r.NAME)} ${r.DEF}`);
  const allLines = [...colLines, ...conLines];

  let ddl = `CREATE TABLE ${qIdent(schema)}.${qIdent(tableName)} (\n${allLines.join(',\n')}\n);`;

  // 제약조건이 아닌 인덱스
  const idxRes = await q(id,
    `SELECT indexdef AS "DEF" FROM pg_indexes
     WHERE schemaname = $1 AND tablename = $2
       AND indexname NOT IN (
         SELECT con.conname FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
         WHERE ns.nspname = $1 AND rel.relname = $2
       )`,
    [schema, tableName]);
  if (idxRes.rows.length > 0)
    ddl += '\n\n' + idxRes.rows.map(r => `${r.DEF};`).join('\n');

  // 주석
  const cmtRes = await q(id,
    `SELECT 'TABLE' AS "KIND", NULL AS "COL", obj_description($1::regclass, 'pg_class') AS "C"
     UNION ALL
     SELECT 'COLUMN', a.attname, col_description($1::regclass, a.attnum)
     FROM pg_attribute a
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
       AND col_description($1::regclass, a.attnum) IS NOT NULL`,
    [`${qIdent(schema)}.${qIdent(tableName)}`]).catch(() => ({ rows: [] }));
  const cmtLines = [];
  for (const r of cmtRes.rows) {
    if (!r.C) continue;
    const esc = r.C.replace(/'/g, "''");
    if (r.KIND === 'TABLE')
      cmtLines.push(`COMMENT ON TABLE ${qIdent(schema)}.${qIdent(tableName)} IS '${esc}';`);
    else
      cmtLines.push(`COMMENT ON COLUMN ${qIdent(schema)}.${qIdent(tableName)}.${qIdent(r.COL)} IS '${esc}';`);
  }
  if (cmtLines.length > 0) ddl += '\n\n' + cmtLines.join('\n');

  return ddl;
}

// 컬럼 타입 문자열 (DATA_TYPE + 길이/정밀도)
function columnTypeText(c) {
  const dt = c.DATA_TYPE;
  if (['VARCHAR2', 'CHAR'].includes(dt) && c.DATA_LENGTH != null) {
    const base = dt === 'VARCHAR2' ? 'VARCHAR' : 'CHAR';
    return `${base}(${c.DATA_LENGTH})`;
  }
  if (dt === 'NUMERIC' && c.DATA_PRECISION != null)
    return `NUMERIC(${c.DATA_PRECISION}${c.DATA_SCALE ? ',' + c.DATA_SCALE : ''})`;
  return dt;
}

// ── 외래키 참조 ──
export async function getTableReferences(id, schema, tableName) {
  const r = await q(id,
    `SELECT tc.constraint_name AS "CONSTRAINT_NAME",
            kcu.column_name AS "COLUMN_NAME",
            ccu.table_schema AS "R_OWNER",
            ccu.table_name AS "R_TABLE",
            ccu.column_name AS "R_COLUMN"
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1 AND tc.table_name = $2
     ORDER BY kcu.column_name`,
    [schema, tableName]);
  return r.rows;
}

// ── 테이블 명세 (주석 + 컬럼 + 인덱스 + FK) ──
export async function getTableSpec(id, schema, tableName) {
  const [tabComment, columns, idxRows, fkRows] = await Promise.all([
    q(id,
      `SELECT obj_description($1::regclass, 'pg_class') AS "C"`,
      [`${qIdent(schema)}.${qIdent(tableName)}`])
      .then(r => r.rows[0]?.C || '').catch(() => ''),
    getColumns(id, schema, tableName),
    q(id,
      `SELECT i.relname AS "INDEX_NAME", ix.indisunique AS "IS_UNIQUE",
              a.attname AS "COLUMN_NAME",
              array_position(ix.indkey, a.attnum) AS "POS"
       FROM pg_class t
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE n.nspname = $1 AND t.relname = $2
       ORDER BY i.relname, "POS"`,
      [schema, tableName]).then(r => r.rows).catch(() => []),
    getTableReferences(id, schema, tableName).catch(() => []),
  ]);

  const idxMap = new Map();
  for (const r of idxRows) {
    if (!idxMap.has(r.INDEX_NAME))
      idxMap.set(r.INDEX_NAME, { name: r.INDEX_NAME, unique: r.IS_UNIQUE === true, columns: [] });
    idxMap.get(r.INDEX_NAME).columns.push(r.COLUMN_NAME);
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

// ── 뷰 DDL ──
export async function getViewDDL(id, schema, viewName) {
  // MATERIALIZED VIEW 먼저 확인 (pg_matviews 에 있으면 CREATE MATERIALIZED VIEW 형식 사용)
  const mvRes = await q(id,
    `SELECT definition AS "DEF" FROM pg_matviews
     WHERE schemaname = $1 AND matviewname = $2`,
    [schema, viewName]);
  if (mvRes.rows[0]?.DEF) {
    const def = mvRes.rows[0].DEF.trim().replace(/;?\s*$/, '');
    return `CREATE MATERIALIZED VIEW ${qIdent(schema)}.${qIdent(viewName)} AS\n${def};`;
  }
  // 일반 VIEW
  const r = await q(id,
    `SELECT pg_get_viewdef($1::regclass, true) AS "DDL"`,
    [`${qIdent(schema)}.${qIdent(viewName)}`]);
  const body = r.rows[0]?.DDL || '';
  return body ? `CREATE OR REPLACE VIEW ${qIdent(schema)}.${qIdent(viewName)} AS\n${body}` : '';
}

// ── 소스 (함수/프로시저/트리거/뷰) ──
export async function getSource(id, schema, type, name) {
  if (type === 'VIEW' || type === 'MATERIALIZED VIEW') {
    return getViewDDL(id, schema, name);
  }
  if (type === 'TRIGGER') {
    const r = await q(id,
      `SELECT pg_get_triggerdef(t.oid) AS "SRC"
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND t.tgname = $2 AND NOT t.tgisinternal
       LIMIT 1`,
      [schema, name]);
    return r.rows[0]?.SRC || '';
  }
  // FUNCTION / PROCEDURE
  const r = await q(id,
    `SELECT pg_get_functiondef(p.oid) AS "SRC"
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.proname = $2
     LIMIT 1`,
    [schema, name]);
  return r.rows[0]?.SRC || '';
}

// ── 오브젝트 속성 ──
export async function getObjectProperties(id, schema, type, name) {
  return {
    OBJECT_NAME: name,
    OBJECT_TYPE: type,
    STATUS: 'VALID',
    SCHEMA: schema,
  };
}

// ── 컴파일 (PostgreSQL 은 별도 컴파일 단계 없음) ──
export async function compileObject() {
  return { success: true, errors: [] };
}

// ── 소스 저장 (CREATE OR REPLACE ... 그대로 실행) ──
export async function saveSource(id, schema, type, name, source) {
  const ddl = source.trim().replace(/;\s*$/, '');
  const { pool } = entryOf(id);
  const client = await pool.connect();
  try {
    if (schema) await client.query(`SET search_path TO ${qIdent(schema)}`);
    await client.query(ddl);
    return { success: true };
  } finally {
    client.release();
  }
}

// ── 시퀀스 정보 ──
export async function getSequenceInfo(id, schema, name) {
  const r = await q(id,
    `SELECT sequence_name AS "SEQUENCE_NAME",
            start_value AS "START_VALUE",
            minimum_value AS "MIN_VALUE",
            maximum_value AS "MAX_VALUE",
            increment AS "INCREMENT_BY",
            cycle_option AS "CYCLE",
            data_type AS "DATA_TYPE"
     FROM information_schema.sequences
     WHERE sequence_schema = $1 AND sequence_name = $2`,
    [schema, name]);
  const info = r.rows[0] || null;
  if (info) {
    // 현재 값 (last_value) 추가
    try {
      const lv = await q(id, `SELECT last_value AS "LAST_VALUE" FROM ${qIdent(schema)}.${qIdent(name)}`);
      info.LAST_VALUE = lv.rows[0]?.LAST_VALUE;
    } catch { /* 권한 없으면 생략 */ }
  }
  return info;
}

// ── SQL 실행 (DBeaver 스타일 페이지네이션) ──
export async function executeSQL(id, sql, schema, { page = 1, limit = 200 } = {}) {
  const { pool } = entryOf(id);
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const isSelect = /^\s*(SELECT|WITH)\b/i.test(cleanSql);
  const pageNum = Math.max(1, Number(page) || 1);
  const lim = Math.min(2000, Math.max(1, Number(limit) || 200));
  const offset = (pageNum - 1) * lim;

  const client = await pool.connect();
  const start = Date.now();
  try {
    if (schema) await client.query(`SET search_path TO ${qIdent(schema)}`);

    if (isSelect) {
      const probe = lim + 1;
      const paged = `SELECT * FROM (${cleanSql}) AS __sd_q LIMIT ${probe} OFFSET ${offset}`;
      const res = await client.query(paged);
      const elapsed = Date.now() - start;
      const rows = res.rows;
      const hasMore = rows.length > lim;
      if (hasMore) rows.length = lim;
      return {
        columns: res.fields.map(f => f.name),
        rows,
        rowCount: rows.length,
        total: null,        // 필요 시 countSQL() 사용
        hasMore,
        page: pageNum, limit: lim,
        executionTime: elapsed,
      };
    }

    const res = await client.query(cleanSql);
    const elapsed = Date.now() - start;
    return {
      columns: [], rows: [],
      rowCount: res.rowCount || 0,
      executionTime: elapsed,
      message: `${res.rowCount || 0} row(s) affected`,
    };
  } finally {
    client.release();
  }
}

// ── 전체 건수 (필요할 때만) ──
export async function countSQL(id, sql, schema) {
  const { pool } = entryOf(id);
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  if (!/^\s*(SELECT|WITH)\b/i.test(cleanSql))
    throw Object.assign(new Error('COUNT is only available for SELECT statements'), { status: 400 });

  const client = await pool.connect();
  const start = Date.now();
  try {
    if (schema) await client.query(`SET search_path TO ${qIdent(schema)}`);
    const res = await client.query(`SELECT COUNT(*) AS "CNT" FROM (${cleanSql}) AS __sd_q`);
    return { total: Number(res.rows[0].CNT), executionTime: Date.now() - start };
  } finally {
    client.release();
  }
}

// ── 컬럼 순서 변경 스크립트 (테이블 재생성 방식) ──
export async function generateColumnReorderScript(id, schema, tableName, newColumnOrder) {
  const tmpName = `${tableName}_reorder_tmp`;
  const qS = qIdent(schema);
  const qT = qIdent(tableName);
  const qTmp = qIdent(tmpName);
  const fqTable = `${qS}.${qT}`;

  const [cols, conRes, refFkRes, idxRes, cmtRes, grantRes] = await Promise.all([
    getColumns(id, schema, tableName),
    // 이 테이블의 제약조건 정의
    q(id,
      `SELECT con.conname AS "NAME", con.contype AS "TYPE", pg_get_constraintdef(con.oid) AS "DEF"
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = $1 AND rel.relname = $2
       ORDER BY con.contype DESC, con.conname`,
      [schema, tableName]),
    // 이 테이블을 참조하는 다른 테이블의 FK
    q(id,
      `SELECT ns.nspname AS "OWNER", rel.relname AS "TABLE_NAME",
              con.conname AS "NAME", pg_get_constraintdef(con.oid) AS "DEF"
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE con.contype = 'f'
         AND con.confrelid = ($3)::regclass
         AND NOT (ns.nspname = $1 AND rel.relname = $2)`,
      [schema, tableName, fqTable]),
    // 제약조건이 아닌 인덱스
    q(id,
      `SELECT indexname AS "NAME", indexdef AS "DEF" FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2
         AND indexname NOT IN (
           SELECT con.conname FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace ns ON ns.oid = rel.relnamespace
           WHERE ns.nspname = $1 AND rel.relname = $2
         )`,
      [schema, tableName]),
    // 컬럼 주석
    q(id,
      `SELECT a.attname AS "COLUMN_NAME", col_description($3::regclass, a.attnum) AS "C"
       FROM pg_attribute a
       WHERE a.attrelid = ($3)::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND col_description($3::regclass, a.attnum) IS NOT NULL`,
      [schema, tableName, fqTable]).catch(() => ({ rows: [] })),
    // 권한
    q(id,
      `SELECT grantee AS "GRANTEE", privilege_type AS "PRIVILEGE", is_grantable AS "GRANTABLE"
       FROM information_schema.role_table_grants
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY grantee, privilege_type`,
      [schema, tableName]).catch(() => ({ rows: [] })),
  ]);

  // 컬럼 순서 정리
  const allCols = cols.map(c => c.COLUMN_NAME);
  const orderedCols = newColumnOrder.filter(c => allCols.includes(c));
  for (const c of allCols) if (!orderedCols.includes(c)) orderedCols.push(c);
  const colMap = Object.fromEntries(cols.map(c => [c.COLUMN_NAME, c]));

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines = [];
  const ln = s => lines.push(s);
  const sep = () => ln('');

  ln(`-- ${'='.repeat(60)}`);
  ln(`-- 컬럼 순서 변경 마이그레이션 스크립트 (PostgreSQL)`);
  ln(`-- 대상 테이블 : ${schema}.${tableName}`);
  ln(`-- 생성 시각   : ${now}`);
  ln(`-- ${'='.repeat(60)}`);
  ln(`-- ⚠  주의: 테이블 재생성 방식입니다.`);
  ln(`--    실행 전 반드시 전체 백업을 수행하세요.`);
  ln(`-- ${'='.repeat(60)}`);

  // Step 1: 참조 FK 삭제
  const refFks = refFkRes.rows;
  if (refFks.length > 0) {
    sep();
    ln(`-- [Step 1] 이 테이블을 참조하는 외래키(FK) 삭제`);
    for (const fk of refFks)
      ln(`ALTER TABLE ${qIdent(fk.OWNER)}.${qIdent(fk.TABLE_NAME)} DROP CONSTRAINT ${qIdent(fk.NAME)};`);
  }

  // Step 2: 임시 테이블 생성
  sep();
  ln(`-- [Step 2] 임시 테이블 생성 (새 컬럼 순서)`);
  ln(`CREATE TABLE ${qS}.${qTmp} (`);
  const colLines = orderedCols.map((cn, i) => {
    const c = colMap[cn];
    const def = `  ${qIdent(cn)} ${columnTypeText(c)}` +
      (c.DATA_DEFAULT != null ? ` DEFAULT ${c.DATA_DEFAULT}` : '') +
      (c.NULLABLE === 'N' ? ' NOT NULL' : '');
    return def + (i < orderedCols.length - 1 ? ',' : '');
  });
  colLines.forEach(ln);
  ln(`);`);

  // Step 3: 데이터 복사
  sep();
  ln(`-- [Step 3] 데이터 복사`);
  const colList = orderedCols.map(c => qIdent(c)).join(', ');
  ln(`INSERT INTO ${qS}.${qTmp} (${colList})`);
  ln(`  SELECT ${colList} FROM ${fqTable};`);

  // Step 4: 원본 삭제
  sep();
  ln(`-- [Step 4] 원본 테이블 삭제`);
  ln(`DROP TABLE ${fqTable} CASCADE;`);

  // Step 5: 이름 변경
  sep();
  ln(`-- [Step 5] 임시 테이블 이름 변경`);
  ln(`ALTER TABLE ${qS}.${qTmp} RENAME TO ${qT};`);

  // Step 6: 제약조건 재생성 (PK→UNIQUE→CHECK→FK)
  const cons = conRes.rows;
  if (cons.length > 0) {
    sep();
    ln(`-- [Step 6] 제약조건 재생성 (PK / UNIQUE / CHECK / FK)`);
    for (const con of cons)
      ln(`ALTER TABLE ${fqTable} ADD CONSTRAINT ${qIdent(con.NAME)} ${con.DEF};`);
  }

  // Step 7: 인덱스 재생성
  if (idxRes.rows.length > 0) {
    sep();
    ln(`-- [Step 7] 인덱스 재생성`);
    for (const idx of idxRes.rows) ln(`${idx.DEF};`);
  }

  // Step 8: 참조 FK 재생성
  if (refFks.length > 0) {
    sep();
    ln(`-- [Step 8] 이 테이블을 참조하는 외래키(FK) 재생성`);
    for (const fk of refFks)
      ln(`ALTER TABLE ${qIdent(fk.OWNER)}.${qIdent(fk.TABLE_NAME)} ADD CONSTRAINT ${qIdent(fk.NAME)} ${fk.DEF};`);
  }

  // Step 9: 컬럼 주석
  if (cmtRes.rows.length > 0) {
    sep();
    ln(`-- [Step 9] 컬럼 주석 재생성`);
    for (const r of cmtRes.rows) {
      const esc = (r.C || '').replace(/'/g, "''");
      ln(`COMMENT ON COLUMN ${fqTable}.${qIdent(r.COLUMN_NAME)} IS '${esc}';`);
    }
  }

  // Step 10: 권한
  if (grantRes.rows.length > 0) {
    sep();
    ln(`-- [Step 10] 권한 재생성`);
    for (const r of grantRes.rows) {
      const withGrant = r.GRANTABLE === 'YES' ? ' WITH GRANT OPTION' : '';
      ln(`GRANT ${r.PRIVILEGE} ON ${fqTable} TO ${qIdent(r.GRANTEE)}${withGrant};`);
    }
  }

  sep();
  ln(`-- 완료`);
  return lines.join('\n');
}

// ── 스크립트 일괄 실행 ──
export async function executeScriptStatements(id, statements, schema) {
  const { pool } = entryOf(id);
  const client = await pool.connect();
  const results = [];
  try {
    if (schema) await client.query(`SET search_path TO ${qIdent(schema)}`).catch(() => {});
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      try {
        await client.query(stmt);
        results.push({ index: i, ok: true });
      } catch (e) {
        results.push({ index: i, ok: false, error: e.message, statement: stmt });
        return { success: false, executedCount: i, results };
      }
    }
    return { success: true, executedCount: statements.length, results };
  } finally {
    client.release();
  }
}

// ── 실행계획 (EXPLAIN) ──
export async function explainSQL(id, sql, schema) {
  const { pool } = entryOf(id);
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const client = await pool.connect();
  try {
    if (schema) await client.query(`SET search_path TO ${qIdent(schema)}`);
    const res = await client.query(`EXPLAIN (VERBOSE true, COSTS true) ${cleanSql}`);
    return res.rows.map(r => r['QUERY PLAN']).join('\n');
  } finally {
    client.release();
  }
}
