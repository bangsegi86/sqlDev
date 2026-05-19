// PL/SQL 소스 분석기 - 데이터 흐름 정보 추출

const SYSTEM_OBJECTS = new Set([
  'DUAL', 'ROWNUM', 'ROWID', 'LEVEL', 'SYSDATE', 'SYSTIMESTAMP',
  'USER', 'UID', 'SESSIONID', 'INSTANCE',
]);

const ORACLE_SYSTEM_PREFIXES = ['V$', 'GV$', 'DBA_', 'ALL_', 'USER_', 'V_$', 'NLS_'];

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IF', 'ELSIF', 'LOOP', 'FOR', 'WHILE', 'BEGIN', 'EXCEPTION', 'RAISE',
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'INTO', 'VALUES', 'SET',
  'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'CURSOR', 'OPEN', 'FETCH', 'CLOSE',
  'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE', 'BODY',
  'RETURN', 'RETURNS', 'DECLARE', 'AS', 'IS', 'BY', 'ON', 'ORDER', 'GROUP',
  'HAVING', 'UNION', 'INTERSECT', 'MINUS', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
  'FULL', 'OUTER', 'CROSS', 'NATURAL', 'USING', 'WITH', 'CONNECT', 'START',
  'PRIOR', 'NOCYCLE', 'SIBLINGS', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
  'BETWEEN', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
  'EXECUTE', 'IMMEDIATE', 'BULK', 'COLLECT', 'FORALL', 'INDICES', 'OF', 'BETWEEN',
  'DEFAULT', 'CONSTANT', 'EXCEPTION', 'OTHERS', 'GOTO', 'EXIT', 'CONTINUE',
  'PRAGMA', 'AUTONOMOUS_TRANSACTION', 'EXCEPTION_INIT', 'RESTRICT_REFERENCES',
  'TABLE', 'INDEX', 'SEQUENCE', 'VIEW', 'SYNONYM', 'GRANT', 'REVOKE',
  'ALTER', 'CREATE', 'DROP', 'TRUNCATE', 'COMMENT', 'COLUMN',
  'NUMBER', 'VARCHAR2', 'VARCHAR', 'CHAR', 'DATE', 'TIMESTAMP', 'BOOLEAN',
  'INTEGER', 'PLS_INTEGER', 'BINARY_INTEGER', 'BINARY_DOUBLE', 'BINARY_FLOAT',
  'CLOB', 'BLOB', 'NCLOB', 'RAW', 'LONG', 'XMLTYPE', 'ROWTYPE', 'TYPE',
  'SYS', 'SYSTEM', 'PUBLIC',
]);

const BUILTIN_FUNCTIONS = new Set([
  'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP', 'TO_TIMESTAMP_TZ', 'TO_CLOB',
  'NVL', 'NVL2', 'DECODE', 'COALESCE', 'NULLIF', 'LNNVL',
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'STDDEV', 'VARIANCE',
  'UPPER', 'LOWER', 'INITCAP', 'TRIM', 'LTRIM', 'RTRIM',
  'SUBSTR', 'SUBSTRB', 'INSTR', 'INSTRB', 'LENGTH', 'LENGTHB',
  'REPLACE', 'TRANSLATE', 'LPAD', 'RPAD', 'CHR', 'ASCII', 'CONCAT',
  'SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP',
  'ADD_MONTHS', 'MONTHS_BETWEEN', 'NEXT_DAY', 'LAST_DAY', 'EXTRACT',
  'TRUNC', 'ROUND', 'CEIL', 'FLOOR', 'MOD', 'POWER', 'SQRT', 'ABS', 'SIGN',
  'GREATEST', 'LEAST', 'WIDTH_BUCKET',
  'REGEXP_LIKE', 'REGEXP_SUBSTR', 'REGEXP_REPLACE', 'REGEXP_COUNT', 'REGEXP_INSTR',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST',
  'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE', 'LAG', 'LEAD',
  'SYS_GUID', 'RAWTOHEX', 'HEXTORAW', 'ROWIDTOCHAR', 'CHARTOROWID',
  'RAISE_APPLICATION_ERROR', 'SQLCODE', 'SQLERRM',
  'PUT_LINE', 'PUT', 'GET_LINE', 'NEW_LINE', 'FOPEN', 'FCLOSE',
  'ISNUMERIC', 'ISDATE', 'ISNULL',
  'LISTAGG', 'WM_CONCAT', 'XMLAGG', 'XMLELEMENT', 'XMLFOREST',
  'SYS_CONTEXT', 'SYS_EXTRACT_UTC', 'DBTIMEZONE', 'SESSIONTIMEZONE',
]);

function removeComments(src) {
  let result = src.replace(/--[^\n]*/g, '');
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
}

function isSystemTable(name) {
  if (SYSTEM_OBJECTS.has(name)) return true;
  return ORACLE_SYSTEM_PREFIXES.some(p => name.startsWith(p));
}

function sanitizeId(name) {
  return name.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
}

function splitByComma(str) {
  const result = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) result.push(cur.trim());
  return result;
}

function parseParameters(src) {
  const params = [];
  // Match procedure/function header parameter block
  const m = src.match(/(?:PROCEDURE|FUNCTION)\s+\w+\s*\(([\s\S]*?)\)\s*(?:RETURN|IS|AS)/i);
  if (!m) return params;

  const lines = splitByComma(m[1]);
  for (const line of lines) {
    const trimmed = line.trim().replace(/\s+/g, ' ');
    // name [IN|OUT|IN OUT] type [DEFAULT|:= ...]
    const pm = trimmed.match(/^(\w+)\s+((?:IN\s+OUT|OUT|IN)\s+)?([A-Z0-9_$%]+(?:\s*\([^)]*\))?)/i);
    if (pm) {
      let dir = (pm[2] || 'IN').trim().toUpperCase().replace(/\s+/g, ' ');
      if (!['IN', 'OUT', 'IN OUT'].includes(dir)) dir = 'IN';
      params.push({ name: pm[1].toUpperCase(), direction: dir, dataType: pm[3].toUpperCase() });
    }
  }
  return params;
}

function parseReads(upper) {
  const tables = new Set();
  // FROM table, JOIN table
  const re = /(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const tbl = m[2] || m[1]; // prefer table part if schema-qualified
    if (!SQL_KEYWORDS.has(tbl) && !isSystemTable(tbl)) tables.add(tbl);
  }
  return [...tables];
}

function parseWrites(upper) {
  const writes = [];
  const patterns = [
    { re: /INSERT\s+(?:ALL\s+)?INTO\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op: 'INSERT' },
    { re: /UPDATE\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?\s+SET/g, op: 'UPDATE' },
    { re: /DELETE\s+(?:FROM\s+)?([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op: 'DELETE' },
    { re: /MERGE\s+INTO\s+([A-Z_][A-Z0-9_$#]*)(?:\s*\.\s*([A-Z_][A-Z0-9_$#]*))?/g, op: 'MERGE' },
  ];
  for (const { re, op } of patterns) {
    let m;
    while ((m = re.exec(upper)) !== null) {
      const tbl = m[2] || m[1];
      if (!SQL_KEYWORDS.has(tbl) && !isSystemTable(tbl)) {
        if (!writes.find(w => w.table === tbl && w.op === op)) writes.push({ table: tbl, op });
      }
    }
  }
  return writes;
}

function parseCursors(upper) {
  const cursors = [];
  const re = /CURSOR\s+(\w+)\s+(?:\([^)]*\)\s+)?IS\s+SELECT\s+[\s\S]{0,200}?FROM\s+([A-Z_][A-Z0-9_$#]*)/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const tbl = m[2];
    if (!SQL_KEYWORDS.has(tbl) && !isSystemTable(tbl)) cursors.push({ name: m[1], table: tbl });
  }
  return cursors;
}

function parseProcedureCalls(src, currentName) {
  const calls = new Map(); // name -> type
  const upper = src.toUpperCase();

  // EXECUTE IMMEDIATE
  if (/EXECUTE\s+IMMEDIATE/i.test(upper)) calls.set('EXECUTE IMMEDIATE', 'dynamic');

  // System packages: DBMS_*, UTL_*, HTP, HTF, APEX_*
  const sysPkgRe = /\b(DBMS_[A-Z0-9_]+|UTL_[A-Z0-9_]+|HTP|HTF|APEX_[A-Z0-9_]+|FND_[A-Z0-9_]+)\b/g;
  let m;
  while ((m = sysPkgRe.exec(upper)) !== null) calls.set(m[1], 'system');

  // Qualified calls: pkg.proc(...) or schema.pkg.proc(...)
  const qualRe = /\b([A-Z_][A-Z0-9_$]*)\s*\.\s*([A-Z_][A-Z0-9_$]*)\s*(?:\.\s*([A-Z_][A-Z0-9_$]*)\s*)?\(/g;
  while ((m = qualRe.exec(upper)) !== null) {
    const part1 = m[1], part2 = m[2], part3 = m[3];
    if (SQL_KEYWORDS.has(part1)) continue;
    if (ORACLE_SYSTEM_PREFIXES.some(p => part1.startsWith(p))) continue;
    const callName = part3 ? `${part1}.${part2}.${part3}` : `${part1}.${part2}`;
    if (!BUILTIN_FUNCTIONS.has(part2) && !BUILTIN_FUNCTIONS.has(part3 || '')) {
      calls.set(callName, 'procedure');
    }
  }

  // Remove current procedure to avoid self-reference
  const currentUpper = currentName.toUpperCase();
  calls.delete(currentUpper);

  return [...calls.entries()].map(([name, type]) => ({ name, type }));
}

function parseExceptions(upper) {
  const excs = [];
  const re = /WHEN\s+((?:[A-Z_][A-Z0-9_$]*\.)?[A-Z_][A-Z0-9_$]*)\s+THEN/g;
  let m;
  while ((m = re.exec(upper)) !== null) {
    const exc = m[1].trim();
    if (exc !== 'OTHERS' || !excs.includes('OTHERS')) {
      if (!excs.includes(exc)) excs.push(exc);
    }
  }
  return excs;
}

function parseVariables(src) {
  const vars = [];
  // Match DECLARE section variables
  const declareMatch = src.match(/DECLARE\s+([\s\S]*?)BEGIN/i);
  if (!declareMatch) return vars;
  const block = declareMatch[1];
  const re = /^\s*(\w+)\s+([A-Z0-9_$%]+(?:\s*\([^)]*\))?)\s*(?::=|DEFAULT|;)/gim;
  let m;
  while ((m = re.exec(block)) !== null) {
    if (!SQL_KEYWORDS.has(m[1].toUpperCase())) vars.push({ name: m[1], type: m[2] });
  }
  return vars.slice(0, 20); // limit
}

function generateMermaid({ procName, procType, params, reads, writes, calls, exceptions, cursors }) {
  const lines = [
    'flowchart TD',
    '  classDef inputParam fill:#1a4a72,stroke:#3498db,color:#aed6f1,rx:8',
    '  classDef outputParam fill:#1a5e3a,stroke:#2ecc71,color:#a9dfbf,rx:8',
    '  classDef inoutParam fill:#512e5f,stroke:#8e44ad,color:#d2b4de,rx:8',
    '  classDef readTable fill:#5d4037,stroke:#d4ac0d,color:#fdebd0',
    '  classDef writeTable fill:#7b241c,stroke:#e74c3c,color:#fadbd8',
    '  classDef procNode fill:#0d47a1,stroke:#4fc1ff,color:#e3f2fd,stroke-width:2px',
    '  classDef callProc fill:#1b3a5c,stroke:#5dade2,color:#d6eaf8',
    '  classDef callSystem fill:#2e4057,stroke:#85c1e9,color:#d6eaf8',
    '  classDef callDynamic fill:#4a235a,stroke:#bb8fce,color:#e8daef',
    '  classDef excNode fill:#424242,stroke:#9e9e9e,color:#e0e0e0',
    '  classDef cursorNode fill:#4a4000,stroke:#f9ca24,color:#ffeaa7',
    '',
  ];

  const inParams = params.filter(p => p.direction === 'IN' || p.direction === 'IN OUT');
  const outParams = params.filter(p => p.direction === 'OUT' || p.direction === 'IN OUT');

  // ── Input Parameters
  if (inParams.length > 0) {
    lines.push('  subgraph INPUT ["📥 입력 파라미터"]');
    for (const p of inParams) {
      lines.push(`    IN_${sanitizeId(p.name)}(["${p.name}\\n${p.direction} ${p.dataType}"])`);
    }
    lines.push('  end');
    lines.push('');
  }

  // ── Read Tables
  if (reads.length > 0) {
    lines.push('  subgraph READS ["📖 SELECT (읽기)"]');
    for (const tbl of reads) {
      const isCursor = cursors.some(c => c.table === tbl);
      lines.push(`    R_${sanitizeId(tbl)}[("${tbl}${isCursor ? '\\n(CURSOR)' : ''}")]`);
    }
    lines.push('  end');
    lines.push('');
  }

  // ── Main Process Node
  lines.push(`  PROC{{"⚙️ ${procName}\\n${procType}"}}`);
  lines.push('  class PROC procNode');
  lines.push('');

  // ── Write Tables
  if (writes.length > 0) {
    lines.push('  subgraph WRITES ["✏️ DML (쓰기)"]');
    for (const w of writes) {
      const id = `W_${sanitizeId(w.table)}_${w.op}`;
      lines.push(`    ${id}[("${w.table}\\n${w.op}")]`);
    }
    lines.push('  end');
    lines.push('');
  }

  // ── Called Procedures
  const userCalls = calls.filter(c => c.type === 'procedure');
  const sysCalls = calls.filter(c => c.type === 'system');
  const dynCalls = calls.filter(c => c.type === 'dynamic');

  if (calls.length > 0) {
    lines.push('  subgraph CALLS ["🔧 호출"]');
    for (const c of dynCalls) {
      lines.push(`    C_${sanitizeId(c.name)}[["${c.name}\\n(동적 SQL)"]]`);
    }
    for (const c of sysCalls) {
      lines.push(`    C_${sanitizeId(c.name)}[["${c.name}"]]`);
    }
    for (const c of userCalls) {
      lines.push(`    C_${sanitizeId(c.name)}[["${c.name}()"]]`);
    }
    lines.push('  end');
    lines.push('');
  }

  // ── Output Parameters
  if (outParams.length > 0) {
    lines.push('  subgraph OUTPUT ["📤 출력 파라미터"]');
    for (const p of outParams) {
      lines.push(`    OUT_${sanitizeId(p.name)}(["${p.name}\\n${p.direction} ${p.dataType}"])`);
    }
    lines.push('  end');
    lines.push('');
  }

  // ── Exceptions
  if (exceptions.length > 0) {
    const excLabel = exceptions.slice(0, 6).join('\\n');
    lines.push(`  EXC["⚠️ EXCEPTION\\n${excLabel}"]`);
    lines.push('  class EXC excNode');
    lines.push('');
  }

  // ── Edges
  for (const p of inParams) lines.push(`  IN_${sanitizeId(p.name)} --> PROC`);
  for (const tbl of reads) lines.push(`  R_${sanitizeId(tbl)} -->|"읽기"| PROC`);
  for (const w of writes) lines.push(`  PROC -->|"${w.op}"| W_${sanitizeId(w.table)}_${w.op}`);
  for (const c of calls) lines.push(`  PROC -->|"호출"| C_${sanitizeId(c.name)}`);
  for (const p of outParams) lines.push(`  PROC --> OUT_${sanitizeId(p.name)}`);
  if (exceptions.length > 0) lines.push(`  PROC -. "예외처리" .-> EXC`);

  // ── Class assignments
  for (const p of inParams) {
    const cls = p.direction === 'IN OUT' ? 'inoutParam' : 'inputParam';
    lines.push(`  class IN_${sanitizeId(p.name)} ${cls}`);
  }
  for (const p of outParams) {
    const cls = p.direction === 'IN OUT' ? 'inoutParam' : 'outputParam';
    lines.push(`  class OUT_${sanitizeId(p.name)} ${cls}`);
  }
  for (const tbl of reads) lines.push(`  class R_${sanitizeId(tbl)} readTable`);
  for (const w of writes) lines.push(`  class W_${sanitizeId(w.table)}_${w.op} writeTable`);
  for (const c of dynCalls) lines.push(`  class C_${sanitizeId(c.name)} callDynamic`);
  for (const c of sysCalls) lines.push(`  class C_${sanitizeId(c.name)} callSystem`);
  for (const c of userCalls) lines.push(`  class C_${sanitizeId(c.name)} callProc`);

  return lines.join('\n');
}

export function analyzePLSQL(source, procName, procType) {
  const cleaned = removeComments(source);
  const upper = cleaned.toUpperCase();

  const params = parseParameters(cleaned);
  const cursors = parseCursors(upper);
  const reads = parseReads(upper);
  const writes = parseWrites(upper);
  const calls = parseProcedureCalls(cleaned, procName);
  const exceptions = parseExceptions(upper);
  const variables = parseVariables(cleaned);

  // Merge cursor tables into reads
  for (const c of cursors) {
    if (!reads.includes(c.table)) reads.push(c.table);
  }

  const mermaid = generateMermaid({ procName, procType, params, reads, writes, calls, exceptions, cursors });

  return { procName, procType, params, reads, writes, calls, exceptions, cursors, variables, mermaid };
}
