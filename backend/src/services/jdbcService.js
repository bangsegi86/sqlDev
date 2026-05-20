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
const IS_WIN = process.platform === 'win32';
const JAVA_BIN = IS_WIN ? 'java.exe' : 'java';

const processes = new Map(); // id -> { proc, buffer, pending: {resolve,reject} | null }

// Auto-detect java executable from common locations (DBeaver, JDK, JRE installs)
function findJava() {
  // 1. JAVA_HOME env var
  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, 'bin', JAVA_BIN);
    if (existsSync(p)) return p;
  }

  const candidates = IS_WIN ? [
    // DBeaver bundled JVM
    'C:\\Program Files\\DBeaver\\jre\\bin\\java.exe',
    'C:\\Program Files\\DBeaverCommunity\\jre\\bin\\java.exe',
    join(process.env.LOCALAPPDATA || 'C:\\Users\\Public', 'DBeaver', 'jre', 'bin', 'java.exe'),
    // Oracle JDK/JRE
    ...['21', '17', '11', '8'].flatMap(v => [
      `C:\\Program Files\\Java\\jre${v}\\bin\\java.exe`,
      `C:\\Program Files\\Java\\jdk-${v}\\bin\\java.exe`,
      `C:\\Program Files\\Java\\jdk${v}\\bin\\java.exe`,
    ]),
    // Eclipse Adoptium / Temurin
    ...['21', '17', '11'].map(v => `C:\\Program Files\\Eclipse Adoptium\\jre-${v}\\bin\\java.exe`),
    // Microsoft JDK
    ...['21', '17', '11'].map(v => `C:\\Program Files\\Microsoft\\jdk-${v}\\bin\\java.exe`),
  ] : [
    // DBeaver bundled JVM (Linux/Mac)
    '/usr/share/dbeaver/jre/bin/java',
    '/opt/dbeaver/jre/bin/java',
    '/Applications/DBeaverCommunity.app/Contents/Eclipse/jre/Contents/Home/bin/java',
    '/usr/bin/java',
    '/usr/local/bin/java',
  ];

  for (const c of candidates) if (existsSync(c)) return c;
  return 'java'; // fallback: rely on PATH
}

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

    const follow = (u, depth = 0) => {
      if (depth > 10) { reject(new Error('Too many redirects')); return; }
      https.get(u, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          res.resume(); // discard redirect body
          follow(res.headers.location, depth + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} — ${u}`));
          return;
        }
        // Only create file once we have the final 200 response
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (e) => { try { file.destroy(); } catch {} unlink(dest, () => {}); reject(e); });
      }).on('error', (e) => { unlink(dest, () => {}); reject(e); });
    };

    follow(url);
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
  // OracleBridge.class is bundled in the repo — compile only if somehow missing
  if (!existsSync(BRIDGE_CLASS_FILE)) {
    try {
      await compile();
    } catch (e) {
      throw new Error(`OracleBridge.class가 없고 javac로 컴파일도 실패했습니다: ${e.message}\n저장소를 다시 clone 해주세요.`);
    }
  }
}

function spawnBridge() {
  const cp = `${BRIDGE_DIR}${CP_SEP}${OJDBC_PATH}`;
  const javaExe = findJava();
  console.log(`[JDBC] java: ${javaExe}`);
  const proc = spawn(javaExe, ['-cp', cp, 'OracleBridge'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = { proc, buffer: '', pending: null };

  const fail = (err) => {
    if (state.pending) { state.pending.reject(err); state.pending = null; }
  };

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
  proc.on('error', (e) => {
    const msg = e.code === 'ENOENT'
      ? 'java 명령어를 찾을 수 없습니다. Java(JRE)가 설치되어 있고 PATH에 등록되어 있는지 확인하세요.'
      : e.message;
    fail(new Error(msg));
  });
  proc.on('exit', (code) => {
    if (code !== 0) fail(new Error(`JDBC bridge 프로세스가 종료되었습니다 (code ${code})`));
    else fail(new Error('JDBC bridge 연결 종료'));
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
    try { state.proc.stdin.write('CLOSE\n'); } catch {}
    setTimeout(() => { try { state.proc.kill(); } catch {} }, 2000);
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
