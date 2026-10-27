import { describe, it, expect } from 'vitest';
import { compactReportTable } from '../src/reporting/compact';
import { createManagementReport } from '../src/reporting/document';
import { renderManagementPdf } from '../src/reporting/pdf';

describe('compact managerial report layout', () => {
  it('groups every original detail field without dropping values', () => {
    for (const [name, count] of [
      ['تکمیل آموزش', 16],
      ['تلاش‌های آزمون', 14],
      ['بازاریاب‌ها', 10],
    ] as const) {
      const original = Array.from({ length: count }, (_, i) => `field-${i}`);
      const table = compactReportTable({
        name,
        note: '',
        columns: original,
        widths: original.map(() => 20),
        rows: [original],
      });
      expect(table.columns.length).toBeLessThan(count);
      expect(table.rows[0]?.flatMap((v) => String(v).split('\n')).sort()).toEqual(
        [...original].sort(),
      );
    }
  });
  it('packs sixteen complete records into a few pages with Persian text and all remaining sections', () => {
    const report = createManagementReport(
      [],
      [],
      [],
      { period: '30', brand: '', product: '', province: '', city: '' },
      'مدیر نمونه',
      'تهران',
      Date.parse('2026-10-26T10:00:00Z'),
    );
    const table = report.tables[0];
    if (!table) throw Error('Missing table');
    table.rows = Array.from({ length: 16 }, (_, i) => [
      'مدیر ' + i,
      '09120000000',
      'تهران',
      'تهران',
      'آموزش شناخت محصول',
      'سیلانه',
      'محصول',
      75,
      'در حال انجام',
      'خیر',
      'بله',
      '۴ آبان ۱۴۰۵',
      '—',
      '—',
      '۴ آبان ۱۴۰۵',
      'بخش آزمون',
    ]);
    const bytes = renderManagementPdf(report);
    const pages = new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThan(1);
    expect(pages).toBeLessThanOrEqual(5);
  });
});
