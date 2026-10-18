import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Bell,
  BellRing,
  Bot,
  CalendarCheck,
  ChevronLeft,
  Play,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import {
  CountBadge,
  CountdownChip,
  EmptyState,
  ErrorState,
  PackageCardSkeleton,
  ProgressRing,
  Skeleton,
} from '@/components/ui';
import { StaleBanner } from '@/components/common/QueryState';
import { ProductImage } from '@/components/common/ProductImage';
import { useAuth } from '@/lib/auth';
import { toPersianDigits } from '@/lib/digits';
import { faDuration } from '@/lib/format';
import { api } from '@/lib/api';
import { qk, useHome, useMessages, useNotifications } from '@/lib/queries';
import { track } from '@/lib/telemetry';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = { start: 'شروع', resume: 'ادامه', quiz: 'شروع آزمون' } as const;

/**
 * Marketer home (داشبورد اصلی) — visual truth = board «تمامی صفحات اپلیکیشن بازاریاب».
 * Real home data/actions remain authoritative; board sample names and stats are ignored.
 */
export function HomePage() {
  const { user } = useAuth();
  const homeQ = useHome(user?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const messages = useMessages();
  const unread =
    (notifications.data?.unread ?? 0) + (messages.data?.filter((m) => !m.readAt).length ?? 0);
  const home = homeQ.data;
  const next = home?.nextItem ?? null;
  const nextPackage = home?.packages.find((p) => p.id === next?.packageId) ?? null;
  const highlightNext = (location.state as { highlightNext?: boolean } | null)?.highlightNext;

  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  const topNudge = nudges.data?.[0];

  const fullName = user?.name ?? '';
  const firstName = fullName.trim().split(/\s+/)[0] || 'کاربر گرامی';
  const initial = fullName.trim().charAt(0) || '؟';
  const greeting = <HomeGreeting firstName={firstName} initial={initial} unread={unread} />;

  // Preserve the real query's loading, error, cached/offline, and empty states.
  if (homeQ.isPending && !home) {
    return (
      <div className="mx-1 flex flex-col gap-3 pt-5 lg:mx-auto lg:max-w-[480px]">
        {greeting}
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-[214px] w-full rounded-[24px] lg:h-[260px]" />
          <Skeleton className="h-[92px] w-full rounded-[20px]" />
          <div className="grid grid-cols-4 gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="mx-auto h-[52px] w-[52px] rounded-[16px]" />
            ))}
          </div>
          <PackageCardSkeleton />
        </div>
      </div>
    );
  }
  if (!home && homeQ.isError) {
    return (
      <div className="mx-1 flex flex-col gap-3 pt-5 lg:mx-auto lg:max-w-[480px]">
        {greeting}
        <ErrorState onRetry={() => void homeQ.refetch()} />
      </div>
    );
  }
  if (home && home.packages.length === 0) {
    return (
      <div className="mx-1 flex flex-col gap-3 pt-5 lg:mx-auto lg:max-w-[480px]">
        {greeting}
        <StaleBanner
          show={homeQ.isError && homeQ.data !== undefined}
          onRetry={() => void homeQ.refetch()}
        />
        <EmptyState
          title="هنوز آموزشی ندارید"
          description="منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید."
          illustration={
            <img
              src="/brand/m/m-empty.png"
              alt=""
              aria-hidden
              className="h-32 w-auto object-contain"
            />
          }
        />
      </div>
    );
  }
  if (!home) return null;

  const suggestedPackages = home.packages.filter((p) => p.status !== 'completed').slice(0, 6);

  return (
    <div className="mx-1 flex flex-col gap-3 pt-5 lg:mx-auto lg:max-w-[480px]">
      {greeting}
      <StaleBanner
        show={homeQ.isError && homeQ.data !== undefined}
        onRetry={() => void homeQ.refetch()}
      />

      {/* Hero: m-home-hero scene + white continue-card + play circle */}
      <section
        aria-label="ادامه یادگیری"
        className={`relative h-[214px] overflow-hidden rounded-[24px] lg:h-[260px]${
          highlightNext ? ' ring-4 ring-primary/25' : ''
        }`}
      >
        <img
          src="/brand/m/m-home-hero.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <div
          className="absolute rounded-[18px] bg-white p-3.5"
          style={{
            bottom: 14,
            left: 14,
            width: '62%',
            backgroundColor: '#FEFCF9',
            boxShadow: '0 10px 26px rgba(16,42,33,0.16)',
          }}
          data-testid={next ? 'next-item' : undefined}
        >
          <p className="text-[10px] tracking-[0.02em]" style={{ color: '#777166' }}>
            ادامه یادگیری
          </p>
          {next ? (
            <>
              <p
                className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-6"
                style={{ color: '#17352a' }}
              >
                {next.packageTitle}
              </p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: '#777166' }}>
                درس {toPersianDigits((nextPackage?.completedSections ?? 0) + 1)} از{' '}
                {toPersianDigits(nextPackage?.sectionCount ?? 0)}
              </p>
              <span className="sr-only">
                {next.sectionTitle} • مدت‌زمان {faDuration(next.durationSec)}
              </span>
              <div
                dir="rtl"
                className="relative mt-2.5 h-[26px] overflow-hidden rounded-full"
                style={{ background: '#EDE7DA' }}
              >
                <div
                  className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${next.percent}%`, background: '#1e8650' }}
                />
                <span
                  dir="ltr"
                  className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    next.percent >= 20 ? 'bg-[#0e6e4e] text-white' : 'bg-[#EDE7DA] text-[#17352a]'
                  }`}
                >
                  {`%${toPersianDigits(next.percent)}`}
                </span>
              </div>
              {next.deadlineAt ? (
                <div className="mt-1.5">
                  <CountdownChip deadline={next.deadlineAt} />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  track('next_item_cta_clicked', { action: next.action });
                  navigate(
                    next.action === 'quiz'
                      ? `/quiz/${next.sectionId}`
                      : `/sections/${next.sectionId}`,
                  );
                }}
                aria-label={`${ACTION_LABEL[next.action]}: ${next.sectionTitle}`}
                className="absolute flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 motion-reduce:transition-none"
                style={{
                  bottom: -22,
                  right: -16,
                  background: '#17352a',
                  boxShadow: '0 10px 22px rgba(16,42,33,0.32)',
                }}
              >
                <Play
                  size={19}
                  fill="#fff"
                  color="#fff"
                  aria-hidden
                  style={{ marginInlineStart: 2 }}
                />
              </button>
            </>
          ) : (
            <EmptyNext />
          )}
        </div>
      </section>

      {/* Mentor nudge (F14) — real API nudge, hidden when there is no nudge. */}
      {topNudge ? (
        <Link
          to={topNudge.actionRef ?? '/mentor'}
          className="flex items-center gap-2.5 rounded-[16px] border border-border bg-card px-3.5 py-3 transition-colors hover:bg-surface"
        >
          <Bot size={17} aria-hidden style={{ color: '#2F9E68' }} />
          <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: '#17352a' }}>
            {topNudge.message}
          </span>
          <ChevronLeft size={15} aria-hidden style={{ color: '#777166' }} />
        </Link>
      ) : null}

      {/* Overall progress */}
      <section
        aria-label="پیشرفت کل"
        className="flex items-center justify-between rounded-[20px] border border-border bg-card p-4"
        style={{ backgroundColor: '#FEFCF9', borderColor: '#E8E1D7' }}
      >
        <div>
          <p className="text-[15px] font-bold" style={{ color: '#17352a' }}>
            پیشرفت کل شما
          </p>
          <p className="mt-1 text-[11.5px]" style={{ color: '#777166' }}>
            در حال حاضر {toPersianDigits(home.counts.inProgress)} درس باز است!
          </p>
        </div>
        <ProgressRing
          value={home.totalProgress}
          size={58}
          stroke={6.5}
          label="پیشرفت کل"
          center={
            <span dir="ltr" className="absolute text-[13px] font-bold" style={{ color: '#17352a' }}>
              {`%${toPersianDigits(home.totalProgress)}`}
            </span>
          }
        />
      </section>

      {/* Board tiles are real navigation targets; exam list currently routes to the learning list. */}
      <nav aria-label="میانبرها" className="grid grid-cols-4 gap-2.5">
        <StatTile
          to="/learn"
          icon={<CalendarCheck size={22} />}
          label="دوره‌ها"
          bg="#FBE9D6"
          fg="#E07B39"
        />
        <StatTile
          to="/learn"
          icon={<ShoppingBag size={22} />}
          label="مسیر یادگیری"
          bg="#E2F2E8"
          fg="#2F9E68"
        />
        <StatTile
          to="/learn"
          icon={<ShieldCheck size={22} />}
          label="آزمون‌ها"
          bg="#ECE7FA"
          fg="#7B5AD6"
        />
        <StatTile to="/cards" icon={<Award size={22} />} label="مدال" bg="#E3EEFB" fg="#3D7ED8" />
      </nav>

      {/* Suggested courses — live package titles, metadata, links, and real deadlines. */}
      <section aria-label="دوره‌های پیشنهادی" className="mt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold" style={{ color: '#17352a' }}>
            دوره‌های پیشنهادی
          </h2>
          <Link
            to="/learn"
            className="flex min-h-12 items-center text-[12px] font-medium text-primary-fg hover:underline"
          >
            مشاهده همه ←
          </Link>
        </div>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {suggestedPackages.map((pkg) => (
            <li key={pkg.id}>
              <Link
                to={`/packages/${pkg.id}`}
                data-testid="package-card"
                className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-2.5 transition-colors hover:bg-surface"
                style={{ backgroundColor: '#FEFCF9', borderColor: '#E8E1D7' }}
              >
                <ProductImage
                  src={pkg.product?.imageUrl}
                  alt={pkg.title}
                  className="h-[56px] w-[56px] !rounded-[12px] !border-0 !bg-transparent !shadow-none"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold" style={{ color: '#17352a' }}>
                    {pkg.title}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: '#777166' }}>
                    {toPersianDigits(pkg.sectionCount)} درس •{' '}
                    {toPersianDigits(pkg.estimatedMinutes)} دقیقه
                  </p>
                  {pkg.deadlineAt ? (
                    <div className="mt-1">
                      <CountdownChip deadline={pkg.deadlineAt} />
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Preserve the home-page overdue alert; absent in the normal board state. */}
      {home.counts.overdue > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[18px] border border-danger/20 bg-danger-light p-4 text-sm text-danger-fg"
        >
          <BellRing className="size-5" aria-hidden />
          مهلت {toPersianDigits(home.counts.overdue)} آموزش گذشته است. هر چه زودتر تمامش کن.
        </div>
      ) : null}
    </div>
  );
}

function HomeGreeting({
  firstName,
  initial,
  unread,
}: {
  firstName: string;
  initial: string;
  unread: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
        style={{ background: '#EFE9DC', color: '#17352a' }}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold" style={{ color: '#17352a' }}>
          سلام {firstName} جان!
        </p>
        <p className="text-[11.5px]" style={{ color: '#777166' }}>
          امروز یک قدم به هدفت نزدیک‌تر شو.
        </p>
      </div>
      <Link
        to="/messages"
        aria-label={
          unread
            ? `پیام‌ها و اعلان‌ها — ${toPersianDigits(unread)} خوانده‌نشده`
            : 'پیام‌ها و اعلان‌ها'
        }
        className="relative flex h-12 w-12 items-center justify-center rounded-full lg:hidden"
      >
        <Bell size={20} aria-hidden style={{ color: '#17352a' }} />
        <CountBadge count={unread} className="absolute -top-0.5 left-0" />
      </Link>
    </div>
  );
}

/** Keep the original no-next success moment, using the delivered full-quality celebration asset. */
function EmptyNext() {
  return (
    <div className="mt-1">
      <p className="text-[13px] font-bold" style={{ color: '#17352a' }}>
        همه آموزش‌ها را تمام کردی! 🎉
      </p>
      <p className="mt-1 text-[11px] leading-5" style={{ color: '#777166' }}>
        به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.
      </p>
      <img
        src="/brand/m/m-celebrate-trophy.png"
        alt=""
        aria-hidden
        className="mt-1 h-11 w-auto object-contain"
      />
    </div>
  );
}

function StatTile({
  to,
  icon,
  label,
  bg,
  fg,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <Link to={to} className="flex min-h-[72px] flex-col items-center gap-1.5">
      <span
        className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px]"
        style={{ background: bg, color: fg }}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-[10.5px] font-medium" style={{ color: '#17352a' }}>
        {label}
      </span>
    </Link>
  );
}
