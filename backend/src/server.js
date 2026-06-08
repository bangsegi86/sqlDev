import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, statSync } from 'fs';
import { networkInterfaces } from 'os';
import connectionsRouter from './routes/connections.js';
import oracleRouter from './routes/oracle.js';
import settingsRouter from './routes/settings.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dir, '../../frontend/dist');
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 → 외부(다른 PC)에서도 접속 가능

// 개발 모드(Vite 5173)에서 오는 요청을 위해 CORS 허용.
// 운영 모드에서는 프론트엔드를 같은 서버가 서빙하므로 same-origin이라 CORS가 필요 없음.
app.use(cors());
app.use(express.json());

// ── 헬스 체크 (서버 관리자 GUI가 상태 확인에 사용) ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), pid: process.pid, time: Date.now() });
});

// ── 빌드 버전 (클라이언트가 새 빌드를 감지하는 데 사용) ──
app.get('/api/build-version', (req, res) => {
  const distIndex = join(DIST_DIR, 'index.html');
  if (!existsSync(distIndex)) return res.json({ version: 0 });
  res.json({ version: statSync(distIndex).mtimeMs });
});

// ── 진단 로그 (클라이언트 크래시 원인 추적용) ──
// 브라우저 탭이 죽어도 서버에 로그가 남는다.
// GET /api/diag-log  → 최근 200개 항목 반환
// POST /api/diag-log → { msg: string } 저장
const diagLogBuffer = [];
const DIAG_LOG_LIMIT = 200;
app.get('/api/diag-log', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(diagLogBuffer.join('\n') || '(진단 로그 없음)');
});
app.post('/api/diag-log', (req, res) => {
  const msg = String(req.body?.msg ?? '').slice(0, 2000);
  const entry = `${new Date().toISOString()}  ${msg}`;
  console.log('[diag]', msg);
  diagLogBuffer.push(entry);
  if (diagLogBuffer.length > DIAG_LOG_LIMIT) diagLogBuffer.shift();
  res.json({ ok: true });
});

app.use('/api/connections', connectionsRouter);
app.use('/api/oracle', oracleRouter);
app.use('/api/settings', settingsRouter);

// ── 빌드된 프론트엔드 정적 파일 서빙 (운영 모드) ──
// frontend/dist 가 있으면 단일 포트에서 앱 전체를 제공한다.
const hasBuild = existsSync(join(DIST_DIR, 'index.html'));
if (hasBuild) {
  app.use(express.static(DIST_DIR));
  // SPA 라우팅: API가 아닌 모든 GET 요청은 index.html 로 폴백
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// 접속 가능한 네트워크 주소 목록 출력 (로컬 + LAN IP)
function printAddresses() {
  console.log(`SQLDev backend running (port ${PORT})`);
  console.log(`  • 로컬:    http://localhost:${PORT}`);
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  • 네트워크: http://${net.address}:${PORT}`);
      }
    }
  }
  if (!hasBuild) {
    console.log('  ⚠ frontend/dist 없음 — 먼저 "npm run build --prefix frontend" 실행 (또는 개발 모드는 npm run dev)');
  }
}

app.listen(PORT, HOST, printAddresses);
