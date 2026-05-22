// Keyword field width for tabular alignment (SELECT=6+1, FROM=4+3, WHERE=5+2, AND=3+4 → all 7)
const KWPAD = 7;
const padKW = kw => kw.padEnd(KWPAD);

// SQL keywords that may precede ( without being a function call — keep the space before (
const SQL_KW_BEFORE_PAREN = new Set([
  'IN','NOT','IS','BETWEEN','LIKE','EXISTS','ANY','ALL','SOME',
  'VALUES','USING','PARTITION','OVER','ON','WHERE','AND','OR',
  'SELECT','FROM','SET','DEFAULT','THEN','ELSE','WHEN',
]);

export function formatSQL(sql) {
  if (!sql?.trim()) return sql;
  try { return formatPLSQL(sql); } catch { return sql; }
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
  const TAB = '    ';  // 4-space indent
  const toks = tokenize(src).filter(t => t.t !== 'WS');
  const UP = tok => tok?.t === 'W' ? tok.v.toUpperCase() : null;

  // Peek inside ( to decide if it's a subquery (contains SELECT before matching ))
  function isSubquery(pos) {
    let depth = 1;
    for (let j = pos + 1; j < toks.length; j++) {
      if (toks[j].v === '(') depth++;
      else if (toks[j].v === ')') { depth--; if (depth === 0) return false; }
      else if (toks[j].t === 'W' && toks[j].v.toUpperCase() === 'SELECT') return true;
    }
    return false;
  }

  const lines = [];
  let cur = '';
  let curPrefix = '';
  let level = 0;
  // When inside a subquery, baseIndent overrides TAB.repeat(level) so content
  // aligns right after the opening (
  let baseIndent = '';

  let caseDepth = 0;
  let funcParenDepth = 0;   // depth of function-call parens (not subquery parens)
  let inSelectList = false;
  let inFromList = false;
  let procHeaderSeen = false;
  let inDeclSection = false;

  // Each BEGIN pushes { level, inExceptionSection, exceptionHandlerLevel } so END can
  // restore the exact level rather than blindly decrementing.
  const beginStack = [];
  let inExceptionSection = false;
  let exceptionHandlerLevel = 0;

  const parenStack = [];      // 'func' | 'subquery' per open paren
  const subqueryCtxStack = []; // saved state per open subquery paren

  function getIndent() {
    return baseIndent !== '' ? baseIndent : TAB.repeat(Math.max(0, level));
  }

  function flush() {
    const s = cur.trim();
    if (s) lines.push(getIndent() + curPrefix + s);
    curPrefix = '';
    cur = '';
  }

  // Remove a trailing blank line (added after ';') before structural keywords
  // so there's no extra blank before END / ELSE / ELSIF / EXCEPTION
  function dropTrailingBlank() {
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
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
      if (!cur.trim()) {
        // Standalone comment: own line
        flush();
        lines.push(getIndent() + curPrefix + tok.v.trim());
      } else if (cur.trim() === ',') {
        // cur holds ONLY the leading comma — no identifier accumulated yet.
        // In comma-first style this means the comment was written right after a
        // comma on a new line, which is unusual; attach to the previously flushed line.
        if (lines.length > 0) lines[lines.length - 1] += ' ' + tok.v.trim();
      } else {
        // Inline comment after real content (e.g. ", T1. ITM_CD --note"):
        // keep on the same line as the accumulated content
        cur = cur.trimEnd() + ' ' + tok.v.trim();
        flush();
      }
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
        const sub = isSubquery(i);
        parenStack.push(sub ? 'subquery' : 'func');
        if (sub) {
          // Ensure space before ( (it's not a function call)
          if (cur && !cur.endsWith(' ') && !cur.endsWith('(')) cur += ' ';
          // Compute column of ( using the CURRENT (outer) indent
          const outerIndentLen = getIndent().length + curPrefix.length;
          cur += '(';
          const parenCol = outerIndentLen + cur.trim().length - 1;
          subqueryCtxStack.push({
            inSelectList, inFromList, caseDepth, funcParenDepth,
            savedBaseIndent: baseIndent,
            savedLevel: level,
            parenCol,
          });
          inSelectList = false; inFromList = false; caseDepth = 0;
          flush();                              // output the (...( line with outer indent
          baseIndent = ' '.repeat(parenCol + 1); // inner content aligns right after (
        } else {
          // Function call: trim trailing space before (.
          // SQL keywords (IN, NOT, VALUES, …) precede ( without being function calls — keep space.
          const prevTok = toks[i - 1];
          if (prevTok?.t === 'NUM' ||
              (prevTok?.t === 'W' && !SQL_KW_BEFORE_PAREN.has(prevTok.v.toUpperCase()))) {
            cur = cur.trimEnd();
          }
          cur += '(';
          funcParenDepth++;
        }
      } else if (p === ')') {
        const typ = parenStack.length > 0 ? parenStack.pop() : 'func';
        if (typ === 'subquery') {
          flush();
          const ctx = subqueryCtxStack.pop();
          baseIndent   = ctx?.savedBaseIndent ?? '';
          level        = ctx?.savedLevel ?? level;
          inSelectList = ctx?.inSelectList ?? false;
          inFromList   = ctx?.inFromList ?? false;
          caseDepth    = ctx?.caseDepth ?? 0;
          funcParenDepth = ctx?.funcParenDepth ?? 0;
          // Position ) at the same column as the opening (
          const outerIndentLen = getIndent().length;
          const extra = (ctx?.parenCol ?? 0) - outerIndentLen;
          curPrefix = extra > 0 ? ' '.repeat(extra) : '';
          cur = ')';
        } else {
          cur = cur.trimEnd() + ')';
          funcParenDepth = Math.max(0, funcParenDepth - 1);
        }
      } else if (p === '.') {
        cur = cur.trimEnd() + '.';
      } else if (p === ';') {
        cur = cur.trimEnd() + ';';
        flush();
        inSelectList = false; inFromList = false; caseDepth = 0;
        // Insert blank line between statements (except inside declaration sections).
        if (!inDeclSection && lines.length > 0 && lines[lines.length - 1] !== '') {
          lines.push('');
        }
      } else if (p === ',') {
        if (funcParenDepth > 0 || caseDepth > 0) {
          // Inside function call or CASE expression: inline comma
          cur = cur.trimEnd() + ', ';
        } else if (inSelectList || inFromList) {
          // SELECT column list or comma-join table list: comma-first style
          cur = cur.trimEnd();
          flush();
          curPrefix = '     ';
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

    // Inside CASE expression: everything inline (except END/CASE which manage depth)
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
        inDeclSection = true;
        break;
      }
      case 'BEGIN': {
        flush();
        if (inDeclSection) {
          level = Math.max(0, level - 1);
          inDeclSection = false;
        }
        beginStack.push({ level, inExceptionSection, exceptionHandlerLevel });
        inExceptionSection = false;
        cur = 'BEGIN'; flush(); level++;
        break;
      }

      // ── Block closers ──────────────────────────────────────────────────
      case 'END': {
        if (caseDepth > 0) {
          app('END');
          caseDepth--;
          if (nextUp === 'CASE') { app('CASE'); i++; }
        } else {
          const isBlockEnd = !['IF', 'LOOP', 'CASE'].includes(nextUp);
          dropTrailingBlank();
          flush();
          if (isBlockEnd && beginStack.length > 0) {
            const frame = beginStack.pop();
            level = frame.level;
            inExceptionSection = frame.inExceptionSection;
            exceptionHandlerLevel = frame.exceptionHandlerLevel;
          } else {
            level = Math.max(0, level - 1);
          }
          cur = 'END';
          if (nextUp === 'IF' || nextUp === 'LOOP' || nextUp === 'CASE') {
            cur += ' ' + nextUp; i++;
          }
          const afterUp = UP(toks[i + 1]);
          if (toks[i+1]?.t === 'W' && toks[i+2]?.v === ';' &&
              !['IF','LOOP','CASE','END'].includes(afterUp)) {
            cur += ' ' + toks[i+1].v.toUpperCase(); i++;
          }
        }
        break;
      }

      case 'EXCEPTION': {
        if (inDeclSection) {
          // In declaration section, EXCEPTION is a variable type (e.g. MY_ERR EXCEPTION;)
          app(up);
        } else {
          const beginLevel = beginStack.length > 0 ? beginStack[beginStack.length - 1].level : 0;
          dropTrailingBlank();
          flush();
          level = beginLevel;
          cur = 'EXCEPTION'; flush();
          level = beginLevel + 1;
          inExceptionSection = true;
          exceptionHandlerLevel = beginLevel + 1;
        }
        break;
      }

      // ── Control flow ────────────────────────────────────────────────────
      case 'IF':    { flush(); cur = 'IF'; break; }
      case 'ELSIF': { dropTrailingBlank(); flush(); level = Math.max(0, level - 1); cur = 'ELSIF'; break; }
      case 'ELSE':  {
        dropTrailingBlank();
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
      case 'WHEN': {
        // Inside exception section, each WHEN resets to handler base level.
        // Guard with !cur.trim() to skip EXIT WHEN (where cur holds 'EXIT').
        if (inExceptionSection && !cur.trim()) level = exceptionHandlerLevel;
        flush(); cur = 'WHEN';
        break;
      }

      // ── DML statements ──────────────────────────────────────────────────
      case 'SELECT': {
        if (funcParenDepth > 0) { app('SELECT'); }
        else { flush(); inSelectList = true; inFromList = false; cur = padKW('SELECT'); }
        break;
      }
      case 'INSERT': { flush(); inSelectList = false; inFromList = false; cur = 'INSERT'; break; }
      case 'UPDATE': { flush(); inSelectList = false; inFromList = false; cur = 'UPDATE'; break; }
      case 'DELETE': { flush(); inSelectList = false; inFromList = false; cur = 'DELETE'; break; }
      case 'MERGE':  { flush(); inSelectList = false; inFromList = false; cur = 'MERGE'; break; }

      // ── SQL clauses ──────────────────────────────────────────────────────
      case 'FROM': {
        if (funcParenDepth > 0) { app('FROM'); break; }
        inSelectList = false; inFromList = true;
        if (cur.trim()) flush();
        cur = padKW('FROM');
        break;
      }
      case 'INTO': {
        if (funcParenDepth > 0) { app('INTO'); break; }
        inFromList = false;
        if (inSelectList) {
          inSelectList = false; flush(); cur = padKW('INTO');
        } else if (cur.trim().startsWith('INSERT')) {
          app('INTO');
        } else {
          flush(); cur = padKW('INTO');
        }
        break;
      }
      case 'WHERE': {
        if (funcParenDepth > 0) { app('WHERE'); break; }
        inFromList = false;
        if (cur.trim()) flush();
        cur = padKW('WHERE');
        break;
      }
      case 'AND': {
        if (funcParenDepth > 0 || caseDepth > 0) { app('AND'); break; }
        flush(); cur = padKW('AND');
        break;
      }
      case 'OR': {
        if (funcParenDepth > 0 || caseDepth > 0) { app('OR'); break; }
        flush(); cur = padKW('OR');
        break;
      }
      case 'SET':    { if (funcParenDepth > 0) { app('SET'); break; } inFromList = false; if (cur.trim()) flush(); cur = padKW('SET'); break; }
      case 'VALUES': { if (funcParenDepth > 0) { app('VALUES'); break; } if (cur.trim()) flush(); cur = padKW('VALUES'); break; }
      case 'HAVING': { if (funcParenDepth > 0) { app('HAVING'); break; } if (cur.trim()) flush(); cur = padKW('HAVING'); break; }
      case 'UNION':  { if (funcParenDepth > 0) { app('UNION'); break; } inFromList = false; flush(); cur = padKW('UNION'); break; }
      case 'GROUP': {
        if (funcParenDepth > 0) { app('GROUP'); break; }
        if (nextUp === 'BY') { flush(); cur = 'GROUP BY '; i++; }
        else app('GROUP');
        break;
      }
      case 'ORDER': {
        if (funcParenDepth > 0) { app('ORDER'); break; }
        if (nextUp === 'BY') { flush(); cur = 'ORDER BY '; i++; }
        else app('ORDER');
        break;
      }
      case 'LEFT':
      case 'RIGHT':
      case 'INNER':
      case 'FULL':
      case 'CROSS': {
        if (funcParenDepth > 0) { app(up); break; }
        inFromList = false;
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
      case 'JOIN': {
        if (funcParenDepth > 0) { app('JOIN'); break; }
        inFromList = false;
        flush(); cur = padKW('JOIN');
        break;
      }
      case 'ON': {
        if (funcParenDepth > 0) { app('ON'); break; }
        flush(); cur = padKW('ON');
        break;
      }

      // ── CASE expression (inline) ─────────────────────────────────────────
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
