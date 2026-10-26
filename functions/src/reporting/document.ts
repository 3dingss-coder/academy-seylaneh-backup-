import {
  buildManagerReportSnapshot,
  type CompletionRow,
  type QuizAttemptRow,
  type ManagerMemberRow,
  type ManagerReportFilters,
} from './model';

export const REPORT_THEME = {
  primary: '047857',
  deep: '064E3B',
  light: 'ECFDF5',
  ink: '0F172A',
  muted: '64748B',
  border: 'E2E8F0',
  background: 'F8FAFC',
  danger: 'B91C1C',
  warning: 'B45309',
};
export interface ReportTable {
  name: string;
  note: string;
  columns: string[];
  widths: number[];
  rows: Array<Array<string | number | null>>;
}
export const reportDate = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('fa-IR', {
        timeZone: 'Asia/Tehran',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(v))
    : '—';
export function createManagementReport(
  rows: CompletionRow[],
  attempts: QuizAttemptRow[],
  members: ManagerMemberRow[],
  filters: ManagerReportFilters,
  managerName: string,
  scopeName: string,
  now: number,
) {
  const matches = (r: {
    brandName: string | null;
    productName: string | null;
    province: string | null;
    city: string | null;
  }) =>
    (!filters.brand || filters.brand === r.brandName) &&
    (!filters.product || filters.product === r.productName) &&
    (!filters.province || filters.province === r.province) &&
    (!filters.city || filters.city === r.city);
  const end = filters.to ? Date.parse(filters.to) : now;
  const start = filters.from
    ? Date.parse(filters.from)
    : filters.period === 'all'
      ? -Infinity
      : end - Number(filters.period) * 86400000;
  const inPeriod = (v: string | null) => !!v && Date.parse(v) >= start && Date.parse(v) <= end;
  const selected = rows.filter(matches);
  const quizzes = attempts.filter((r) => matches(r) && inPeriod(r.submittedAt));
  const snapshot = buildManagerReportSnapshot(rows, attempts, members, filters, now);
  const status = { new: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل‌شده' };
  const location = [filters.province, filters.city].filter(Boolean).join('، ') || scopeName;
  const period = Number.isFinite(start)
    ? `${reportDate(new Date(start).toISOString())} تا ${reportDate(new Date(end).toISOString())}`
    : `کل بازه تا ${reportDate(new Date(end).toISOString())}`;
  const selectedIds = new Set(selected.map((r) => r.userId));
  const roster = members.filter(
    (m) =>
      (!filters.province || m.province === filters.province) &&
      (!filters.city || m.city === filters.city) &&
      ((!filters.brand && !filters.product) || selectedIds.has(m.id)),
  );

  const tables: ReportTable[] = [
    {
      name: 'تکمیل آموزش',
      note: 'وضعیت فعلی آموزش‌ها در محدوده انتخابی؛ تاریخ‌های تکمیل و آخرین فعالیت جداگانه ثبت شده‌اند.',
      columns: [
        'نام عضو',
        'شماره',
        'استان',
        'شهر',
        'آموزش',
        'برند',
        'محصول',
        'پیشرفت (٪)',
        'وضعیت',
        'دیرکرد',
        'نیازمند پیگیری',
        'مهلت',
        'تکمیل',
        'به‌موقع',
        'آخرین فعالیت',
        'گیر کرده در',
      ],
      widths: [24, 17, 17, 17, 38, 24, 32, 15, 20, 14, 19, 24, 24, 14, 24, 30],
      rows: selected.map((r) => [
        r.userName,
        r.phone ?? null,
        r.province,
        r.city,
        r.packageTitle,
        r.brandName,
        r.productName,
        r.percent,
        status[r.status],
        r.overdue ? 'بله' : 'خیر',
        r.lagging ? 'بله' : 'خیر',
        reportDate(r.deadlineAt),
        reportDate(r.completedAt),
        r.onTime === null ? '—' : r.onTime ? 'بله' : 'خیر',
        reportDate(r.lastActivityAt),
        r.stuckAt,
      ]),
    },
    {
      name: 'تلاش‌های آزمون',
      note: 'فقط تلاش‌های ثبت‌شده در بازه انتخابی؛ زمان شروع آزمون مبنای فیلتر نیست.',
      columns: [
        'نام عضو',
        'استان',
        'شهر',
        'آموزش',
        'برند',
        'محصول',
        'بخش آزمون',
        'شماره تلاش',
        'نمره (٪)',
        'حدنصاب',
        'درست',
        'غلط',
        'نتیجه',
        'ثبت‌شده در',
      ],
      widths: [24, 17, 17, 38, 24, 32, 30, 16, 15, 14, 12, 12, 22, 24],
      rows: quizzes.map((r) => [
        r.userName,
        r.province,
        r.city,
        r.packageTitle,
        r.brandName,
        r.productName,
        r.sectionTitle,
        r.attemptNumber,
        r.score,
        r.passScore,
        r.correct,
        r.wrong,
        r.passed === null ? 'نامشخص' : r.passed ? 'قبول' : 'نیازمند تکرار',
        reportDate(r.submittedAt),
      ]),
    },
    {
      name: 'عملکرد محصول',
      note: 'وضعیت فعلی محصولات همراه با تکمیل‌های ثبت‌شده در بازه انتخابی.',
      columns: [
        'برند',
        'محصول / آموزش',
        'تخصیص‌یافته فعلی',
        'تکمیل‌شده فعلی',
        'نرخ تکمیل فعلی (٪)',
        'دیرکرد فعلی',
        'تکمیل در بازه',
      ],
      widths: [26, 42, 22, 22, 24, 20, 22],
      rows: snapshot.products.map((p) => [
        p.brand,
        p.product,
        p.assigned,
        p.completed,
        p.rate,
        p.overdue,
        selected.filter(
          (r) =>
            (r.brandName ?? 'برند ثبت‌نشده') === p.brand &&
            (r.productName ?? r.packageTitle) === p.product &&
            inPeriod(r.completedAt),
        ).length,
      ]),
    },
    {
      name: 'تفکیک منطقه',
      note: 'آمار فعلی محدوده به تفکیک استان و عملکرد ثبت‌شده در بازه انتخابی.',
      columns: [
        'استان',
        'اعضا',
        'تخصیص‌یافته فعلی',
        'تکمیل‌شده فعلی',
        'نرخ تکمیل فعلی (٪)',
        'دیرکرد فعلی',
        'تکمیل در بازه',
        'تلاش آزمون در بازه',
      ],
      widths: [26, 16, 22, 22, 24, 20, 22, 24],
      rows: snapshot.regions.map((p) => [
        p.province,
        p.members,
        p.assigned,
        p.completed,
        p.rate,
        p.overdue,
        selected.filter(
          (r) => (r.province ?? 'استان ثبت‌نشده') === p.province && inPeriod(r.completedAt),
        ).length,
        quizzes.filter((r) => (r.province ?? 'استان ثبت‌نشده') === p.province).length,
      ]),
    },
  ];
  tables.push({
    name: 'بازاریاب‌ها',
    note: 'همه بازاریاب‌های محدوده، حتی افراد بدون آموزش یا فعالیت در بازه.',
    columns: [
      'نام بازاریاب',
      'شماره',
      'استان',
      'شهر',
      'وضعیت حساب',
      'آموزش تخصیص‌یافته فعلی',
      'تکمیل‌شده فعلی',
      'تکمیل در بازه',
      'تلاش آزمون در بازه',
      'نیازمند پیگیری',
    ],
    widths: [28, 18, 18, 18, 18, 24, 22, 22, 24, 22],
    rows: roster.map((m) => [
      m.name ?? '—',
      m.phone ?? null,
      m.province,
      m.city,
      m.status === 'active' ? 'فعال' : 'غیرفعال',
      selected.filter((r) => r.userId === m.id).length,
      selected.filter((r) => r.userId === m.id && r.status === 'completed').length,
      selected.filter((r) => r.userId === m.id && inPeriod(r.completedAt)).length,
      quizzes.filter((r) => r.userId === m.id).length,
      selected.filter((r) => r.userId === m.id && r.lagging).length,
    ]),
  });

  return {
    title: 'گزارش مدیریتی آموزش',
    managerName,
    scopeName: location,
    period,
    generatedAt: new Date(now).toISOString(),
    snapshot,
    tables,
    kpis: [
      { label: 'اعضای فعال', value: snapshot.activeMembers, unit: 'نفر', context: 'محدوده فعلی' },
      {
        label: 'تکمیل در بازه',
        value: snapshot.completedInPeriod,
        unit: 'آموزش',
        context: 'بازه انتخابی',
      },
      { label: 'نرخ تکمیل', value: snapshot.completionRate, unit: '٪', context: 'وضعیت فعلی' },
      { label: 'نیازمند پیگیری', value: snapshot.lagging, unit: 'آموزش', context: 'وضعیت فعلی' },
      { label: 'تلاش آزمون', value: snapshot.quizAttempts, unit: 'تلاش', context: 'بازه انتخابی' },
      { label: 'نرخ قبولی', value: snapshot.quizPassRate, unit: '٪', context: 'بازه انتخابی' },
      { label: 'میانگین نمره', value: snapshot.averageScore, unit: '٪', context: 'بازه انتخابی' },
      { label: 'دیرکرد', value: snapshot.overdue, unit: 'آموزش', context: 'وضعیت فعلی' },
    ],
    priorities: selected
      .filter((r) => r.lagging)
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.percent - b.percent)
      .slice(0, 6)
      .map((r) => ({
        name: r.userName,
        training: r.packageTitle,
        reason: r.overdue ? 'مهلت گذشته' : 'نیازمند پیگیری',
        progress: r.percent,
      })),
  };
}
export type ManagementReport = ReturnType<typeof createManagementReport>;
