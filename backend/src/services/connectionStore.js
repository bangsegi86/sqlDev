import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../config/encryption.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../../data/connections.json');
const DATA_DIR = join(__dirname, '../../data');

async function ensureDataFile() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) await writeFile(DATA_FILE, JSON.stringify({ connections: [] }, null, 2));
}

async function readData() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeData(data) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

export async function getAll() {
  const { connections } = await readData();
  return connections.map(c => ({ ...c, password: '***' }));
}

export async function getById(id) {
  const { connections } = await readData();
  const conn = connections.find(c => c.id === id);
  if (!conn) throw Object.assign(new Error('Connection not found'), { status: 404 });
  return { ...conn, password: decrypt(conn.password) };
}

export async function create(data) {
  const { connections } = await readData();
  const conn = {
    id: uuidv4(),
    name: data.name,
    host: data.host,
    port: Number(data.port) || 1521,
    serviceName: data.serviceName,
    username: data.username,
    password: encrypt(data.password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  connections.push(conn);
  await writeData({ connections });
  return { ...conn, password: '***' };
}

export async function update(id, data) {
  const { connections } = await readData();
  const idx = connections.findIndex(c => c.id === id);
  if (idx === -1) throw Object.assign(new Error('Connection not found'), { status: 404 });

  const existing = connections[idx];
  const updated = {
    ...existing,
    name: data.name ?? existing.name,
    host: data.host ?? existing.host,
    port: data.port ? Number(data.port) : existing.port,
    serviceName: data.serviceName ?? existing.serviceName,
    username: data.username ?? existing.username,
    password: data.password ? encrypt(data.password) : existing.password,
    updatedAt: new Date().toISOString(),
  };
  connections[idx] = updated;
  await writeData({ connections });
  return { ...updated, password: '***' };
}

export async function remove(id) {
  const { connections } = await readData();
  const filtered = connections.filter(c => c.id !== id);
  if (filtered.length === connections.length)
    throw Object.assign(new Error('Connection not found'), { status: 404 });
  await writeData({ connections: filtered });
}
