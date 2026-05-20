import { format } from 'sql-formatter';

export function formatSQL(sql) {
  if (!sql || !sql.trim()) return sql;
  try {
    return format(sql, {
      language: 'plsql',
      tabWidth: 2,
      keywordCase: 'upper',
      linesBetweenQueries: 1,
      indentStyle: 'standard',
    });
  } catch {
    return sql;
  }
}
