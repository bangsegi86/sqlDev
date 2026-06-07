// ─────────────────────────────────────────────────────────────────────────
// 결과 그리드 내보내기 (CSV / Excel)
//
// 외부망 단절 환경을 가정하므로 라이브러리 없이 브라우저 내장 기능만 사용한다.
//  - CSV   : UTF-8 BOM 을 붙여 엑셀에서 한글이 깨지지 않게 함
//  - Excel : HTML <table> 을 .xls 로 저장 — 엑셀이 HTML 표를 열어준다 (무의존)
// ─────────────────────────────────────────────────────────────────────────

function tsName(base, ext) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${base || 'query_result'}_${stamp}.${ext}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cellToString(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// CSV 한 필드 이스케이프 (쉼표·따옴표·줄바꿈 포함 시 따옴표로 감쌈)
function csvField(v) {
  const s = cellToString(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportCSV(columns, rows, baseName) {
  const header = columns.map(csvField).join(',');
  const body = rows.map(row => columns.map(c => csvField(row[c])).join(',')).join('\r\n');
  const csv = header + '\r\n' + body;
  // ﻿ = UTF-8 BOM → 엑셀이 UTF-8 로 인식해 한글 깨짐 방지
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, tsName(baseName, 'csv'));
}

function htmlEscape(v) {
  return cellToString(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function exportExcel(columns, rows, baseName) {
  const thead = '<tr>' + columns.map(c => `<th>${htmlEscape(c)}</th>`).join('') + '</tr>';
  const tbody = rows.map(row =>
    '<tr>' + columns.map(c => {
      // 숫자처럼 보여도 앞 0 이 보존되도록 텍스트 서식 강제 (예: 사번 00123)
      const s = htmlEscape(row[c]);
      return `<td style="mso-number-format:'@'">${s}</td>`;
    }).join('') + '</tr>'
  ).join('');
  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"></head>' +
    `<body><table border="1">${thead}${tbody}</table></body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, tsName(baseName, 'xls'));
}
