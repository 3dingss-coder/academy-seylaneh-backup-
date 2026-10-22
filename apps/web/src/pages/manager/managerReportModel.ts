import type { CompletionRow, ManagerMemberRow, QuizAttemptRow } from '@/lib/types';

export type ReportPeriod = '30' | '90' | '180' | 'all';
export interface ManagerReportFilters {
  period: ReportPeriod;
  brand: string;
  product: string;
  province: string;
  city: string;
}
export interface TrendBucket { label: string; startAt: number; endAt: number; completed: number }
export interface ProductPerformance { brand: string; product: string; assigned: number; completed: number; overdue: number; rate: number }
export interface RegionPerformance { province: string; assigned: number; completed: number; overdue: number; members: number; rate: number }
export interface ManagerReportSnapshot {
  assignments: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  lagging: number;
  completionRate: number | null;
  onTimeRate: number | null;
  averageProgress: number | null;
  completedInPeriod: number;
  previousPeriodCompleted: number | null;
  trend: TrendBucket[];
  quizAttempts: number;
  quizScoredAttempts: number;
  quizPassed: number;
  quizPassRate: number | null;
  averageScore: number | null;
  products: ProductPerformance[];
  regions: RegionPerformance[];
  activeMembers: number;
  teamMembers: number;
}

const matchesScope = (
  row: { brandName: string | null; productName: string | null; province: string | null; city: string | null },
  filters: ManagerReportFilters,
) =>
  (!filters.brand || row.brandName === filters.brand) &&
  (!filters.product || row.productName === filters.product) &&
  (!filters.province || row.province === filters.province) &&
  (!filters.city || row.city === filters.city);

function timeWindow(period: ReportPeriod, now: number): { start: number; duration: number } {
  const days = period === 'all' ? 180 : Number(period);
  const duration = days * 24 * 60 * 60 * 1000;
  return { start: now - duration, duration };
}

export function buildManagerReportSnapshot(
  completionRows: CompletionRow[],
  attempts: QuizAttemptRow[],
  members: ManagerMemberRow[],
  filters: ManagerReportFilters,
  now = Date.now(),
): ManagerReportSnapshot {
  const rows = completionRows.filter((row) => matchesScope(row, filters));
  const periodStart = timeWindow(filters.period, now).start;
  const selectedAttempts = attempts.filter((attempt) => {
    if (!matchesScope(attempt, filters) || !attempt.submittedAt) return false;
    const timestamp = Date.parse(attempt.submittedAt);
    return Number.isFinite(timestamp) && timestamp <= now && (filters.period === 'all' || timestamp >= periodStart);
  });
  const completedRows = rows.filter((row) => row.status === 'completed');
  const completedInPeriod = rows.filter((row) => {
    if (!row.completedAt) return false;
    const time = Date.parse(row.completedAt);
    return Number.isFinite(time) && time <= now && (filters.period === 'all' || time >= periodStart);
  }).length;
  const previousPeriodCompleted = filters.period === 'all' ? null : rows.filter((row) => {
    if (!row.completedAt) return false;
    const time = Date.parse(row.completedAt);
    const { start, duration } = timeWindow(filters.period, now);
    return time >= start - duration && time < start;
  }).length;
  const { start: trendStart, duration: trendDuration } = timeWindow(filters.period, now);
  const trendCount = 6;
  const trend = Array.from({ length: trendCount }, (_, index) => {
    const bucketStart = trendStart + (trendDuration / trendCount) * index;
    const bucketEnd = trendStart + (trendDuration / trendCount) * (index + 1);
    return {
      label: new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(bucketStart)),
      startAt: bucketStart,
      endAt: bucketEnd,
      completed: 0,
    };
  });
  for (const row of rows) {
    if (!row.completedAt) continue;
    const timestamp = Date.parse(row.completedAt);
    if (timestamp < trendStart || timestamp > now) continue;
    const index = Math.min(trendCount - 1, Math.floor(((timestamp - trendStart) / trendDuration) * trendCount));
    const bucket = trend[index];
    if (bucket) bucket.completed++;
  }
  const scoredAttempts = selectedAttempts.filter((attempt) => attempt.passed !== null);
  const scores = selectedAttempts.map((attempt) => attempt.score).filter((score): score is number => score !== null);
  const passedAttempts = scoredAttempts.filter((attempt) => attempt.passed === true).length;
  const assigned = rows.length;
  const completed = completedRows.length;
  const onTime = completedRows.filter((row) => row.onTime !== null);
  const productMap = new Map<string, ProductPerformance>();
  for (const row of rows) {
    const brand = row.brandName ?? 'برند ثبت‌نشده';
    const product = row.productName ?? row.packageTitle;
    const key = `${brand}\u0000${product}`;
    const item = productMap.get(key) ?? { brand, product, assigned: 0, completed: 0, overdue: 0, rate: 0 };
    item.assigned++;
    if (row.status === 'completed') item.completed++;
    if (row.overdue) item.overdue++;
    item.rate = Math.round((item.completed / item.assigned) * 100);
    productMap.set(key, item);
  }
  const regionMap = new Map<string, RegionPerformance & { memberIds: Set<string> }>();
  for (const row of rows) {
    const province = row.province ?? 'استان ثبت‌نشده';
    const area = regionMap.get(province) ?? { province, assigned: 0, completed: 0, overdue: 0, members: 0, rate: 0, memberIds: new Set<string>() };
    area.assigned++;
    area.memberIds.add(row.userId);
    if (row.status === 'completed') area.completed++;
    if (row.overdue) area.overdue++;
    area.members = area.memberIds.size;
    area.rate = Math.round((area.completed / area.assigned) * 100);
    regionMap.set(province, area);
  }
  const selectedMemberIds = new Set(rows.map((row) => row.userId));
  const filteredMembers = members.filter((member) =>
    (!filters.province || member.province === filters.province) &&
    (!filters.city || member.city === filters.city) &&
    ((!filters.brand && !filters.product) || selectedMemberIds.has(member.id)),
  );

  return {
    assignments: assigned,
    completed,
    inProgress: rows.filter((row) => row.status === 'in_progress').length,
    notStarted: rows.filter((row) => row.status === 'new').length,
    overdue: rows.filter((row) => row.overdue).length,
    lagging: rows.filter((row) => row.lagging).length,
    completionRate: assigned ? Math.round((completed / assigned) * 100) : null,
    onTimeRate: onTime.length ? Math.round((onTime.filter((row) => row.onTime === true).length / onTime.length) * 100) : null,
    averageProgress: assigned ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / assigned) : null,
    completedInPeriod,
    previousPeriodCompleted,
    trend,
    quizAttempts: selectedAttempts.length,
    quizScoredAttempts: scoredAttempts.length,
    quizPassed: passedAttempts,
    quizPassRate: scoredAttempts.length ? Math.round((passedAttempts / scoredAttempts.length) * 100) : null,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    products: [...productMap.values()].sort((a, b) => b.assigned - a.assigned || a.product.localeCompare(b.product, 'fa')),
    regions: [...regionMap.values()].map(({ memberIds: _memberIds, ...area }) => { void _memberIds; return area; }).sort((a, b) => b.assigned - a.assigned || a.province.localeCompare(b.province, 'fa')),
    activeMembers: filteredMembers.filter((member) => member.status === 'active').length,
    teamMembers: filteredMembers.length,
  };
}

export function listReportOptions(rows: CompletionRow[]) {
  return {
    brands: [...new Set(rows.map((row) => row.brandName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fa')),
    products: [...new Set(rows.map((row) => row.productName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fa')),
    provinces: [...new Set(rows.map((row) => row.province).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fa')),
    citiesByProvince: rows.reduce<Record<string, string[]>>((out, row) => {
      if (!row.province || !row.city) return out;
      const cities = new Set(out[row.province] ?? []);
      cities.add(row.city);
      out[row.province] = [...cities].sort((a, b) => a.localeCompare(b, 'fa'));
      return out;
    }, {}),
  };
}
