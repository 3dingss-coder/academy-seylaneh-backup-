import type { ReportTable } from './document';

/** Every source column is retained; related fields share one readable table cell. */
export function compactReportTable(table: ReportTable): ReportTable {
  const layouts: Record<string, { groups: number[][]; headers: string[]; widths: number[] }> = {
    'تکمیل آموزش': {
      groups: [
        [0, 1],
        [2, 3],
        [4, 5, 6],
        [7, 8],
        [9, 10, 13],
        [11, 12],
        [14, 15],
      ],
      headers: [
        'بازاریاب / تماس',
        'استان / شهر',
        'آموزش / برند / محصول',
        'پیشرفت / وضعیت',
        'دیرکرد / پیگیری / به‌موقع',
        'مهلت / تکمیل',
        'فعالیت / محل توقف',
      ],
      widths: [35, 23, 59, 28, 33, 48, 43],
    },
    'تلاش‌های آزمون': {
      groups: [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7],
        [8, 9],
        [10, 11],
        [12, 13],
      ],
      headers: [
        'بازاریاب / محدوده',
        'آموزش / برند / محصول',
        'آزمون / تلاش',
        'نمره / حدنصاب',
        'درست / غلط',
        'نتیجه / زمان ثبت',
      ],
      widths: [39, 65, 48, 28, 28, 61],
    },
    بازاریاب‌ها: {
      groups: [[0, 1], [2, 3], [4], [5, 6], [7, 8], [9]],
      headers: [
        'بازاریاب / تماس',
        'استان / شهر',
        'حساب',
        'تخصیص / تکمیل فعلی',
        'تکمیل / آزمون در بازه',
        'نیازمند پیگیری',
      ],
      widths: [55, 45, 30, 48, 50, 41],
    },
  };
  const layout = layouts[table.name];
  if (!layout) return table;
  return {
    ...table,
    columns: layout.headers,
    widths: layout.widths,
    rows: table.rows.map((row) =>
      layout.groups.map((group) => group.map((i) => String(row[i] ?? '—')).join('\n')),
    ),
  };
}
