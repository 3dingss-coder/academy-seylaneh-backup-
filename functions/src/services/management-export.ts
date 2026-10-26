import { z } from 'zod';
import type { Deps } from './context';
import type { Doc } from '../store/types';
import type { User, Attempt } from '../domain/types';
import { completionRows, loadMembers, quizResultRows, reportBound } from './reports';
import { managerMarketers, effectiveManagerProvinces } from './team-scope';
import { createManagementReport } from '../reporting/document';
import { ApiError } from '../http/errors';

export const managementExportQuery = z.object({
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
  period: z.enum(['1', '7', '30', '90', '180', 'all', 'custom']).default('30'),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  province: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  brand: z.string().max(200).default(''),
  product: z.string().max(300).default(''),
});
export type ManagementExportQuery = z.infer<typeof managementExportQuery>;
export async function loadManagementReport(
  d: Deps,
  manager: Doc<User>,
  query: ManagementExportQuery,
) {
  const now = d.clock().getTime();
  const validDate = (value: string | undefined) =>
    !value ||
    (Number.isFinite(Date.parse(value)) &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) === value));
  if (!validDate(query.from) || !validDate(query.to))
    throw new ApiError('VALIDATION', 'تاریخ گزارش معتبر نیست.');
  const from = query.from
    ? reportBound(query.from, 'start')
    : query.period === 'all'
      ? null
      : now - Number(query.period) * 86400000;
  const requestedTo = query.to ? reportBound(query.to, 'end') : now;
  const to = Math.min(requestedTo, now);
  if (
    !Number.isFinite(requestedTo) ||
    requestedTo > now + 86400000 ||
    (from !== null && (!Number.isFinite(from) || from > to)) ||
    (query.period === 'custom' && !query.from)
  )
    throw new ApiError('VALIDATION', 'بازه زمانی گزارش معتبر نیست.');
  const users = await managerMarketers(d, manager);
  if (
    query.province &&
    !users.some((u) => u.province === query.province) &&
    !effectiveManagerProvinces(manager).includes(query.province)
  )
    throw new ApiError('FORBIDDEN', 'این استان در محدوده مدیریت شما نیست.');
  const [members, attempts] = await Promise.all([
    loadMembers(d, users),
    d.store.query<Attempt>({
      collection: 'attempts',
      where: [
        ...(from !== null
          ? [['submittedAt', '>=', new Date(from).toISOString()] as [string, '>=', string]]
          : []),
        ['submittedAt', '<=', new Date(to).toISOString()],
      ],
    }),
  ]);
  const rows = completionRows(members, {}, new Date(now));
  const allowed = new Set(rows.map((r) => `${r.userId}|${r.packageId}`));
  const quizzes = quizResultRows(
    members,
    attempts.filter((a) => allowed.has(`${a.userId}|${a.packageId}`)),
    {},
  ).attempts;
  const filters = {
    ...query,
    ...(from !== null ? { from: new Date(from).toISOString() } : {}),
    to: new Date(to).toISOString(),
  };
  return createManagementReport(
    rows,
    quizzes,
    users,
    filters,
    manager.name,
    effectiveManagerProvinces(manager).join('، ') || 'تیم تحت مدیریت',
    now,
  );
}
export async function exportManagementReport(
  d: Deps,
  manager: Doc<User>,
  query: ManagementExportQuery,
) {
  const report = await loadManagementReport(d, manager, query);
  const bytes =
    query.format === 'pdf'
      ? (await import('../reporting/pdf')).renderManagementPdf(report)
      : await (await import('../reporting/workbook')).renderManagementWorkbook(report);
  return {
    filename: `manager-learning-report-${query.period}-${new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-')}.${query.format}`,
    bytes,
    mimeType:
      query.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    caption: `گزارش مدیریتی آموزش\nمدیر: ${manager.name}\nمحدوده: ${report.scopeName}\n${report.period}`,
    memberCount: report.snapshot.teamMembers,
  };
}
