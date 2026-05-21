// Rule-based Oracle execution plan analyzer (no external AI dependency)

function parseSuffix(s) {
  if (!s) return 0;
  const u = String(s).trim().toUpperCase();
  if (u.endsWith('G')) return Math.round(parseFloat(u) * 1e9);
  if (u.endsWith('M')) return Math.round(parseFloat(u) * 1e6);
  if (u.endsWith('K')) return Math.round(parseFloat(u) * 1e3);
  return parseFloat(u) || 0;
}

// Parse the operation rows from DBMS_XPLAN.DISPLAY output
function parsePlanRows(planText) {
  const rows = [];
  const lines = planText.split('\n');
  let seenHeader = false;
  let inTable = false;
  let sepCount = 0;

  for (const line of lines) {
    // Detect header row (contains "Id" and "Operation")
    if (!seenHeader && line.includes('| Id') && line.includes('Operation')) {
      seenHeader = true;
      continue;
    }
    if (!seenHeader) continue;

    // Separator lines (dashes + pipes only)
    if (/^[\s\-|+=]+$/.test(line)) {
      sepCount++;
      if (sepCount === 1) { inTable = true; continue; }
      if (sepCount >= 2) { inTable = false; break; }
      continue;
    }
    if (!inTable) continue;

    // Split columns by '|'
    const cols = line.split('|');
    if (cols.length < 5) continue;

    const idRaw = cols[1] ?? '';
    const idNum = parseInt(idRaw.replace(/\*/g, '').trim());
    if (isNaN(idNum)) continue;

    const hasFilter = idRaw.includes('*');
    const opRaw = cols[2] ?? '';
    const operation = opRaw.trim();
    const depth = opRaw.search(/\S/) < 0 ? 0 : Math.floor(opRaw.search(/\S/) / 2);
    const name = (cols[3] ?? '').trim();
    const rowsStr = (cols[4] ?? '').trim();
    const bytesStr = (cols[5] ?? '').trim();
    const costStr = (cols[6] ?? '').replace(/\([^)]*\)/g, '').trim();

    rows.push({
      id: idNum,
      hasFilter,
      operation,
      name,
      rows: parseSuffix(rowsStr),
      bytes: parseSuffix(bytesStr),
      cost: parseSuffix(costStr),
      depth,
    });
  }
  return rows;
}

// Extract the "Plan hash value" and note section
function extractMeta(planText) {
  const hashMatch = planText.match(/Plan hash value:\s*(\d+)/);
  const noteLines = [];
  let inNote = false;
  for (const line of planText.split('\n')) {
    if (/^Note\s*$/.test(line.trim())) { inNote = true; continue; }
    if (inNote) {
      if (/^-+$/.test(line.trim())) continue;
      if (line.trim() === '') { inNote = false; continue; }
      noteLines.push(line.trim().replace(/^-\s*/, ''));
    }
  }
  return {
    planHash: hashMatch?.[1] || null,
    notes: noteLines,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzePlan(planText) {
  const rows = parsePlanRows(planText);
  const meta = extractMeta(planText);

  if (rows.length === 0) {
    return {
      grade: 'unknown',
      gradeLabel: '알 수 없음',
      summary: '실행계획을 파싱할 수 없습니다. EXPLAIN PLAN 결과를 확인하세요.',
      totalCost: 0,
      totalRows: 0,
      planHash: null,
      notes: [],
      operations: [],
      findings: [],
    };
  }

  const findings = [];
  const totalCost = rows[0]?.cost ?? 0;
  const totalRows = rows[0]?.rows ?? 0;

  // ── Rule 1: Full Table Scan ────────────────────────────────────────────────
  rows.filter(r => r.operation === 'TABLE ACCESS FULL').forEach(r => {
    const level = r.rows > 100_000 ? 'critical' : r.rows > 10_000 ? 'warning' : 'info';
    findings.push({
      level,
      title: `Full Table Scan — ${r.name || '?'}`,
      description:
        `${r.name} 테이블을 전체 스캔합니다 (예상 ${r.rows.toLocaleString()}행, Cost ${r.cost.toLocaleString()}).` +
        (r.rows > 10_000 ? ' 대량 데이터일 경우 성능에 큰 영향을 줍니다.' : ''),
      suggestion: r.name
        ? `WHERE 조건 컬럼에 인덱스 추가를 검토하세요.\n예) CREATE INDEX idx_${r.name.toLowerCase()}_col ON ${r.name}(조건컬럼);`
        : 'WHERE 조건에 인덱스를 추가하세요.',
    });
  });

  // ── Rule 2: Cartesian Join ────────────────────────────────────────────────
  rows.filter(r => r.operation.includes('CARTESIAN')).forEach(() => {
    findings.push({
      level: 'critical',
      title: 'Cartesian Join (카테시안 곱) 감지',
      description: '조인 조건이 없어 두 테이블의 모든 행을 조합하고 있습니다. 데이터가 많을수록 기하급수적으로 느려집니다.',
      suggestion: 'FROM 절 모든 테이블에 적절한 ON 조건(또는 WHERE 조인 조건)이 있는지 확인하세요.',
    });
  });

  // ── Rule 3: Nested Loops on large data ───────────────────────────────────
  rows.filter(r => r.operation.startsWith('NESTED LOOPS') && r.rows > 50_000).forEach(r => {
    findings.push({
      level: 'warning',
      title: 'Nested Loops — 대량 데이터 조인',
      description: `Nested Loops 조인 결과가 ${r.rows.toLocaleString()}행으로 많습니다. HASH JOIN이 더 효율적일 수 있습니다.`,
      suggestion: '/*+ USE_HASH(테이블명) */ 힌트를 추가하거나, 드라이빙 테이블의 WHERE 조건을 강화해 중간 결과를 줄이세요.',
    });
  });

  // ── Rule 4: Heavy sort operations ────────────────────────────────────────
  rows.filter(r => r.operation.startsWith('SORT') && r.rows > 50_000).forEach(r => {
    findings.push({
      level: 'warning',
      title: `정렬 연산 부하 — ${r.operation}`,
      description: `${r.rows.toLocaleString()}행에 대한 정렬 발생. TEMP 테이블스페이스 I/O가 발생할 수 있습니다.`,
      suggestion: 'ORDER BY / GROUP BY 컬럼에 복합 인덱스를 생성하거나, 먼저 WHERE 조건으로 대상 행을 줄이세요.',
    });
  });

  // ── Rule 5: Index Full Scan on large index ────────────────────────────────
  rows.filter(r => r.operation === 'INDEX FULL SCAN' && r.rows > 10_000).forEach(r => {
    findings.push({
      level: 'warning',
      title: `INDEX FULL SCAN — ${r.name}`,
      description: `${r.name} 인덱스 전체 스캔 (${r.rows.toLocaleString()}행). TABLE ACCESS FULL보다는 낫지만 비효율적입니다.`,
      suggestion: 'WHERE 조건이 인덱스 선두 컬럼(Leading Column)부터 시작하는지 확인해 RANGE SCAN으로 개선하세요.',
    });
  });

  // ── Rule 6: Buffer sort ───────────────────────────────────────────────────
  rows.filter(r => r.operation === 'BUFFER SORT').forEach(() => {
    findings.push({
      level: 'info',
      title: 'BUFFER SORT',
      description: '임시 버퍼를 사용하는 정렬이 발생합니다. 메모리가 충분하면 문제없습니다.',
      suggestion: null,
    });
  });

  // ── Rule 7: Positive — Unique / Range index scan ──────────────────────────
  const uniqueScans = rows.filter(r => r.operation === 'INDEX UNIQUE SCAN');
  if (uniqueScans.length > 0) {
    findings.push({
      level: 'good',
      title: 'INDEX UNIQUE SCAN 사용 (최적)',
      description: uniqueScans.map(r => r.name).join(', ') + ' — PK/Unique 인덱스를 통한 1행 접근',
      suggestion: null,
    });
  }

  const rangeScans = rows.filter(r => r.operation === 'INDEX RANGE SCAN');
  if (rangeScans.length > 0 && !rows.some(r => r.operation === 'TABLE ACCESS FULL')) {
    findings.push({
      level: 'good',
      title: 'INDEX RANGE SCAN 사용',
      description: rangeScans.map(r => r.name).filter(Boolean).join(', ') + ' — 인덱스 범위 스캔으로 효율적 접근',
      suggestion: null,
    });
  }

  // ── Rule 8: Very high cost ────────────────────────────────────────────────
  if (totalCost > 100_000 && !findings.some(f => f.level === 'critical')) {
    findings.push({
      level: 'warning',
      title: '높은 전체 Cost',
      description: `전체 실행 Cost가 ${totalCost.toLocaleString()}으로 매우 높습니다. 통계 정보가 오래됐을 수 있습니다.`,
      suggestion: 'ANALYZE 또는 DBMS_STATS.GATHER_TABLE_STATS()로 통계 정보를 갱신하세요.',
    });
  }

  // ── Grade ─────────────────────────────────────────────────────────────────
  const hasCritical = findings.some(f => f.level === 'critical');
  const hasWarning  = findings.some(f => f.level === 'warning');
  const grade = hasCritical ? 'critical' : hasWarning ? 'warning' : 'good';
  const gradeLabel = grade === 'critical' ? '심각' : grade === 'warning' ? '주의' : '양호';

  // ── Summary ───────────────────────────────────────────────────────────────
  const opTypes = [...new Set(rows.map(r => r.operation.split(' ')[0] + (r.operation.includes('JOIN') ? ' JOIN' : '')))];
  const joinOps = rows.filter(r => r.operation.includes('JOIN')).map(r => r.operation);
  const summary = [
    `전체 Cost ${totalCost.toLocaleString()}, 예상 반환 ${totalRows.toLocaleString()}행.`,
    joinOps.length > 0 ? `조인 방식: ${[...new Set(joinOps)].join(', ')}.` : '',
    rows.filter(r => r.operation === 'TABLE ACCESS FULL').length > 0
      ? `Full Table Scan ${rows.filter(r => r.operation === 'TABLE ACCESS FULL').length}건.`
      : '인덱스 접근 위주의 효율적 플랜.',
    meta.notes.length > 0 ? `Note: ${meta.notes.join('; ')}.` : '',
  ].filter(Boolean).join(' ');

  return {
    grade,
    gradeLabel,
    summary,
    totalCost,
    totalRows,
    planHash: meta.planHash,
    notes: meta.notes,
    operations: rows,
    findings,
  };
}
