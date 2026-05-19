/**
 * Generates a structured Korean explanation of a PL/SQL object
 * from static analysis results — no external API needed.
 */
export function generateExplanation(name, type, analysis) {
  const { params = [], reads = [], writes = [], calls = [], exceptions = [], cursors = [], variables = [] } = analysis;

  const inParams  = params.filter(p => p.direction === 'IN' || p.direction === 'IN OUT');
  const outParams = params.filter(p => p.direction === 'OUT' || p.direction === 'IN OUT');

  const insertTables = [...new Set(writes.filter(w => w.op === 'INSERT').map(w => w.table))];
  const updateTables = [...new Set(writes.filter(w => w.op === 'UPDATE').map(w => w.table))];
  const deleteTables = [...new Set(writes.filter(w => w.op === 'DELETE').map(w => w.table))];
  const mergeTables  = [...new Set(writes.filter(w => w.op === 'MERGE').map(w => w.table))];

  const userCalls   = calls.filter(c => c.type === 'user');
  const sysCalls    = calls.filter(c => c.type === 'system');
  const dynamicCalls = calls.filter(c => c.type === 'dynamic');

  const sections = [];

  // ── 핵심 목적 ──────────────────────────────────────────
  const purposeParts = [];
  if (reads.length)         purposeParts.push(`**${reads.join(', ')}** 테이블에서 데이터 조회`);
  if (insertTables.length)  purposeParts.push(`**${insertTables.join(', ')}** 테이블에 신규 데이터 등록`);
  if (updateTables.length)  purposeParts.push(`**${updateTables.join(', ')}** 테이블의 데이터 수정`);
  if (deleteTables.length)  purposeParts.push(`**${deleteTables.join(', ')}** 테이블의 데이터 삭제`);
  if (mergeTables.length)   purposeParts.push(`**${mergeTables.join(', ')}** 테이블에 데이터 병합(MERGE)`);
  if (userCalls.length)     purposeParts.push(`외부 프로시저/함수(**${userCalls.map(c => c.name).join(', ')}**) 연계 처리`);
  if (dynamicCalls.length)  purposeParts.push('동적 SQL 실행');

  if (purposeParts.length) {
    sections.push({
      title: '핵심 목적',
      content: purposeParts.join(' → ') + `하는 ${typeKr(type)}입니다.`,
    });
  } else {
    sections.push({
      title: '핵심 목적',
      content: `**${name}** ${typeKr(type)}의 내부 처리 로직을 수행합니다.`,
    });
  }

  // ── 입력 데이터 ────────────────────────────────────────
  if (inParams.length) {
    const lines = inParams.map(p =>
      `- \`${p.name}\` *(${p.dataType})* — ${dirDesc(p.direction)} 값`
    );
    sections.push({ title: '입력 데이터', lines });
  } else {
    sections.push({ title: '입력 데이터', content: '별도 입력 파라미터 없음 (파라미터 없는 독립 실행형)' });
  }

  // ── 처리 로직 ──────────────────────────────────────────
  const logicLines = [];

  if (cursors.length) {
    logicLines.push(`커서를 사용해 데이터를 반복 처리합니다 (${cursors.map(c => `\`${c.name}\``).join(', ')})`);
  }
  if (reads.length && !cursors.length) {
    logicLines.push(`**${reads.join(', ')}** 테이블에서 조건에 맞는 데이터를 조회합니다.`);
  }
  if (insertTables.length) {
    logicLines.push(`조회한 데이터를 가공하여 **${insertTables.join(', ')}** 테이블에 INSERT합니다.`);
  }
  if (updateTables.length) {
    logicLines.push(`**${updateTables.join(', ')}** 테이블의 기존 데이터를 조건에 따라 UPDATE합니다.`);
  }
  if (deleteTables.length) {
    logicLines.push(`**${deleteTables.join(', ')}** 테이블에서 조건에 해당하는 데이터를 DELETE합니다.`);
  }
  if (mergeTables.length) {
    logicLines.push(`**${mergeTables.join(', ')}** 테이블에 MERGE 구문으로 있으면 수정, 없으면 등록합니다.`);
  }
  if (dynamicCalls.length) {
    logicLines.push('EXECUTE IMMEDIATE 등 동적 SQL을 실행합니다.');
  }
  if (userCalls.length) {
    logicLines.push(`처리 과정에서 **${userCalls.map(c => c.name).join(', ')}** 등 외부 프로시저/함수를 호출합니다.`);
  }
  if (sysCalls.length) {
    logicLines.push(`시스템 패키지(**${sysCalls.map(c => c.name).join(', ')}**)를 통해 로그 출력 등 부가 처리를 수행합니다.`);
  }

  if (logicLines.length) {
    sections.push({ title: '처리 로직', lines: logicLines.map(l => `- ${l}`) });
  }

  // ── 출력 / 결과 ────────────────────────────────────────
  if (outParams.length) {
    const lines = outParams.map(p =>
      `- \`${p.name}\` *(${p.dataType})* — 처리 결과를 반환`
    );
    sections.push({ title: '출력 / 반환값', lines });
  } else if (type === 'FUNCTION') {
    sections.push({ title: '출력 / 반환값', content: '함수 반환값(RETURN)으로 결과를 전달합니다.' });
  } else {
    sections.push({ title: '출력 / 반환값', content: 'OUT 파라미터 없음 — DB 테이블 변경이 직접 결과입니다.' });
  }

  // ── 예외 처리 ──────────────────────────────────────────
  if (exceptions.length) {
    sections.push({
      title: '예외 처리',
      lines: exceptions.map(e => `- \`${e}\` 예외 발생 시 별도 처리 로직 수행`),
    });
  } else {
    sections.push({ title: '예외 처리', content: '명시적 예외 처리 없음 — 오류 발생 시 호출자에게 전파됩니다.' });
  }

  // ── 특이사항 ───────────────────────────────────────────
  const notes = [];
  if (variables.length > 5) notes.push(`로컬 변수를 ${variables.length}개 사용하는 복잡한 처리 로직입니다.`);
  if (dynamicCalls.length)  notes.push('동적 SQL을 포함하고 있어 실행 계획 캐싱이 되지 않을 수 있습니다.');
  if (cursors.length > 1)   notes.push(`${cursors.length}개의 커서를 사용하는 반복 처리 구조입니다.`);
  if (writes.length > 3)    notes.push(`${writes.length}개의 테이블에 DML을 수행하므로 트랜잭션 관리에 주의가 필요합니다.`);

  if (notes.length) {
    sections.push({ title: '특이사항', lines: notes.map(n => `- ${n}`) });
  }

  return sections;
}

function typeKr(type) {
  const m = { PROCEDURE: '프로시저', FUNCTION: '함수', PACKAGE: '패키지', 'PACKAGE BODY': '패키지 바디', TRIGGER: '트리거' };
  return m[type] || type;
}

function dirDesc(dir) {
  if (dir === 'IN') return '입력';
  if (dir === 'OUT') return '출력';
  return '입출력';
}
