import { Router } from 'express';
import * as oracle from '../services/oracleService.js';
import * as store from '../services/connectionStore.js';
import { analyzePLSQL } from '../services/plsqlAnalyzer.js';
import { analyzePlan } from '../services/planAnalyzer.js';

const router = Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/test', wrap(async (req, res) => {
  const { host, port, serviceName, username, password } = req.body;
  if (!host || !serviceName || !username || !password)
    return res.status(400).json({ error: 'host, serviceName, username, password are required' });
  res.json(await oracle.testConnection({ host, port: Number(port) || 1521, serviceName, username, password }));
}));

router.post('/connect/:id', wrap(async (req, res) => {
  const connInfo = await store.getById(req.params.id);
  res.json(await oracle.connect(connInfo));
}));

router.post('/disconnect/:id', wrap(async (req, res) => {
  res.json(await oracle.disconnect(req.params.id));
}));

router.post('/reconnect/:id', wrap(async (req, res) => {
  const connInfo = await store.getById(req.params.id);
  res.json(await oracle.reconnect(connInfo));
}));

router.get('/status', (req, res) => {
  res.json(oracle.getStatus());
});

router.get('/:id/schemas', wrap(async (req, res) => {
  res.json(await oracle.getSchemas(req.params.id));
}));

router.get('/:id/objects', wrap(async (req, res) => {
  const { schema, type } = req.query;
  if (!schema || !type) return res.status(400).json({ error: 'schema and type required' });
  res.json(await oracle.getObjects(req.params.id, schema, type));
}));

router.get('/:id/tables/:schema/:name/columns', wrap(async (req, res) => {
  res.json(await oracle.getColumns(req.params.id, req.params.schema, req.params.name));
}));

router.get('/:id/tables/:schema/:name/data', wrap(async (req, res) => {
  const { page, limit, orderBy, orderDir, filter } = req.query;
  res.json(await oracle.getTableData(req.params.id, req.params.schema, req.params.name, { page, limit, orderBy, orderDir, filter }));
}));

router.get('/:id/tables/:schema/:name/ddl', wrap(async (req, res) => {
  res.json({ ddl: await oracle.getTableDDL(req.params.id, req.params.schema, req.params.name) });
}));

router.get('/:id/tables/:schema/:name/references', wrap(async (req, res) => {
  res.json(await oracle.getTableReferences(req.params.id, req.params.schema, req.params.name));
}));

router.get('/:id/tables/:schema/:name/indexes', wrap(async (req, res) => {
  const { id, schema, name: tableName } = req.params;
  const result = await oracle.executeRaw(id, `
SELECT i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS,
       i.NUM_ROWS, i.LAST_ANALYZED,
       LISTAGG(ic.COLUMN_NAME || CASE WHEN ic.DESCEND = 'DESC' THEN ' DESC' ELSE '' END, ', ')
         WITHIN GROUP (ORDER BY ic.COLUMN_POSITION) AS COLUMNS
FROM ALL_INDEXES i
JOIN ALL_IND_COLUMNS ic ON i.INDEX_NAME = ic.INDEX_NAME AND i.OWNER = ic.INDEX_OWNER
WHERE i.OWNER = :schema AND i.TABLE_NAME = :tableName
GROUP BY i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS, i.NUM_ROWS, i.LAST_ANALYZED
ORDER BY i.INDEX_NAME
  `, { schema, tableName });
  res.json({ indexes: result.rows });
}));

router.get('/:id/views/:schema/:name/ddl', wrap(async (req, res) => {
  res.json({ ddl: await oracle.getViewDDL(req.params.id, req.params.schema, req.params.name) });
}));

router.get('/:id/source/:schema/:type/:name', wrap(async (req, res) => {
  res.json({ source: await oracle.getSource(req.params.id, req.params.schema, req.params.type, req.params.name) });
}));

router.get('/:id/source/:schema/:type/:name/properties', wrap(async (req, res) => {
  res.json(await oracle.getObjectProperties(req.params.id, req.params.schema, req.params.type, req.params.name));
}));

router.post('/:id/source/:schema/:type/:name/compile', wrap(async (req, res) => {
  const { id, schema, type, name } = req.params;
  res.json(await oracle.compileObject(id, schema, type, name));
}));

router.put('/:id/source/:schema/:type/:name', wrap(async (req, res) => {
  const { id, schema, type, name } = req.params;
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: 'source is required' });
  res.json(await oracle.saveSource(id, schema, type, name, source));
}));

router.get('/:id/sequences/:schema/:name', wrap(async (req, res) => {
  res.json(await oracle.getSequenceInfo(req.params.id, req.params.schema, req.params.name));
}));

router.post('/:id/query', wrap(async (req, res) => {
  const { sql, schema, page, limit } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });
  res.json(await oracle.executeSQL(req.params.id, sql, schema, { page, limit }));
}));

// ── 컬럼 순서 변경 스크립트 생성
router.post('/:id/tables/:schema/:name/reorder-script', wrap(async (req, res) => {
  const { columnOrder } = req.body;
  if (!Array.isArray(columnOrder) || columnOrder.length === 0)
    return res.status(400).json({ error: 'columnOrder array is required' });
  const script = await oracle.generateColumnReorderScript(
    req.params.id, req.params.schema, req.params.name, columnOrder
  );
  res.json({ script });
}));

// ── 스크립트 일괄 실행 (여러 문장 순차 실행)
router.post('/:id/execute-script', wrap(async (req, res) => {
  const { statements, schema } = req.body;
  if (!Array.isArray(statements) || statements.length === 0)
    return res.status(400).json({ error: 'statements array is required' });
  res.json(await oracle.executeScriptStatements(req.params.id, statements, schema));
}));

// ── 실행계획 (EXPLAIN PLAN)
router.post('/:id/explain', wrap(async (req, res) => {
  const { sql, schema } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });
  const plan = await oracle.explainSQL(req.params.id, sql, schema);
  res.json({ plan });
}));

// ── 실행계획 규칙 분석
router.post('/:id/explain/analyze', wrap(async (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });
  res.json(analyzePlan(plan));
}));

// ── PL/SQL 분석기
router.get('/:id/analyze/:schema/:type/:name', wrap(async (req, res) => {
  const { id, schema, type, name } = req.params;
  const source = await oracle.getSource(id, schema, type, name);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  const result = analyzePLSQL(source, name, type);
  res.json(result);
}));

// ── 세션 모니터링
router.get('/:id/sessions', wrap(async (req, res) => {
  try {
    const result = await oracle.executeRaw(req.params.id, `
SELECT s.SID, s.SERIAL#, s.USERNAME, s.STATUS, s.OSUSER, s.MACHINE,
       s.PROGRAM, s.MODULE, s.ACTION, s.LOGON_TIME,
       s.LAST_CALL_ET, s.SQL_ID, s.EVENT, s.STATE,
       q.SQL_TEXT
FROM V$SESSION s
LEFT JOIN V$SQL q ON s.SQL_ID = q.SQL_ID AND s.SQL_CHILD_NUMBER = q.CHILD_NUMBER
WHERE s.TYPE = 'USER' AND s.USERNAME IS NOT NULL
ORDER BY s.STATUS, s.LAST_CALL_ET DESC
    `);
    res.json({ sessions: result.rows });
  } catch (e) {
    if (e.message && (e.message.includes('ORA-00942') || e.message.includes('insufficient privileges') || e.message.includes('table or view does not exist'))) {
      res.json({ sessions: [], note: 'V$SESSION 조회 권한이 없습니다. DBA 권한이 필요합니다.' });
    } else {
      throw e;
    }
  }
}));

// ── 락 모니터링
router.get('/:id/locks', wrap(async (req, res) => {
  try {
    const result = await oracle.executeRaw(req.params.id, `
SELECT l.SID, l.TYPE, l.ID1, l.ID2, l.LMODE, l.REQUEST, l.BLOCK,
       s.USERNAME, s.STATUS, s.SQL_ID,
       o.OBJECT_NAME, o.OBJECT_TYPE
FROM V$LOCK l
JOIN V$SESSION s ON l.SID = s.SID
LEFT JOIN DBA_OBJECTS o ON l.ID1 = o.OBJECT_ID
WHERE l.TYPE IN ('TM','TX') AND s.USERNAME IS NOT NULL
ORDER BY l.BLOCK DESC, l.SID
    `);
    res.json({ locks: result.rows });
  } catch (e) {
    if (e.message && (e.message.includes('ORA-00942') || e.message.includes('insufficient privileges') || e.message.includes('table or view does not exist'))) {
      res.json({ locks: [], note: 'V$LOCK 조회 권한이 없습니다. DBA 권한이 필요합니다.' });
    } else {
      throw e;
    }
  }
}));


export default router;
