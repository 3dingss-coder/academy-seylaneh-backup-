import { toGregorian, toJalali, jalaliMonthLength } from './jalali';
export function parseReportDateRange(text: string): { from: string; to: string } | null {
  const normalized = text
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .trim();
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+تا\s+(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(
    normalized,
  );
  if (!match) return null;
  const date = (offset: number) => {
    let y = Number(match[offset]),
      m = Number(match[offset + 1]),
      d = Number(match[offset + 2]);
    if (m < 1 || m > 12 || d < 1) return null;
    if (y >= 1300 && y < 1700) {
      if (d > jalaliMonthLength(y, m)) return null;
      const original = [y, m, d];
      [y, m, d] = toGregorian(y, m, d);
      if (toJalali(y, m, d).join() !== original.join()) return null;
    }
    const value = new Date(Date.UTC(y, m - 1, d));
    if (value.getUTCFullYear() !== y || value.getUTCMonth() !== m - 1 || value.getUTCDate() !== d)
      return null;
    return value.toISOString().slice(0, 10);
  };
  const from = date(1),
    to = date(4);
  return from && to && from <= to ? { from, to } : null;
}
