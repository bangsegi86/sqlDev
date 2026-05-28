// PL/SQL 순차 실행 흐름 분석기

const SYSTEM_OBJECTS = new Set([
  'DUAL','ROWNUM','ROWID','LEVEL','SYSDATE','SYSTIMESTAMP','USER','UID','SESSIONID','INSTANCE',
]);
const ORACLE_SYSTEM_PREFIXES = ['V$','GV$','DBA_','ALL_','USER_','V_$','NLS_'];
const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','IS','NULL',
  'CASE','WHEN','THEN','ELSE','END','IF','ELSIF','LOOP','FOR','WHILE','BEGIN','EXCEPTION',
  'RAISE','INSERT','UPDATE','DELETE','MERGE','INTO','VALUES','SET','COMMIT','ROLLBACK',
  'SAVEPOINT','CURSOR','OPEN','FETCH','CLOSE','PROCEDURE','FUNCTION','PACKAGE','TRIGGER',
  'TYPE','BODY','RETURN','DECLARE','AS','IS','BY','ON','ORDER','GROUP','HAVING','UNION',
  'INTERSECT','MINUS','JOIN','INNER','LEFT','RIGHT','FULL','OUTER','CROSS','NATURAL',
  'USING','WITH','EXECUTE','IMMEDIATE','BULK','COLLECT','FORALL','DEFAULT','CONSTANT',
  'OTHERS','GOTO','EXIT','CONTINUE','PRAGMA','TABLE','INDEX','SEQUENCE','VIEW','TRUE','FALSE',
  'NUMBER','VARCHAR2','VARCHAR','CHAR','DATE','TIMESTAMP','BOOLEAN','INTEGER','CLOB','BLOB',
  'SYS','SYSTEM','PUBLIC','ALL','OF','OVER','PARTITION','ROW','ROWS','RANGE','CONNECT','START',
]);
const BUILTIN_FUNCTIONS = new Set([
  'TO_CHAR','TO_DATE','TO_NUMBER','TO_TIMESTAMP','NVL','NVL2','DECODE','COALESCE','NULLIF',
  'COUNT','SUM','AVG','MAX','MIN','UPPER','LOWER','TRIM','LTRIM','RTRIM','SUBSTR','INSTR',
  'LENGTH','REPLACE','LPAD','RPAD','CHR','ASCII','CONCAT','SYSDATE','SYSTIMESTAMP',
  'ADD_MONTHS','MONTHS_BETWEEN','TRUNC','ROUND','CEIL','FLOOR','MOD','ABS','SIGN',
  'GREATEST','LEAST','REGEXP_LIKE','REGEXP_SUBSTR','REGEXP_REPLACE','ROW_NUMBER','RANK',
  'DENSE_RANK','FIRST_VALUE','LAST_VALUE','LAG','LEAD','SYS_GUID','RAWTOHEX',
  'RAISE_APPLICATION_ERROR','SQLCODE','SQLERRM','PUT_LINE','LISTAGG','SYS_CONTEXT',
]);

// ── Utilities ─────────────────────────────────────────────────────────────────

function removeComments(src) {
  // Replace comments with equal-length whitespace (preserving newlines) so that
  // token character positions still map 1:1 onto the original source — required
  // for node→source-line mapping in the flowchart.
  return src
    .replace(/--[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

// Map a character offset to a 1-based line number using a precomputed line-start index
function buildLineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

function posToLine(lineStarts, pos) {
  if (pos == null) return null;
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function sanitizeId(name) {
  return (name.replace(/[^A-Z0-9_]/gi, '_').toUpperCase().replace(/^_+|_+$/g, '') || 'X');
}

function esc(s) {
  // Escape text for Mermaid node labels
  return String(s || '').replace(/"/g, "'").replace(/[<>{}[\]]/g, ' ').replace(/\n/g, '\\n').trim().slice(0, 90);
}

// ── @desc comment extraction ───────────────────────────────────────────────────

function extractDescComments(src) {
  // Returns Map<lineNo(1-based), descText> for every "-- @desc: ..." or "-- desc: ..." line
  const byLine = new Map();
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /--\s*@?desc:\s*(.*)/i.exec(lines[i]);
    if (m) byLine.set(i + 1, m[1].trim());
  }
  return byLine;
}

function attachDescs(steps, lineStarts, descByLine) {
  // Recursively attach .desc to each step.
  // Looks up to 3 lines above the statement for a desc comment
  // (to allow for blank lines between comment and statement).
  for (const step of steps) {
    if (!step) continue;
    if (step.pos != null) {
      const ln = posToLine(lineStarts, step.pos);
      for (let offset = 1; offset <= 3; offset++) {
        const desc = descByLine.get(ln - offset);
        if (desc != null) { step.desc = desc; break; }
      }
    }
    // Recurse into control-flow children
    if (step.branches) for (const b of step.branches) if (b.steps) attachDescs(b.steps, lineStarts, descByLine);
    if (step.steps)    attachDescs(step.steps, lineStarts, descByLine);
    if (step.bodySteps) attachDescs(step.bodySteps, lineStarts, descByLine);
  }
}

function descSuffix(step) {
  return step?.desc ? `\\n💬 ${esc(step.desc)}` : '';
}

// ── Statement-detail extractors (for richer node labels) ──────────────────────

function extractWhere(text) {
  const m = /\bWHERE\b\s+([\s\S]+?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bRETURNING\b|\bCONNECT\s+BY\b|$)/i.exec(text);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 45);
}

function extractSelectInto(text) {
  const m = /\bINTO\b\s+([\s\S]+?)\bFROM\b/i.exec(text);
  if (!m) return '';
  const vars = splitByComma(m[1]).map(v => v.trim()).filter(Boolean);
  return vars.slice(0, 3).join(', ') + (vars.length > 3 ? ` 외 ${vars.length - 3}` : '');
}

function extractUpdateSetCols(text) {
  const m = /\bSET\b([\s\S]+?)(?:\bWHERE\b|$)/i.exec(text);
  if (!m) return [];
  return splitByComma(m[1])
    .map(a => (a.split(/:=|=/)[0] || '').trim().split('.').pop().trim())
    .filter(c => c && /^[A-Za-z_]/.test(c));
}

function extractInsertCols(text) {
  const m = /\bINTO\b\s+[A-Z_][A-Z0-9_$#.]*\s*\(([\s\S]+?)\)/i.exec(text);
  if (!m) return [];
  return splitByComma(m[1]).map(c => c.trim()).filter(Boolean);
}

function isSystemTable(name) {
  if (SYSTEM_OBJECTS.has(name)) return true;
  return ORACLE_SYSTEM_PREFIXES.some(p => name.startsWith(p));
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src[i] === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'" && src[j+1] === "'") { j += 2; }
        else if (src[j] === "'") { j++; break; }
        else j++;
      }
      toks.push({ t: 'STR', v: "'...'", pos: i }); i = j; continue;
    }
    if (/[A-Za-z_$#]/.test(src[i])) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$#]/.test(src[j])) j++;
      const v = src.slice(i, j);
      toks.push({ t: 'W', v, u: v.toUpperCase(), pos: i }); i = j; continue;
    }
    if (/\d/.test(src[i])) {
      let j = i;
      while (j < src.length && /[\d.eE]/.test(src[j])) j++;
      toks.push({ t: 'NUM', v: src.slice(i, j), pos: i }); i = j; continue;
    }
    const two = src.slice(i, i+2);
    if ([':=','<>','<=','>=','!=','||','..'].includes(two)) {
      toks.push({ t: 'OP', v: two, pos: i }); i += 2; continue;
    }
    const ch = src[i];
    toks.push({ t: ch===';'?'SEMI':ch==='('?'LP':ch===')'?'RP':ch==='.'?'DOT':'P', v: ch, pos: i });
    i++;
  }
  return toks;
}

// ── Parser Helpers ────────────────────────────────────────────────────────────

function skipParens(toks, i) {
  let d = 1; i++;
  while (i < toks.length && d > 0) {
    if (toks[i].t === 'LP') d++;
    else if (toks[i].t === 'RP') d--;
    i++;
  }
  return i;
}

function collectUntilSemi(toks, i) {
  const parts = [];
  let depth = 0;
  while (i < toks.length) {
    if (toks[i].t === 'SEMI' && depth === 0) break;
    if (toks[i].t === 'LP') { depth++; parts.push('('); i++; continue; }
    if (toks[i].t === 'RP') { depth--; parts.push(')'); i++; continue; }
    if (toks[i].t === 'STR') { parts.push("'…'"); i++; continue; }
    parts.push(toks[i].v); i++;
  }
  return { text: parts.join(' ').replace(/\s+/g,' ').trim(), endIdx: i };
}

// collectCondition: captures full expression including paren content (for IF/WHILE conditions)
function collectCondition(toks, i, ...stopWords) {
  const parts = [];
  let depth = 0;
  while (i < toks.length) {
    if (depth === 0 && toks[i].t === 'W' && stopWords.includes(toks[i].u)) break;
    if (toks[i].t === 'LP') { depth++; parts.push('('); i++; continue; }
    if (toks[i].t === 'RP') { depth--; parts.push(')'); i++; continue; }
    if (toks[i].t === 'STR') { parts.push("'…'"); i++; continue; }
    parts.push(toks[i].v); i++;
  }
  return { text: parts.join(' ').replace(/\s+/g,' ').trim(), endIdx: i };
}

// collectUntil kept for backward compatibility (same as collectCondition)
function collectUntil(toks, i, ...stopWords) {
  return collectCondition(toks, i, ...stopWords);
}

// ── Block Parser ──────────────────────────────────────────────────────────────
// Returns { steps[], endIdx } where endIdx points AT the stop word

function parseBlock(toks, i, stopWords) {
  const steps = [];
  while (i < toks.length) {
    if (toks[i].t === 'W' && stopWords.includes(toks[i].u)) return { steps, endIdx: i };
    if (toks[i].t !== 'W') { i++; continue; }
    const u = toks[i].u;

    if (u === 'IF') {
      const sp = toks[i].pos;
      i++;
      const { text: cond, endIdx: ci } = collectCondition(toks, i, 'THEN');
      i = toks[ci]?.u === 'THEN' ? ci + 1 : ci;
      const branches = [];
      const { steps: s0, endIdx: e0 } = parseBlock(toks, i, ['ELSIF','ELSE','END']);
      branches.push({ label: '예 (TRUE)', condition: cond, steps: s0 }); i = e0;
      while (toks[i]?.u === 'ELSIF') {
        i++;
        const { text: ec, endIdx: ei } = collectCondition(toks, i, 'THEN');
        i = toks[ei]?.u === 'THEN' ? ei + 1 : ei;
        const { steps: es, endIdx: ee } = parseBlock(toks, i, ['ELSIF','ELSE','END']);
        branches.push({ label: `ELSIF ${ec.slice(0,30)}`, condition: ec, steps: es }); i = ee;
      }
      if (toks[i]?.u === 'ELSE') {
        i++;
        const { steps: es, endIdx: ee } = parseBlock(toks, i, ['END']);
        branches.push({ label: '아니오 (FALSE)', condition: null, steps: es }); i = ee;
      } else {
        branches.push({ label: '아니오 (FALSE)', condition: null, steps: [] });
      }
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.u === 'IF') i++; if (toks[i]?.t === 'SEMI') i++; }
      steps.push({ type: 'if', condition: cond, branches, code: `IF ${cond} THEN`, pos: sp }); continue;
    }

    if (u === 'FOR') {
      const sp = toks[i].pos;
      i++;
      const { text: hdr, endIdx: hi } = collectCondition(toks, i, 'LOOP');
      i = toks[hi]?.u === 'LOOP' ? hi + 1 : hi;
      const { steps: ls, endIdx: le } = parseBlock(toks, i, ['END']); i = le;
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.u === 'LOOP') i++; if (toks[i]?.t === 'SEMI') i++; }
      steps.push({ type: 'for_loop', header: hdr, steps: ls, code: `FOR ${hdr} LOOP`, pos: sp }); continue;
    }

    if (u === 'WHILE') {
      const sp = toks[i].pos;
      i++;
      const { text: wc, endIdx: wi } = collectCondition(toks, i, 'LOOP');
      i = toks[wi]?.u === 'LOOP' ? wi + 1 : wi;
      const { steps: ls, endIdx: le } = parseBlock(toks, i, ['END']); i = le;
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.u === 'LOOP') i++; if (toks[i]?.t === 'SEMI') i++; }
      steps.push({ type: 'while_loop', condition: wc, steps: ls, code: `WHILE ${wc} LOOP`, pos: sp }); continue;
    }

    if (u === 'LOOP') {
      const sp = toks[i].pos;
      i++;
      const { steps: ls, endIdx: le } = parseBlock(toks, i, ['END']); i = le;
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.u === 'LOOP') i++; if (toks[i]?.t === 'SEMI') i++; }
      steps.push({ type: 'loop', steps: ls, code: 'LOOP ... END LOOP', pos: sp }); continue;
    }

    if (u === 'CASE') {
      const sp = toks[i].pos;
      i++;
      let caseExpr = '';
      if (toks[i]?.u !== 'WHEN') { const r = collectCondition(toks, i, 'WHEN'); caseExpr = r.text; i = r.endIdx; }
      const branches = [];
      while (toks[i]?.u === 'WHEN') {
        i++;
        const { text: wc, endIdx: wi } = collectCondition(toks, i, 'THEN');
        i = toks[wi]?.u === 'THEN' ? wi + 1 : wi;
        const { steps: ws, endIdx: we } = parseBlock(toks, i, ['WHEN','ELSE','END']);
        branches.push({ label: `WHEN ${wc.slice(0,25)}`, condition: (caseExpr?caseExpr+'=':'')+wc, steps: ws }); i = we;
      }
      if (toks[i]?.u === 'ELSE') {
        i++;
        const { steps: es, endIdx: ee } = parseBlock(toks, i, ['END']);
        branches.push({ label: 'ELSE', condition: null, steps: es }); i = ee;
      }
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.u === 'CASE') i++; if (toks[i]?.t === 'SEMI') i++; }
      const caseCond = caseExpr || 'CASE';
      steps.push({ type: 'if', condition: caseCond, branches, code: `CASE ${caseCond}`, pos: sp }); continue;
    }

    if (u === 'BEGIN') {
      i++;
      const { steps: bs, endIdx: be } = parseBlock(toks, i, ['END','EXCEPTION']); i = be;
      if (toks[i]?.u === 'EXCEPTION') {
        i++;
        const { endIdx: ee } = parseBlock(toks, i, ['END']); i = ee;
      }
      if (toks[i]?.u === 'END') { i++; if (toks[i]?.t === 'SEMI') i++; }
      steps.push(...bs); continue;
    }

    if (u === 'DECLARE') {
      const { endIdx: bi } = collectUntil(toks, i+1, 'BEGIN'); i = bi; continue;
    }

    if (u === 'NULL' || u === 'EXIT' || u === 'CONTINUE') {
      while (i < toks.length && toks[i].t !== 'SEMI') i++;
      if (toks[i]?.t === 'SEMI') i++;
      continue;
    }

    // Simple statement
    const sp = toks[i].pos;
    const { text, endIdx: si } = collectUntilSemi(toks, i);
    i = si + 1;
    const step = classifyStatement(u, text);
    if (step) { step.pos = sp; steps.push(step); }
  }
  return { steps, endIdx: i };
}

function classifyStatement(firstWord, text) {
  switch (firstWord) {
    case 'SELECT': {
      const tables = [];
      const re = /(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_$#]*)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const t = m[1].toUpperCase();
        if (!SQL_KEYWORDS.has(t) && !SYSTEM_OBJECTS.has(t) && !tables.includes(t)) tables.push(t);
      }
      let label = 'SELECT';
      const into = extractSelectInto(text);
      if (into) label += ` → ${into}`;
      if (tables.length) label += '\\nFROM ' + tables.slice(0, 3).join(', ') + (tables.length > 3 ? ` 외 ${tables.length - 3}` : '');
      const w = extractWhere(text);
      if (w) label += `\\nWHERE ${w}`;
      return { type: 'select', tables, label, code: text };
    }
    case 'INSERT': {
      const t = /INTO\s+([A-Z_][A-Z0-9_$#]*)/i.exec(text)?.[1]?.toUpperCase() || '';
      const cols = extractInsertCols(text);
      const colNote = cols.length ? `\\n${cols.length}개 컬럼` : (/\bSELECT\b/i.test(text) ? '\\n(SELECT 결과)' : '');
      return { type: 'insert', table: t, label: `INSERT INTO\\n${t}${colNote}`, code: text };
    }
    case 'UPDATE': {
      const t = /UPDATE\s+([A-Z_][A-Z0-9_$#]*)/i.exec(text)?.[1]?.toUpperCase() || '';
      const setCols = extractUpdateSetCols(text);
      let label = `UPDATE\\n${t}`;
      if (setCols.length) label += `\\nSET ${setCols.slice(0, 3).join(', ')}${setCols.length > 3 ? ` 외 ${setCols.length - 3}` : ''}`;
      const w = extractWhere(text);
      if (w) label += `\\nWHERE ${w}`;
      return { type: 'update', table: t, label, code: text };
    }
    case 'DELETE': {
      const t = /(?:DELETE\s+FROM|DELETE)\s+([A-Z_][A-Z0-9_$#]*)/i.exec(text)?.[1]?.toUpperCase() || '';
      let label = `DELETE FROM\\n${t}`;
      const w = extractWhere(text);
      if (w) label += `\\nWHERE ${w}`;
      return { type: 'delete', table: t, label, code: text };
    }
    case 'MERGE': {
      const t = /MERGE\s+INTO\s+([A-Z_][A-Z0-9_$#]*)/i.exec(text)?.[1]?.toUpperCase() || '';
      return { type: 'merge', table: t, label: `MERGE INTO\\n${t}`, code: text };
    }
    case 'COMMIT':   return { type: 'commit',   label: 'COMMIT',    code: text };
    case 'ROLLBACK': return { type: 'rollback', label: 'ROLLBACK',  code: text };
    case 'SAVEPOINT': return { type: 'commit',  label: `SAVEPOINT ${text.replace(/^SAVEPOINT\s*/i,'').slice(0,20)}`, code: text };
    case 'RETURN': {
      const v = text.replace(/^RETURN\s*/i,'').replace(/\s+/g,' ').slice(0,35);
      return { type: 'return', label: `RETURN${v ? ' ' + v : ''}`, code: text };
    }
    case 'RAISE': {
      const v = text.replace(/^RAISE\s*/i,'').slice(0,35) || 'EXCEPTION';
      return { type: 'raise', label: `RAISE ${v}`, code: text };
    }
    case 'EXECUTE': return { type: 'dynamic', label: 'EXECUTE IMMEDIATE\\n동적 SQL', code: text };
    case 'OPEN':  return { type: 'cursor', op: 'OPEN',  label: text.replace(/\s+/g,' ').slice(0,50), code: text };
    case 'FETCH': return { type: 'cursor', op: 'FETCH', label: text.replace(/\s+/g,' ').slice(0,50), code: text };
    case 'CLOSE': return { type: 'cursor', op: 'CLOSE', label: text.replace(/\s+/g,' ').slice(0,50), code: text };
    default: {
      if (text.includes(':=')) return null; // variable assignment — skip
      const callM = /^([A-Za-z_][A-Za-z0-9_$#]*(?:\.[A-Za-z_][A-Za-z0-9_$#]*)*)\s*\(/.exec(text);
      if (!callM) return null;
      const fn = callM[1];
      const fnUp = fn.toUpperCase();
      if (SQL_KEYWORDS.has(fnUp.split('.')[0])) return null;
      if (BUILTIN_FUNCTIONS.has(fnUp.split('.').pop())) return null;
      const isSys = /^(DBMS_|UTL_|HTP\b|HTF\b|APEX_|FND_)/i.test(fn);
      return { type: isSys ? 'call_system' : 'call_user', label: fn.slice(0,50), code: text };
    }
  }
}

// ── Flow AST Builder ──────────────────────────────────────────────────────────

function buildFlowAST(src) {
  const cleaned = removeComments(src);
  const toks = tokenize(cleaned);

  // Find the main BEGIN (skip procedure header parens)
  let i = 0, depth = 0;
  while (i < toks.length) {
    if (toks[i].t === 'LP') { depth++; i++; continue; }
    if (toks[i].t === 'RP') { depth--; i++; continue; }
    if (depth === 0 && toks[i].t === 'W' && toks[i].u === 'BEGIN') { i++; break; }
    i++;
  }

  const { steps: mainSteps, endIdx } = parseBlock(toks, i, ['END','EXCEPTION']);
  i = endIdx;

  const exceptionHandlers = [];
  if (toks[i]?.u === 'EXCEPTION') {
    i++;
    while (i < toks.length && toks[i]?.u !== 'END') {
      if (toks[i]?.u !== 'WHEN') { i++; continue; }
      i++;
      const { text: cond, endIdx: ci } = collectUntil(toks, i, 'THEN');
      i = toks[ci]?.u === 'THEN' ? ci + 1 : ci;
      const { steps: hs, endIdx: he } = parseBlock(toks, i, ['WHEN','END']);
      exceptionHandlers.push({ condition: cond, steps: hs }); i = he;
    }
  }

  return { mainSteps, exceptionHandlers };
}

// ── Mermaid Sequential Flowchart Generator ────────────────────────────────────

let _n = 0;
const nid = prefix => `${prefix}${++_n}`;

// Module-level position map (node id → source char offset), reset per generateMermaid.
// Mirrors the existing `_n` counter pattern to avoid threading through every fn.
let _posMap = {};
function regPos(id, step) {
  if (step && step.pos != null) _posMap[id] = step.pos;
}

function arrowTo(label) {
  return label ? `-->|"${esc(label)}"|` : '-->';
}

function summarizeSteps(steps) {
  const out = [];
  for (const s of steps || []) {
    if (!s) continue;
    if (s.type === 'select')   out.push(`📖 SELECT FROM ${(s.tables||[]).slice(0,1).join(',')}`);
    if (s.type === 'insert')   out.push(`✏️ INSERT INTO ${s.table}`);
    if (s.type === 'update')   out.push(`✏️ UPDATE ${s.table}`);
    if (s.type === 'delete')   out.push(`✏️ DELETE FROM ${s.table}`);
    if (s.type === 'merge')    out.push(`✏️ MERGE INTO ${s.table}`);
    if (s.type === 'call_user') out.push(`🔧 ${s.label}`);
    if (s.type === 'call_system') out.push(`📦 ${s.label}`);
    if (s.type === 'commit')   out.push('💾 COMMIT');
    if (s.type === 'rollback') out.push('↩ ROLLBACK');
    if (s.type === 'if')       out.push(`⬦ IF ${(s.condition||'').slice(0,20)}`);
    if (s.type === 'for_loop' || s.type === 'while_loop' || s.type === 'loop')
      out.push('🔄 내부 반복');
  }
  return [...new Set(out)];
}

function generateFlow(lines, steps, prevIds, nodeCodeMap, firstLabel = null) {
  let curr = prevIds;
  for (let si = 0; si < steps.length; si++) {
    const lbl = si === 0 ? firstLabel : null;
    const { endIds } = generateNode(lines, steps[si], curr, lbl, nodeCodeMap);
    curr = endIds;
    if (!curr.length) break;
  }
  return { endIds: curr };
}

function generateNode(lines, step, prevIds, edgeLabel = null, nodeCodeMap = {}) {
  const AT = arrowTo(edgeLabel);

  switch (step.type) {
    case 'select': {
      const id = nid('SEL');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["📖 ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} readOp`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'insert': case 'update': case 'delete': case 'merge': {
      const id = nid('DML');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["✏️ ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} writeOp`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'call_user': {
      const id = nid('CALL');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["🔧 ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} callOp`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'call_system': {
      const id = nid('SYS');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["📦 ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} sysCall`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'dynamic': {
      const id = nid('DYN');
      nodeCodeMap[id] = step.code || 'EXECUTE IMMEDIATE'; regPos(id, step);
      lines.push(`  ${id}["⚡ EXECUTE IMMEDIATE\\n동적 SQL 실행${descSuffix(step)}"]`);
      lines.push(`  class ${id} sysCall`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'commit': {
      const id = nid('CMT');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["💾 ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} commitNode`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'rollback': {
      const id = nid('RBK');
      nodeCodeMap[id] = step.code || 'ROLLBACK'; regPos(id, step);
      lines.push(`  ${id}["↩ ROLLBACK${descSuffix(step)}"]`);
      lines.push(`  class ${id} rollbackNode`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'return': {
      const id = nid('RET');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}(["↪ ${esc(step.label)}${descSuffix(step)}"])`);
      lines.push(`  class ${id} endNode`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [] };
    }
    case 'raise': {
      const id = nid('RAISE');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      lines.push(`  ${id}["⚠️ ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} excNode`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [] };
    }
    case 'cursor': {
      const id = nid('CUR');
      nodeCodeMap[id] = step.code || step.label; regPos(id, step);
      const icon = step.op === 'FETCH' ? '📋' : step.op === 'OPEN' ? '🔓' : '🔒';
      lines.push(`  ${id}["${icon} ${esc(step.label)}${descSuffix(step)}"]`);
      lines.push(`  class ${id} cursorOp`);
      prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
      lines.push('');
      return { endIds: [id] };
    }
    case 'if': return generateIfNode(lines, step, prevIds, edgeLabel, nodeCodeMap);
    case 'for_loop':   return generateLoopNode(lines, step, prevIds, edgeLabel, `🔄 FOR ${esc(step.header)}`, nodeCodeMap);
    case 'while_loop': return generateLoopNode(lines, step, prevIds, edgeLabel, `🔄 WHILE ${esc(step.condition)}`, nodeCodeMap);
    case 'loop':       return generateLoopNode(lines, step, prevIds, edgeLabel, '🔄 LOOP', nodeCodeMap);
    default: return { endIds: prevIds };
  }
}

function generateIfNode(lines, step, prevIds, edgeLabel, nodeCodeMap = {}) {
  const decId = nid('IF');
  const AT = arrowTo(edgeLabel);
  const condLabel = step.condition ? esc(step.condition) : '조건';
  nodeCodeMap[decId] = step.code || `IF ${step.condition || ''}`; regPos(decId, step);
  lines.push(`  ${decId}{"IF\\n${condLabel}"}`);
  lines.push(`  class ${decId} decision`);
  prevIds.forEach(p => lines.push(`  ${p} ${AT} ${decId}`));
  lines.push('');

  const branchEnds = [];
  const hasElse = step.branches.some(b => b.condition === null);

  for (let bi = 0; bi < step.branches.length; bi++) {
    const br = step.branches[bi];
    const lbl = bi === 0 ? '예' : (br.condition === null ? '아니오' : esc(br.label));
    if (!br.steps.length) { branchEnds.push(decId); continue; }
    const { endIds } = generateFlow(lines, br.steps, [decId], nodeCodeMap, lbl);
    branchEnds.push(...endIds);
  }

  if (!hasElse) branchEnds.push(decId);

  const valid = [...new Set(branchEnds)].filter(Boolean);
  if (!valid.length) return { endIds: [] };
  if (valid.length === 1 && valid[0] === decId) return { endIds: valid };

  const joinId = nid('JOIN');
  lines.push(`  ${joinId}((●))`);
  lines.push(`  class ${joinId} mergeNode`);
  valid.forEach(e => lines.push(`  ${e} --> ${joinId}`));
  lines.push('');
  return { endIds: [joinId] };
}

function buildLoopCodeDetail(step, indent) {
  indent = indent || '';
  const lines = [step.code];
  for (const s of (step.steps || [])) {
    if (!s) continue;
    if (s.type === 'for_loop' || s.type === 'while_loop' || s.type === 'loop') {
      lines.push(indent + '  ' + s.code);
      lines.push(indent + '    ...');
      lines.push(indent + '  END LOOP;');
    } else if (s.type === 'if') {
      lines.push(indent + '  IF ' + s.condition + ' THEN');
      for (const br of (s.branches || [])) {
        for (const bs of (br.steps || [])) {
          if (bs && bs.code) lines.push(indent + '    ' + bs.code + ';');
        }
      }
      lines.push(indent + '  END IF;');
    } else if (s.code) {
      lines.push(indent + '  ' + s.code + ';');
    }
  }
  lines.push(indent + 'END LOOP;');
  return lines.join('\n');
}

function generateLoopNode(lines, step, prevIds, edgeLabel, headerLabel, nodeCodeMap = {}) {
  const id = nid('LOOP');
  const AT = arrowTo(edgeLabel);
  nodeCodeMap[id] = buildLoopCodeDetail(step, ''); regPos(id, step);

  const bodySteps = (step.steps || []).filter(Boolean);
  const hasInteresting = bodySteps.some(s =>
    ['select','insert','update','delete','merge','if','call_user','call_system',
     'dynamic','commit','rollback','return','raise','cursor','for_loop','while_loop','loop'].includes(s.type)
  );

  if (!hasInteresting) {
    // No meaningful body — show single summary box
    const summary = summarizeSteps(bodySteps).slice(0, 4).map(s => esc(s)).join('\\n');
    lines.push(`  ${id}["${esc(headerLabel)}${summary ? '\\n──────\\n' + summary : ''}"]`);
    lines.push(`  class ${id} loopBox`);
    prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
    lines.push('');
    return { endIds: [id] };
  }

  // Expanded loop: header node → body nodes → loop-back → exit merge node
  lines.push(`  ${id}["${esc(headerLabel)}"]`);
  lines.push(`  class ${id} loopBox`);
  prevIds.forEach(p => lines.push(`  ${p} ${AT} ${id}`));
  lines.push('');

  const { endIds: bodyEndIds } = generateFlow(lines, bodySteps, [id], nodeCodeMap, '반복');

  // Loop-back arrows from body end points to loop header
  const loopBacks = bodyEndIds.filter(e => e !== id);
  if (loopBacks.length) {
    loopBacks.forEach(e => lines.push(`  ${e} -->|"↩"| ${id}`));
    lines.push('');
  }

  // Explicit exit node so downstream steps connect cleanly
  const exitId = nid('LEXT');
  lines.push(`  ${exitId}((●))`);
  lines.push(`  class ${exitId} mergeNode`);
  lines.push(`  ${id} -->|"완료"| ${exitId}`);
  lines.push('');

  return { endIds: [exitId] };
}

function generateMermaid({ procName, procType, params, mainSteps, exceptionHandlers }) {
  _n = 0;
  _posMap = {};
  const nodeCodeMap = {};
  const lines = [
    'flowchart TD',
    '  classDef startNode fill:#1a237e,stroke:#7986cb,color:#e8eaf6',
    '  classDef endNode   fill:#1a237e,stroke:#7986cb,color:#e8eaf6',
    '  classDef paramNode fill:#0d3349,stroke:#4dd0e1,color:#e0f7fa',
    '  classDef readOp    fill:#1b3a1b,stroke:#66bb6a,color:#c8e6c9',
    '  classDef writeOp   fill:#3b1a1a,stroke:#ef5350,color:#ffcdd2',
    '  classDef callOp    fill:#2a1a3a,stroke:#ab47bc,color:#f3e5f5',
    '  classDef sysCall   fill:#1a2535,stroke:#42a5f5,color:#bbdefb',
    '  classDef loopBox   fill:#2a2a12,stroke:#d4e157,color:#f9fbe7',
    '  classDef commitNode fill:#0d2b22,stroke:#26a69a,color:#b2dfdb',
    '  classDef rollbackNode fill:#3a1a1a,stroke:#ef5350,color:#ffcdd2',
    '  classDef decision  fill:#3e2200,stroke:#ffa000,color:#fff9c4',
    '  classDef excNode   fill:#2a2a2a,stroke:#bdbdbd,color:#f5f5f5',
    '  classDef mergeNode fill:#263238,stroke:#546e7a,color:#cfd8dc',
    '  classDef cursorOp  fill:#1a2a3a,stroke:#80cbc4,color:#e0f2f1',
    '',
  ];

  const inParams  = params.filter(p => p.direction === 'IN' || p.direction === 'IN OUT');
  const outParams = params.filter(p => p.direction === 'OUT' || p.direction === 'IN OUT');

  lines.push(`  START(["▶ START\\n${esc(procName)}  ·  ${esc(procType)}"])`);
  lines.push(`  class START startNode`);
  lines.push('');

  let prevIds = ['START'];

  if (inParams.length) {
    const pid = 'P_IN';
    const lbl = inParams.map(p => `${p.name} : ${p.dataType}`).join('\\n');
    lines.push(`  ${pid}["📥 입력 파라미터\\n${esc(lbl)}"]`);
    lines.push(`  class ${pid} paramNode`);
    prevIds.forEach(p => lines.push(`  ${p} --> ${pid}`));
    lines.push('');
    prevIds = [pid];
  }

  const { endIds } = generateFlow(lines, mainSteps, prevIds, nodeCodeMap);
  prevIds = endIds.length ? endIds : ['START'];

  if (outParams.length) {
    const pid = 'P_OUT';
    const lbl = outParams.map(p => `${p.name} : ${p.dataType}`).join('\\n');
    lines.push(`  ${pid}["📤 출력 파라미터\\n${esc(lbl)}"]`);
    lines.push(`  class ${pid} paramNode`);
    prevIds.forEach(p => lines.push(`  ${p} --> ${pid}`));
    lines.push('');
    prevIds = [pid];
  }

  lines.push(`  END_N(["■ END"])`);
  lines.push(`  class END_N endNode`);
  prevIds.forEach(p => lines.push(`  ${p} --> END_N`));

  if (exceptionHandlers.length) {
    const excId = 'EXC_BLOCK';
    const hlist = exceptionHandlers.map(h => `WHEN ${h.condition}`).join('\\n');
    lines.push('');
    lines.push(`  ${excId}["⚠️ EXCEPTION\\n${esc(hlist)}"]`);
    lines.push(`  class ${excId} excNode`);
    lines.push(`  START -.->|"오류 발생 시"| ${excId}`);
  }

  return { mermaid: lines.join('\n'), nodeCodeMap, nodePosMap: _posMap };
}

// ── Legacy metadata parsers (used by Summary tab) ─────────────────────────────

function parseParameters(src) {
  const params = [];
  const m = src.match(/(?:PROCEDURE|FUNCTION)\s+\w+\s*\(([\s\S]*?)\)\s*(?:RETURN|IS|AS)/i);
  if (!m) return params;
  const lines = splitByComma(m[1]);
  for (const line of lines) {
    const pm = line.trim().replace(/\s+/g,' ').match(/^(\w+)\s+((?:IN\s+OUT|OUT|IN)\s+)?([A-Z0-9_$%]+(?:\s*\([^)]*\))?)/i);
    if (pm) {
      let dir = (pm[2]||'IN').trim().toUpperCase().replace(/\s+/g,' ');
      if (!['IN','OUT','IN OUT'].includes(dir)) dir = 'IN';
      params.push({ name: pm[1].toUpperCase(), direction: dir, dataType: pm[3].toUpperCase() });
    }
  }
  return params;
}

function splitByComma(str) {
  const r = []; let d = 0, c = '';
  for (const ch of str) {
    if (ch==='(') { d++; c+=ch; } else if (ch===')') { d--; c+=ch; }
    else if (ch===',' && d===0) { r.push(c.trim()); c=''; } else c+=ch;
  }
  if (c.trim()) r.push(c.trim());
  return r;
}

function parseReads(upper) {
  const tables = new Set();
  const re = /(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const t = m[2] || m[1];
    if (!SQL_KEYWORDS.has(t) && !isSystemTable(t)) tables.add(t);
  }
  return [...tables];
}

function parseWrites(upper) {
  const writes = [];
  const pats = [
    { re: /INSERT\s+(?:ALL\s+)?INTO\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op:'INSERT' },
    { re: /UPDATE\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?\s+SET/g, op:'UPDATE' },
    { re: /DELETE\s+(?:FROM\s+)?([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op:'DELETE' },
    { re: /MERGE\s+INTO\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op:'MERGE' },
  ];
  for (const { re, op } of pats) {
    let m;
    while ((m = re.exec(upper)) !== null) {
      const t = m[2] || m[1];
      if (!SQL_KEYWORDS.has(t) && !isSystemTable(t) && !writes.find(w=>w.table===t&&w.op===op))
        writes.push({ table: t, op });
    }
  }
  return writes;
}

function parseCursors(upper) {
  const cursors = [];
  const re = /CURSOR\s+(\w+)\s+(?:\([^)]*\)\s+)?IS\s+SELECT\s+[\s\S]{0,200}?FROM\s+([A-Z_][A-Z0-9_$#]*)/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const t = m[2];
    if (!SQL_KEYWORDS.has(t) && !isSystemTable(t)) cursors.push({ name: m[1], table: t });
  }
  return cursors;
}

function parseProcedureCalls(src, currentName) {
  const calls = new Map();
  const upper = src.toUpperCase();
  if (/EXECUTE\s+IMMEDIATE/i.test(upper)) calls.set('EXECUTE IMMEDIATE', 'dynamic');
  const sysPkgRe = /\b(DBMS_[A-Z0-9_]+|UTL_[A-Z0-9_]+|HTP|HTF|APEX_[A-Z0-9_]+|FND_[A-Z0-9_]+)\b/g;
  let m;
  while ((m = sysPkgRe.exec(upper)) !== null) calls.set(m[1], 'system');
  const qualRe = /\b([A-Z_][A-Z0-9_$]*)\s*\.\s*([A-Z_][A-Z0-9_$]*)\s*(?:\.\s*([A-Z_][A-Z0-9_$]*)\s*)?\(/g;
  while ((m = qualRe.exec(upper)) !== null) {
    if (SQL_KEYWORDS.has(m[1])) continue;
    if (ORACLE_SYSTEM_PREFIXES.some(p => m[1].startsWith(p))) continue;
    const name = m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
    if (!BUILTIN_FUNCTIONS.has(m[2]) && !BUILTIN_FUNCTIONS.has(m[3]||'')) calls.set(name, 'procedure');
  }
  calls.delete(currentName.toUpperCase());
  return [...calls.entries()].map(([name, type]) => ({ name, type }));
}

function parseExceptions(upper) {
  const excs = [];
  const re = /WHEN\s+((?:[A-Z_][A-Z0-9_$]*\.)?[A-Z_][A-Z0-9_$]*)\s+THEN/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const e = m[1].trim();
    if (!excs.includes(e)) excs.push(e);
  }
  return excs;
}

function parseVariables(src) {
  const vars = [];
  const dm = src.match(/DECLARE\s+([\s\S]*?)BEGIN/i);
  if (!dm) return vars;
  const re = /^\s*(\w+)\s+([A-Z0-9_$%]+(?:\s*\([^)]*\))?)\s*(?::=|DEFAULT|;)/gim;
  let m;
  while ((m = re.exec(dm[1])) !== null) {
    if (!SQL_KEYWORDS.has(m[1].toUpperCase())) vars.push({ name: m[1], type: m[2] });
  }
  return vars.slice(0, 20);
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function analyzePLSQL(source, procName, procType) {
  const cleaned = removeComments(source);
  const upper = cleaned.toUpperCase();

  const params     = parseParameters(cleaned);
  const cursors    = parseCursors(upper);
  const reads      = parseReads(upper);
  const writes     = parseWrites(upper);
  const calls      = parseProcedureCalls(cleaned, procName);
  const exceptions = parseExceptions(upper);
  const variables  = parseVariables(cleaned);

  for (const c of cursors) {
    if (!reads.includes(c.table)) reads.push(c.table);
  }

  const descByLine = extractDescComments(source);

  let mermaid = 'flowchart TD\n  ERR["분석 오류"]';
  let nodeCodeMap = {};
  let nodePosMap = {};
  try {
    const { mainSteps, exceptionHandlers } = buildFlowAST(source);
    // Attach @desc comments to steps (must happen before generateMermaid)
    const lineStarts = buildLineStarts(source);
    attachDescs(mainSteps, lineStarts, descByLine);
    for (const h of exceptionHandlers) attachDescs(h.steps, lineStarts, descByLine);
    ({ mermaid, nodeCodeMap, nodePosMap } = generateMermaid({ procName, procType, params, mainSteps, exceptionHandlers }));
  } catch {}

  // Convert node char-offsets → 1-based source line numbers (for click-to-scroll)
  const lineStarts = buildLineStarts(source);
  const nodeLineMap = {};
  for (const [id, pos] of Object.entries(nodePosMap)) {
    const ln = posToLine(lineStarts, pos);
    if (ln != null) nodeLineMap[id] = ln;
  }

  return {
    procName, procType, params, reads, writes, calls, exceptions, cursors, variables,
    mermaid, nodeCodeMap, nodeLineMap, source,
  };
}
