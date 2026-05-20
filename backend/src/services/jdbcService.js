import { spawn, execFile } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createWriteStream, unlink } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
export const BRIDGE_DIR = join(__dir, '../../bridge');
export const JDBC_DIR = join(__dir, '../data/jdbc');
export const OJDBC_PATH = join(JDBC_DIR, 'ojdbc11.jar');
export const BRIDGE_CLASS_FILE = join(BRIDGE_DIR, 'OracleBridge.class');
const OJDBC_URL = 'https://repo1.maven.org/maven2/com/oracle/database/jdbc/ojdbc11/23.7.0.25.01/ojdbc11-23.7.0.25.01.jar';
const CP_SEP = process.platform === 'win32' ? ';' : ':';

const processes = new Map(); // id -> { proc, buffer, pending: {resolve,reject} | null }

export function getJdbcStatus() {
  return {
    driverDownloaded: existsSync(OJDBC_PATH),
    bridgeCompiled: existsSync(BRIDGE_CLASS_FILE),
    available: existsSync(OJDBC_PATH) && existsSync(BRIDGE_CLASS_FILE),
  };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        get(res.headers.location);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { unlink(dest, () => {}); reject(e); });
    get(url);
  });
}

function compile() {
  return new Promise((resolve, reject) => {
    execFile('javac', ['-cp', OJDBC_PATH, '-d', BRIDGE_DIR,
      join(BRIDGE_DIR, 'OracleBridge.java')],
      (err, _out, stderr) => err ? reject(new Error(stderr || err.message)) : resolve());
  });
}

export async function downloadAndCompile() {
  if (!existsSync(OJDBC_PATH)) await downloadFile(OJDBC_URL, OJDBC_PATH);
  if (!existsSync(BRIDGE_CLASS_FILE)) await compile();
}

function spawnBridge() {
  const cp = `${BRIDGE_DIR}${CP_SEP}${OJDBC_PATH}`;
  const proc = spawn('java', ['-cp', cp, 'OracleBridge'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = { proc, buffer: '', pending: null };
  proc.stdout.on('data', (chunk) => {
    state.buffer += chunk.toString('utf8');
    const nl = state.buffer.indexOf('\n');
    if (nl !== -1 && state.pending) {
      const line = state.buffer.slice(0, nl).trim();
      state.buffer = state.buffer.slice(nl + 1);
      const { resolve, reject } = state.pending;
      state.pending = null;
      if (line.startsWith('ERROR\t')) reject(new Error(line.slice(6)));
      else resolve(line);
    }
  });
  proc.stderr.on('data', (d) => console.error('[JDBC]', d.toString()));
  proc.on('exit', () => {
    if (state.pending) { state.pending.reject(new Error('JDBC bridge exited')); state.pending = null; }
  });
  return state;
}

function send(state, cmd) {
  return new Promise((resolve, reject) => {
    if (state.pending) return reject(new Error('Bridge busy'));
    state.pending = { resolve, reject };
    state.proc.stdin.write(cmd + '\n');
    setTimeout(() => {
      if (state.pending?.reject === reject) {
        state.pending = null;
        reject(new Error('JDBC timeout'));
      }
    }, 30000);
  });
}

export async function jdbcTestConnection({ host, port, serviceName, username, password }) {
  const state = spawnBridge();
  try {
    const start = Date.now();
    const resp = await send(state, `CONNECT\t${host}\t${port}\t${serviceName}\t${username}\t${password}`);
    // resp: OK\t"Oracle version string"
    const version = JSON.parse(resp.slice(3));
    return { success: true, latencyMs: Date.now() - start, serverVersion: version };
  } finally {
    state.proc.stdin.write('CLOSE\n');
    setTimeout(() => state.proc.kill(), 2000);
  }
}

export async function jdbcConnect(connInfo) {
  await jdbcDisconnect(connInfo.id);
  const state = spawnBridge();
  const resp = await send(state, `CONNECT\t${connInfo.host}\t${connInfo.port}\t${connInfo.serviceName}\t${connInfo.username}\t${connInfo.password}`);
  // OK\t"version"
  processes.set(connInfo.id, state);
  return { status: 'connected' };
}

export async function jdbcDisconnect(id) {
  const state = processes.get(id);
  if (state) {
    try { state.proc.stdin.write('CLOSE\n'); } catch {}
    setTimeout(() => { try { state.proc.kill(); } catch {} }, 1000);
    processes.delete(id);
  }
  return { status: 'disconnected' };
}

// Expand named Oracle bind params (:name) to literal values for JDBC
function expandParams(sql, params) {
  if (!params || Object.keys(params).length === 0) return sql;
  return sql.replace(/:(\w+)/g, (_, key) => {
    const val = params[key];
    if (val === undefined || val === null) return 'NULL';
    if (typeof val === 'number') return String(val);
    return "'" + String(val).replace(/'/g, "''") + "'";
  });
}

export async function jdbcExecute(id, sql, params = {}) {
  const state = processes.get(id);
  if (!state) throw Object.assign(new Error('Not connected (JDBC)'), { status: 400 });
  const expanded = expandParams(sql, params);
  const resp = await send(state, 'QUERY\t' + expanded.replace(/\n/g, ' '));
  // DATA\t{json}
  const data = JSON.parse(resp.slice(5));
  // Normalize to match oracledb result format
  return {
    rows: data.rows || [],
    metaData: (data.columns || []).map(name => ({ name })),
    rowsAffected: data.rowsAffected,
  };
}
