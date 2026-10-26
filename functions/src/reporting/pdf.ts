import { jsPDF } from 'jspdf';
import { VAZIRMATN_TTF } from './font';
import { REPORT_THEME as T, type ManagementReport, reportDate } from './document';

/** Vector PDF with embedded Persian font, repeated headers and no dropped detail rows. */
export function renderManagementPdf(report: ManagementReport): Uint8Array {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.setCreationDate(new Date(report.generatedAt));
  doc.addFileToVFS('Vazirmatn.ttf', VAZIRMATN_TTF);
  doc.addFont('Vazirmatn.ttf', 'Vazirmatn', 'normal');
  doc.setFont('Vazirmatn');
  doc.setProperties({ title: report.title, author: 'آکادمی سیلانه', subject: report.period });
  const W = 297,
    H = 210,
    M = 14,
    usable = W - 2 * M;
  const fa = (v: string | number | null) =>
    v === null ? '—' : String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
  const text = (
    v: string | number | null,
    x: number,
    y: number,
    size = 10,
    color = T.ink,
    width?: number,
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(`#${color}`);
    doc.setR2L(false);
    const lines = width ? (doc.splitTextToSize(fa(v), width) as string[]) : [fa(v)];
    doc.text(lines, x, y, { align: 'right', lineHeightFactor: 1.45 });
    return lines.length * size * 0.3528 * 1.45;
  };
  const header = (title = report.title) => {
    doc.setFillColor(`#${T.deep}`);
    doc.rect(0, 0, W, 27, 'F');
    text(title, W - M, 12, 19, 'FFFFFF');
    text(
      `آکادمی سیلانه · ${report.managerName} · ${report.scopeName.length > 65 ? 'استان‌های مجاز مدیر (جزئیات در تفکیک منطقه)' : report.scopeName}`,
      W - M,
      21,
      10,
      'FFFFFF',
    );
    text(report.period, W - M, 35, 9, T.muted);
  };
  const newPage = (title: string) => {
    doc.addPage();
    header(title);
  };
  header();
  report.kpis.forEach((k, i) => {
    const col = i % 4,
      row = Math.floor(i / 4),
      w = (usable - 3 * 6) / 4,
      x = W - M - w - col * (w + 6),
      y = 43 + row * 31;
    doc.setFillColor(i === 3 || i === 7 ? '#FFFBEB' : '#ECFDF5');
    doc.roundedRect(x, y, w, 26, 3, 3, 'F');
    text(k.label, x + w - 4, y + 7, 10, T.muted);
    text(k.value, x + w - 4, y + 17, 21, i === 3 || i === 7 ? T.warning : T.primary);
    text(`${k.unit} · ${k.context}`, x + w - 4, y + 23, 8.5, T.muted);
  });
  text('روند تکمیل آموزش در بازه', W - M, 111, 12, T.primary);
  const max = Math.max(1, ...report.snapshot.trend.map((b) => b.completed));
  report.snapshot.trend.forEach((b, i) => {
    const w = usable / 6 - 7,
      x = W - M - ((i + 1) * usable) / 6 + 4,
      h = (22 * b.completed) / max;
    doc.setFillColor(`#${T.light}`);
    doc.roundedRect(x, 119, w, 25, 2, 2, 'F');
    if (h > 0) {
      doc.setFillColor(`#${T.primary}`);
      doc.roundedRect(x, 144 - h, w, h, 1, 1, 'F');
    }
    text(b.completed, x + w, 117, 9, T.primary);
    text(b.label, x + w, 150, 8, T.muted);
  });
  text('اولویت پیگیری · شش مورد نخست', W - M, 162, 12, T.primary);
  report.priorities.slice(0, 6).forEach((p, i) => {
    const row = i % 3,
      col = Math.floor(i / 3),
      x = W - M - col * (usable / 2 + 3);
    text(`${p.name} · ${p.reason} · ${p.progress}٪`, x, 171 + row * 7, 9, T.ink, usable / 2 - 6);
  });
  if (!report.priorities.length)
    text('موردی برای پیگیری در این محدوده ثبت نشده است.', W - M, 172, 10, T.muted);
  text(
    'بازه انتخابی: زمان ثبت تکمیل و ارسال آزمون. وضعیت فعلی: تصویر زمان تولید گزارش.',
    W - M,
    196,
    8,
    T.muted,
  );
  for (const table of report.tables) {
    newPage(table.name);
    let y = 44;
    text(table.note, W - M, y, 9, T.muted, usable);
    y += 14;
    if (!table.rows.length) {
      text('در این محدوده و بازه، رکوردی ثبت نشده است.', W - M, y, 11, T.muted);
      continue;
    }
    // Compact records retain every column at a readable size instead of shrinking a 16-column table.
    for (let index = 0; index < table.rows.length; index++) {
      const row = table.rows[index] ?? [];
      const groups = Array.from({ length: Math.ceil(table.columns.length / 4) }, (_, g) =>
        table.columns
          .slice(g * 4, g * 4 + 4)
          .map((label, c) => ({ label, value: row[g * 4 + c] ?? '—' })),
      );
      doc.setFontSize(9.5);
      const heights = groups.map(
        (group) =>
          Math.max(
            ...group.map(
              (cell) => (doc.splitTextToSize(fa(cell.value), usable / 4 - 9) as string[]).length,
            ),
            1,
          ) *
            5 +
          7,
      );
      const height = heights.reduce((a, b) => a + b, 0) + 12;
      if (y + height > H - 17) {
        newPage(table.name);
        y = 45;
      }
      doc.setFillColor(index % 2 ? '#F8FAFC' : '#FFFFFF');
      doc.setDrawColor(`#${T.border}`);
      doc.roundedRect(M, y, usable, height, 2, 2, 'FD');
      text(`ردیف ${index + 1}`, W - M - 4, y + 7, 9, T.primary);
      let gy = y + 13;
      groups.forEach((group, g) => {
        group.forEach((cell, c) => {
          const x = W - M - 5 - (c * usable) / 4;
          text(cell.label, x, gy, 8, T.muted);
          text(cell.value, x, gy + 5, 9.5, T.ink, usable / 4 - 9);
        });
        gy += heights[g] ?? 12;
      });
      y += height + 5;
    }
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    doc.setDrawColor(`#${T.border}`);
    doc.line(M, H - 12, W - M, H - 12);
    text(`آکادمی سیلانه · ${reportDate(report.generatedAt)} · تهران`, W - M, H - 7, 8, T.muted);
    text(`${page} از ${count}`, M + 17, H - 7, 8, T.muted);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
