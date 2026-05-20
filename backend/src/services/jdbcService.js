import { spawn, execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
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

// 프로젝트 내장 JRE 경로 (backend/runtime/jre/)
const RUNTIME_DIR = join(__dir, '../../runtime');
export const JRE_DIR = join(RUNTIME_DIR, 'jre');
const JRE_JAVA = join(JRE_DIR, 'bin', JAVA_BIN);

// Adoptium OpenJDK 21 JRE 다운로드 URL
function getJreUrl() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const os = IS_WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const ext = IS_WIN ? 'zip' : 'tar.gz';
  return {
    url: `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`,
    ext,
  };
}

const processes = new Map();

// 프로젝트 내장 JRE 우선 → JAVA_HOME → PATH
function findJava() {
  if (existsSync(JRE_JAVA)) return JRE_JAVA;
  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, 'bin', JAVA_BIN);
    if (existsSync(p)) return p;
  }
  return 'java'; // 마지막 수단: PATH
}

export function getJdbcStatus() {
  return {
    driverDownloaded: existsSync(OJDBC_PATH),
    bridgeCompiled: existsSync(BRIDGE_CLASS_FILE),
    jreReady: existsSync(JRE_JAVA),
    available: existsSync(OJDBC_PATH) && existsSync(BRIDGE_CLASS_FILE) && existsSync(JRE_JAVA),
  };
}

async function downloadJre() {
  if (existsSync(JRE_JAVA)) return; // 이미 있으면 스킵
  const { url, ext } = getJreUrl();
  const archivePath = join(RUNTIME_DIR, `jre.${ext}`);
  const tmpDir = join(RUNTIME_DIR, 'jre_tmp');

  console.log(`[JRE] 다운로드 중: ${url}`);
  await downloadFile(url, archivePath);

  console.log('[JRE] 압축 해제 중...');
  mkdirSync(tmpDir, { recursive: true });
  await new Promise((resolve, reject) => {
    execFile('tar', ['-xf', archivePath, '-C', tmpDir],
      (err, _o, stderr) => err ? reject(new Error(stderr || err.message)) : resolve());
  });

  // 압축 해제된 폴더(jdk-21.x.x-jre 형태)를 runtime/jre 로 이동
  const entries = readdirSync(tmpDir);
  if (entries.length === 0) throw new Error('JRE 압축 해제 실패: 빈 폴더');
  renameSync(join(tmpDir, entries[0]), JRE_DIR);

  // 임시 파일 정리
  try { rmSync(archivePath); } catch {}
  try { rmSync(tmpDir, { recursive: true }); } catch {}
  console.log(`[JRE] 완료: ${JRE_JAVA}`);
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
  // ojdbc11.jar 다운로드
  if (!existsSync(OJDBC_PATH)) await downloadFile(OJDBC_URL, OJDBC_PATH);
  // OracleBridge.class는 저장소에 포함되어 있음
  if (!existsSync(BRIDGE_CLASS_FILE)) {
    try { await compile(); } catch (e) {
      throw new Error(`OracleBridge.class 컴파일 실패: ${e.message}`);
    }
  }
  // 프로젝트 내장 JRE 다운로드 (없을 경우)
  if (!existsSync(JRE_JAVA)) await downloadJre();
}

function spawnBridge() {
  const cp = `${BRIDGE_DIR}${CP_SEP}${OJDBC_PATH}`;
  const javaExe = findJava();
  console.log(`[JDBC] java: ${javaExe}`);
  console.log(`[JDBC] classpath: ${cp}`);
  const proc = spawn(javaExe, ['-cp', cp, 'OracleBridge'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = { proc, buffer: '', stderrBuf: '', pending: null };

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
  proc.stderr.on('data', (d) => {
    state.stderrBuf += d.toString();
    console.error('[JDBC stderr]', d.toString());
  });
  proc.on('error', (e) => {
    const msg = e.code === 'ENOENT'
      ? `java 실행파일을 찾을 수 없습니다: ${javaExe}`
      : e.message;
    fail(new Error(msg));
  });
  proc.on('exit', (code) => {
    if (code !== 0) {
      const detail = state.stderrBuf.trim().split('\n')[0] || '';
      fail(new Error(`JDBC 브리지 시작 실패 (code ${code})${detail ? ': ' + detail : ''}`));
    } else {
      fail(new Error('JDBC bridge 연결 종료'));
    }
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
