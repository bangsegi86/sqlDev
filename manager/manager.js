// ─────────────────────────────────────────────────────────────────────────
// SQLDev 서버 관리자 (Server Manager)
//
// 명령 프롬프트 대신 GUI(브라우저 제어판)로 SQLDev 앱 서버를 시작/종료/재시작
// 하고, 실시간 상태와 로그를 확인할 수 있는 경량 관리자입니다.
//
// - 외부 의존성 없음 (Node.js 내장 모듈만 사용 → 오프라인 환경에서도 동작)
// - 자기 자신은 3100 포트에서 제어판을 띄우고, 앱 서버(backend)는 자식
//   프로세스로 띄워 관리합니다.
//
// 실행:  node manager/manager.js   (또는 루트에서 npm run manager)
// ─────────────────────────────────────────────────────────────────────────
import http from 'http';
import { spawn, exec } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { networkInterfaces } from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const SERVER_ENTRY = join(ROOT, 'backend', 'src', 'server.js');
const DIST_INDEX = join(ROOT, 'frontend', 'dist', 'index.html');
const BACKEND_MODULES = join(ROOT, 'backend', 'node_modules');
const PUBLIC_DIR = join(__dir, 'public');

const MANAGER_PORT = Number(process.env.MANAGER_PORT) || 3100;
const IS_WIN = process.platform === 'win32';

// ── 앱 서버 프로세스 상태 ──
let child = null;            // 실행 중인 자식 프로세스
let appPort = Number(process.env.PORT) || 3001;
let startedAt = null;
let lastExit = null;         // { code, signal, at }
const LOG_LIMIT = 600;
const logBuffer = [];        // 최근 로그 (ring buffer)
const sseClients = new Set();

function pushLog(line, stream = 'out') {
  const entry = { t: Date.now(), stream, line: String(line).replace(/\s+$/, '') };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_LIMIT) logBuffer.shift();
  for (const res of sseClients) {
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  }
}

function isRunning() {
  // child.killed only means "a signal was sent" — not that the process died.
  // The process is alive until its exit event fires (child set to null) / exitCode set.
  return !!child && child.exitCode === null;
}

// ── 앱 서버 시작 ──
function startServer(port) {
  if (isRunning()) return { ok: false, message: '이미 실행 중입니다.' };
  appPort = Number(port) || appPort;

  if (!existsSync(SERVER_ENTRY))
    return { ok: false, message: `서버 진입점을 찾을 수 없습니다: ${SERVER_ENTRY}` };

  pushLog(`[관리자] 서버 시작 (포트 ${appPort})...`, 'sys');
  child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(appPort) },
  });
  startedAt = Date.now();
  lastExit = null;

  child.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => pushLog(l, 'out')));
  child.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => pushLog(l, 'err')));
  child.on('exit', (code, signal) => {
    lastExit = { code, signal, at: Date.now() };
    pushLog(`[관리자] 서버 종료 (code ${code}${signal ? ', signal ' + signal : ''})`, 'sys');
    child = null;
    startedAt = null;
  });
  child.on('error', e => pushLog(`[관리자] 시작 오류: ${e.message}`, 'err'));

  return { ok: true, message: `서버를 시작했습니다 (포트 ${appPort}).` };
}

// ── 앱 서버 종료 ──
// 앱 서버(oracledb 포함)는 SIGTERM을 무시하는 경우가 있어, 잠시 후에도
// 살아있으면 SIGKILL로 강제 종료한다. 윈도우는 taskkill /F로 트리까지 종료.
function stopServer(onExit) {
  if (!isRunning()) { if (onExit) onExit(); return { ok: false, message: '실행 중이 아닙니다.' }; }
  const proc = child;
  const pid = proc.pid;
  pushLog('[관리자] 서버 종료 요청...', 'sys');
  if (onExit) proc.once('exit', onExit);

  if (IS_WIN) {
    exec(`taskkill /pid ${pid} /T /F`);
  } else {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode === null) {
        pushLog('[관리자] 정상 종료 신호 무시됨 — 강제 종료(SIGKILL)', 'sys');
        try { proc.kill('SIGKILL'); } catch {}
      }
    }, 2000);
  }
  return { ok: true, message: '서버를 종료했습니다.' };
}

// ── 프론트엔드 빌드 ──
let building = false;
function runBuild() {
  if (building) return { ok: false, message: '이미 빌드 중입니다.' };
  building = true;
  pushLog('[관리자] 프론트엔드 빌드 시작...', 'sys');
  const npmCmd = IS_WIN ? 'npm.cmd' : 'npm';
  const proc = spawn(npmCmd, ['run', 'build', '--prefix', 'frontend'], { cwd: ROOT });
  proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => pushLog(l, 'out')));
  proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => pushLog(l, 'err')));
  proc.on('exit', code => {
    building = false;
    pushLog(code === 0 ? '[관리자] 빌드 완료 ✔' : `[관리자] 빌드 실패 (code ${code})`, 'sys');
  });
  proc.on('error', e => { building = false; pushLog(`[관리자] 빌드 오류: ${e.message}`, 'err'); });
  return { ok: true, message: '빌드를 시작했습니다. 로그를 확인하세요.' };
}

function getNetworkIPs() {
  const ips = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

function status() {
  return {
    running: isRunning(),
    pid: isRunning() ? child.pid : null,
    appPort,
    uptimeSec: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    lastExit,
    building,
    hasBuild: existsSync(DIST_INDEX),
    hasNodeModules: existsSync(BACKEND_MODULES),
    managerPort: MANAGER_PORT,
    networkIPs: getNetworkIPs(),
  };
}

// ── HTTP 제어판 서버 ──
function sendJson(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${MANAGER_PORT}`);
  const path = url.pathname;

  // 제어판 정적 파일
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // 상태
  if (req.method === 'GET' && path === '/api/status') return sendJson(res, status());

  // 로그 히스토리
  if (req.method === 'GET' && path === '/api/logs/history') return sendJson(res, { logs: logBuffer });

  // 로그 실시간 스트림 (SSE)
  if (req.method === 'GET' && path === '/api/logs/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // 제어 동작
  if (req.method === 'POST' && path === '/api/start') {
    const body = await readBody(req);
    return sendJson(res, startServer(body.port));
  }
  if (req.method === 'POST' && path === '/api/stop') return sendJson(res, stopServer());
  if (req.method === 'POST' && path === '/api/restart') {
    const body = await readBody(req);
    if (isRunning()) {
      // 실제 종료(exit)를 기다렸다가 재시작 → 포트 충돌 방지
      stopServer(() => setTimeout(() => startServer(body.port), 400));
      return sendJson(res, { ok: true, message: '재시작 중입니다...' });
    }
    return sendJson(res, startServer(body.port));
  }
  if (req.method === 'POST' && path === '/api/build') return sendJson(res, runBuild());

  if (req.method === 'POST' && path === '/api/shutdown') {
    pushLog('[관리자] 관리자 종료 요청을 받았습니다.', 'sys');
    sendJson(res, { ok: true, message: '관리자를 종료합니다.' });
    setTimeout(shutdown, 600);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ── 브라우저 자동 실행 (가능하면 앱 모드 창으로) ──
function openBrowser(targetUrl) {
  const tryCmds = [];
  if (IS_WIN) {
    // Edge/Chrome 앱 모드 우선, 실패 시 기본 브라우저
    tryCmds.push(`start chrome --app=${targetUrl}`);
    tryCmds.push(`start msedge --app=${targetUrl}`);
    tryCmds.push(`start "" "${targetUrl}"`);
  } else if (process.platform === 'darwin') {
    tryCmds.push(`open -a "Google Chrome" --args --app=${targetUrl}`);
    tryCmds.push(`open "${targetUrl}"`);
  } else {
    tryCmds.push(`google-chrome --app=${targetUrl}`);
    tryCmds.push(`chromium --app=${targetUrl}`);
    tryCmds.push(`xdg-open "${targetUrl}"`);
  }
  const run = (i) => {
    if (i >= tryCmds.length) return;
    exec(tryCmds[i], err => { if (err) run(i + 1); });
  };
  run(0);
}

const NO_OPEN = process.env.NO_OPEN || process.argv.includes('--no-open');

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[관리자] 포트 ${MANAGER_PORT} 이미 사용 중 — 다른 인스턴스가 실행 중입니다.`);
    if (!NO_OPEN) openBrowser(`http://localhost:${MANAGER_PORT}`);
    process.exit(0);
  }
  throw e;
});

server.listen(MANAGER_PORT, () => {
  const url = `http://localhost:${MANAGER_PORT}`;
  console.log('═══════════════════════════════════════════════');
  console.log('  SQLDev 서버 관리자 (백그라운드 실행 중)');
  console.log(`  제어판: ${url}`);
  console.log('  종료하려면 제어판의 [관리자 종료] 버튼을 사용하세요.');
  console.log('═══════════════════════════════════════════════');
  if (!NO_OPEN) openBrowser(url);
});

// 관리자 종료 시 앱 서버도 함께 종료 (SIGTERM을 무시하므로 강제 종료)
function shutdown() {
  if (isRunning()) {
    try { IS_WIN ? exec(`taskkill /pid ${child.pid} /T /F`) : child.kill('SIGKILL'); } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
