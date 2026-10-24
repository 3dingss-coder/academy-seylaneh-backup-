import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlarmClock,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpLeft,
  BadgeCheck,
  BellRing,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  FileText,
  Megaphone,
  Rocket,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { Button, Card, Skeleton, StatusBadge } from '@/components/ui';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faNumber, faPercent } from '@/lib/format';
import type { AdminDashboard as DashboardData, AdminDashboardActivity, Role } from '@/lib/types';
import { PackageFormDialog } from './PackageFormDialog';
import { PublishGuide } from '@/components/admin/PublishGuide';

type DashboardTab = 'overview' | 'users' | 'learning' | 'engagement' | 'messages' | 'activity';
type Period = 7 | 30 | 90;

const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: 'overview', label: 'نمای کلی' },
  { id: 'users', label: 'کاربران' },
  { id: 'learning', label: 'آموزش‌ها' },
  { id: 'engagement', label: 'مشارکت' },
  { id: 'messages', label: 'پیام‌ها و اعلان‌ها' },
  { id: 'activity', label: 'فعالیت سیستم' },
];

const ROLE_LABELS: Record<Role, string> = {
  marketer: 'بازاریاب',
  manager: 'مدیر فروش',
  admin: 'ادمین',
  superadmin: 'ادمین ارشد',
};
const ROLE_COLORS: Record<Role, string> = {
  marketer: '#059669',
  manager: '#2563eb',
  admin: '#f59e0b',
  superadmin: '#8b5cf6',
};

/** A1 — one operational overview spanning users, learning, engagement, communications and system activity. */
export function AdminDashboard() {
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: ({ signal }) => api.get<DashboardData>('/admin/dashboard', signal),
    staleTime: 30_000,
  });
  const [tab, setTab] = useState<DashboardTab>('overview');
  const [period, setPeriod] = useState<Period>(30);
  const [newPkg, setNewPkg] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#52645b]">مدیریت آکادمی / نمای کلی</p>
          <h1 className="mt-1 text-2xl font-black text-[#172235] sm:text-[28px]">
            سلام، ادمین عزیز
          </h1>
          <p className="mt-1 text-sm text-[#526274]">
            خلاصهٔ کاربران، آموزش‌ها و اتفاقات آکادمی در یک نگاه
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e8e5] bg-white px-3 text-sm text-[#43574f]">
            <span className="sr-only">بازهٔ نمودار</span>
            <select
              aria-label="بازهٔ نمودار"
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value) as Period)}
              className="max-w-36 bg-transparent font-semibold outline-none"
            >
              <option value={7}>۷ روز گذشته</option>
              <option value={30}>۳۰ روز گذشته</option>
              <option value={90}>۹۰ روز گذشته</option>
            </select>
          </label>
          <Link
            to="/admin/reports"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e8e5] bg-white px-3 text-sm font-bold text-[#43574f] transition hover:border-[#b8d7c7] hover:text-[#047857]"
          >
            <Activity className="size-4" aria-hidden="true" />
            گزارش کامل
          </Link>
          <Button
            className="w-full sm:w-auto"
            icon={<Rocket className="size-4" aria-hidden />}
            onClick={() => setNewPkg(true)}
          >
            انتشار آموزش جدید
          </Button>
        </div>
      </header>
      {newPkg && <PackageFormDialog open onClose={() => setNewPkg(false)} />}

      <QueryState
        query={q}
        loading={<DashboardSkeleton />}
        empty={<DashboardEmpty onCreate={() => setNewPkg(true)} />}
        isEmpty={(data) => {
          const insights = data.insights;
          return Boolean(
            insights &&
            insights.users.total === 0 &&
            data.content.published === 0 &&
            data.content.drafts === 0 &&
            data.pendingRetakes === 0,
          );
        }}
      >
        {(data) => (
          <DashboardContent
            data={data}
            period={period}
            tab={tab}
            onTabChange={setTab}
            onCreate={() => setNewPkg(true)}
          />
        )}
      </QueryState>
    </div>
  );
}

function DashboardContent({
  data,
  period,
  tab,
  onTabChange,
  onCreate,
}: {
  data: DashboardData;
  period: Period;
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onCreate: () => void;
}) {
  const insights = data.insights;
  const users = insights?.users;
  const roleCounts = users?.byRole ?? {
    marketer: data.kpis.marketers,
    manager: 0,
    admin: 0,
    superadmin: 0,
  };
  const totalUsers = users?.total ?? data.kpis.marketers;
  const activeUsers = users?.active ?? data.kpis.activeMarketers;
  const active = (insights?.activityTrend ?? []).slice(-period);
  const activities = insights?.recentActivity ?? [];
  const packages = insights?.recentPackages ?? [];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(250px,1.32fr)_repeat(4,minmax(0,1fr))]">
        <WelcomeCard totalUsers={totalUsers} activeUsers={activeUsers} onCreate={onCreate} />
        <MetricCard
          title="کل کاربران"
          value={faNumber(totalUsers)}
          note="همهٔ نقش‌ها"
          icon={UsersRound}
          tone="blue"
          to="/admin/users"
        />
        <MetricCard
          title="کاربران فعال"
          value={faNumber(activeUsers)}
          note="وضعیت حساب: فعال"
          icon={Users}
          tone="green"
          to="/admin/users?status=active"
        />
        <MetricCard
          title="آموزش منتشرشده"
          value={faNumber(data.content.published)}
          note={`${toPersianDigits(data.content.drafts)} پیش‌نویس`}
          icon={BookOpen}
          tone="violet"
          to="/admin/content"
        />
        <MetricCard
          title="تکمیل به‌موقع"
          value={faPercent(data.kpis.onTimeCompletionRate)}
          note={`${faNumber(data.kpis.completions)} تکمیل ثبت‌شده`}
          icon={CheckCircle2}
          tone="amber"
          to="/admin/reports"
        />
      </div>

      <AttentionStrip data={data} />

      <nav
        aria-label="تب‌های دادهٔ داشبورد"
        className="overflow-x-auto rounded-2xl border border-[#e8e5dc] bg-white p-1.5 shadow-sm"
      >
        <div role="tablist" className="flex min-w-max gap-1" dir="rtl">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={cn(
                'min-h-10 rounded-xl px-4 text-sm font-bold transition-colors',
                tab === id
                  ? 'bg-[#08704f] text-white shadow-sm'
                  : 'text-[#53645b] hover:bg-[#eff5ee] hover:text-[#075b44]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          data={data}
          period={period}
          roleCounts={roleCounts}
          activities={activities}
          packages={packages}
        />
      )}
      {tab === 'users' && <UsersTab data={data} period={period} roleCounts={roleCounts} />}
      {tab === 'learning' && <LearningTab data={data} packages={packages} onCreate={onCreate} />}
      {tab === 'engagement' && <EngagementTab data={data} period={period} active={active} />}
      {tab === 'messages' && <MessagesTab data={data} activities={activities} />}
      {tab === 'activity' && <ActivityTab data={data} activities={activities} />}
    </div>
  );
}

function WelcomeCard({
  totalUsers,
  activeUsers,
  onCreate,
}: {
  totalUsers: number;
  activeUsers: number;
  onCreate: () => void;
}) {
  return (
    <Card className="relative flex min-h-[158px] items-center overflow-hidden border-[#d8ebd9] bg-gradient-to-br from-[#eaf8ec] via-[#f3f7e7] to-[#e5f2dc] p-4 sm:p-5">
      <div className="relative z-10 max-w-[65%]" dir="rtl">
        <p className="text-lg font-black text-[#173e35]">همه‌چیز برای مدیریت آموزش آماده است</p>
        <p className="mt-2 text-sm leading-6 text-[#526b5c]">
          {totalUsers
            ? `${toPersianDigits(activeUsers)} کاربر فعال از ${toPersianDigits(totalUsers)} کاربر در سامانه دارید.`
            : 'با ساخت اولین آموزش، مسیر یادگیری را آغاز کنید.'}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-extrabold text-[#08704f] hover:bg-white/70"
        >
          ساخت آموزش جدید <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="pointer-events-none absolute -bottom-4 left-1 flex h-[150px] w-[42%] items-end justify-center sm:left-3">
        <img
          src="/brand/mascot.webp"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain object-bottom"
        />
      </div>
      <div className="pointer-events-none absolute -bottom-16 left-10 size-36 rounded-full bg-white/35 blur-2xl" />
    </Card>
  );
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  tone,
  to,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof Users;
  tone: 'blue' | 'green' | 'violet' | 'amber';
  to: string;
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <Link
      to={to}
      className="group flex min-h-[158px] flex-col justify-between rounded-2xl border border-[#e8e6df] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d6c5] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('grid size-11 place-items-center rounded-2xl', tones[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <ArrowDownLeft
          className="size-4 text-[#9aa39b] transition group-hover:text-[#08704f]"
          aria-hidden="true"
        />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#67736c]">{title}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-[#172235]">{value}</p>
        <p className="mt-1 truncate text-xs text-[#52645b]">{note}</p>
      </div>
    </Link>
  );
}

function AttentionStrip({ data }: { data: DashboardData }) {
  const insight = data.insights;
  const alerts = [
    {
      label: 'درخواست آزمون مجدد',
      value: data.pendingRetakes,
      to: '/admin/retake-requests',
      icon: FileQuestion,
      tone: 'amber',
    },
    {
      label: 'محتوای بدون تخصیص',
      value: data.content.unassigned,
      to: '/admin/content?tab=unassigned',
      icon: FileText,
      tone: 'rose',
    },
    {
      label: 'پیش‌نویس آموزش',
      value: data.content.drafts,
      to: '/admin/content?tab=drafts',
      icon: ClipboardList,
      tone: 'blue',
    },
    {
      label: 'کمپین ناموفق',
      value: insight?.campaigns.failed ?? 0,
      to: '/admin/push-campaigns',
      icon: Megaphone,
      tone: 'rose',
    },
  ] as const;
  const activeAlerts = alerts.filter((alert) => alert.value > 0);
  return (
    <Card className="flex flex-col gap-3 border-[#eee4cf] bg-[#fffdf7] p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <BellRing className="size-[18px]" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold text-[#26362e]">نیازمند پیگیری</h2>
          <p className="text-xs text-[#52645b]">
            {activeAlerts.length
              ? 'موارد باز را مستقیماً از همین‌جا بررسی کنید.'
              : 'همهٔ موارد فوری رسیدگی شده‌اند.'}
          </p>
        </div>
      </div>
      {activeAlerts.length ? (
        <div className="flex flex-wrap gap-2">
          {activeAlerts.map(({ label, value, to, icon: Icon, tone }) => (
            <Link
              key={label}
              to={to}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition hover:-translate-y-0.5',
                tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : tone === 'rose'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800',
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {toPersianDigits(value)} {label}
            </Link>
          ))}
        </div>
      ) : (
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          وضعیت عادی
        </span>
      )}
    </Card>
  );
}

function OverviewTab({
  data,
  period,
  roleCounts,
  activities,
  packages,
}: {
  data: DashboardData;
  period: Period;
  roleCounts: Record<Role, number>;
  activities: AdminDashboardActivity[];
  packages: NonNullable<DashboardData['insights']>['recentPackages'];
}) {
  return (
    <div role="tabpanel" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <ActivityChart data={data.insights?.activityTrend ?? []} period={period} />
        <RoleDistribution counts={roleCounts} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RecentUsers data={data.insights?.users.recent ?? []} />
        <RecentPackages packages={packages} />
        <RecentActivity activities={activities.slice(0, 5)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="نرخ فعال‌سازی"
          value={faPercent(data.kpis.activationRate)}
          icon={UserCheck}
          to="/admin/reports"
          tone="blue"
        />
        <MiniStat
          label="قبولی در تلاش اول"
          value={faPercent(data.kpis.firstPassRate)}
          icon={BadgeCheck}
          to="/admin/reports"
          tone="green"
        />
        <MiniStat
          label="میانگین تأخیر"
          value={`${toPersianDigits(Math.round(data.kpis.avgDelayHours))} ساعت`}
          icon={AlarmClock}
          to="/admin/reports"
          tone="amber"
        />
        <MiniStat
          label="اثر یادآوری منتور"
          value={faPercent(data.kpis.nudgeReengagementRate)}
          icon={Sparkles}
          to="/admin/mentor"
          tone="violet"
        />
      </div>
    </div>
  );
}

function UsersTab({
  data,
  period,
  roleCounts,
}: {
  data: DashboardData;
  period: Period;
  roleCounts: Record<Role, number>;
}) {
  return (
    <div role="tabpanel" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
      <RoleDistribution counts={roleCounts} />
      <RecentUsers data={data.insights?.users.recent ?? []} expanded />
      <div className="xl:col-span-2">
        <ActivityChart
          data={data.insights?.activityTrend ?? []}
          period={period}
          metric="signups"
          title="ثبت‌نام کاربران"
        />
      </div>
    </div>
  );
}

function LearningTab({
  data,
  packages,
  onCreate,
}: {
  data: DashboardData;
  packages: NonNullable<DashboardData['insights']>['recentPackages'];
  onCreate: () => void;
}) {
  return (
    <div role="tabpanel" className="flex flex-col gap-4">
      <ContentStatus data={data} />
      <RecentPackages packages={packages} expanded />
      <PublishGuide onNewPackage={onCreate} drafts={data.content.drafts} />
    </div>
  );
}

function EngagementTab({
  data,
  period,
  active,
}: {
  data: DashboardData;
  period: Period;
  active: DashboardData['insights'] extends undefined
    ? never
    : NonNullable<DashboardData['insights']>['activityTrend'];
}) {
  return (
    <div role="tabpanel" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="WAU / MAU"
          value={faPercent(data.kpis.wauMau)}
          icon={Activity}
          to="/admin/reports"
          tone="blue"
        />
        <MiniStat
          label="کاربران فعال هفتگی"
          value={faNumber(data.kpis.wau)}
          icon={Users}
          to="/admin/reports"
          tone="green"
        />
        <MiniStat
          label="تکمیل به‌موقع"
          value={faPercent(data.kpis.onTimeCompletionRate)}
          icon={CheckCircle2}
          to="/admin/reports"
          tone="amber"
        />
        <MiniStat
          label="قبولی در تلاش اول"
          value={faPercent(data.kpis.firstPassRate)}
          icon={BadgeCheck}
          to="/admin/reports"
          tone="violet"
        />
      </div>
      <ActivityChart data={active} period={period} metric="completions" title="تکمیل آموزش‌ها" />
    </div>
  );
}

function MessagesTab({
  data,
  activities,
}: {
  data: DashboardData;
  activities: AdminDashboardActivity[];
}) {
  const campaigns = data.insights?.campaigns;
  const stats = [
    ['کل کمپین‌ها', campaigns?.total ?? 0, 'همهٔ کمپین‌ها'],
    ['پیش‌نویس', campaigns?.draft ?? 0, 'در انتظار آماده‌سازی'],
    ['زمان‌بندی‌شده', campaigns?.scheduled ?? 0, 'در صف ارسال'],
    ['در حال اجرا', campaigns?.inProgress ?? 0, 'در حال پردازش'],
    ['ارسال‌شده', campaigns?.sent ?? 0, 'با وضعیت ثبت‌شده'],
    ['ناموفق', campaigns?.failed ?? 0, 'نیازمند بررسی'],
  ] as const;
  const communicationEvents = activities.filter((event) =>
    ['admin_notification_sent', 'admin_push_campaign_started', 'notification_opened'].includes(
      event.name,
    ),
  );
  return (
    <div role="tabpanel" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value, note]) => (
          <Link
            key={label}
            to="/admin/push-campaigns"
            className="rounded-2xl border border-[#e8e6df] bg-white p-4 shadow-sm transition hover:border-[#b7d6c5]"
          >
            <p className="text-sm text-[#67736c]">{label}</p>
            <p className="mt-1 text-2xl font-black text-[#172235]">{faNumber(value)}</p>
            <p className="mt-1 text-xs text-[#52645b]">{note}</p>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentActivity activities={communicationEvents} title="آخرین اتفاقات پیام‌رسانی" />
        <Card className="flex flex-col justify-between gap-4 bg-gradient-to-br from-white to-[#f3faf5]">
          <div>
            <h2 className="font-extrabold text-[#24372e]">مدیریت ارتباط با کاربران</h2>
            <p className="mt-1 text-sm leading-6 text-[#69766f]">
              کمپین‌ها، اعلان‌ها و اتوماسیون را از صفحهٔ مربوط به خود ادامه دهید.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/push-campaigns"
              className="rounded-xl bg-[#08704f] px-4 py-3 text-sm font-bold text-white"
            >
              کمپین‌های Push
            </Link>
            <Link
              to="/admin/notifications"
              className="rounded-xl border border-[#dce6dd] bg-white px-4 py-3 text-sm font-bold text-[#08704f]"
            >
              اعلان‌ها
            </Link>
            <Link
              to="/admin/push-campaigns/automations"
              className="rounded-xl border border-[#dce6dd] bg-white px-4 py-3 text-sm font-bold text-[#08704f]"
            >
              اتوماسیون
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ActivityTab({
  data,
  activities,
}: {
  data: DashboardData;
  activities: AdminDashboardActivity[];
}) {
  return (
    <div role="tabpanel" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      <RecentActivity activities={activities} expanded title="آخرین فعالیت‌های اپلیکیشن و پنل" />
      <div className="flex flex-col gap-3">
        <MiniStat
          label="درخواست آزمون مجدد"
          value={faNumber(data.pendingRetakes)}
          icon={FileQuestion}
          to="/admin/retake-requests"
          tone="amber"
        />
        <MiniStat
          label="محتوای بدون تخصیص"
          value={faNumber(data.content.unassigned)}
          icon={FileText}
          to="/admin/content?tab=unassigned"
          tone="blue"
        />
        <MiniStat
          label="تکمیل‌های ثبت‌شده"
          value={faNumber(data.kpis.completions)}
          icon={CheckCircle2}
          to="/admin/reports"
          tone="green"
        />
      </div>
    </div>
  );
}

function ActivityChart({
  data,
  period,
  metric = 'activeUsers',
  title = 'روند کاربران فعال',
}: {
  data: NonNullable<DashboardData['insights']>['activityTrend'];
  period: Period;
  metric?: 'activeUsers' | 'signups' | 'completions';
  title?: string;
}) {
  const rows = data.slice(-period);
  const valueKey = metric;
  const values = rows.map((row) => row[valueKey]);
  const max = Math.max(1, ...values);
  const hasValues = values.some((value) => value > 0);
  const width = 720;
  const height = 220;
  const pad = { top: 18, right: 20, bottom: 34, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const points = values.map((value, index) => {
    const x = pad.left + (values.length <= 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);
    const y = pad.top + plotH - (value / max) * plotH;
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const area = points.length
    ? `${line} L ${points.at(-1)?.[0] ?? pad.left} ${pad.top + plotH} L ${points[0]?.[0] ?? pad.left} ${pad.top + plotH} Z`
    : '';
  const dateLabel = (date: string) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(parsed);
  };
  const label =
    metric === 'activeUsers' ? 'کاربر فعال یکتا' : metric === 'signups' ? 'ثبت‌نام' : 'تکمیل آموزش';
  return (
    <Card className="overflow-hidden p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-[#24372e]">{title}</h2>
          <p className="mt-1 text-xs text-[#52645b]">
            {label} در هر روز · {toPersianDigits(period)} روز گذشته
          </p>
        </div>
        <span className="rounded-full bg-[#eff7f1] px-3 py-1.5 text-xs font-bold text-[#28704f]">
          تجمیع روزانه
        </span>
      </div>
      {hasValues ? (
        <div className="overflow-x-auto" dir="ltr">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title} در ${toPersianDigits(period)} روز گذشته`}
            className="h-[220px] min-w-[560px] w-full"
          >
            <defs>
              <linearGradient id="admin-trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.015" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((tick) => {
              const y = pad.top + (plotH / 3) * tick;
              const value = Math.round(max - (max / 3) * tick);
              return (
                <g key={tick}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    stroke="#e9eee9"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={pad.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[#52645b] text-[10px]"
                  >
                    {toPersianDigits(value)}
                  </text>
                </g>
              );
            })}
            <path d={area} fill="url(#admin-trend-fill)" />
            <path
              d={line}
              fill="none"
              stroke="#08704f"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points
              .filter(
                (_, i) =>
                  i === 0 ||
                  i === points.length - 1 ||
                  i % Math.max(1, Math.floor(points.length / 4)) === 0,
              )
              .map(([x, y], i) => (
                <circle
                  key={`${x}-${i}`}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#fff"
                  stroke="#08704f"
                  strokeWidth="2.5"
                />
              ))}
            {[0, 0.25, 0.5, 0.75, 1].map((pos) => {
              const index = Math.min(rows.length - 1, Math.round(pos * (rows.length - 1)));
              const row = rows[index];
              return row ? (
                <text
                  key={pos}
                  x={pad.left + plotW * pos}
                  y={height - 8}
                  textAnchor={pos === 0 ? 'start' : pos === 1 ? 'end' : 'middle'}
                  className="fill-[#52645b] text-[10px]"
                >
                  {dateLabel(row.date)}
                </text>
              ) : null;
            })}
          </svg>
        </div>
      ) : (
        <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-[#dce6dd] bg-[#fbfdf9] px-5 text-center">
          <div>
            <Activity className="mx-auto size-8 text-[#7ba68c]" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-[#3b5144]">
              هنوز دادهٔ کافی برای این بازه ثبت نشده است.
            </p>
            <p className="mt-1 text-xs text-[#52645b]">
              به‌محض ثبت فعالیت کاربران، روند اینجا نمایش داده می‌شود.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function RoleDistribution({ counts }: { counts: Record<Role, number> }) {
  const roles = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
    role,
    count: counts[role] ?? 0,
  }));
  const total = roles.reduce((sum, row) => sum + row.count, 0);
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-[#24372e]">توزیع کاربران بر اساس نقش</h2>
          <p className="mt-1 text-xs text-[#52645b]">ترکیب حساب‌های فعال و غیرفعال</p>
        </div>
        <Link
          to="/admin/users"
          aria-label="مشاهده همه کاربران"
          className="rounded-lg p-2 text-[#08704f] hover:bg-[#eff7f1]"
        >
          <ArrowUpLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div
          className="relative shrink-0"
          role="img"
          aria-label={`توزیع ${faNumber(total)} کاربر بر اساس نقش`}
        >
          <svg width="172" height="172" viewBox="0 0 172 172" className="-rotate-90">
            <circle cx="86" cy="86" r={radius} fill="none" stroke="#edf1ec" strokeWidth="20" />
            {roles
              .filter((row) => row.count > 0)
              .map(({ role, count }) => {
                const length = total ? (count / total) * circumference : 0;
                const circle = (
                  <circle
                    key={role}
                    cx="86"
                    cy="86"
                    r={radius}
                    fill="none"
                    stroke={ROLE_COLORS[role]}
                    strokeWidth="20"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += length;
                return circle;
              })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-black text-[#172235]">{faNumber(total)}</p>
              <p className="text-xs text-[#52645b]">کاربر</p>
            </div>
          </div>
        </div>
        <ul className="w-full space-y-2">
          {roles.map(({ role, count }) => (
            <li key={role} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-[#59675f]">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: ROLE_COLORS[role] }}
                />
                {ROLE_LABELS[role]}
              </span>
              <span className="font-extrabold text-[#24372e]">
                {faNumber(count)}{' '}
                <span className="text-xs font-normal text-[#52645b]">
                  ({faPercent(total ? (count / total) * 100 : 0)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function RecentUsers({
  data,
  expanded = false,
}: {
  data: NonNullable<DashboardData['insights']>['users']['recent'];
  expanded?: boolean;
}) {
  return (
    <Card className="p-0">
      <PanelHeader title="آخرین کاربران ثبت‌نام‌شده" to="/admin/users" icon={UserPlus} />
      {data.length ? (
        <ul className="divide-y divide-[#edf0eb] px-4">
          {(expanded ? data : data.slice(0, 4)).map((user) => (
            <li key={user.id}>
              <Link
                to={`/admin/users/${user.id}`}
                className="flex min-h-[58px] items-center gap-3 py-2 hover:bg-[#fbfcf8]"
                dir="rtl"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f4ed] text-sm font-black text-[#08704f]">
                  {user.name.trim().charAt(0) || <UserPlus className="size-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#273831]">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-[#52645b]">
                    {ROLE_LABELS[user.role]} · {user.city ?? user.province ?? 'موقعیت ثبت نشده'}
                  </span>
                </span>
                <span className="shrink-0 text-left text-[11px] text-[#52645b]">
                  {relativeTime(user.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty icon={Users} text="هنوز کاربری ثبت‌نام نکرده است." />
      )}
    </Card>
  );
}

function RecentPackages({
  packages,
  expanded = false,
}: {
  packages: NonNullable<DashboardData['insights']>['recentPackages'];
  expanded?: boolean;
}) {
  return (
    <Card className="p-0">
      <PanelHeader title="آخرین آموزش‌های اضافه‌شده" to="/admin/content" icon={BookOpen} />
      {packages.length ? (
        <ul className="divide-y divide-[#edf0eb] px-4">
          {(expanded ? packages : packages.slice(0, 4)).map((pkg) => (
            <li key={pkg.id}>
              <Link
                to={`/admin/packages/${pkg.id}`}
                className="flex min-h-[58px] items-center gap-3 py-2 hover:bg-[#fbfcf8]"
                dir="rtl"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef6f0] text-[#08704f]">
                  <BookOpen className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#273831]">
                    {pkg.title}
                  </span>
                  <span className="block text-xs text-[#52645b]">
                    افزوده‌شده {relativeTime(pkg.createdAt)}
                  </span>
                </span>
                <StatusBadge status={pkg.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty icon={BookOpen} text="هنوز بستهٔ آموزشی ساخته نشده است." />
      )}
    </Card>
  );
}

function RecentActivity({
  activities,
  expanded = false,
  title = 'آخرین فعالیت‌های سیستم',
}: {
  activities: AdminDashboardActivity[];
  expanded?: boolean;
  title?: string;
}) {
  return (
    <Card className="p-0">
      <PanelHeader title={title} to="/admin/audit" icon={Activity} />
      {activities.length ? (
        <ul className="divide-y divide-[#edf0eb] px-4">
          {(expanded ? activities : activities.slice(0, 4)).map((event) => {
            const Icon = eventIcon(event.name);
            const target = eventTarget(event);
            const content = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f5f1] text-[#08704f]">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#273831]">
                    {eventTitle(event)}
                  </span>
                  <span className="block truncate text-xs text-[#52645b]">
                    {event.actorName}
                    {event.entity ? ` · ${entityLabel(event.entity)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-left text-[11px] text-[#52645b]">
                  {relativeTime(event.at)}
                </span>
              </>
            );
            return (
              <li key={`${event.source}:${event.id}`}>
                {target ? (
                  <Link
                    to={target}
                    className="flex min-h-[58px] items-center gap-3 py-2 hover:bg-[#fbfcf8]"
                    dir="rtl"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-h-[58px] items-center gap-3 py-2" dir="rtl">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <PanelEmpty icon={Activity} text="هنوز فعالیتی برای نمایش ثبت نشده است." />
      )}
    </Card>
  );
}

function ContentStatus({ data }: { data: DashboardData }) {
  const values = [
    {
      label: 'منتشرشده',
      value: data.content.published,
      to: '/admin/content',
      color: 'text-[#08704f]',
    },
    {
      label: 'پیش‌نویس',
      value: data.content.drafts,
      to: '/admin/content?tab=drafts',
      color: 'text-blue-700',
    },
    {
      label: 'بدون تخصیص',
      value: data.content.unassigned,
      to: '/admin/content?tab=unassigned',
      color: 'text-amber-700',
    },
    {
      label: 'بایگانی',
      value: data.content.archived,
      to: '/admin/archive',
      color: 'text-[#52645b]',
    },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-[#24372e]">وضعیت محتوای آموزشی</h2>
          <p className="mt-1 text-xs text-[#52645b]">موجودی محتوا بر اساس مرحلهٔ انتشار</p>
        </div>
        <Link to="/admin/content" className="text-sm font-bold text-[#08704f]">
          مدیریت محتوا
        </Link>
      </div>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#edf1ec]"
        role="img"
        aria-label="توزیع وضعیت محتوای آموزشی"
      >
        {values.map((item, index) => {
          const width = total ? (item.value / total) * 100 : 0;
          const colors = ['bg-[#08704f]', 'bg-blue-500', 'bg-amber-500', 'bg-slate-400'];
          const bar = (
            <span key={item.label} className={colors[index]} style={{ width: `${width}%` }} />
          );
          return bar;
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {values.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="rounded-xl border border-[#edf0eb] bg-[#fff] p-3 hover:border-[#b7d6c5]"
          >
            <p className="text-xs text-[#52645b]">{item.label}</p>
            <p className={cn('mt-1 text-xl font-black', item.color)}>{faNumber(item.value)}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  to: string;
  tone: 'blue' | 'green' | 'amber' | 'violet';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <Link
      to={to}
      className="flex min-h-[82px] items-center gap-3 rounded-2xl border border-[#e8e6df] bg-white px-4 py-3 shadow-sm hover:border-[#b7d6c5]"
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-[#52645b]">{label}</span>
        <span className="mt-1 block truncate text-lg font-black text-[#24372e]">{value}</span>
      </span>
      <ArrowDownLeft className="size-4 shrink-0 text-[#a0aaa2]" aria-hidden="true" />
    </Link>
  );
}

function PanelHeader({ title, to, icon: Icon }: { title: string; to: string; icon: typeof Users }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-2 border-b border-[#edf0eb] px-4">
      <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-extrabold text-[#24372e]">
        <Icon className="size-4 shrink-0 text-[#08704f]" aria-hidden="true" />
        {title}
      </h2>
      <Link
        to={to}
        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#08704f] hover:bg-[#eff7f1]"
      >
        مشاهده همه
        <ArrowLeft className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function PanelEmpty({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="grid min-h-40 place-items-center px-4 text-center">
      <div>
        <Icon className="mx-auto size-7 text-[#9aa99e]" aria-hidden="true" />
        <p className="mt-2 text-sm text-[#52645b]">{text}</p>
      </div>
    </div>
  );
}

function eventIcon(name: string) {
  if (name.includes('signup')) return UserPlus;
  if (name.includes('quiz') || name.includes('retake')) return FileQuestion;
  if (name.includes('package')) return BookOpen;
  if (name.includes('notification') || name.includes('push')) return Megaphone;
  if (name.includes('mentor')) return Sparkles;
  return ClipboardList;
}

function eventTitle(event: AdminDashboardActivity) {
  const names: Record<string, string> = {
    signup_completed: 'کاربر جدید ثبت‌نام کرد',
    package_completed: 'آموزش توسط کاربر تکمیل شد',
    quiz_passed: 'کاربر در آزمون قبول شد',
    quiz_failed: 'کاربر در آزمون قبول نشد',
    retake_requested: 'درخواست آزمون مجدد ثبت شد',
    mentor_message_sent: 'پیام جدید به منتور ارسال شد',
    'package.created': 'بستهٔ آموزشی ایجاد شد',
    'package.updated': 'بستهٔ آموزشی ویرایش شد',
    'package.published': 'آموزش منتشر شد',
    'package.archived': 'آموزش بایگانی شد',
    'user.updated': 'اطلاعات کاربر به‌روزرسانی شد',
    'user.role_changed': 'نقش کاربر تغییر کرد',
    'retake.approved': 'درخواست آزمون مجدد تأیید شد',
    'retake.rejected': 'درخواست آزمون مجدد رد شد',
    'notification.sent': 'اعلان ارسال شد',
    'policy.updated': 'سیاست‌های سیستم تغییر کرد',
    'assignment.created': 'مخاطبان به آموزش تخصیص داده شدند',
  };
  return (
    names[event.name] ??
    (event.source === 'admin' ? 'تغییر مدیریتی ثبت شد' : 'فعالیت جدید در اپلیکیشن')
  );
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    users: 'کاربران',
    packages: 'آموزش‌ها',
    retake_requests: 'آزمون مجدد',
    push_campaigns: 'کمپین‌ها',
    assignments: 'مخاطبان',
    policies: 'سیاست‌ها',
  };
  return labels[entity] ?? 'سامانه';
}

function eventTarget(event: AdminDashboardActivity) {
  if (!event.entityId) return null;
  if (event.entity === 'users') return `/admin/users/${event.entityId}`;
  if (event.entity === 'packages') return `/admin/packages/${event.entityId}`;
  if (event.entity === 'retake_requests') return '/admin/retake-requests';
  if (event.entity === 'push_campaigns') return `/admin/push-campaigns/${event.entityId}`;
  return '/admin/audit';
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes) || !value) return '—';
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${toPersianDigits(days)} روز پیش`;
  return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="در حال بارگذاری داشبورد">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_0.9fr]">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function DashboardEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 bg-gradient-to-br from-white to-[#eef8f0] py-10 text-center sm:py-14">
      <img
        src="/brand/mascot.webp"
        alt=""
        aria-hidden="true"
        className="h-40 w-40 object-contain"
      />
      <div>
        <h2 className="text-xl font-black text-[#173e35]">به پنل مدیریت آکادمی خوش آمدید</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[#66756d]">
          هنوز کاربر یا آموزش ثبت نشده است. با ساخت اولین بستهٔ آموزشی، داشبورد شما به‌تدریج با
          داده‌های واقعی پر می‌شود.
        </p>
      </div>
      <Button icon={<Rocket className="size-4" aria-hidden />} onClick={onCreate}>
        ساخت اولین آموزش
      </Button>
    </Card>
  );
}
