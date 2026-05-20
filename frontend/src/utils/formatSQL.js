import { format } from 'sql-formatter';

// Keyword field width for tabular alignment (SELECT=6+1, FROM=4+3, WHERE=5+2, AND=3+4 → all 7)
const KWPAD = 7;
const padKW = kw => kw.padEnd(KWPAD);

export function formatSQL(sql) {
  if (!sql?.trim()) return sql;
  const isPLSQL = /\b(BEGIN|DECLARE|PROCEDURE|FUNCTION|PACKAGE|TRIGGER)\b/i.test(sql);
  if (isPLSQL) {
    try { return formatPLSQL(sql); } catch { return sql; }
  }
  try {
    return format(sql, { language: 'sql', tabWidth: 2, keywordCase: 'upper', linesBetweenQueries: 1 });
  } catch { return sql; }
}

// ── Tokenizer ──────────────────────────────────────────────────────────────────

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      let v = '';
      while (i < src.length && /\s/.test(src[i])) v += src[i++];
      toks.push({ t: 'WS', v });
    } else if (src[i] === '-' && src[i+1] === '-') {
      let v = '';
      while (i < src.length && src[i] !== '\n') v += src[i++];
      toks.push({ t: 'CMT', v });
    } else if (src[i] === '/' && src[i+1] === '*') {
      let v = '/*'; i += 2;
      while (i < src.length && !(src[i-1] === '*' && src[i] === '/')) v += src[i++];
      v += '/'; i++;
      toks.push({ t: 'CMT', v });
    } else if (src[i] === "'") {
      let v = "'"; i++;
      while (i < src.length) {
        if (src[i] === "'" && src[i+1] === "'") { v += "''"; i += 2; }
        else if (src[i] === "'") { v += "'"; i++; break; }
        else v += src[i++];
      }
      toks.push({ t: 'STR', v });
    } else if (src[i] === '"') {
      let v = '"'; i++;
      while (i < src.length && src[i] !== '"') v += src[i++];
      v += '"'; i++;
      toks.push({ t: 'W', v });
    } else if (/[a-zA-Z_$#]/.test(src[i])) {
      let v = '';
      while (i < src.length && /[a-zA-Z0-9_$#]/.test(src[i])) v += src[i++];
      toks.push({ t: 'W', v });
    } else if (/\d/.test(src[i])) {
      let v = '';
      while (i < src.length && /[\d.eE]/.test(src[i])) v += src[i++];
      toks.push({ t: 'NUM', v });
    } else if ([':=', '..', '<>', '<=', '>=', '!=', '||'].includes(src.slice(i, i+2))) {
      toks.push({ t: 'OP', v: src.slice(i, i+2) }); i += 2;
    } else {
      toks.push({ t: 'P', v: src[i++] });
    }
  }
  return toks;
}

// ── PL/SQL Formatter ───────────────────────────────────────────────────────────

function formatPLSQL(src) {
  const TAB = '  ';
  const toks = tokenize(src).filter(t => t.t !== 'WS');
  const UP = tok => tok?.t === 'W' ? tok.v.toUpperCase() : null;

  const lines = [];
  let cur = '';        // current line content
  let curPrefix = '';  // leading whitespace for comma-first alignment
  let level = 0;

  // Context state
  let caseDepth = 0;          // > 0 = inside CASE expression (all tokens inline)
  let parenDepth = 0;         // > 0 = inside () (commas are inline)
  let inSelectList = false;   // true between SELECT and FROM/INTO
  let procHeaderSeen = false; // true after PROCEDURE/FUNCTION keyword
  let inDeclSection = false;  // true after IS/AS until BEGIN

  function flush() {
    const s = cur.trim();
    if (s) lines.push(TAB.repeat(Math.max(0, level)) + curPrefix + s);
    curPrefix = '';
    cur = '';
  }

  function app(s) {
    const needsSpace = cur && !cur.endsWith(' ') && !cur.endsWith('(');
    const noSpaceBefore = s === ')' || s === ',' || s === ';' || s === '.';
    if (needsSpace && !noSpaceBefore) cur += ' ';
    cur += s;
  }

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const up = UP(tok);
    const next = toks[i + 1];
    const nextUp = UP(next);

    // ── Comments ──────────────────────────────────────────────────────────
    if (tok.t === 'CMT') {
      flush();
      lines.push(TAB.repeat(Math.max(0, level)) + tok.v.trim());
      continue;
    }

    // ── Strings / numbers / operators (always inline) ─────────────────────
    if (tok.t === 'STR' || tok.t === 'NUM' || tok.t === 'OP') {
      app(tok.v); continue;
    }

    // ── Punctuation ───────────────────────────────────────────────────────
    if (tok.t === 'P') {
      const p = tok.v;
      if (p === '(') {
        cur = cur.trimEnd() + '(';
        parenDepth++;
      } else if (p === ')') {
        cur = cur.trimEnd() + ')';
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (p === '.') {
        cur = cur.trimEnd() + '.';
      } else if (p === ';') {
        cur = cur.trimEnd() + ';';
        flush();
        inSelectList = false; caseDepth = 0; parenDepth = 0;
      } else if (p === ',') {
        // Comma-first: only in SELECT column list, not inside () or CASE
        if (inSelectList && caseDepth === 0 && parenDepth === 0) {
          cur = cur.trimEnd();
          flush();
          curPrefix = '     '; // 5 spaces → `, col` aligns with SELECT data (indent+7 total)
          cur = ', ';
        } else {
          cur = cur.trimEnd() + ', ';
        }
      } else {
        app(p);
      }
      continue;
    }

    // ── Word tokens ───────────────────────────────────────────────────────
    if (tok.t !== 'W') continue;

    // Inside CASE expression: everything is inline (except END/CASE which manage depth)
    if (caseDepth > 0 && up !== 'END' && up !== 'CASE') {
      app(up); continue;
    }

    switch (up) {

      // ── CREATE header ──────────────────────────────────────────────────
      case 'CREATE':  { flush(); cur = 'CREATE'; procHeaderSeen = false; break; }
      case 'OR':      { app('OR'); break; }
      case 'REPLACE': { app('REPLACE'); break; }
      case 'PROCEDURE':
      case 'FUNCTION':
      case 'PACKAGE':
      case 'TRIGGER':
      case 'TYPE':
      case 'BODY': {
        app(up);
        procHeaderSeen = true;
        break;
      }

      // IS / AS: block opener only after PROCEDURE/FUNCTION header ──────────
      case 'IS':
      case 'AS': {
        app(up);
        if (procHeaderSeen && nextUp !== 'SELECT' && nextUp !== '(') {
          flush(); level++;
          inDeclSection = true;
          procHeaderSeen = false;
        } else {
          procHeaderSeen = false;
        }
        break;
      }

      // ── Block openers ──────────────────────────────────────────────────
      case 'DECLARE': {
        flush(); cur = 'DECLARE'; flush(); level++;
        break;
      }
      case 'BEGIN': {
        flush();
        if (inDeclSection) {
          level = Math.max(0, level - 1); // undo the AS-induced indent
          inDeclSection = false;
        }
        cur = 'BEGIN'; flush(); level++;
        break;
      }

      // ── Block closers ──────────────────────────────────────────────────
      case 'END': {
        if (caseDepth > 0) {
          // Closing CASE expression → inline
          app('END');
          caseDepth--;
          if (nextUp === 'CASE') { app('CASE'); i++; }
        } else {
          flush();
          level = Math.max(0, level - 1);
          cur = 'END';
          if (nextUp === 'IF' || nextUp === 'LOOP' || nextUp === 'CASE') {
            cur += ' ' + nextUp; i++;
          }
          // END proc_name (before ;)
          const afterUp = UP(toks[i + 1]);
          if (toks[i+1]?.t === 'W' && toks[i+2]?.v === ';' &&
              !['IF','LOOP','CASE','END'].includes(afterUp)) {
            cur += ' ' + toks[i+1].v.toUpperCase(); i++;
          }
        }
        break;
      }

      case 'EXCEPTION': {
        flush(); level = Math.max(0, level - 1);
        cur = 'EXCEPTION'; flush(); level++;
        break;
      }

      // ── Control flow ────────────────────────────────────────────────────
      case 'IF':    { flush(); cur = 'IF'; break; }
      case 'ELSIF': { flush(); level = Math.max(0, level - 1); cur = 'ELSIF'; break; }
      case 'ELSE':  {
        flush(); level = Math.max(0, level - 1);
        cur = 'ELSE'; flush(); level++;
        break;
      }
      case 'THEN': {
        cur = cur.trimEnd() + ' THEN'; flush(); level++;
        break;
      }
      case 'FOR':   { flush(); cur = 'FOR'; break; }
      case 'WHILE': { flush(); cur = 'WHILE'; break; }
      case 'LOOP':  { cur = cur.trimEnd() + ' LOOP'; flush(); level++; break; }
      case 'WHEN':  { flush(); cur = 'WHEN'; break; }

      // ── DML statements ──────────────────────────────────────────────────
      case 'SELECT': {
        flush(); inSelectList = true;
        cur = padKW('SELECT');
        break;
      }
      case 'INSERT': { flush(); inSelectList = false; cur = 'INSERT'; break; }
      case 'UPDATE': { flush(); inSelectList = false; cur = 'UPDATE'; break; }
      case 'DELETE': { flush(); inSelectList = false; cur = 'DELETE'; break; }
      case 'MERGE':  { flush(); inSelectList = false; cur = 'MERGE'; break; }

      // ── SQL clauses (tabular aligned) ────────────────────────────────────
      case 'FROM': {
        inSelectList = false;
        if (cur.trim()) flush();
        cur = padKW('FROM');
        break;
      }
      case 'INTO': {
        // SELECT ... INTO var (ends select list) vs INSERT INTO (stays inline)
        if (inSelectList) {
          inSelectList = false; flush(); cur = padKW('INTO');
        } else if (cur.trim().startsWith('INSERT')) {
          app('INTO'); // INSERT INTO → stays on INSERT line
        } else {
          flush(); cur = padKW('INTO');
        }
        break;
      }
      case 'WHERE': {
        if (cur.trim()) flush();
        cur = padKW('WHERE');
        break;
      }
      case 'AND': {
        if (parenDepth === 0 && caseDepth === 0) { flush(); cur = padKW('AND'); }
        else app('AND');
        break;
      }
      case 'OR': {
        if (parenDepth === 0 && caseDepth === 0) { flush(); cur = padKW('OR'); }
        else app('OR');
        break;
      }
      case 'SET':    { if (cur.trim()) flush(); cur = padKW('SET'); break; }
      case 'VALUES': { if (cur.trim()) flush(); cur = padKW('VALUES'); break; }
      case 'HAVING': { if (cur.trim()) flush(); cur = padKW('HAVING'); break; }
      case 'UNION':  { flush(); cur = padKW('UNION'); break; }
      case 'GROUP': {
        if (nextUp === 'BY') { flush(); cur = 'GROUP BY '; i++; }
        else app('GROUP');
        break;
      }
      case 'ORDER': {
        if (nextUp === 'BY') { flush(); cur = 'ORDER BY '; i++; }
        else app('ORDER');
        break;
      }
      case 'LEFT':
      case 'RIGHT':
      case 'INNER':
      case 'FULL':
      case 'CROSS': {
        // Peek ahead to consume full JOIN type (e.g., LEFT OUTER JOIN)
        if (['JOIN','OUTER','INNER'].includes(nextUp)) {
          flush();
          let jt = up;
          let j = i + 1;
          while (j < toks.length && UP(toks[j]) !== 'JOIN' && ['OUTER','INNER'].includes(UP(toks[j]))) {
            jt += ' ' + UP(toks[j]); j++;
          }
          if (j < toks.length && UP(toks[j]) === 'JOIN') { jt += ' JOIN'; j++; }
          i = j - 1;
          cur = jt + ' ';
        } else {
          app(up);
        }
        break;
      }
      case 'JOIN': { flush(); cur = padKW('JOIN'); break; }
      case 'ON':   { flush(); cur = padKW('ON'); break; }

      // ── CASE expression (inline, managed by caseDepth) ───────────────────
      case 'CASE': {
        app('CASE');
        caseDepth++;
        break;
      }

      // ── Misc statement starters ──────────────────────────────────────────
      case 'RETURN':
      case 'RAISE':
      case 'EXECUTE':
      case 'COMMIT':
      case 'ROLLBACK':
      case 'SAVEPOINT':
      case 'OPEN':
      case 'CLOSE':
      case 'FETCH':
      case 'EXIT':
      case 'CONTINUE':
      case 'PIPE': { flush(); cur = up; break; }

      case 'NULL': {
        const prevTok = toks[i - 1];
        const prevUp = UP(prevTok);
        if (!cur.trim() || ['IS', 'NOT'].includes(prevUp)) app('NULL');
        else { flush(); cur = 'NULL'; }
        break;
      }

      default: { app(up); break; }
    }
  }

  flush();
  return lines.join('\n');
}
