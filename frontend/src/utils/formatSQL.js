import { format } from 'sql-formatter';

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
    // whitespace
    if (/\s/.test(src[i])) {
      let v = '';
      while (i < src.length && /\s/.test(src[i])) v += src[i++];
      toks.push({ t: 'WS', v });
    // line comment
    } else if (src[i] === '-' && src[i+1] === '-') {
      let v = '';
      while (i < src.length && src[i] !== '\n') v += src[i++];
      toks.push({ t: 'CMT', v });
    // block comment
    } else if (src[i] === '/' && src[i+1] === '*') {
      let v = '/*'; i += 2;
      while (i < src.length && !(src[i-1] === '*' && src[i] === '/')) v += src[i++];
      v += '/'; i++;
      toks.push({ t: 'CMT', v });
    // string literal
    } else if (src[i] === "'") {
      let v = "'"; i++;
      while (i < src.length) {
        if (src[i] === "'" && src[i+1] === "'") { v += "''"; i += 2; }
        else if (src[i] === "'") { v += "'"; i++; break; }
        else v += src[i++];
      }
      toks.push({ t: 'STR', v });
    // quoted identifier
    } else if (src[i] === '"') {
      let v = '"'; i++;
      while (i < src.length && src[i] !== '"') v += src[i++];
      v += '"'; i++;
      toks.push({ t: 'W', v });
    // word / keyword
    } else if (/[a-zA-Z_$#]/.test(src[i])) {
      let v = '';
      while (i < src.length && /[a-zA-Z0-9_$#]/.test(src[i])) v += src[i++];
      toks.push({ t: 'W', v });
    // number
    } else if (/\d/.test(src[i])) {
      let v = '';
      while (i < src.length && /[\d.eE]/.test(src[i])) v += src[i++];
      toks.push({ t: 'NUM', v });
    // two-char operators
    } else if ([':=', '..', '<>', '<=', '>=', '!=', '||'].includes(src.slice(i, i+2))) {
      toks.push({ t: 'OP', v: src.slice(i, i+2) }); i += 2;
    // single char
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
  let cur = '';   // current line content (no indent prefix)
  let level = 0;

  function flush() {
    const s = cur.trim();
    if (s) lines.push(TAB.repeat(Math.max(0, level)) + s);
    cur = '';
  }

  function app(s) {
    if (cur && !cur.endsWith(' ') && !cur.endsWith('(') && s !== ')' && s !== ',' && s !== ';' && s !== '.') {
      cur += ' ';
    }
    cur += s;
  }

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const up = UP(tok);
    const prev = toks[i - 1];
    const next = toks[i + 1];
    const nextUp = UP(next);

    // ── comments ────────────────────────────────────────────────────────────
    if (tok.t === 'CMT') {
      flush();
      lines.push(TAB.repeat(Math.max(0, level)) + tok.v.trim());
      continue;
    }

    // ── strings / numbers / operators ────────────────────────────────────────
    if (tok.t === 'STR' || tok.t === 'NUM') { app(tok.v); continue; }

    if (tok.t === 'OP') { app(tok.v); continue; }

    if (tok.t === 'P') {
      const p = tok.v;
      if (p === ';') { cur = cur.trimEnd() + ';'; flush(); }
      else if (p === ',') { cur = cur.trimEnd() + ','; app(''); }
      else if (p === '(') { cur = cur.trimEnd() + '('; }
      else if (p === ')') { cur = cur.trimEnd() + ')'; }
      else if (p === '.') { cur = cur.trimEnd() + '.'; }
      else app(p);
      continue;
    }

    // ── word tokens ──────────────────────────────────────────────────────────
    if (tok.t !== 'W') continue;

    switch (up) {

      // ── CREATE header ──────────────────────────────────────────────────────
      case 'CREATE':   { flush(); cur = 'CREATE'; break; }
      case 'OR':       { app('OR');  break; }
      case 'REPLACE':  { app('REPLACE'); break; }
      case 'PROCEDURE':
      case 'FUNCTION':
      case 'PACKAGE':
      case 'TRIGGER':
      case 'TYPE':
      case 'BODY':     { app(up); break; }

      // IS / AS: starts declaration section after proc/function header
      case 'IS':
      case 'AS': {
        const prevUp = UP(prev);
        const afterHeader =
          prev?.v === ')' ||
          (prev?.t === 'W' && !['SELECT','FROM','WHERE','AND','OR','NOT','IN','CAST','THEN','ELSE','CASE'].includes(prevUp));
        app(up);
        if (afterHeader && nextUp !== 'SELECT' && nextUp !== '(') {
          flush(); level++;
        }
        break;
      }

      // ── Block openers ──────────────────────────────────────────────────────
      case 'DECLARE': {
        flush(); cur = 'DECLARE'; flush(); level++;
        break;
      }
      case 'BEGIN': {
        flush(); cur = 'BEGIN'; flush(); level++;
        break;
      }

      // ── Block closers ──────────────────────────────────────────────────────
      case 'END': {
        flush();
        level = Math.max(0, level - 1);
        cur = 'END';
        // END IF / END LOOP / END CASE
        if (nextUp === 'IF' || nextUp === 'LOOP' || nextUp === 'CASE') {
          cur += ' ' + nextUp; i++;
        }
        // END proc_name (before semicolon)
        const afterUp = UP(toks[i + 1]);
        if (toks[i+1]?.t === 'W' && toks[i+2]?.v === ';' &&
            !['IF','LOOP','CASE','END'].includes(afterUp)) {
          cur += ' ' + toks[i+1].v.toUpperCase(); i++;
        }
        break;
      }

      case 'EXCEPTION': {
        flush(); level = Math.max(0, level - 1);
        cur = 'EXCEPTION'; flush(); level++;
        break;
      }

      // ── IF / ELSIF / ELSE / THEN ───────────────────────────────────────────
      case 'IF': {
        flush(); cur = 'IF';
        break;
      }
      case 'ELSIF': {
        flush(); level = Math.max(0, level - 1);
        cur = 'ELSIF';
        break;
      }
      case 'ELSE': {
        flush(); level = Math.max(0, level - 1);
        cur = 'ELSE'; flush(); level++;
        break;
      }
      case 'THEN': {
        cur = cur.trimEnd() + ' THEN'; flush(); level++;
        break;
      }

      // ── LOOP ──────────────────────────────────────────────────────────────
      case 'FOR':
      case 'WHILE': {
        flush(); cur = up;
        break;
      }
      case 'LOOP': {
        cur = cur.trimEnd() + ' LOOP'; flush(); level++;
        break;
      }

      // ── WHEN (exception handler or CASE branch) ────────────────────────────
      case 'WHEN': {
        flush(); cur = 'WHEN';
        break;
      }

      // ── DML statements ────────────────────────────────────────────────────
      case 'SELECT':
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
      case 'MERGE':  { flush(); cur = up; break; }

      // ── SQL clauses (new line, same indent level) ──────────────────────────
      case 'FROM':
      case 'WHERE':
      case 'SET':
      case 'VALUES':
      case 'GROUP':
      case 'ORDER':
      case 'HAVING':
      case 'JOIN':
      case 'UNION':
      case 'INTO': {
        if (cur.trim()) flush();
        cur = up;
        break;
      }

      case 'AND':
      case 'NOT': {
        // AND/NOT in WHERE/ON → new line; inside expressions → inline
        // Heuristic: if previous token on this line looks like a value/id → new line
        const lineHasContent = cur.trim().length > 0;
        if (lineHasContent && !['(', ':=', '||'].includes(prev?.v)) {
          flush(); cur = up;
        } else {
          app(up);
        }
        break;
      }

      // ── Misc statement starters ────────────────────────────────────────────
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
      case 'PIPE':    { flush(); cur = up; break; }

      case 'NULL': {
        // standalone NULL statement → own line; inline NULL (IS NULL etc) → inline
        const prevUp2 = UP(prev);
        if (!cur.trim() || ['IS', 'NOT'].includes(prevUp2)) {
          app('NULL');
        } else {
          flush(); cur = 'NULL';
        }
        break;
      }

      // ── Everything else (identifiers, inline keywords, etc.) ───────────────
      default: {
        app(up);
        break;
      }
    }
  }

  flush();
  return lines.join('\n');
}
