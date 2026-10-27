import { compactReportTable } from './compact';
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
  const newPage = (title = report.title) => {
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
  let y = H; // Keep the dashboard on its own page; detail sections share available space.
  for (const source of report.tables) {
    const table = compactReportTable(source);
    const totalWidth = table.widths.reduce((sum, w) => sum + w, 0);
    const widths = table.widths.map((w) => (usable * w) / totalWidth);
    doc.setFontSize(8);
    const headingHeight =
      Math.max(
        1,
        ...table.columns.map(
          (v, i) => (doc.splitTextToSize(fa(v), (widths[i] ?? 20) - 4) as string[]).length,
        ),
      ) *
        4.2 +
      5;
    doc.setFontSize(8.5);
    const firstRowHeight =
      Math.max(
        1,
        ...(table.rows[0] ?? []).map(
          (v, i) => (doc.splitTextToSize(fa(v), (widths[i] ?? 20) - 4) as string[]).length,
        ),
      ) *
        4.4 +
      5;
    doc.setFontSize(8);
    const noteHeight = (doc.splitTextToSize(fa(table.note), usable) as string[]).length * 4.2;
    const drawColumns = () => {
      doc.setFillColor(`#${T.primary}`);
      doc.rect(M, y, usable, headingHeight, 'F');
      let x = W - M;
      table.columns.forEach((label, i) => {
        text(label, x - 2, y + 4.5, 8, 'FFFFFF', (widths[i] ?? 20) - 4);
        x -= widths[i] ?? 0;
      });
      y += headingHeight;
    };
    if (y + 10 + 6 + noteHeight + 3 + headingHeight + firstRowHeight > H - 17) {
      newPage();
      y = 44;
    } else y += 10;
    text(
      `${table.name} · ${table.rows.length.toLocaleString('fa-IR')} رکورد`,
      W - M,
      y,
      12,
      T.primary,
    );
    y += 6;
    y += text(table.note, W - M, y, 8, T.muted, usable) + 3;
    drawColumns();
    if (!table.rows.length) {
      text('رکوردی در این محدوده و بازه ثبت نشده است.', W - M - 3, y + 7, 9, T.muted);
      y += 14;
      continue;
    }
    for (let index = 0; index < table.rows.length; index++) {
      const row = table.rows[index] ?? [];
      doc.setFontSize(8.5);
      const lines = row.map(
        (value, i) => doc.splitTextToSize(fa(value), (widths[i] ?? 20) - 4) as string[],
      );
      const height = Math.max(1, ...lines.map((v) => v.length)) * 4.4 + 5;
      if (y + height > H - 17) {
        newPage(table.name);
        y = 44;
        drawColumns();
      }
      doc.setFillColor(index % 2 ? '#F1F5F9' : '#FFFFFF');
      doc.rect(M, y, usable, height, 'F');
      let x = W - M;
      row.forEach((value, i) => {
        text(value, x - 2, y + 4.5, 8.5, T.ink, (widths[i] ?? 20) - 4);
        x -= widths[i] ?? 0;
      });
      doc.setDrawColor(`#${T.border}`);
      doc.line(M, y + height, W - M, y + height);
      y += height;
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
