// ─────────────────────────────────────────────────────────────────────────
// DB 서비스 디스패처
//
// 연결의 dbType(oracle | postgres)에 따라 적절한 서비스 모듈로 위임합니다.
// 라우트는 이 모듈만 import 하면 되고, DB 종류별 분기를 신경 쓸 필요가 없습니다.
//
// - testConnection / connect / reconnect: params/connInfo 에 dbType 포함
// - id 기반 호출: 연결 시 기록한 dbType 로 라우팅 (없으면 store 조회 후 보정)
// - getStatus: 모든 서비스의 상태를 병합
// ─────────────────────────────────────────────────────────────────────────
import * as oracle from './oracleService.js';
import * as postgres from './postgresService.js';
import * as store from './connectionStore.js';

const services = { oracle, postgres };
const idType = new Map(); // id → dbType (연결 시 기록)

function svcFor(dbType) {
  return services[dbType] || oracle;
}

// id 로부터 서비스 모듈 해석 (idType 우선, 없으면 store 조회)
async function svcForId(id) {
  let t = idType.get(id);
  if (!t) {
    try {
      const conn = await store.getById(id);
      t = conn.dbType || 'oracle';
      idType.set(id, t);
    } catch {
      t = 'oracle';
    }
  }
  return svcFor(t);
}

// ── 연결 수명주기 ──
export async function testConnection(params) {
  return svcFor(params.dbType || 'oracle').testConnection(params);
}

export async function connect(connInfo) {
  const dbType = connInfo.dbType || 'oracle';
  const r = await svcFor(dbType).connect(connInfo);
  idType.set(connInfo.id, dbType);
  return r;
}

export async function disconnect(id) {
  const svc = await svcForId(id);
  const r = await svc.disconnect(id);
  idType.delete(id);
  return r;
}

export async function reconnect(connInfo) {
  const dbType = connInfo.dbType || 'oracle';
  idType.set(connInfo.id, dbType);
  return svcFor(dbType).reconnect(connInfo);
}

export function getStatus() {
  return { ...oracle.getStatus(), ...postgres.getStatus() };
}

// ── id 기반 위임 (제너릭 래퍼) ──
function delegate(method) {
  return async (id, ...args) => {
    const svc = await svcForId(id);
    return svc[method](id, ...args);
  };
}

export const getSchemas = delegate('getSchemas');
export const getObjects = delegate('getObjects');
export const getColumns = delegate('getColumns');
export const getTableData = delegate('getTableData');
export const getTableDDL = delegate('getTableDDL');
export const getTableReferences = delegate('getTableReferences');
export const getSchemaErd = delegate('getSchemaErd');
export const getTableSpec = delegate('getTableSpec');
export const getViewDDL = delegate('getViewDDL');
export const getSource = delegate('getSource');
export const getObjectProperties = delegate('getObjectProperties');
export const compileObject = delegate('compileObject');
export const saveSource = delegate('saveSource');
export const getSequenceInfo = delegate('getSequenceInfo');
export const executeSQL = delegate('executeSQL');
export const countSQL = delegate('countSQL');
export const generateColumnReorderScript = delegate('generateColumnReorderScript');
export const executeScriptStatements = delegate('executeScriptStatements');
export const explainSQL = delegate('explainSQL');
export const executeDml = delegate('executeDml');
export const executeRaw = delegate('executeRaw');
