import React from 'react';

// ── Keyword sets ───────────────────────────────────────────────────────────────

const SQL_KW = new Set([
  'SELECT','INSERT','UPDATE','DELETE','MERGE','WITH',
  'FROM','WHERE','AND','OR','NOT','AS','IN','EXISTS','BETWEEN','LIKE',
  'IS','NULL','DISTINCT','ALL','UNION','INTERSECT','MINUS','EXCEPT',
  'INTO','VALUES','SET','USING','MATCHED',
  'BY','CONNECT','START','PRIOR','ROWNUM','ROWID','LEVEL',
  'GROUP','ORDER','HAVING',
  'JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS','NATURAL','ON',
  'OVER','PARTITION','FOLLOWING','PRECEDING','CURRENT','ROW','ROWS',
  'UNBOUNDED','WITHIN','NULLS','FIRST','LAST','TIES',
  'CASE','WHEN','THEN','ELSE','END',
  'FETCH','OFFSET','LIMIT','ANY','SOME',
]);

// SQL_KW takes precedence; PLSQL_KW only applies to words not in SQL_KW
const PLSQL_KW = new Set([
  'CREATE','OR','REPLACE',
  'PROCEDURE','FUNCTION','PACKAGE','BODY','TRIGGER','TYPE',
  'BEGIN','DECLARE','EXCEPTION',
  'IF','ELSIF','LOOP','WHILE','FOR','EXIT','CONTINUE',
  'RETURN','RAISE',
  'CURSOR','OPEN','CLOSE',
  'COMMIT','ROLLBACK','SAVEPOINT','PRAGMA',
  'EXECUTE','IMMEDIATE','BULK','COLLECT','FORALL',
  'PIPE','PIPELINED','DETERMINISTIC','OUT',
]);

// After these SQL keywords, the next plain identifier is a table/view name
const TABLE_CTX = new Set(['FROM','JOIN','UPDATE','USING','TABLE']);

const BUILTIN_FN = new Set([
  'COUNT','SUM','AVG','MIN','MAX',
  'NVL','NVL2','DECODE','COALESCE','NULLIF','GREATEST','LEAST',
  'TO_CHAR','TO_NUMBER','TO_DATE','TO_TIMESTAMP','TO_CLOB','TO_BLOB',
  'SUBSTR','SUBSTRB','INSTR','INSTRB',
  'TRIM','LTRIM','RTRIM','UPPER','LOWER','INITCAP',
  'LENGTH','LENGTHB','LPAD','RPAD',
  'REPLACE','TRANSLATE',
  'REGEXP_REPLACE','REGEXP_SUBSTR','REGEXP_LIKE','REGEXP_COUNT',
  'ROUND','TRUNC','FLOOR','CEIL','MOD','ABS','SIGN','POWER','SQRT','EXP','LN','LOG',
  'SYSDATE','SYSTIMESTAMP','CURRENT_DATE','CURRENT_TIMESTAMP',
  'ADD_MONTHS','MONTHS_BETWEEN','LAST_DAY','NEXT_DAY','EXTRACT',
  'DENSE_RANK','RANK','ROW_NUMBER','LAG','LEAD',
  'FIRST_VALUE','LAST_VALUE','NTILE','PERCENT_RANK','CUME_DIST',
  'LISTAGG','SYS_CONNECT_BY_PATH','SYS_GUID','SYS_CONTEXT',
  'RAISE_APPLICATION_ERROR',
  'CAST','CONVERT','CHARTOROWID','ROWIDTOCHAR',
  'DUMP','VSIZE','USERENV','ORA_ROWSCN',
]);

// ── Colors (VS Code Dark+ inspired, dark-theme friendly) ──────────────────────

export const SQL_COLORS = {
  sql_kw:  '#569cd6',   // SQL keywords  — steel blue
  plsql_kw:'#c586c0',   // PL/SQL structural — soft purple
  builtin: '#dcdcaa',   // Built-in functions — muted yellow
  table:   '#4ec9b0',   // Table / view names — teal
  string:  '#ce9178',   // String literals — warm orange
  number:  '#b5cea8',   // Numbers — sage green
  comment: '#6a9955',   // Comments — forest green
  operator:'#9cdcfe',   // Operators (:= ||) — sky blue
};

// ── Raw tokenizer ──────────────────────────────────────────────────────────────

function rawTokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    // Whitespace (preserve newlines)
    if (/[ \t\r\n]/.test(src[i])) {
      let v = '';
      while (i < src.length && /[ \t\r\n]/.test(src[i])) v += src[i++];
      toks.push({ k: 'ws', v });
    }
    // Line comment
    else if (src[i] === '-' && src[i+1] === '-') {
      let v = '';
      while (i < src.length && src[i] !== '\n') v += src[i++];
      toks.push({ k: 'comment', v });
    }
    // Block comment
    else if (src[i] === '/' && src[i+1] === '*') {
      let v = '/*'; i += 2;
      while (i < src.length && !(src[i-1] === '*' && src[i] === '/')) v += src[i++];
      if (i < src.length) { v += '/'; i++; }
      toks.push({ k: 'comment', v });
    }
    // String literal
    else if (src[i] === "'") {
      let v = "'"; i++;
      while (i < src.length) {
        if (src[i] === "'" && src[i+1] === "'") { v += "''"; i += 2; }
        else if (src[i] === "'") { v += "'"; i++; break; }
        else v += src[i++];
      }
      toks.push({ k: 'string', v });
    }
    // Quoted identifier
    else if (src[i] === '"') {
      let v = '"'; i++;
      while (i < src.length && src[i] !== '"') v += src[i++];
      if (i < src.length) { v += '"'; i++; }
      toks.push({ k: 'ident', v });
    }
    // Word / keyword
    else if (/[a-zA-Z_$#]/.test(src[i])) {
      let v = '';
      while (i < src.length && /[a-zA-Z0-9_$#]/.test(src[i])) v += src[i++];
      toks.push({ k: 'word', v });
    }
    // Number
    else if (/\d/.test(src[i])) {
      let v = '';
      while (i < src.length && /[\d.]/.test(src[i])) v += src[i++];
      toks.push({ k: 'num', v });
    }
    // 2-char operators
    else if ([':=','..','<>','<=','>=','!=','||','=>','**'].includes(src.slice(i, i+2))) {
      toks.push({ k: 'op', v: src.slice(i, i+2) }); i += 2;
    }
    // Everything else (punctuation)
    else {
      toks.push({ k: 'p', v: src[i++] });
    }
  }
  return toks;
}

// ── Context-aware classifier ───────────────────────────────────────────────────

// Returns array of { color: string|null, value: string }
export function highlightTokens(src) {
  if (!src) return [];
  const raw = rawTokenize(src);
  const out = [];

  let expectTable = false;   // next plain identifier = table/view name
  let dotAfterTable = false; // saw '.' after a table token → next ident also table
  let inFromClause = false;  // inside FROM list (comma re-triggers expectTable)

  for (let j = 0; j < raw.length; j++) {
    const tok = raw[j];

    // ── Pass-through token types ───────────────────────────────────────────
    if (tok.k === 'ws')      { out.push({ color: null,              value: tok.v }); continue; }
    if (tok.k === 'comment') { out.push({ color: SQL_COLORS.comment, value: tok.v }); continue; }
    if (tok.k === 'string')  { out.push({ color: SQL_COLORS.string,  value: tok.v }); continue; }
    if (tok.k === 'num')     { out.push({ color: SQL_COLORS.number,  value: tok.v }); continue; }
    if (tok.k === 'op')      { out.push({ color: SQL_COLORS.operator,value: tok.v }); continue; }

    // ── Quoted identifiers ─────────────────────────────────────────────────
    if (tok.k === 'ident') {
      out.push({ color: expectTable ? SQL_COLORS.table : null, value: tok.v });
      if (expectTable) {
        expectTable = false;
        dotAfterTable = nextIsDot(raw, j);
      }
      continue;
    }

    // ── Punctuation ────────────────────────────────────────────────────────
    if (tok.k === 'p') {
      const p = tok.v;
      if (p === '.') {
        if (dotAfterTable) { dotAfterTable = false; expectTable = true; }
      } else if (p === ',') {
        if (inFromClause) expectTable = true;
      } else if (p === '(' || p === ';') {
        expectTable = false; inFromClause = false; dotAfterTable = false;
      }
      out.push({ color: null, value: p });
      continue;
    }

    // ── Word token ─────────────────────────────────────────────────────────
    const up = tok.v.toUpperCase();

    // SQL keyword (highest priority)
    if (SQL_KW.has(up)) {
      out.push({ color: SQL_COLORS.sql_kw, value: tok.v });
      if (TABLE_CTX.has(up)) {
        expectTable = true;
        inFromClause = (up === 'FROM');
      } else if (up === 'INTO') {
        // INSERT INTO / MERGE INTO → table follows; SELECT INTO → variable (accepted false-positive)
        expectTable = true;
        inFromClause = false;
      } else if (['WHERE','ON','SET','SELECT','HAVING','VALUES','GROUP','ORDER',
                  'CASE','OVER','PARTITION','WHEN','THEN','ELSE','END',
                  'UNION','INTERSECT','MINUS','CONNECT','START'].includes(up)) {
        expectTable = false; inFromClause = false; dotAfterTable = false;
      }
      continue;
    }

    // PL/SQL keyword
    if (PLSQL_KW.has(up)) {
      out.push({ color: SQL_COLORS.plsql_kw, value: tok.v });
      expectTable = false; inFromClause = false; dotAfterTable = false;
      continue;
    }

    // Table/view name expected
    if (expectTable) {
      out.push({ color: SQL_COLORS.table, value: tok.v });
      expectTable = false;
      dotAfterTable = nextIsDot(raw, j);
      continue;
    }

    // Built-in function by name
    if (BUILTIN_FN.has(up)) {
      out.push({ color: SQL_COLORS.builtin, value: tok.v });
      continue;
    }

    // Any identifier followed by '(' → function call
    if (nextNonWsIs(raw, j, '(')) {
      out.push({ color: SQL_COLORS.builtin, value: tok.v });
      continue;
    }

    // Default
    out.push({ color: null, value: tok.v });
  }

  return out;
}

function nextIsDot(raw, j) {
  let k = j + 1;
  while (k < raw.length && raw[k].k === 'ws') k++;
  return k < raw.length && raw[k].k === 'p' && raw[k].v === '.';
}

function nextNonWsIs(raw, j, ch) {
  let k = j + 1;
  while (k < raw.length && raw[k].k === 'ws') k++;
  return k < raw.length && raw[k].k === 'p' && raw[k].v === ch;
}

// ── Render helpers ─────────────────────────────────────────────────────────────

// Returns React children for a <pre> or similar element
export function renderHighlighted(src) {
  const tokens = highlightTokens(src);
  return tokens.map((tok, i) =>
    tok.color
      ? React.createElement('span', { key: i, style: { color: tok.color } }, tok.value)
      : tok.value
  );
}

// Splits highlighted tokens into per-line arrays (for line-numbered source view)
export function splitHighlightedLines(tokens) {
  const lines = [[]];
  for (const tok of tokens) {
    if (!tok.value.includes('\n')) {
      lines[lines.length - 1].push(tok);
    } else {
      const parts = tok.value.split('\n');
      lines[lines.length - 1].push({ ...tok, value: parts[0] });
      for (let i = 1; i < parts.length; i++) {
        lines.push([{ ...tok, value: parts[i] }]);
      }
    }
  }
  return lines;
}
