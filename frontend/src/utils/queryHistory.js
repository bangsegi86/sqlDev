// ─────────────────────────────────────────────────────────────────────────
// 쿼리 실행 히스토리 (localStorage 기반 — 오프라인 동작)
// History is stored per-connection: key = `sqldev.queryHistory_${connectionId}`
// ─────────────────────────────────────────────────────────────────────────
const BASE_KEY = 'sqldev.queryHistory';
const LIMIT = 200;

function storageKey(connectionId) {
  return connectionId ? `${BASE_KEY}_${connectionId}` : BASE_KEY;
}

export function loadHistory(connectionId) {
  try {
    const raw = localStorage.getItem(storageKey(connectionId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(list, connectionId) {
  try { localStorage.setItem(storageKey(connectionId), JSON.stringify(list)); } catch {}
}

// 히스토리에 추가. 직전 항목과 동일한 SQL 이면 시각만 갱신(중복 방지).
export function addHistory({ sql, connName, connectionId, schema, ok, rowCount, ms }) {
  const trimmed = (sql || '').trim();
  if (!trimmed) return;
  const list = loadHistory(connectionId);
  const entry = { sql: trimmed, connName, connectionId, schema, ok, rowCount, ms, ts: Date.now() };
  if (list.length && list[0].sql === trimmed) {
    list[0] = entry;          // 같은 쿼리 연속 실행 → 맨 위 갱신
  } else {
    list.unshift(entry);
  }
  if (list.length > LIMIT) list.length = LIMIT;
  save(list, connectionId);
  return list;
}

export function removeHistory(ts, connectionId) {
  const list = loadHistory(connectionId).filter(e => e.ts !== ts);
  save(list, connectionId);
  return list;
}

export function clearHistory(connectionId) {
  save([], connectionId);
  return [];
}
