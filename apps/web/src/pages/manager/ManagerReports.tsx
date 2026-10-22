import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Printer,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  GraduationCap,
  TrendingUp,
  AlertTriangle,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/ui/Table';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  KpiCard,
  ProgressBar,
  Skeleton,
  TableSkeleton,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { Tabs, Select } from '@/components/common/Field';
import { CompletionReport } from '@/components/reports/CompletionReport';
import { QuizResultsReport } from '@/components/reports/QuizResultsReport';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faDate, faNumber, faPercent } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import { downloadCsv, toCsv } from '@/lib/csv';
import { exportExcelSheets, type ExcelColumn } from '@/lib/excel';
import type {
  CompletionReport as CompletionData,
  CompletionRow,
  ManagerMembersResponse,
  QuizAttemptRow,
  QuizReport,
} from '@/lib/types';
import {
  buildManagerReportSnapshot,
  listReportOptions,
  type ManagerReportFilters,
  type ProductPerformance,
  type RegionPerformance,
  type ReportPeriod,
} from './managerReportModel';

const EMPTY_COMPLETION_ROWS: CompletionRow[] = [];
const EMPTY_QUIZ_ATTEMPTS: QuizAttemptRow[] = [];
const EMPTY_MEMBERS: ManagerMembersResponse['members'] = [];

/** Executive overview plus the full, filterable learning and quiz reports. */
export function ManagerReports() {
  const [searchParams] = useSearchParams();
  const completionQueryKeys = [
    'brand',
    'product',
    'user',
    'status',
    'team',
    'province',
    'city',
    'from',
    'to',
  ];
  const [tab, setTab] = useState<'executive' | 'completion' | 'quizzes'>(() =>
    completionQueryKeys.some((key) => searchParams.has(key)) ? 'completion' : 'executive',
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          title="گزارش مدیریتی"
          subtitle="تصویر قابل‌اقدام از یادگیری تیم، آموزش‌های عقب‌مانده و نتایج آزمون"
        />
        <Tabs
          label="بخش گزارش"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'executive', label: 'خلاصه مدیریتی' },
            { value: 'completion', label: 'تکمیل آموزش' },
            { value: 'quizzes', label: 'نتایج آزمون' },
          ]}
        />
      </div>
      {tab === 'executive' ? (
        <ManagerExecutiveReport />
      ) : tab === 'completion' ? (
        <ManagerCompletion />
      ) : (
        <ManagerQuizResults />
      )}
    </div>
  );
}

function ManagerExecutiveReport() {
  const completion = useQuery({
    queryKey: ['manager', 'executive', 'completion'],
    queryFn: ({ signal }) => api.get<CompletionData>('/manager/reports/completion', signal),
  });
  const quizzes = useQuery({
    queryKey: ['manager', 'report', 'quizzes'],
    queryFn: ({ signal }) => api.get<QuizReport>('/manager/reports/quizzes', signal),
  });
  const members = useQuery({
    queryKey: ['manager', 'members'],
    queryFn: ({ signal }) => api.get<ManagerMembersResponse>('/manager/members', signal),
  });
  const [filters, setFilters] = useState<ManagerReportFilters>({
    period: '30',
    brand: '',
    product: '',
    province: '',
    city: '',
  });
  const rows = completion.data?.rows ?? EMPTY_COMPLETION_ROWS;
  const attempts = quizzes.data?.attempts ?? EMPTY_QUIZ_ATTEMPTS;
  const memberRows = members.data?.members ?? EMPTY_MEMBERS;
  const options = useMemo(() => listReportOptions(rows), [rows]);
  const snapshot = useMemo(
    () => buildManagerReportSnapshot(rows, attempts, memberRows, filters),
    [attempts, filters, memberRows, rows],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!filters.brand || row.brandName === filters.brand) &&
          (!filters.product || row.productName === filters.product) &&
          (!filters.province || row.province === filters.province) &&
          (!filters.city || row.city === filters.city),
      ),
    [filters, rows],
  );
  const filteredAttempts = useMemo(() => {
    const now = Date.now();
    const periodStart =
      filters.period === 'all'
        ? Number.NEGATIVE_INFINITY
        : now - Number(filters.period) * 86_400_000;
    return attempts.filter((attempt) => {
      if (filters.brand && attempt.brandName !== filters.brand) return false;
      if (filters.product && attempt.productName !== filters.product) return false;
      if (filters.province && attempt.province !== filters.province) return false;
      if (filters.city && attempt.city !== filters.city) return false;
      if (!attempt.submittedAt) return false;
      const timestamp = Date.parse(attempt.submittedAt);
      return Number.isFinite(timestamp) && timestamp <= now && timestamp >= periodStart;
    });
  }, [attempts, filters]);
  const loading = completion.isPending || quizzes.isPending || members.isPending;
  const failed = completion.isError
    ? completion
    : quizzes.isError
      ? quizzes
      : members.isError
        ? members
        : null;
  const teamName = members.data?.team?.name ?? 'تیم من';
  const periodLabel =
    filters.period === 'all'
      ? 'کل بازهٔ موجود در داده‌ها'
      : `${toPersianDigits(filters.period)} روز اخیر`;
  const generatedAt = new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const exportCsvReport = () => {
    const csvRows: Array<Array<string | number | null | undefined>> = [
      ['نام تیم', teamName],
      ['بازهٔ گزارش', periodLabel],
      ['اعضای فعال در دامنه فیلتر', snapshot.activeMembers],
      ['آموزش‌های تخصیص‌یافته', snapshot.assignments],
      ['آموزش‌های تکمیل‌شده (وضعیت فعلی)', snapshot.completed],
      ['نرخ تکمیل فعلی (٪)', snapshot.completionRate ?? ''],
      ['تکمیل‌های ثبت‌شده در بازه', snapshot.completedInPeriod],
      ['تکمیل دوره قبل', snapshot.previousPeriodCompleted ?? ''],
      ['آموزش‌های دیرکرددار (وضعیت فعلی)', snapshot.overdue],
      ['آموزش‌های نیازمند پیگیری', snapshot.lagging],
      ['تلاش‌های آزمون در بازه', snapshot.quizAttempts],
      ['تلاش‌های آزمون دارای نتیجه', snapshot.quizScoredAttempts],
      ['قبولی تلاش‌های آزمون', snapshot.quizPassed],
      ['نرخ قبولی تلاش‌ها (٪)', snapshot.quizPassRate ?? ''],
      ['میانگین نمرهٔ آزمون (٪)', snapshot.averageScore ?? ''],
    ];
    const csv = toCsv(['معیار', 'مقدار'], csvRows);
    downloadCsv(`manager-learning-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  const exportXlsxReport = () => {
    const summaryRows = [
      { metric: 'نام تیم', value: teamName, note: '' },
      { metric: 'بازهٔ گزارش', value: periodLabel, note: `تولید گزارش: ${generatedAt}` },
      {
        metric: 'اعضای فعال در دامنه فیلتر',
        value: snapshot.activeMembers,
        note: 'اعضای فعال براساس فیلترهای مکانی و محصولی',
      },
      {
        metric: 'آموزش‌های تخصیص‌یافته',
        value: snapshot.assignments,
        note: 'وضعیت فعلی آموزش‌های موجود در دامنه فیلتر',
      },
      { metric: 'آموزش‌های تکمیل‌شده', value: snapshot.completed, note: 'وضعیت فعلی' },
      {
        metric: 'نرخ تکمیل فعلی (٪)',
        value: snapshot.completionRate ?? '',
        note: 'آموزش تکمیل‌شده ÷ آموزش تخصیص‌یافته',
      },
      { metric: 'تکمیل ثبت‌شده در بازه', value: snapshot.completedInPeriod, note: periodLabel },
      {
        metric: 'تکمیل دوره قبل',
        value: snapshot.previousPeriodCompleted ?? '',
        note:
          filters.period === 'all'
            ? 'برای کل بازه مقایسهٔ دوره‌ای انجام نشده است.'
            : 'دورهٔ هم‌اندازه پیش از بازهٔ انتخابی',
      },
      {
        metric: 'دیرکرد فعلی',
        value: snapshot.overdue,
        note: 'وضعیت فعلی آموزش‌ها؛ مستقل از بازهٔ انتخابی',
      },
      {
        metric: 'نیازمند پیگیری',
        value: snapshot.lagging,
        note: 'براساس آخرین فعالیت/مهلت ثبت‌شده',
      },
      { metric: 'تلاش‌های آزمون در بازه', value: snapshot.quizAttempts, note: periodLabel },
      {
        metric: 'تلاش‌های آزمون دارای نتیجه',
        value: snapshot.quizScoredAttempts,
        note: 'مبنای محاسبهٔ نرخ قبولی',
      },
      {
        metric: 'قبولی تلاش‌های آزمون',
        value: snapshot.quizPassed,
        note: 'تلاش‌های ثبت‌شده با نتیجهٔ قبولی',
      },
      {
        metric: 'نرخ قبولی تلاش‌ها (٪)',
        value: snapshot.quizPassRate ?? '',
        note: 'قبولی ÷ تلاش‌های دارای نتیجه',
      },
      {
        metric: 'میانگین نمره آزمون (٪)',
        value: snapshot.averageScore ?? '',
        note: 'میانگین نمرهٔ تلاش‌های دارای نمره',
      },
    ];
    const completionColumns: ExcelColumn[] = [
      { header: 'نام عضو', key: 'userName', width: 22 },
      { header: 'شماره', key: 'phone', width: 14 },
      { header: 'استان', key: 'province', width: 16 },
      { header: 'شهر', key: 'city', width: 16 },
      { header: 'آموزش', key: 'packageTitle', width: 28 },
      { header: 'برند', key: 'brandName', width: 18 },
      { header: 'محصول', key: 'productName', width: 22 },
      { header: 'پیشرفت (٪)', key: 'percent', width: 12, isNumber: true, align: 'center' },
      { header: 'وضعیت', key: 'status', width: 14 },
      { header: 'دیرکرد', key: 'overdue', width: 10 },
      { header: 'نیازمند پیگیری', key: 'lagging', width: 14 },
      { header: 'مهلت', key: 'deadline', width: 16 },
      { header: 'تکمیل', key: 'completedAt', width: 16 },
      { header: 'به‌موقع', key: 'onTime', width: 12 },
      { header: 'آخرین فعالیت', key: 'lastActivity', width: 16 },
      { header: 'گیر کرده در', key: 'stuckAt', width: 24 },
    ];
    const quizColumns: ExcelColumn[] = [
      { header: 'نام عضو', key: 'userName', width: 22 },
      { header: 'استان', key: 'province', width: 16 },
      { header: 'شهر', key: 'city', width: 16 },
      { header: 'آموزش', key: 'packageTitle', width: 28 },
      { header: 'برند', key: 'brandName', width: 18 },
      { header: 'محصول', key: 'productName', width: 22 },
      { header: 'بخش آزمون', key: 'sectionTitle', width: 24 },
      { header: 'شماره تلاش', key: 'attemptNumber', width: 12, isNumber: true, align: 'center' },
      { header: 'نمره (٪)', key: 'score', width: 10, isNumber: true, align: 'center' },
      { header: 'حدنصاب', key: 'passScore', width: 10, isNumber: true, align: 'center' },
      { header: 'درست', key: 'correct', width: 10, isNumber: true, align: 'center' },
      { header: 'غلط', key: 'wrong', width: 10, isNumber: true, align: 'center' },
      { header: 'نتیجه', key: 'result', width: 12 },
      { header: 'ثبت‌شده در', key: 'submittedAt', width: 18 },
    ];
    const productColumns: ExcelColumn[] = [
      { header: 'برند', key: 'brand', width: 22 },
      { header: 'محصول / آموزش', key: 'product', width: 28 },
      { header: 'آموزش تخصیص‌یافته', key: 'assigned', width: 18, isNumber: true, align: 'center' },
      { header: 'تکمیل‌شده', key: 'completed', width: 14, isNumber: true, align: 'center' },
      { header: 'نرخ تکمیل (٪)', key: 'rate', width: 14, isNumber: true, align: 'center' },
      { header: 'دیرکرد فعلی', key: 'overdue', width: 14, isNumber: true, align: 'center' },
    ];
    const regionColumns: ExcelColumn[] = [
      { header: 'استان', key: 'province', width: 22 },
      { header: 'اعضا', key: 'members', width: 12, isNumber: true, align: 'center' },
      { header: 'آموزش تخصیص‌یافته', key: 'assigned', width: 18, isNumber: true, align: 'center' },
      { header: 'تکمیل‌شده', key: 'completed', width: 14, isNumber: true, align: 'center' },
      { header: 'نرخ تکمیل (٪)', key: 'rate', width: 14, isNumber: true, align: 'center' },
      { header: 'دیرکرد فعلی', key: 'overdue', width: 14, isNumber: true, align: 'center' },
    ];
    const excelTitle = `گزارش مدیریتی آموزش — ${teamName}`;
    const filename = `manager-learning-report-${new Date().toISOString().slice(0, 10)}`;
    void exportExcelSheets(filename, [
      {
        sheetName: 'خلاصه مدیریتی',
        title: excelTitle,
        subtitle: periodLabel,
        fileName: filename,
        columns: [
          { header: 'معیار', key: 'metric', width: 34 },
          { header: 'مقدار', key: 'value', width: 22 },
          { header: 'توضیح', key: 'note', width: 48 },
        ],
        rows: summaryRows,
      },
      {
        sheetName: 'تکمیل آموزش',
        title: 'جزئیات تکمیل آموزش',
        subtitle: periodLabel,
        fileName: filename,
        columns: completionColumns,
        rows: completionRowsForExcel(filteredRows),
      },
      {
        sheetName: 'تلاش‌های آزمون',
        title: 'جزئیات تلاش‌های آزمون',
        subtitle: periodLabel,
        fileName: filename,
        columns: quizColumns,
        rows: quizRowsForExcel(filteredAttempts),
      },
      {
        sheetName: 'عملکرد محصول',
        title: 'تفکیک عملکرد محصول',
        subtitle: 'بر پایه آموزش‌های تخصیص‌یافته و وضعیت فعلی',
        fileName: filename,
        columns: productColumns,
        rows: snapshot.products.map((row) => ({
          brand: row.brand,
          product: row.product,
          assigned: row.assigned,
          completed: row.completed,
          rate: row.rate,
          overdue: row.overdue,
        })),
      },
      {
        sheetName: 'تفکیک منطقه',
        title: 'عملکرد بر اساس استان',
        subtitle: 'آمار فعلی، نه تغییرات جمعیتی یا فروش',
        fileName: filename,
        columns: regionColumns,
        rows: snapshot.regions.map((row) => ({
          province: row.province,
          members: row.members,
          assigned: row.assigned,
          completed: row.completed,
          rate: row.rate,
          overdue: row.overdue,
        })),
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          title={`خلاصه مدیریتی${members.data?.team?.name ? ` — ${members.data.team.name}` : ''}`}
          subtitle="یادگیری و دانش محصول بر پایهٔ داده‌های واقعی تیم؛ فیلترها روی KPIها و خروجی اعمال می‌شوند."
          actions={
            <>
              <Button
                variant="secondary"
                icon={<Download className="size-4" aria-hidden />}
                onClick={exportCsvReport}
              >
                خروجی CSV
              </Button>
              <Button
                variant="secondary"
                icon={<FileSpreadsheet className="size-4" aria-hidden />}
                onClick={exportXlsxReport}
              >
                خروجی Excel
              </Button>
              <Button
                variant="secondary"
                icon={<Printer className="size-4" aria-hidden />}
                onClick={() => window.print()}
              >
                چاپ / PDF
              </Button>
            </>
          }
        />
      </div>
      <Card className="grid gap-3 border-[#dce8de] bg-white/90 sm:grid-cols-2 xl:grid-cols-5 print:hidden">
        <Select
          label="بازه زمانی"
          value={filters.period}
          onChange={(event) =>
            setFilters((current) => ({ ...current, period: event.target.value as ReportPeriod }))
          }
        >
          <option value="30">۳۰ روز اخیر</option>
          <option value="90">۹۰ روز اخیر</option>
          <option value="180">۱۸۰ روز اخیر</option>
          <option value="all">کل داده‌های موجود</option>
        </Select>
        <Select
          label="برند"
          value={filters.brand}
          onChange={(event) =>
            setFilters((current) => ({ ...current, brand: event.target.value, product: '' }))
          }
        >
          <option value="">همه برندها</option>
          {options.brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </Select>
        <Select
          label="محصول"
          value={filters.product}
          onChange={(event) =>
            setFilters((current) => ({ ...current, product: event.target.value }))
          }
        >
          <option value="">همه محصولات</option>
          {options.products
            .filter(
              (product) =>
                !filters.brand ||
                rows.some((row) => row.productName === product && row.brandName === filters.brand),
            )
            .map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
        </Select>
        <Select
          label="استان"
          value={filters.province}
          onChange={(event) =>
            setFilters((current) => ({ ...current, province: event.target.value, city: '' }))
          }
        >
          <option value="">همه استان‌ها</option>
          {options.provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </Select>
        <Select
          label="شهر"
          value={filters.city}
          disabled={!filters.province}
          onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
        >
          <option value="">همه شهرها</option>
          {(options.citiesByProvince[filters.province] ?? []).map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
      </Card>

      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <TableSkeleton rows={5} />
        </>
      ) : failed ? (
        <ErrorState onRetry={() => void failed.refetch()} />
      ) : (
        <>
          <div className="hidden print:block">
            <div className="border-b-2 border-[#1c6b4d] pb-3 text-start">
              <p className="text-sm font-bold text-[#1c6b4d]">آکادمی سیلانه • گزارش تیم</p>
              <h1 className="mt-1 text-2xl font-black">خلاصه مدیریتی — {teamName}</h1>
              <p className="mt-1 text-sm text-slate-600">
                بازه: {periodLabel} • تهیه‌شده در {generatedAt}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              title="نرخ تکمیل فعلی"
              value={optionalPercent(snapshot.completionRate)}
              subtitle={`${faNumber(snapshot.completed)} از ${faNumber(snapshot.assignments)} آموزش`}
              icon={GraduationCap}
              tone="primary"
            />
            <KpiCard
              title="تکمیل در بازه"
              value={faNumber(snapshot.completedInPeriod)}
              subtitle={comparisonText(
                snapshot.completedInPeriod,
                snapshot.previousPeriodCompleted,
              )}
              icon={TrendingUp}
              tone="info"
            />
            <KpiCard
              title="دیرکرد فعلی"
              value={faNumber(snapshot.overdue)}
              subtitle={`${faNumber(snapshot.lagging)} آموزش نیازمند پیگیری`}
              icon={AlertTriangle}
              tone={snapshot.overdue ? 'warning' : 'primary'}
            />
            <KpiCard
              title="نرخ قبولی تلاش آزمون"
              value={optionalPercent(snapshot.quizPassRate)}
              subtitle={`${faNumber(snapshot.quizScoredAttempts)} نتیجه از ${faNumber(snapshot.quizAttempts)} تلاش • ${periodLabel}`}
              icon={ClipboardCheck}
              tone="info"
            />
          </div>
          <Card className="grid gap-4 border-[#dce8de] bg-white/95 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] print:break-inside-avoid">
            <section aria-labelledby="report-trend-title" className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="report-trend-title" className="font-extrabold text-[#183d30]">
                    روند تکمیل آموزش
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    {filters.period === 'all'
                      ? 'شش بازهٔ اخیر، حداکثر تا ۱۸۰ روز گذشته'
                      : `شش بازهٔ هم‌اندازه در ${periodLabel}`}
                    ؛ شمارش بر اساس زمان واقعی تکمیل.
                  </p>
                </div>
                <span className="rounded-full bg-[#eaf4ec] px-3 py-1 text-xs font-bold text-[#176e50]">
                  {faNumber(snapshot.completedInPeriod)} تکمیل در بازه
                </span>
              </div>
              <CompletionTrend buckets={snapshot.trend} />
            </section>
            <section
              className="flex flex-col gap-3 rounded-xl bg-[#f5f8f5] p-4"
              aria-label="یادداشت مدیریتی"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white text-[#176e50]">
                  <ShieldCheck className="size-5" aria-hidden />
                </span>
                <h2 className="font-extrabold text-[#183d30]">خلاصهٔ اقدام</h2>
              </div>
              <ul className="flex flex-col gap-2 text-sm leading-6 text-[#51645a]">
                <li>
                  در دامنهٔ فیلتر، {faNumber(snapshot.lagging)} آموزش نیازمند پیگیری و{' '}
                  {faNumber(snapshot.overdue)} آموزش دارای دیرکرد فعلی است.
                </li>
                <li>
                  {snapshot.quizPassRate === null
                    ? 'در این بازه تلاش آزمونِ دارای نتیجه ثبت نشده است.'
                    : `نرخ قبولی تلاش‌های آزمون ${faPercent(snapshot.quizPassRate)} است؛ نمرهٔ میانگین ${optionalPercent(snapshot.averageScore)}.`}
                </li>
                <li>
                  {snapshot.onTimeRate === null
                    ? 'دادهٔ کافی برای محاسبهٔ تکمیل به‌موقع وجود ندارد.'
                    : `از موارد دارای وضعیت به‌موقع، ${faPercent(snapshot.onTimeRate)} در مهلت ثبت‌شده تکمیل شده‌اند.`}
                </li>
              </ul>
              <div className="mt-auto border-t border-[#dce5dd] pt-3 text-xs leading-6 text-text-secondary">
                این گزارش عملکرد آموزشی و آزمون را نشان می‌دهد؛ هزینهٔ تبلیغات، فروش، ROAS،
                attribution یا مشاهدهٔ اعلان در داده‌های موجود ثبت نمی‌شود.
              </div>
            </section>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <PerformanceTable products={snapshot.products} />
            <RegionTable regions={snapshot.regions} />
          </div>
          <Card className="flex flex-col gap-2 text-xs leading-6 text-text-secondary print:hidden">
            <div className="flex items-center gap-2 font-bold text-[#183d30]">
              <Users className="size-4" aria-hidden />
              اعضای فعال در دامنهٔ فیلتر: {faNumber(snapshot.activeMembers)} فعال از{' '}
              {faNumber(snapshot.teamMembers)}
            </div>
            <p>
              برای اقدام روی فرد، از فهرست «تیم من» وارد پروندهٔ عضو شوید. خروجی Excel شامل خلاصهٔ
              مدیریتی، جزئیات آموزش، تلاش‌های آزمون و تفکیک محصول و استان است.
            </p>
          </Card>
          <p className="text-end text-[11px] text-text-secondary print:block">
            زمان تولید گزارش: {generatedAt} • بازه: {periodLabel}
          </p>
        </>
      )}
    </div>
  );
}

function CompletionTrend({
  buckets,
}: {
  buckets: Array<{ label: string; startAt: number; completed: number }>;
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.completed));
  const hasValues = buckets.some((bucket) => bucket.completed > 0);
  if (!hasValues)
    return (
      <EmptyState
        title="در این بازه تکمیلی ثبت نشده"
        description="بازهٔ زمانی یا فیلترها را تغییر دهید؛ نمودار از داده‌های واقعی تکمیل ساخته می‌شود."
        icon={<TrendingUp className="size-7" aria-hidden />}
      />
    );
  return (
    <figure aria-label="نمودار روند تکمیل آموزش">
      <div
        role="img"
        aria-label={buckets
          .map((bucket) => `${bucket.label}: ${faNumber(bucket.completed)} تکمیل`)
          .join('؛ ')}
        className="flex h-48 items-end justify-between gap-2 rounded-xl border border-[#e6ece7] bg-gradient-to-b from-white to-[#f7faf7] px-3 pb-3 pt-6"
      >
        {buckets.map((bucket, index) => {
          const height = bucket.completed ? Math.max(10, (bucket.completed / max) * 100) : 2;
          return (
            <div
              key={`${bucket.startAt}-${index}`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-xs font-bold text-[#2c6550]">{faNumber(bucket.completed)}</span>
              <div className="flex h-full w-full items-end justify-center">
                <div
                  aria-hidden
                  className={cn(
                    'w-full max-w-14 rounded-t-lg transition-all',
                    bucket.completed
                      ? 'bg-gradient-to-t from-[#1a7954] to-[#64b388]'
                      : 'bg-[#e3e9e4]',
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="max-w-full truncate text-[10px] text-text-secondary">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">تعداد تکمیل‌های ثبت‌شده در شش بازهٔ هم‌اندازه</figcaption>
    </figure>
  );
}

function PerformanceTable({ products }: { products: ProductPerformance[] }) {
  const columns: Column<ProductPerformance>[] = [
    {
      key: 'product',
      header: 'برند / محصول',
      cell: (row) => (
        <div>
          <span className="block font-bold">{row.product}</span>
          <span className="text-xs text-text-secondary">{row.brand}</span>
        </div>
      ),
      sortValue: (row) => row.product,
    },
    {
      key: 'volume',
      header: 'تخصیص‌یافته',
      cell: (row) => faNumber(row.assigned),
      sortValue: (row) => row.assigned,
    },
    {
      key: 'rate',
      header: 'نرخ تکمیل',
      cell: (row) => (
        <div className="min-w-28">
          <div className="mb-1 text-xs font-bold">{faPercent(row.rate)}</div>
          <ProgressBar value={row.rate} label={`تکمیل ${row.product}`} />
        </div>
      ),
      sortValue: (row) => row.rate,
    },
    {
      key: 'overdue',
      header: 'دیرکرد',
      cell: (row) =>
        row.overdue ? (
          <span className="font-bold text-danger-fg">{faNumber(row.overdue)}</span>
        ) : (
          '۰'
        ),
      sortValue: (row) => row.overdue,
    },
  ];
  return (
    <Card className="flex flex-col gap-3 print:break-inside-avoid">
      <div>
        <h2 className="font-extrabold text-[#183d30]">آمادگی محصول</h2>
        <p className="mt-1 text-xs text-text-secondary">
          تفکیک بر اساس آموزش تخصیص‌یافته؛ برای فهم شکاف‌های آموزشی.
        </p>
      </div>
      {products.length ? (
        <DataTable
          caption="عملکرد آموزش به تفکیک محصول"
          rows={products.slice(0, 8)}
          columns={columns}
          rowKey={(row) => `${row.brand}-${row.product}`}
        />
      ) : (
        <EmptyState title="دادهٔ محصولی برای این فیلتر نیست" />
      )}
    </Card>
  );
}

function RegionTable({ regions }: { regions: RegionPerformance[] }) {
  const columns: Column<RegionPerformance>[] = [
    {
      key: 'province',
      header: 'استان',
      cell: (row) => row.province,
      sortValue: (row) => row.province,
    },
    {
      key: 'members',
      header: 'اعضا',
      cell: (row) => faNumber(row.members),
      sortValue: (row) => row.members,
    },
    {
      key: 'assigned',
      header: 'آموزش',
      cell: (row) => faNumber(row.assigned),
      sortValue: (row) => row.assigned,
    },
    {
      key: 'rate',
      header: 'تکمیل',
      cell: (row) => <span className="font-bold">{faPercent(row.rate)}</span>,
      sortValue: (row) => row.rate,
    },
    {
      key: 'overdue',
      header: 'دیرکرد',
      cell: (row) =>
        row.overdue ? (
          <span className="font-bold text-danger-fg">{faNumber(row.overdue)}</span>
        ) : (
          '۰'
        ),
      sortValue: (row) => row.overdue,
    },
  ];
  return (
    <Card className="flex flex-col gap-3 print:break-inside-avoid">
      <div>
        <h2 className="font-extrabold text-[#183d30]">پوشش منطقه‌ای</h2>
        <p className="mt-1 text-xs text-text-secondary">
          وضعیت آموزش بر اساس استان محل فعالیت ثبت‌شده.
        </p>
      </div>
      {regions.length ? (
        <DataTable
          caption="وضعیت آموزش به تفکیک استان"
          rows={regions.slice(0, 8)}
          columns={columns}
          rowKey={(row) => row.province}
        />
      ) : (
        <EmptyState title="اطلاعات مکانی در این فیلتر نیست" />
      )}
    </Card>
  );
}

function optionalPercent(value: number | null) {
  return value === null ? '—' : faPercent(value);
}

function comparisonText(current: number, previous: number | null) {
  if (previous === null) return 'برای کل داده‌های موجود مقایسهٔ دوره‌ای نداریم';
  if (previous === 0)
    return current === 0
      ? 'در دورهٔ قبل نیز تکمیلی ثبت نشده بود'
      : `در دورهٔ قبل تکمیلی ثبت نشده؛ اکنون ${faNumber(current)} مورد`;
  const delta = current - previous;
  return `${delta > 0 ? 'افزایش' : delta < 0 ? 'کاهش' : 'بدون تغییر'} ${faNumber(Math.abs(delta))} مورد نسبت به دورهٔ قبل`;
}

function completionRowsForExcel(rows: CompletionRow[]) {
  const status = { new: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل' } as const;
  return rows.map((row) => ({
    userName: row.userName,
    phone: row.phone ?? '—',
    province: row.province ?? '—',
    city: row.city ?? '—',
    packageTitle: row.packageTitle,
    brandName: row.brandName ?? '—',
    productName: row.productName ?? '—',
    percent: row.percent,
    status: status[row.status],
    overdue: row.overdue ? 'بله' : 'خیر',
    lagging: row.lagging ? 'بله' : 'خیر',
    deadline: row.deadlineAt ? faDate(row.deadlineAt) : '—',
    completedAt: row.completedAt ? faDate(row.completedAt) : '—',
    onTime: row.onTime === null ? '—' : row.onTime ? 'بله' : 'خیر',
    lastActivity: row.lastActivityAt ? faDate(row.lastActivityAt) : '—',
    stuckAt: row.stuckAt ?? '—',
  }));
}
function quizRowsForExcel(rows: QuizAttemptRow[]) {
  return rows.map((row) => ({
    userName: row.userName,
    province: row.province ?? '—',
    city: row.city ?? '—',
    packageTitle: row.packageTitle,
    brandName: row.brandName ?? '—',
    productName: row.productName ?? '—',
    sectionTitle: row.sectionTitle,
    attemptNumber: row.attemptNumber,
    score: row.score ?? '',
    passScore: row.passScore,
    correct: row.correct,
    wrong: row.wrong,
    result: row.passed === null ? 'نامشخص' : row.passed ? 'قبول' : 'نیازمند تکرار',
    submittedAt: row.submittedAt ? faDate(row.submittedAt) : '—',
  }));
}

function ManagerQuizResults() {
  const q = useQuery({
    queryKey: ['manager', 'report', 'quizzes'],
    queryFn: ({ signal }) => api.get<QuizReport>('/manager/reports/quizzes', signal),
  });
  return (
    <QueryState query={q} loading={<TableSkeleton rows={6} />}>
      {(data) => <QuizResultsReport data={data} memberLink={(id) => `/manager/members/${id}`} />}
    </QueryState>
  );
}

function ManagerCompletion() {
  const q = useQuery({
    queryKey: ['manager', 'report', 'completion'],
    queryFn: ({ signal }) => api.get<CompletionData>('/manager/reports/completion', signal),
  });
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-[#f5f8f5] text-sm text-text-secondary">
        <span>
          گزارش تکمیل آموزش قابل فیلتر بر اساس برند، محصول، وضعیت، مهلت و محدودهٔ مکانی است.
        </span>
        <span className="font-bold text-[#176e50]">
          از خروجی Excel یا CSV برای اشتراک‌گذاری استفاده کنید.
        </span>
      </Card>
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(data) => (
          <CompletionReport rows={data.rows} memberLink={(id) => `/manager/members/${id}`} />
        )}
      </QueryState>
    </div>
  );
}
