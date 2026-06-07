// ─────────────────────────────────────────────────────────────────────────
// 쿼리 실행 히스토리 (localStorage 기반 — 오프라인 동작)
// ─────────────────────────────────────────────────────────────────────────
const KEY = 'sqldev.queryHistory';
const LIMIT = 200;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

// 히스토리에 추가. 직전 항목과 동일한 SQL 이면 시각만 갱신(중복 방지).
export function addHistory({ sql, connName, schema, ok, rowCount, ms }) {
  const trimmed = (sql || '').trim();
  if (!trimmed) return;
  const list = loadHistory();
  const entry = { sql: trimmed, connName, schema, ok, rowCount, ms, ts: Date.now() };
  if (list.length && list[0].sql === trimmed) {
    list[0] = entry;          // 같은 쿼리 연속 실행 → 맨 위 갱신
  } else {
    list.unshift(entry);
  }
  if (list.length > LIMIT) list.length = LIMIT;
  save(list);
  return list;
}

export function removeHistory(ts) {
  const list = loadHistory().filter(e => e.ts !== ts);
  save(list);
  return list;
}

export function clearHistory() {
  save([]);
  return [];
}
