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

router.get('/:id/views/:schema/:name/ddl', wrap(async (req, res) => {
  res.json({ ddl: await oracle.getViewDDL(req.params.id, req.params.schema, req.params.name) });
}));

router.get('/:id/source/:schema/:type/:name', wrap(async (req, res) => {
  res.json({ source: await oracle.getSource(req.params.id, req.params.schema, req.params.type, req.params.name) });
}));

router.get('/:id/source/:schema/:type/:name/properties', wrap(async (req, res) => {
  res.json(await oracle.getObjectProperties(req.params.id, req.params.schema, req.params.type, req.params.name));
}));

router.get('/:id/sequences/:schema/:name', wrap(async (req, res) => {
  res.json(await oracle.getSequenceInfo(req.params.id, req.params.schema, req.params.name));
}));

router.post('/:id/query', wrap(async (req, res) => {
  const { sql, schema } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });
  res.json(await oracle.executeSQL(req.params.id, sql, schema));
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


export default router;
