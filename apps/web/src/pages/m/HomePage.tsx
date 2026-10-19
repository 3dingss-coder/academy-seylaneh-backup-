import { useState, type ReactNode } from 'react';
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
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6"><div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
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
      </div></div>
    );
  }
  if (!home && homeQ.isError) {
    return (
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6"><div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
        {greeting}
        <ErrorState onRetry={() => void homeQ.refetch()} />
      </div></div>
    );
  }
  if (home && home.packages.length === 0) {
    return (
      <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6"><div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
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
      </div></div>
    );
  }
  if (!home) return null;

  const suggestedPackages = home.packages.filter((p) => p.status !== 'completed').slice(0, 6);

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6"><div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
      {greeting}
      <StaleBanner
        show={homeQ.isError && homeQ.data !== undefined}
        onRetry={() => void homeQ.refetch()}
      />

      {/* Hero: reference-matched warm scene, live next lesson and one real CTA. */}
      <section
        aria-label="ادامه یادگیری"
        className={`relative h-[265px] overflow-hidden rounded-[30px] border border-[#E9E1D5] shadow-[0_18px_42px_-34px_rgba(26,67,55,.45)] sm:h-[285px]${
          highlightNext ? ' ring-4 ring-primary/25' : ''
        }`}
        style={{ backgroundColor: '#F7E8C4' }}
      >
        <img
          src="/brand/m/m-home-hero.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {/* Temporary warm veil keeps the current landscape art close to the brighter Drive reference. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,247,225,.96) 0%, rgba(255,247,225,.88) 42%, rgba(255,247,225,.36) 63%, rgba(255,247,225,0) 82%)',
          }}
        />
        <div
          className="absolute rounded-[20px] p-4"
          style={{
            bottom: 16,
            left: 14,
            width: '66%',
            backgroundColor: 'rgba(255,253,248,.97)',
            boxShadow: '0 16px 34px -24px rgba(16,42,33,0.45)',
          }}
          data-testid={next ? 'next-item' : undefined}
        >
          {next ? (
            <>
              <p className="text-[15px] font-extrabold leading-6" style={{ color: '#11704F' }}>
                ادامه یادگیری
              </p>
              <p
                className="mt-1 line-clamp-2 text-[15px] font-bold leading-6"
                style={{ color: '#17352a' }}
              >
                {next.packageTitle}
              </p>
              <p className="mt-0.5 truncate text-[12px]" style={{ color: '#777166' }}>
                درس {toPersianDigits((nextPackage?.completedSections ?? 0) + 1)} از{' '}
                {toPersianDigits(nextPackage?.sectionCount ?? 0)}
              </p>
              <span className="sr-only">
                {next.sectionTitle} • مدت‌زمان {faDuration(next.durationSec)}
              </span>
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
                className="relative mt-3 flex h-11 w-full items-center justify-center rounded-full px-10 text-sm font-bold text-white transition-transform hover:scale-[1.02] motion-reduce:transition-none"
                style={{ background: '#087B55' }}
              >
                {ACTION_LABEL[next.action]}
                <span
                  aria-hidden
                  className="absolute -right-2 flex size-12 items-center justify-center rounded-full border-[3px] border-white bg-[#203A58] shadow-lg"
                >
                  <Play size={18} fill="#fff" color="#fff" style={{ marginInlineStart: 2 }} />
                </span>
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] font-extrabold leading-6" style={{ color: '#11704F' }}>
                ادامه یادگیری
              </p>
              <EmptyNext />
            </>
          )}
        </div>
      </section>

      {/* Mentor nudge (F14) — real API nudge, hidden when there is no nudge. */}
      {topNudge ? (
        <Link
          to={topNudge.actionRef ?? '/mentor'}
          className="pressable flex min-h-14 items-center gap-3 rounded-[20px] border border-[#E7E0D6] bg-[#FFFDF8] px-4 py-3 shadow-[0_10px_26px_-24px_rgba(32,60,52,.36)] hover:bg-white"
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
        aria-label="پیشرفت کلی شما"
        className="flex items-center justify-between rounded-[24px] border border-[#E7E0D6] bg-[#FFFDF8] p-4 shadow-[0_12px_30px_-28px_rgba(32,60,52,.4)]"
        style={{ backgroundColor: '#FEFCF9', borderColor: '#E8E1D7' }}
      >
        <div>
          <p className="text-[16px] font-extrabold" style={{ color: '#17352a' }}>
            پیشرفت کلی شما
          </p>
          <p className="mt-2 text-[13px] font-medium" style={{ color: '#777166' }}>
            در مسیر عالی هستید!
          </p>
          <span className="sr-only">
            {toPersianDigits(home.counts.inProgress)} درس در حال یادگیری است.
          </span>
        </div>
        <ProgressRing
          value={home.totalProgress}
          size={96}
          stroke={9}
          label="پیشرفت کل"
          center={
            <span
              dir="ltr"
              className="absolute text-[19px] font-extrabold"
              style={{ color: '#17352a' }}
            >
              {`${toPersianDigits(home.totalProgress)}٪`}
            </span>
          }
        />
      </section>

      {/* Education opens the learning path; the course list stays available at /learn/all. */}
      <nav aria-label="میانبرها" className="grid grid-cols-4 gap-2.5 rounded-[24px] border border-[#ECE4D8] bg-[#FFFDF8] p-2.5 shadow-[0_12px_30px_-28px_rgba(32,60,52,.38)]">
        <StatTile
          to="/learn/all"
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
          to="/learn/all"
          icon={<ShieldCheck size={22} />}
          label="آزمون‌ها"
          bg="#ECE7FA"
          fg="#7B5AD6"
        />
        <StatTile to="/cards" icon={<Award size={22} />} label="مدال" bg="#E3EEFB" fg="#3D7ED8" />
      </nav>

      {/* Suggested courses — live package titles, metadata, links, and real deadlines. */}
      <section aria-label="دوره‌های پیشنهادی" className="mt-1 rounded-[24px] border border-[#ECE4D8] bg-[#FFFDF8] p-4 shadow-[0_12px_30px_-28px_rgba(32,60,52,.38)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold" style={{ color: '#17352a' }}>
            دوره‌های پیشنهادی
          </h2>
          <Link
            to="/learn/all"
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
                className="pressable flex items-center gap-3 rounded-[20px] border border-[#ECE4D8] bg-[#FFFEFA] p-3 transition-colors hover:bg-white"
                style={{ backgroundColor: '#FFFCF6', borderColor: '#E8E1D7' }}
              >
                <ProductImage
                  src={pkg.product?.imageUrl}
                  alt={pkg.title}
                  className="h-[72px] w-[72px] shrink-0 !rounded-[14px] !border-0 !bg-transparent !shadow-none"
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
  const mascotSrc = '/brand/m/m-empty.png';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src =
    avatarUrl && failedSrc !== avatarUrl ? avatarUrl : failedSrc !== mascotSrc ? mascotSrc : null;

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[#ECE4D8] bg-[#FFFDF8] px-3 py-3 shadow-[0_10px_28px_-26px_rgba(32,60,52,.38)]">
      <Link
        to="/profile"
        aria-label={`پروفایل ${firstName}`}
        className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E8E1D7] bg-[#EAF4E8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {src ? (
          <img
            src={src}
            alt=""
            aria-hidden
            className={`h-full w-full ${src === mascotSrc ? 'object-contain p-0.5' : 'object-cover'}`}
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <span aria-hidden className="text-[15px] font-bold" style={{ color: '#17352a' }}>
            {initial}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-extrabold" style={{ color: '#17352a' }}>
          سلام {firstName} جان!
        </p>
        <p className="text-[12px]" style={{ color: '#777166' }}>
          امروز یک قدم دیگر به موفقیت نزدیک‌تر شدی!
        </p>
      </div>
      <Link
        to="/messages"
        aria-label={
          unread
            ? `پیام‌ها و اعلان‌ها — ${toPersianDigits(unread)} خوانده‌نشده`
            : 'پیام‌ها و اعلان‌ها'
        }
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
      >
        <Bell size={23} aria-hidden style={{ color: '#17352a' }} />
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
    <Link
      to={to}
      className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] px-1.5 py-2 transition-transform hover:-translate-y-0.5 hover:bg-[#F9F7F0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
    >
      <span
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px]"
        style={{ background: bg, color: fg }}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-[11px] font-semibold" style={{ color: '#17352a' }}>
        {label}
      </span>
    </Link>
  );
}
