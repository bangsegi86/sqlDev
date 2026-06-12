function ph(col)   { return `/*${col}*/`; }
function bind(col) { return `:${col}`; }

export function buildSelectTemplate(schema, table, columns) {
  const cols = columns.map(c => `  ${c.COLUMN_NAME}`).join(',\n');
  return `SELECT\n${cols}\nFROM ${schema}.${table}`;
}

export function buildInsertTemplate(schema, table, columns) {
  const colList = columns.map(c => `  ${c.COLUMN_NAME}`).join(',\n');
  const valList = columns.map(c => `  ${ph(c.COLUMN_NAME)}`).join(',\n');
  return `INSERT INTO ${schema}.${table} (\n${colList}\n)\nVALUES (\n${valList}\n)`;
}

export function buildUpdateTemplate(schema, table, columns) {
  const pkCols   = columns.filter(c => c.IS_PK);
  const dataCols = columns.filter(c => !c.IS_PK);
  const setCols  = dataCols.length > 0 ? dataCols : columns;
  const setList  = setCols.map(c => `  ${c.COLUMN_NAME} = ${bind(c.COLUMN_NAME)}`).join(',\n');
  const whereList = (pkCols.length > 0 ? pkCols : columns.slice(0, 1))
    .map(c => `  ${c.COLUMN_NAME} = ${bind(c.COLUMN_NAME)}`).join('\n  AND ');
  return `UPDATE ${schema}.${table}\nSET\n${setList}\nWHERE\n  ${whereList}`;
}

export function buildDeleteTemplate(schema, table, columns) {
  const pkCols = columns.filter(c => c.IS_PK);
  const whereList = (pkCols.length > 0 ? pkCols : columns.slice(0, 1))
    .map(c => `  ${c.COLUMN_NAME} = ${bind(c.COLUMN_NAME)}`).join('\n  AND ');
  return `DELETE FROM ${schema}.${table}\nWHERE\n  ${whereList}`;
}

export function buildMergeTemplate(schema, table, columns) {
  const pkCols   = columns.filter(c => c.IS_PK);
  const dataCols = columns.filter(c => !c.IS_PK);
  const srcCols  = columns.map(c => `    ${bind(c.COLUMN_NAME)} AS ${c.COLUMN_NAME}`).join(',\n');
  const onList   = (pkCols.length > 0 ? pkCols : columns.slice(0, 1))
    .map(c => `t.${c.COLUMN_NAME} = s.${c.COLUMN_NAME}`).join(' AND ');
  const updCols  = (dataCols.length > 0 ? dataCols : columns)
    .map(c => `    t.${c.COLUMN_NAME} = s.${c.COLUMN_NAME}`).join(',\n');
  const insCols  = columns.map(c => `    ${c.COLUMN_NAME}`).join(',\n');
  const insVals  = columns.map(c => `    s.${c.COLUMN_NAME}`).join(',\n');
  return (
    `MERGE INTO ${schema}.${table} t\n` +
    `USING (\n  SELECT\n${srcCols}\n  FROM DUAL\n) s\n` +
    `ON (${onList})\n` +
    `WHEN MATCHED THEN\n  UPDATE SET\n${updCols}\n` +
    `WHEN NOT MATCHED THEN\n  INSERT (\n${insCols}\n  )\n  VALUES (\n${insVals}\n  )`
  );
}
