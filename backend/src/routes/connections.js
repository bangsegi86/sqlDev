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
  const { name, host, port, serviceName, username, password } = req.body;
  if (!name || !host || !serviceName || !username || !password)
    return res.status(400).json({ error: 'name, host, serviceName, username, password are required' });
  res.status(201).json(await store.create({ name, host, port, serviceName, username, password }));
}));

router.put('/:id', wrap(async (req, res) => {
  res.json(await store.update(req.params.id, req.body));
}));

router.delete('/:id', wrap(async (req, res) => {
  await store.remove(req.params.id);
  res.json({ success: true });
}));

export default router;
