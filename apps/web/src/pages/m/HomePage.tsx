import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, CalendarCheck, CheckCircle2, ChevronLeft, Play } from 'lucide-react';
import {
  CountBadge,
  CountUp,
  CountdownChip,
  EmptyState,
  ErrorState,
  PackageCardSkeleton,
  ProgressBar,
  ProgressRing,
  Skeleton,
} from '@/components/ui';
import { StaleBanner } from '@/components/common/QueryState';
import { MarketerIcon } from '@/components/brand/MarketerIcon';
import { ProductImage } from '@/components/common/ProductImage';
import { useAuth } from '@/lib/auth';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faNumber, faPercent } from '@/lib/format';
import { api } from '@/lib/api';
import { qk, useHome, useMessages, useNotifications } from '@/lib/queries';
import { track } from '@/lib/telemetry';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = { start: 'شروع', resume: 'ادامه', quiz: 'شروع آزمون' } as const;

/**
 * Marketer home (داشبورد اصلی) — visual truth = the per-page reference in Drive.
 * Real home data/actions remain authoritative; reference sample names and stats are never hard-coded.
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
  const greeting = (
    <HomeGreeting
      firstName={firstName}
      initial={initial}
      avatarUrl={user?.avatarUrl}
      unread={unread}
    />
  );

  // Preserve the real query's loading, error, cached/offline, and empty states.
  if (homeQ.isPending && !home) {
    return (
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
        <div className="mx-auto flex w-full max-w-[520px] sm:max-w-[760px] lg:max-w-[1040px] flex-col gap-4">
          {greeting}
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-[250px] w-full rounded-[24px] sm:h-[270px]" />
            <Skeleton className="h-[92px] w-full rounded-[20px]" />
            <div className="grid grid-cols-4 gap-2.5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="mx-auto h-[52px] w-[52px] rounded-[16px]" />
              ))}
            </div>
            <PackageCardSkeleton />
          </div>
        </div>
      </div>
    );
  }
  if (!home && homeQ.isError) {
    return (
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
        <div className="mx-auto flex w-full max-w-[520px] sm:max-w-[760px] lg:max-w-[1040px] flex-col gap-4">
          {greeting}
          <ErrorState onRetry={() => void homeQ.refetch()} />
        </div>
      </div>
    );
  }
  if (home && home.packages.length === 0) {
    return (
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
        <div className="mx-auto flex w-full max-w-[520px] sm:max-w-[760px] lg:max-w-[1040px] flex-col gap-4">
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
      </div>
    );
  }
  if (!home) return null;

  const myPackages = home.packages.filter((p) => p.status !== 'completed').slice(0, 6);
  const allCompleted =
    home.packages.length > 0 && home.packages.every((p) => p.status === 'completed');

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
      <div className="mx-auto flex w-full max-w-[520px] sm:max-w-[760px] lg:max-w-[1040px] flex-col gap-4">
        {greeting}
        <StaleBanner
          show={homeQ.isError && homeQ.data !== undefined}
          onRetry={() => void homeQ.refetch()}
        />

        {/* Next action: API-backed lesson, course context, time and one clear CTA. */}
        <section
          aria-labelledby="next-action-heading"
          className={`relative h-[290px] overflow-hidden rounded-hero border border-marketer-border bg-marketer-brand-soft shadow-md sm:h-[320px]${
            highlightNext ? ' ring-4 ring-marketer-brand/25' : ''
          }`}
        >
          <img
            src="/brand/m/m-home-hero-bg.webp"
            alt=""
            aria-hidden
            width={776}
            height={1024}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <img
            src="/brand/m/m-home-mascot-sit.webp"
            alt=""
            aria-hidden
            width={276}
            height={322}
            decoding="async"
            className="pointer-events-none absolute right-3 top-1 h-[80%] w-auto select-none [-webkit-mask-image:linear-gradient(to_bottom,#000_62%,transparent)] [mask-image:linear-gradient(to_bottom,#000_62%,transparent)]"
          />
          <div
            className="absolute bottom-4 left-4 w-[82%] max-w-[420px] rounded-card border border-marketer-border bg-marketer-surface/95 p-4 shadow-lg backdrop-blur-sm lg:w-[48%]"
            data-testid={next ? 'next-item' : undefined}
          >
            {next ? (
              <>
                <p className="text-xs font-bold text-marketer-brand">کار بعدی شما</p>
                <h2
                  id="next-action-heading"
                  className="mt-1 line-clamp-2 text-base font-extrabold leading-6 text-marketer-ink sm:text-lg"
                >
                  {next.sectionTitle}
                </h2>
                <p className="mt-1 truncate text-sm text-marketer-muted">{next.packageTitle}</p>
                <div className="mt-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-marketer-muted">
                  {nextPackage ? (
                    <span>
                      درس {toPersianDigits((nextPackage.completedSections ?? 0) + 1)} از{' '}
                      {toPersianDigits(nextPackage.sectionCount)}
                    </span>
                  ) : null}
                  <span>{faDuration(next.durationSec)}</span>
                  {next.deadlineAt ? <CountdownChip deadline={next.deadlineAt} /> : null}
                </div>
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
                  className="pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-gradient px-4 text-sm font-bold text-on-cta shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand motion-reduce:transition-none"
                >
                  <Play className="size-4" fill="currentColor" aria-hidden />
                  {ACTION_LABEL[next.action]}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-marketer-brand">مسیر یادگیری شما</p>
                <h2
                  id="next-action-heading"
                  className="mt-1 text-base font-extrabold text-marketer-ink"
                >
                  {allCompleted ? 'همه آموزش‌ها را تمام کردی!' : 'فعلاً درس بعدی در دسترس نیست'}
                </h2>
                <EmptyNext allCompleted={allCompleted} />
              </>
            )}
          </div>
        </section>

        {/* Mentor nudge (F14) — real API nudge, hidden when there is no nudge. */}
        {topNudge ? (
          <Link
            to={topNudge.actionRef ?? '/mentor'}
            className="pressable flex min-h-14 items-center gap-3 rounded-card border border-marketer-border bg-marketer-surface px-4 py-3 shadow-sm hover:bg-marketer-surface-soft"
          >
            <MarketerIcon name="mentor" className="size-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm text-marketer-ink">
              {topNudge.message}
            </span>
            <ChevronLeft className="size-4 shrink-0 text-marketer-muted" aria-hidden />
          </Link>
        ) : null}

        {/* Live progress and counts: every figure is supplied by the home API. */}
        <section
          aria-label="پیشرفت و آمار یادگیری"
          className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <div className="flex min-h-[142px] items-center justify-between gap-4 rounded-card border border-marketer-border bg-marketer-surface p-4 shadow-sm sm:p-5">
            <div>
              <h2 className="text-base font-extrabold text-marketer-ink">پیشرفت کلی شما</h2>
              <p className="mt-2 max-w-[210px] text-sm leading-6 text-marketer-muted">
                وضعیت آموزش‌هایت را یک‌جا ببین و قدم بعدی را بردار.
              </p>
            </div>
            <ProgressRing
              value={home.totalProgress}
              size={96}
              stroke={9}
              label="پیشرفت کل"
              center={
                <span dir="ltr" className="absolute text-[19px] font-extrabold text-marketer-ink">
                  {`${toPersianDigits(home.totalProgress)}٪`}
                </span>
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3" aria-label="آمار آموزشی">
            <MetricTile
              to="/learn/all"
              icon={<BookOpen className="size-4" aria-hidden />}
              label="در حال یادگیری"
              value={home.counts.inProgress}
            />
            <MetricTile
              to="/learn/all"
              icon={<CalendarCheck className="size-4" aria-hidden />}
              label="آموزش جدید"
              value={home.counts.new}
            />
            <MetricTile
              to="/learn/all"
              icon={<CheckCircle2 className="size-4" aria-hidden />}
              label="تکمیل‌شده"
              value={home.counts.completed}
            />
            <MetricTile
              to="/cards"
              icon={<Award className="size-4" aria-hidden />}
              label="امتیازها"
              value={home.pointsBalance}
              tone="points"
            />
          </div>
        </section>

        {/* Preserve the existing routes, with larger touch targets and shared tile styling. */}
        <nav
          aria-label="میانبرها"
          className="grid grid-cols-2 gap-2 rounded-card border border-marketer-border bg-marketer-surface p-2 shadow-sm sm:grid-cols-4"
        >
          <StatTile
            to="/learn/all"
            icon={<MarketerIcon name="assignment" className="size-6" />}
            label="دوره‌ها"
          />
          <StatTile
            to="/learn"
            icon={<MarketerIcon name="learning" className="size-6" />}
            label="مسیر یادگیری"
          />
          <StatTile
            to="/learn/all"
            icon={<MarketerIcon name="quiz" className="size-6" />}
            label="آزمون‌ها"
          />
          <StatTile
            to="/cards"
            icon={<MarketerIcon name="badge-medal" className="size-6" />}
            label="امتیاز و نشان‌ها"
          />
        </nav>

        {/* Assigned learning stays distinct from recommendations; show real progress and deadlines. */}
        <section
          aria-labelledby="my-learning-title"
          className="rounded-card border border-marketer-border bg-marketer-surface p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="my-learning-title" className="text-base font-extrabold text-marketer-ink">
                آموزش‌های من
              </h2>
              <p className="mt-1 text-xs text-marketer-muted">دوره‌هایی که برایت فعال هستند</p>
            </div>
            <Link
              to="/learn/all"
              className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-bold text-marketer-brand hover:bg-marketer-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand"
            >
              مشاهده همه <ChevronLeft className="ms-1 size-4" aria-hidden />
            </Link>
          </div>
          {myPackages.length > 0 ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {myPackages.map((pkg) => (
                <li key={pkg.id}>
                  <Link
                    to={`/packages/${pkg.id}`}
                    data-testid="package-card"
                    className="pressable flex min-h-[104px] items-center gap-3 rounded-card border border-marketer-border bg-marketer-surface-soft p-3 transition-colors hover:bg-marketer-surface"
                  >
                    <ProductImage
                      src={pkg.product?.imageUrl}
                      alt={pkg.title}
                      className="size-16 !border-marketer-border !bg-marketer-surface !shadow-none"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-marketer-ink">{pkg.title}</p>
                      <p className="mt-1 text-xs text-marketer-muted">
                        {toPersianDigits(pkg.sectionCount)} درس •{' '}
                        {toPersianDigits(pkg.estimatedMinutes)} دقیقه
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-h-6 items-center rounded-full bg-marketer-brand-soft px-2 text-[11px] font-bold text-marketer-brand">
                          {pkg.status === 'new' ? 'شروع‌نشده' : 'در حال یادگیری'}
                        </span>
                        {pkg.deadlineAt ? <CountdownChip deadline={pkg.deadlineAt} /> : null}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar
                          value={pkg.percent}
                          label={`پیشرفت ${pkg.title}`}
                          className="h-1.5 min-w-0 flex-1"
                        />
                        <span className="shrink-0 text-xs font-bold text-marketer-brand">
                          {faPercent(pkg.percent)}
                        </span>
                      </div>
                    </div>
                    <ChevronLeft className="size-4 shrink-0 text-marketer-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-card border border-dashed border-marketer-border bg-marketer-surface-soft px-4 py-5 text-center">
              <p className="text-sm font-bold text-marketer-ink">آموزش ناتمامی نداری</p>
              <p className="mt-1 text-xs text-marketer-muted">
                برای مرور دوره‌ها، فهرست آموزش‌ها را ببین.
              </p>
              <Link
                to="/learn/all"
                className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-marketer-brand hover:underline"
              >
                دیدن همه آموزش‌ها <ChevronLeft className="ms-1 size-4" aria-hidden />
              </Link>
            </div>
          )}
        </section>

        {/* Preserve the home-page overdue alert; absent in the normal board state. */}
        {home.counts.overdue > 0 ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-card border border-danger/20 bg-danger-light p-4 text-sm text-danger-fg"
          >
            <MarketerIcon name="deadline" className="size-6 shrink-0" />
            <p className="min-w-0 flex-1">
              مهلت {toPersianDigits(home.counts.overdue)} آموزش گذشته است. آموزش‌های ناتمام را مرور
              کن.
            </p>
            <Link
              to="/learn/all"
              className="flex min-h-10 shrink-0 items-center font-bold underline-offset-4 hover:underline"
            >
              مشاهده آموزش‌ها
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HomeGreeting({
  firstName,
  initial,
  avatarUrl,
  unread,
}: {
  firstName: string;
  initial: string;
  avatarUrl?: string | null;
  unread: number;
}) {
  const profileIconSrc = '/brand/m/icons/profile-3d.png';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const avatarSrc = avatarUrl && failedSrc !== avatarUrl ? avatarUrl : null;
  const showProfileIcon = !avatarSrc && failedSrc !== profileIconSrc;

  return (
    <div className="flex items-center gap-3 rounded-card border border-marketer-border bg-marketer-surface px-3 py-3 shadow-sm">
      <Link
        to="/profile"
        aria-label={`پروفایل ${firstName}`}
        className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-marketer-border bg-marketer-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand"
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(avatarSrc)}
          />
        ) : showProfileIcon ? (
          <MarketerIcon
            name="profile"
            className="size-full p-1"
            onError={() => setFailedSrc(profileIconSrc)}
          />
        ) : (
          <span aria-hidden className="text-base font-bold text-marketer-ink">
            {initial}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-extrabold text-marketer-ink">سلام {firstName} جان!</h1>
        <p className="text-xs text-marketer-muted">امروز یک قدم دیگر به موفقیت نزدیک‌تر شدی!</p>
      </div>
      <Link
        to="/messages"
        aria-label={
          unread
            ? `پیام‌ها و اعلان‌ها — ${toPersianDigits(unread)} خوانده‌نشده`
            : 'پیام‌ها و اعلان‌ها'
        }
        className="relative flex size-12 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand lg:hidden"
      >
        <MarketerIcon name="notification" className="size-6" />
        <CountBadge count={unread} className="absolute -top-0.5 end-0" />
      </Link>
    </div>
  );
}

/** Keep the completion celebration only when the live API confirms all assigned packages are done. */
function EmptyNext({ allCompleted }: { allCompleted: boolean }) {
  return (
    <div className="mt-2">
      <p className="text-xs leading-5 text-marketer-muted">
        {allCompleted
          ? 'به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.'
          : 'برای مرور دوره‌ها و آموزش‌های در دسترس، فهرست آموزش‌ها را ببین.'}
      </p>
      <Link
        to="/learn/all"
        className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-marketer-brand hover:underline"
      >
        دیدن همه آموزش‌ها <ChevronLeft className="ms-1 size-4" aria-hidden />
      </Link>
      {allCompleted ? (
        <img
          src="/brand/m/m-celebrate-trophy.png"
          alt=""
          aria-hidden
          width={160}
          height={120}
          decoding="async"
          className="mt-1 h-11 w-auto object-contain"
        />
      ) : null}
    </div>
  );
}

function MetricTile({
  to,
  icon,
  label,
  value,
  tone = 'default',
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'points';
}) {
  const points = tone === 'points';
  return (
    <Link
      to={to}
      aria-label={`${label}: ${toPersianDigits(value)}`}
      className={`pressable min-h-[88px] rounded-card border p-3 shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand ${
        points
          ? 'border-accent/30 bg-accent-light hover:bg-accent-light/80'
          : 'border-marketer-border bg-marketer-surface hover:bg-marketer-surface-soft'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-xl ${
            points ? 'bg-accent text-on-accent' : 'bg-marketer-brand-soft text-marketer-brand'
          }`}
        >
          {icon}
        </span>
        <span
          className={`truncate text-xs font-semibold ${points ? 'text-accent-fg' : 'text-marketer-muted'}`}
        >
          {label}
        </span>
      </div>
      <p
        className={`mt-2 text-xl font-black leading-none ${points ? 'text-accent-fg' : 'text-marketer-ink'}`}
      >
        <CountUp value={value} format={faNumber} />
      </p>
    </Link>
  );
}

function StatTile({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="pressable flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-card px-2 py-3 text-center text-marketer-ink transition-colors hover:bg-marketer-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand motion-reduce:transition-none"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marketer-brand-soft text-marketer-brand">
        {icon}
      </span>
      <span className="text-xs font-semibold leading-5">{label}</span>
    </Link>
  );
}
