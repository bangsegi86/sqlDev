// ─────────────────────────────────────────────────────────────────────────
// 테이블 Alias 재작성 엔진 (규칙 기반, 오프라인)
//
// SQL 문을 토큰화하여 FROM / JOIN 절의 테이블과 그 alias 를 찾고,
// 설정된 명명 규칙에 따라 새 alias 를 생성한 뒤, 해당 alias 로 참조하는
// 모든 컬럼 접두사(alias.col)까지 함께 치환한다.
//
// 쿼리 컨텍스트(메인 / 서브쿼리 / 스칼라 서브쿼리 / 조인 대상)를 구분하여
// 컨텍스트별로 다른 규칙을 적용할 수 있다.
//
// 스코프(각 SELECT 블록)는 한 번만 계산하여 토큰마다 부여하고, 참조 수집과
// 컬럼 치환 양쪽에서 동일한 스코프 id 를 사용한다.
//
// 외부 라이브러리/AI 없이 동작한다. 완전한 SQL 파서는 아니며 일반적인
// SELECT 패턴을 대상으로 한다.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_ALIAS_OPTIONS = {
  // 컨텍스트별 규칙: main / sub / scalar / join
  // method: 'abbrev' | 'prefixSeq' | 'truncate'
  contexts: {
    main:   { method: 'abbrev',    prefix: 'T',  truncLen: 3, upper: true },
    join:   { method: 'abbrev',    prefix: 'J',  truncLen: 3, upper: true },
    sub:    { method: 'prefixSeq', prefix: 'S',  truncLen: 3, upper: true },
    scalar: { method: 'prefixSeq', prefix: 'SC', truncLen: 2, upper: true },
  },
};

export const CONTEXT_LABELS = {
  main:   '메인 쿼리',
  join:   '조인 대상 테이블',
  sub:    '서브쿼리 (FROM 인라인뷰 / WHERE IN 등)',
  scalar: '스칼라 서브쿼리 (SELECT 절 내)',
};

export const METHOD_LABELS = {
  abbrev:    '단어 첫글자 축약',
  prefixSeq: '접두문자 + 순번',
  truncate:  '앞 N글자 잘라쓰기',
};

// ── 토크나이저 ──
function tokenize(sql) {
  const tokens = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      let s = ''; while (i < n && /\s/.test(sql[i])) { s += sql[i]; i++; }
      tokens.push({ type: 'ws', value: s }); continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      let s = ''; while (i < n && sql[i] !== '\n') { s += sql[i]; i++; }
      tokens.push({ type: 'comment', value: s }); continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      let s = ''; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { s += sql[i]; i++; }
      if (i < n) { s += '*/'; i += 2; }
      tokens.push({ type: 'comment', value: s }); continue;
    }
    if (c === "'" || c === '"') {
      const quote = c; let s = c; i++;
      while (i < n) {
        s += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { s += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      tokens.push({ type: quote === '"' ? 'quoted' : 'string', value: s }); continue;
    }
    if (/[A-Za-z_$#]/.test(c)) {
      let s = ''; while (i < n && /[A-Za-z0-9_$#]/.test(sql[i])) { s += sql[i]; i++; }
      tokens.push({ type: 'ident', value: s }); continue;
    }
    if (/[0-9]/.test(c)) {
      let s = ''; while (i < n && /[0-9.]/.test(sql[i])) { s += sql[i]; i++; }
      tokens.push({ type: 'number', value: s }); continue;
    }
    tokens.push({ type: 'punct', value: c }); i++;
  }
  return tokens;
}

const KW = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'AND', 'OR',
  'NOT', 'IN', 'EXISTS', 'UNION', 'ALL', 'INTERSECT', 'MINUS', 'AS', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'WITH', 'DISTINCT', 'USING', 'OVER', 'PARTITION', 'NULLS',
  'FIRST', 'LAST', 'ASC', 'DESC', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'CONNECT', 'START',
  'IS', 'NULL', 'LIKE', 'BETWEEN', 'INTO', 'VALUES', 'SET', 'ROWNUM',
]);
const isKw = (v) => KW.has(v.toUpperCase());
const CLAUSE_KW = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER',
  'CONNECT', 'START', 'UNION', 'INTERSECT', 'MINUS', 'ON', 'USING', 'SET']);

function nextSig(tokens, idx) {
  for (let j = idx + 1; j < tokens.length; j++)
    if (tokens[j].type !== 'ws' && tokens[j].type !== 'comment') return { tok: tokens[j], idx: j };
  return { tok: null, idx: -1 };
}

// ── 스코프 계산 (단일 패스, 진실의 원천) ──
// 반환: { tokenScope: number[], scopes: Map(id → {id, kind}) }
function computeScopes(tokens) {
  const tokenScope = new Array(tokens.length).fill(0);
  const scopes = new Map();
  let counter = 0;
  const root = { id: counter++, kind: 'main', clause: null, parenDepth: 0 };
  scopes.set(root.id, root);
  const stack = [root];
  let parenDepth = 0;

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    const top = stack[stack.length - 1];

    if (t.type === 'ws' || t.type === 'comment') { tokenScope[idx] = top.id; continue; }

    if (t.type === 'punct' && t.value === '(') {
      tokenScope[idx] = top.id;           // 여는 괄호는 부모 스코프 소속
      parenDepth++;
      const { tok: nt } = nextSig(tokens, idx);
      if (nt && nt.type === 'ident' && nt.value.toUpperCase() === 'SELECT') {
        // 부모의 현재 절로 컨텍스트 결정
        let kind = 'sub';
        if (top.clause === 'SELECT') kind = 'scalar';
        else if (top.clause === 'FROM') kind = 'sub';
        const sc = { id: counter++, kind, clause: null, parenDepth };
        scopes.set(sc.id, sc);
        stack.push(sc);
      }
      continue;
    }
    if (t.type === 'punct' && t.value === ')') {
      if (stack.length > 1 && top.parenDepth === parenDepth) stack.pop();
      parenDepth--;
      tokenScope[idx] = stack[stack.length - 1].id;
      continue;
    }

    // 절(clause) 추적
    if (t.type === 'ident') {
      const v = t.value.toUpperCase();
      if (CLAUSE_KW.has(v)) {
        // GROUP BY / ORDER BY 는 첫 단어로 처리
        top.clause = v;
      }
    }
    tokenScope[idx] = top.id;
  }
  return { tokenScope, scopes };
}

// ── 테이블 참조 수집 ──
function collectRefs(tokens, tokenScope, scopes) {
  const refs = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type !== 'ident') continue;
    const v = t.value.toUpperCase();
    if (v === 'FROM' || v === 'JOIN') {
      const sid = tokenScope[idx];
      const scopeKind = scopes.get(sid)?.kind || 'main';
      const isJoin = v === 'JOIN';
      const parsed = parseTableRefList(tokens, idx, sid, scopeKind, isJoin);
      for (const r of parsed) refs.push(r);
    }
  }
  return refs;
}

function parseTableRefList(tokens, fromIdx, scopeId, scopeKind, isJoin) {
  const result = [];
  let j = fromIdx;

  while (true) {
    const { tok: t1, idx: i1 } = nextSig(tokens, j);
    if (!t1) break;

    // 인라인뷰: FROM ( SELECT ... ) alias
    if (t1.type === 'punct' && t1.value === '(') {
      const close = matchParen(tokens, i1);
      let aliasTok = null, aliasIdx = -1;
      const { tok: at, idx: ai } = nextSig(tokens, close);
      if (at && at.type === 'ident' && at.value.toUpperCase() === 'AS') {
        const nx = nextSig(tokens, ai);
        if (nx.tok && (nx.tok.type === 'ident' || nx.tok.type === 'quoted') && !isKw(nx.tok.value)) {
          aliasTok = nx.tok; aliasIdx = nx.idx;
        }
      } else if (at && (at.type === 'ident' || at.type === 'quoted') && !isKw(at.value)) {
        aliasTok = at; aliasIdx = ai;
      }
      if (aliasTok) {
        result.push({
          tableName: '(subquery)', tableShort: aliasTok.value,
          alias: aliasTok.value, aliasIdx, tableIdx: -1,
          context: isJoin ? 'join' : 'sub', scopeId, isInlineView: true,
        });
      }
      j = aliasIdx >= 0 ? aliasIdx : close;
    } else if (t1.type === 'ident' && !isKw(t1.value)) {
      // 테이블명 (스키마.테이블)
      let tableName = t1.value;
      let lastIdx = i1;
      let probe = nextSig(tokens, i1);
      while (probe.tok && probe.tok.type === 'punct' && probe.tok.value === '.') {
        const after = nextSig(tokens, probe.idx);
        if (after.tok && (after.tok.type === 'ident' || after.tok.type === 'quoted')) {
          tableName += '.' + after.tok.value;
          lastIdx = after.idx;
          probe = nextSig(tokens, after.idx);
        } else break;
      }
      // alias
      let aliasTok = null, aliasIdx = -1;
      const { tok: at, idx: ai } = nextSig(tokens, lastIdx);
      if (at && at.type === 'ident' && at.value.toUpperCase() === 'AS') {
        const nx = nextSig(tokens, ai);
        if (nx.tok && (nx.tok.type === 'ident' || nx.tok.type === 'quoted') && !isKw(nx.tok.value)) {
          aliasTok = nx.tok; aliasIdx = nx.idx;
        }
      } else if (at && (at.type === 'ident' || at.type === 'quoted') && !isKw(at.value)) {
        aliasTok = at; aliasIdx = ai;
      }

      const tableShort = tableName.split('.').pop().replace(/["']/g, '');
      result.push({
        tableName, tableShort,
        alias: aliasTok ? aliasTok.value : null,
        aliasIdx, tableIdx: lastIdx,
        context: isJoin ? 'join' : (scopeKind === 'main' ? 'main' : scopeKind),
        scopeId, isInlineView: false,
      });
      j = aliasIdx >= 0 ? aliasIdx : lastIdx;
    } else {
      break;
    }

    if (isJoin) break;
    const { tok: sep, idx: si } = nextSig(tokens, j);
    if (sep && sep.type === 'punct' && sep.value === ',') { j = si; continue; }
    break;
  }
  return result;
}

function matchParen(tokens, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < tokens.length; k++) {
    if (tokens[k].type === 'punct' && tokens[k].value === '(') depth++;
    else if (tokens[k].type === 'punct' && tokens[k].value === ')') {
      depth--; if (depth === 0) return k;
    }
  }
  return tokens.length - 1;
}

// ── alias 생성기 ──
function genAbbrev(tableName) {
  const base = tableName.split('.').pop().replace(/["']/g, '');
  let words;
  if (base.includes('_')) words = base.split('_').filter(Boolean);
  else words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean);
  if (words.length <= 1) return (words[0] || base).slice(0, 1);
  return words.map(w => w[0]).join('');
}
function genTruncate(tableName, len) {
  const base = tableName.split('.').pop().replace(/["']/g, '').replace(/_/g, '');
  return base.slice(0, Math.max(1, len || 3));
}
function baseAlias(ref, rule, seqNo) {
  let a;
  if (ref.isInlineView) {
    // 인라인뷰는 이름이 없으므로 prefixSeq 강제
    a = `${rule.prefix || 'S'}${seqNo}`;
  } else {
    switch (rule.method) {
      case 'prefixSeq': a = `${rule.prefix || 'T'}${seqNo}`; break;
      case 'truncate':  a = genTruncate(ref.tableName, rule.truncLen); break;
      case 'abbrev':
      default:          a = genAbbrev(ref.tableName); break;
    }
  }
  if (rule.upper) a = a.toUpperCase();
  return a;
}

// ── 메인 진입점 ──
export function rewriteAliases(sql, options = DEFAULT_ALIAS_OPTIONS) {
  if (!sql || !sql.trim()) return { sql, changes: [] };
  const tokens = tokenize(sql);
  const { tokenScope, scopes } = computeScopes(tokens);
  const refs = collectRefs(tokens, tokenScope, scopes);
  if (refs.length === 0) return { sql, changes: [] };

  const scopeUsed = new Map();
  // prefixSeq / 인라인뷰 번호는 컨텍스트별 전역 순번을 사용한다 (S1, S2, S3...).
  const ctxSeq = new Map();
  const nextCtxSeq = (ctx) => { const n = (ctxSeq.get(ctx) || 0) + 1; ctxSeq.set(ctx, n); return n; };
  const changes = [];
  // scopeId → Map(oldAliasUpper → newAlias)
  const scopeAliasMap = new Map();
  const aliasDeclIdx = new Map();  // tokenIdx → newAlias
  const insertAfter = new Map();   // tokenIdx → newAlias (alias 없던 테이블)

  for (const ref of refs) {
    const ctxRule = options.contexts[ref.context] || options.contexts.main;
    const sid = ref.scopeId;
    if (!scopeUsed.has(sid)) scopeUsed.set(sid, new Set());

    const useSeq = (ctxRule.method === 'prefixSeq' || ref.isInlineView)
      ? nextCtxSeq(ref.context) : 0;
    let cand = baseAlias(ref, ctxRule, useSeq);

    // 같은 스코프 내 충돌 시 끝에 순번을 붙여 유일화
    const used = scopeUsed.get(sid);
    if (used.has(cand.toUpperCase())) {
      let k = 2, next = `${cand}${k}`;
      while (used.has(next.toUpperCase())) { k++; next = `${cand}${k}`; }
      cand = next;
    }
    used.add(cand.toUpperCase());

    const oldAlias = ref.alias || ref.tableShort;
    if (!scopeAliasMap.has(sid)) scopeAliasMap.set(sid, new Map());
    scopeAliasMap.get(sid).set(oldAlias.toUpperCase(), cand);

    if (ref.aliasIdx >= 0) aliasDeclIdx.set(ref.aliasIdx, cand);
    else if (!ref.isInlineView && ref.tableIdx >= 0) insertAfter.set(ref.tableIdx, cand);

    changes.push({ table: ref.tableName, from: ref.alias || '(없음)', to: cand, context: ref.context });
  }

  // 재작성
  let out = '';
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];

    if (aliasDeclIdx.has(idx)) { out += aliasDeclIdx.get(idx); continue; }

    // 컬럼 참조 치환: ident '.' 에서 앞 ident 가 oldAlias 면 치환
    if (t.type === 'ident' && !isKw(t.value)) {
      const nx = nextSig(tokens, idx);
      if (nx.tok && nx.tok.type === 'punct' && nx.tok.value === '.') {
        const map = scopeAliasMap.get(tokenScope[idx]);
        if (map && map.has(t.value.toUpperCase()) && !aliasDeclIdx.has(idx)) {
          out += map.get(t.value.toUpperCase());
          continue;
        }
      }
    }

    out += t.value;
    if (insertAfter.has(idx)) out += ' ' + insertAfter.get(idx);
  }

  return { sql: out, changes };
}
