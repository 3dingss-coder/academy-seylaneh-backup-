import { z } from 'zod';
import { dayKey, zonedParts } from '../lib/time';
import type { User } from '../domain/types';

export function normalizeReportTime(value: string): string | null {
  const time = value.trim().replace(/[۰-۹٠-٩]/g, (d) => {
    const p = '۰۱۲۳۴۵۶۷۸۹'.indexOf(d);
    return String(p >= 0 ? p : '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  });
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}
export const reportTimeSchema = z
  .string()
  .max(20)
  .transform((v, ctx) => {
    const time = normalizeReportTime(v);
    if (time) return time;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ساعت معتبر به شکل ۱۸:۳۰ وارد کنید.' });
    return z.NEVER;
  });
export const managerReportTime = (user: Pick<User, 'telegramReportTime'>, defaultHour = 9) =>
  normalizeReportTime(user.telegramReportTime ?? '') ??
  `${String(defaultHour).padStart(2, '0')}:00`;

/** Once a day, at/after the selected wall-clock minute. Past-time changes start tomorrow. */
export function isReportDue(user: User, now: Date, timezone: string, defaultHour = 9): boolean {
  const [hour, minute] = managerReportTime(user, defaultHour).split(':').map(Number);
  const target = (hour ?? 9) * 60 + (minute ?? 0);
  const parts = zonedParts(now, timezone);
  if (parts.hour * 60 + parts.minute < target) return false;
  if (user.telegramReportTimeUpdatedAt) {
    const changed = new Date(user.telegramReportTimeUpdatedAt);
    if (Number.isFinite(changed.getTime()) && dayKey(changed, timezone) === dayKey(now, timezone)) {
      const p = zonedParts(changed, timezone);
      if (p.hour * 60 + p.minute > target) return false;
    }
  }
  return true;
}
