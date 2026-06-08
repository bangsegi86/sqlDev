export function findMatches(text, query, { caseSensitive = false, useRegex = false } = {}) {
  if (!query) return [];
  const res = [];
  if (useRegex) {
    let re;
    try { re = new RegExp(query, caseSensitive ? 'g' : 'gi'); } catch { return []; }
    let m;
    while ((m = re.exec(text)) !== null) {
      res.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
      if (res.length > 10000) break;
    }
  } else {
    const hay = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      res.push({ start: i, end: i + needle.length });
      i += needle.length || 1;
      if (res.length > 10000) break;
    }
  }
  return res;
}
