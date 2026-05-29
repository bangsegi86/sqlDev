import { Router } from 'express';
import * as store from '../services/connectionStore.js';

const router = Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/', wrap(async (req, res) => {
  res.json(await store.getAll());
}));

router.post('/', wrap(async (req, res) => {
  const { name, host, port, dbType, serviceName, database, username, password } = req.body;
  const isPg = dbType === 'postgres';
  const target = isPg ? database : serviceName;
  const targetLabel = isPg ? 'database' : 'serviceName';
  if (!name || !host || !target || !username || !password)
    return res.status(400).json({ error: `name, host, ${targetLabel}, username, password are required` });
  res.status(201).json(await store.create({ name, host, port, dbType, serviceName, database, username, password }));
}));

router.put('/:id', wrap(async (req, res) => {
  res.json(await store.update(req.params.id, req.body));
}));

router.delete('/:id', wrap(async (req, res) => {
  await store.remove(req.params.id);
  res.json({ success: true });
}));

export default router;
