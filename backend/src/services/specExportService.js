// Build table-specification documents (Excel / PDF) from gathered table specs.
//
// - Excel: sheet 1 is an index (목록) with hyperlinks to each table's sheet;
//   one sheet per table follows.
// - PDF: cover/index page + one section per table, with PDF outline bookmarks
//   so viewers show a clickable sidebar to jump to each table.
//
// Korean text is rendered in PDF using the bundled NanumGothic font.

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dir, '../../assets/fonts');
const FONT_REGULAR = join(FONT_DIR, 'NanumGothic-Regular.ttf');
const FONT_BOLD = join(FONT_DIR, 'NanumGothic-Bold.ttf');

// ── Helpers ──────────────────────────────────────────────────────────────────

function colTypeStr(col) {
  const t = col.DATA_TYPE;
  if (t === 'NUMBER') {
    if (col.DATA_PRECISION != null) {
      return `NUMBER(${col.DATA_PRECISION}${col.DATA_SCALE ? ',' + col.DATA_SCALE : ''})`;
    }
    return 'NUMBER';
  }
  if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW'].includes(t)) {
    return `${t}(${col.DATA_LENGTH})`;
  }
  return t;
}

function defaultStr(col) {
  if (col.DATA_DEFAULT == null) return '';
  return String(col.DATA_DEFAULT).trim();
}

// Excel sheet names: max 31 chars, no  : \ / ? * [ ] , must be unique.
function sanitizeSheetName(name, used) {
  let base = String(name).replace(/[:\\/?*[\]]/g, '_').slice(0, 28);
  let candidate = base;
  let n = 1;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${n++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ── Excel ──────────────────────────────────────────────────────────────────────

export async function buildWorkbook(tables) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Oracle DB Manager';
  wb.created = new Date();

  const usedNames = new Set();
  // Pre-assign each table its sheet name so the index can link to it.
  const sheetNames = tables.map(t => sanitizeSheetName(t.name, usedNames));

  // ── Index sheet (목록) ──
  const idx = wb.addWorksheet('목록', { views: [{ state: 'frozen', ySplit: 3 }] });
  idx.columns = [
    { header: '', key: 'no', width: 6 },
    { header: '', key: 'table', width: 32 },
    { header: '', key: 'comment', width: 44 },
    { header: '', key: 'cols', width: 10 },
  ];

  idx.mergeCells('A1:D1');
  const title = idx.getCell('A1');
  title.value = '테이블 명세서';
  title.font = { size: 18, bold: true, color: { argb: 'FF1A237E' } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  idx.getRow(1).height = 28;

  idx.mergeCells('A2:D2');
  const sub = idx.getCell('A2');
  sub.value = `생성일시: ${new Date().toLocaleString('ko-KR')}    ·    총 ${tables.length}개 테이블`;
  sub.font = { size: 10, color: { argb: 'FF666666' } };

  const headerRow = idx.getRow(3);
  ['No', '테이블명', '설명', '컬럼수'].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
  });
  headerRow.height = 20;

  tables.forEach((t, i) => {
    const row = idx.addRow({
      no: i + 1,
      table: t.name,
      comment: t.comment || '',
      cols: t.columns.length,
    });
    // Hyperlink the table-name cell to that table's sheet
    const linkCell = row.getCell('table');
    linkCell.value = { text: t.name, hyperlink: `#'${sheetNames[i]}'!A1` };
    linkCell.font = { color: { argb: 'FF1565C0' }, underline: true, bold: true };
    row.getCell('no').alignment = { horizontal: 'center' };
    row.getCell('cols').alignment = { horizontal: 'center' };
    row.eachCell(c => { c.border = thinBorder(); });
  });

  // ── One sheet per table ──
  tables.forEach((t, ti) => {
    const ws = wb.addWorksheet(sheetNames[ti], { views: [{ state: 'frozen', ySplit: 5 }] });
    ws.columns = [
      { width: 6 },   // No
      { width: 26 },  // 컬럼명
      { width: 20 },  // 타입
      { width: 8 },   // NULL
      { width: 6 },   // PK
      { width: 22 },  // 기본값
      { width: 40 },  // 설명
    ];

    ws.mergeCells('A1:G1');
    const tt = ws.getCell('A1');
    tt.value = `${t.schema}.${t.name}`;
    tt.font = { size: 15, bold: true, color: { argb: 'FF1A237E' } };
    ws.getRow(1).height = 24;

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = t.comment ? `설명: ${t.comment}` : '설명: -';
    ws.getCell('A2').font = { size: 10, color: { argb: 'FF444444' } };

    // back-to-index link
    ws.mergeCells('A3:G3');
    const back = ws.getCell('A3');
    back.value = { text: '◀ 목록으로', hyperlink: `#'목록'!A1` };
    back.font = { color: { argb: 'FF1565C0' }, underline: true, size: 9 };

    // Column grid header (row 5)
    ws.getRow(4).height = 4;
    const hdr = ws.getRow(5);
    ['No', '컬럼명', '데이터타입', 'NULL', 'PK', '기본값', '설명'].forEach((h, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinBorder();
    });
    hdr.height = 20;

    t.columns.forEach((col, ci) => {
      const row = ws.addRow([
        ci + 1,
        col.COLUMN_NAME,
        colTypeStr(col),
        col.NULLABLE === 'N' ? 'NOT NULL' : 'NULL',
        col.IS_PK ? 'PK' : '',
        defaultStr(col),
        col.COMMENTS || '',
      ]);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      if (col.IS_PK) {
        row.getCell(2).font = { bold: true, color: { argb: 'FFB71C1C' } };
        row.getCell(5).font = { bold: true, color: { argb: 'FFB71C1C' } };
      }
      row.eachCell({ includeEmpty: true }, c => { c.border = thinBorder(); });
    });

    // Indexes section
    if (t.indexes.length) {
      ws.addRow([]);
      const ih = ws.addRow(['■ 인덱스']);
      ih.getCell(1).font = { bold: true, color: { argb: 'FF1A237E' } };
      t.indexes.forEach(ix => {
        ws.addRow([
          '',
          ix.name,
          ix.unique ? 'UNIQUE' : 'NONUNIQUE',
          `(${ix.columns.join(', ')})`,
        ]);
      });
    }

    // Foreign keys section
    if (t.foreignKeys.length) {
      ws.addRow([]);
      const fh = ws.addRow(['■ 외래키 (FK)']);
      fh.getCell(1).font = { bold: true, color: { argb: 'FF1A237E' } };
      t.foreignKeys.forEach(fk => {
        ws.addRow([
          '',
          fk.column,
          '→',
          `${fk.refOwner}.${fk.refTable}.${fk.refColumn}`,
        ]);
      });
    }
  });

  return wb.xlsx.writeBuffer();
}

function thinBorder() {
  const s = { style: 'thin', color: { argb: 'FFBDBDBD' } };
  return { top: s, left: s, bottom: s, right: s };
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export function buildPdf(tables) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false, bufferPages: true });
    doc.registerFont('kr', FONT_REGULAR);
    doc.registerFont('kr-bold', FONT_BOLD);

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page ? doc.page.width : 595;
    const LEFT = 40;
    const RIGHT = 555; // A4 width 595 - margin 40

    // ── Index page ──
    doc.addPage();
    doc.font('kr-bold').fontSize(22).fillColor('#1a237e').text('테이블 명세서', LEFT, 50);
    doc.font('kr').fontSize(10).fillColor('#666')
      .text(`생성일시: ${new Date().toLocaleString('ko-KR')}    ·    총 ${tables.length}개 테이블`, LEFT, 84);

    doc.moveTo(LEFT, 104).lineTo(RIGHT, 104).strokeColor('#cccccc').stroke();

    let y = 120;
    doc.font('kr-bold').fontSize(11).fillColor('#000');
    doc.text('No', LEFT, y, { width: 30 });
    doc.text('테이블명', LEFT + 36, y, { width: 180 });
    doc.text('설명', LEFT + 220, y, { width: 290 });
    y += 18;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor('#cccccc').stroke();
    y += 6;

    doc.font('kr').fontSize(10).fillColor('#222');
    tables.forEach((t, i) => {
      if (y > 780) { doc.addPage(); y = 50; }
      const rowH = Math.max(
        doc.heightOfString(t.name, { width: 180 }),
        doc.heightOfString(t.comment || '-', { width: 290 }),
      ) + 6;
      doc.fillColor('#222').text(String(i + 1), LEFT, y, { width: 30 });
      doc.fillColor('#1565c0').text(t.name, LEFT + 36, y, { width: 180 });
      doc.fillColor('#444').text(t.comment || '-', LEFT + 220, y, { width: 290 });
      y += rowH;
      doc.moveTo(LEFT, y - 3).lineTo(RIGHT, y - 3).strokeColor('#eeeeee').stroke();
    });

    // ── One section per table, each as a new page + outline bookmark ──
    tables.forEach(t => {
      doc.addPage();
      doc.outline.addItem(`${t.name}${t.comment ? ' (' + t.comment + ')' : ''}`);

      doc.font('kr-bold').fontSize(16).fillColor('#1a237e')
        .text(`${t.schema}.${t.name}`, LEFT, 45);
      doc.font('kr').fontSize(10).fillColor('#444')
        .text(t.comment ? `설명: ${t.comment}` : '설명: -', LEFT, 70, { width: RIGHT - LEFT });

      let cy = 96;
      // Column grid header
      const cols = [
        { label: 'No', x: LEFT, w: 28 },
        { label: '컬럼명', x: LEFT + 28, w: 120 },
        { label: '데이터타입', x: LEFT + 148, w: 95 },
        { label: 'NULL', x: LEFT + 243, w: 55 },
        { label: 'PK', x: LEFT + 298, w: 28 },
        { label: '기본값', x: LEFT + 326, w: 90 },
        { label: '설명', x: LEFT + 416, w: RIGHT - (LEFT + 416) },
      ];
      const drawHeader = (yy) => {
        doc.rect(LEFT, yy - 2, RIGHT - LEFT, 18).fill('#37474f');
        doc.font('kr-bold').fontSize(9).fillColor('#fff');
        cols.forEach(c => doc.text(c.label, c.x + 2, yy + 2, { width: c.w - 4, ellipsis: true }));
        return yy + 18;
      };
      cy = drawHeader(cy);

      doc.font('kr').fontSize(8.5).fillColor('#222');
      t.columns.forEach((col, ci) => {
        const cells = [
          String(ci + 1),
          col.COLUMN_NAME,
          colTypeStr(col),
          col.NULLABLE === 'N' ? 'NOT NULL' : 'NULL',
          col.IS_PK ? 'PK' : '',
          defaultStr(col),
          col.COMMENTS || '',
        ];
        const rowH = Math.max(
          14,
          ...cells.map((v, ix) => doc.heightOfString(String(v), { width: cols[ix].w - 4 })),
        ) + 4;
        if (cy + rowH > 800) { doc.addPage(); cy = drawHeader(50); doc.font('kr').fontSize(8.5).fillColor('#222'); }
        if (ci % 2 === 1) doc.rect(LEFT, cy - 1, RIGHT - LEFT, rowH).fill('#f5f5f5');
        doc.fillColor(col.IS_PK ? '#b71c1c' : '#222');
        cells.forEach((v, ix) => {
          doc.font(col.IS_PK && (ix === 1 || ix === 4) ? 'kr-bold' : 'kr')
            .text(String(v), cols[ix].x + 2, cy + 1, { width: cols[ix].w - 4, ellipsis: ix < 6 });
        });
        doc.fillColor('#222');
        cy += rowH;
      });

      // Indexes
      if (t.indexes.length) {
        cy += 10;
        if (cy > 770) { doc.addPage(); cy = 50; }
        doc.font('kr-bold').fontSize(10).fillColor('#1a237e').text('■ 인덱스', LEFT, cy);
        cy += 16;
        doc.font('kr').fontSize(9).fillColor('#333');
        t.indexes.forEach(ix => {
          if (cy > 800) { doc.addPage(); cy = 50; }
          doc.text(`• ${ix.name} ${ix.unique ? '[UNIQUE]' : ''} (${ix.columns.join(', ')})`, LEFT + 8, cy, { width: RIGHT - LEFT - 8 });
          cy += 14;
        });
      }

      // Foreign keys
      if (t.foreignKeys.length) {
        cy += 10;
        if (cy > 770) { doc.addPage(); cy = 50; }
        doc.font('kr-bold').fontSize(10).fillColor('#1a237e').text('■ 외래키 (FK)', LEFT, cy);
        cy += 16;
        doc.font('kr').fontSize(9).fillColor('#333');
        t.foreignKeys.forEach(fk => {
          if (cy > 800) { doc.addPage(); cy = 50; }
          doc.text(`• ${fk.column} → ${fk.refOwner}.${fk.refTable}.${fk.refColumn}`, LEFT + 8, cy, { width: RIGHT - LEFT - 8 });
          cy += 14;
        });
      }
    });

    doc.end();
  });
}
