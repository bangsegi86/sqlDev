import { Router } from 'express';
import * as oracle from '../services/dbService.js';
import * as store from '../services/connectionStore.js';
import { analyzePLSQL } from '../services/plsqlAnalyzer.js';
import { analyzePlan } from '../services/planAnalyzer.js';
import { buildWorkbook, buildPdf } from '../services/specExportService.js';

const router = Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/test', wrap(async (req, res) => {
  const { host, port, serviceName, database, username, password, dbType = 'oracle' } = req.body;
  const isPg = dbType === 'postgres';
  const target = isPg ? database : serviceName;
  const targetLabel = isPg ? 'database' : 'serviceName';
  if (!host || !target || !username || !password)
    return res.status(400).json({ error: `host, ${targetLabel}, username, password are required` });
  const defaultPort = isPg ? 5432 : 1521;
  res.json(await oracle.testConnection({
    dbType, host, port: Number(port) || defaultPort,
    serviceName, database, username, password,
  }));
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

router.get('/:id/erd/:schema', wrap(async (req, res) => {
  res.json(await oracle.getSchemaErd(req.params.id, req.params.schema));
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

// ── 전체 건수 조회 (필요할 때만 COUNT(*) 실행)
router.post('/:id/count', wrap(async (req, res) => {
  const { sql, schema } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });
  res.json(await oracle.countSQL(req.params.id, sql, schema));
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

// ── DML 실행 (UPDATE / INSERT / DELETE)
router.post('/:id/execute-dml', wrap(async (req, res) => {
  const { sql, binds } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });
  res.json(await oracle.executeDml(req.params.id, sql, binds || {}));
}));

// ── 테이블 명세서 내보내기 (Excel / PDF)
router.post('/:id/table-spec/export', wrap(async (req, res) => {
  const { id } = req.params;
  const { schema, tables, format = 'xlsx' } = req.body;
  if (!schema || !Array.isArray(tables) || tables.length === 0)
    return res.status(400).json({ error: 'schema and a non-empty tables array are required' });

  // Gather metadata for every requested table (sequentially to avoid overloading the pool)
  const specs = [];
  for (const name of tables) {
    specs.push(await oracle.getTableSpec(id, schema, name));
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `table_spec_${schema}_${stamp}`;

  if (format === 'pdf') {
    const buf = await buildPdf(specs);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    return res.end(buf);
  }

  const buf = await buildWorkbook(specs);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
  res.end(Buffer.from(buf));
}));

export default router;
