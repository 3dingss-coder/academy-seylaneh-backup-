import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing,
  BookOpenCheck,
  Bot,
  ChevronLeft,
  Headphones,
  Mail,
  PlayCircle,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  Button,
  CountdownChip,
  EmptyState,
  PackageCardSkeleton,
  ProgressRing,
  Skeleton,
} from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { ProductImage } from '@/components/common/ProductImage';
import { Mascot } from '@/components/brand/Mascot';
import { PackageCard } from '@/components/learning/PackageCard';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faNumber } from '@/lib/format';
import { qk, useHome } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { track } from '@/lib/telemetry';
import type { Nudge } from '@/lib/types';

const ACTION_LABEL = { start: 'شروع', resume: 'ادامه', quiz: 'شروع آزمون' } as const;

/** M3 — Home («کار بعدی تو»): the single most important screen. Visual truth = after/m-home-*.png. */
export function HomePage() {
  const { user } = useAuth();
  const home = useHome(user?.id);
  const nav = useNavigate();
  const loc = useLocation();
  const highlight = (loc.state as { highlightNext?: boolean } | null)?.highlightNext;
  const nudges = useQuery({
    queryKey: qk.nudges,
    queryFn: ({ signal }) => api.get<Nudge[]>('/me/mentor/nudges', signal),
  });
  const topNudge = nudges.data?.[0];

  return (
    <div className="flex flex-col gap-5 pb-3">
      <div className="px-1">
        <p className="text-sm text-text-secondary">سلام {user?.name.split(' ')[0]} 👋</p>
        <h1 className="mt-0.5 text-2xl font-extrabold text-text">کار بعدی تو</h1>
      </div>

      <StaleBanner
        show={home.isError && home.data !== undefined}
        onRetry={() => void home.refetch()}
      />

      <QueryState
        query={home}
        loading={
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-72 w-full rounded-[28px]" />
            <PackageCardSkeleton />
          </div>
        }
        isEmpty={(d) => d.packages.length === 0}
        empty={
          <EmptyState
            title="هنوز آموزشی ندارید"
            description="منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید."
            illustration={<Mascot mood="thinking" className="h-32 w-auto" />}
          />
        }
      >
        {(d) => (
          <>
            {d.nextItem ? (
              <section
                className={cn(
                  'relative overflow-hidden rounded-[28px] bg-gradient-to-bl from-[#0a6a4c] to-[#064E3B] px-5 py-5 text-white shadow-[0_18px_50px_-24px_rgba(6,78,59,.55)] sm:px-7 sm:py-6',
                  highlight && 'ring-4 ring-primary/25',
                )}
                data-testid="next-item"
              >
                {/* Soft glow + dot texture (match after/m-home-*.png hero surface). */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-24 -start-28 size-80 rounded-full bg-white/[0.07]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'radial-gradient(rgba(255,255,255,0.14) 1.5px, transparent 1.5px)',
                    backgroundSize: '20px 20px',
                  }}
                />

                <div className="relative z-10">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d7f3e3] px-3 py-1 text-xs font-extrabold text-[#064E3B]">
                    <span aria-hidden>🔥</span>
                    کار بعدی
                  </span>

                  <div className="mt-4 flex flex-row items-center gap-4 md:flex-row-reverse md:items-start">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold leading-8 text-white sm:text-2xl">
                        {d.nextItem.packageTitle}
                      </h2>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-7 text-white/75">
                        {d.nextItem.sectionTitle}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/85">
                        {d.nextItem.mediaType === 'audio' ? (
                          <Headphones className="size-4" aria-hidden />
                        ) : (
                          <PlayCircle className="size-4" aria-hidden />
                        )}
                        <span>{faDuration(d.nextItem.durationSec)}</span>
                        {d.nextItem.deadlineAt && (
                          <CountdownChip deadline={d.nextItem.deadlineAt} />
                        )}
                      </div>
                    </div>

                    {/* Real product image (contract: accessible name = package title). */}
                    <ProductImage
                      src={d.nextItem.imageUrl}
                      alt={d.nextItem.packageTitle}
                      className="size-28 shrink-0 rounded-[20px] border border-white/20 bg-white p-2 shadow-lg sm:size-32"
                    />
                  </div>

                  <Button
                    variant="light"
                    size="lg"
                    className="mt-5 min-h-14 w-full rounded-full px-6"
                    icon={<PlayCircle className="size-5" aria-hidden />}
                    onClick={() => {
                      track('next_item_cta_clicked', { action: d.nextItem?.action ?? '' });
                      nav(
                        d.nextItem?.action === 'quiz'
                          ? `/quiz/${d.nextItem.sectionId}`
                          : `/sections/${d.nextItem?.sectionId}`,
                      );
                    }}
                  >
                    {ACTION_LABEL[d.nextItem.action]}
                  </Button>
                </div>
              </section>
            ) : (
              <section className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-6 shadow-sm">
                <div className="flex items-center gap-5">
                  <Mascot mood="success" className="h-36 w-auto" />
                  <div>
                    <p className="text-lg font-extrabold text-text">
                      همه آموزش‌ها را تمام کردی! 🎉
                    </p>
                    <p className="mt-1 text-sm leading-7 text-text-secondary">
                      به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <ProgressRing value={d.totalProgress} size={92} stroke={9} label="پیشرفت کلی" />
                <div className="grid flex-1 grid-cols-3 gap-2">
                  <Stat label="در حال انجام" value={d.counts.inProgress} />
                  <Stat label="جدید" value={d.counts.new} />
                  <Stat label="تکمیل" value={d.counts.completed} />
                </div>
              </div>
              <Link
                to="/cards"
                className="pressable mt-4 flex min-h-14 items-center justify-between rounded-[18px] bg-accent-light px-4 text-accent-fg"
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <Trophy className="size-5" aria-hidden />
                  امتیاز شما
                </span>
                <span className="text-lg font-extrabold">{faNumber(d.pointsBalance)}</span>
              </Link>
            </section>

            <nav aria-label="میانبرها" className="grid grid-cols-4 gap-2">
              <QuickLink to="/learn" label="دوره‌ها" icon={BookOpenCheck} tone="amber" />
              <QuickLink to="/messages" label="پیام‌ها" icon={Mail} tone="green" />
              <QuickLink to="/cards" label="کارت‌ها" icon={Trophy} tone="violet" />
              <QuickLink to="/mentor" label="منتور" icon={Bot} tone="blue" />
            </nav>

            {topNudge && (
              <Link
                to={topNudge.actionRef ?? '/mentor'}
                className="pressable flex items-start gap-3 rounded-[20px] border border-info/20 bg-info-light p-4 text-sm text-text shadow-xs"
              >
                <Sparkles className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
                <span>{topNudge.message}</span>
              </Link>
            )}

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[18px] border border-danger/20 bg-danger-light p-4 text-sm text-danger-fg"
              >
                <BellRing className="size-5" aria-hidden />
                مهلت {toPersianDigits(d.counts.overdue)} آموزش گذشته است. هر چه زودتر تمامش کن.
              </div>
            )}

            <section aria-labelledby="my-trainings" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="my-trainings" className="text-lg font-extrabold text-text">
                  آموزش‌های من
                </h2>
                <Link
                  to="/learn"
                  className="flex min-h-12 items-center gap-0.5 px-2 text-sm font-bold text-primary-fg"
                >
                  همه
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              </div>
              <div className="stagger grid gap-3 md:grid-cols-2">
                {d.packages
                  .filter((p) => p.status !== 'completed')
                  .slice(0, 6)
                  .map((p) => (
                    <PackageCard key={p.id} p={p} />
                  ))}
              </div>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}

const QUICK_TONES = {
  amber: 'bg-accent-light text-accent-fg',
  green: 'bg-success-light text-success-fg',
  violet: 'bg-violet-light text-violet-fg',
  blue: 'bg-info-light text-info-fg',
} as const;

function QuickLink({
  to,
  label,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  icon: typeof BookOpenCheck;
  tone: keyof typeof QUICK_TONES;
}) {
  return (
    <Link
      to={to}
      className="pressable flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-[18px] border border-border bg-surface px-2 py-3 text-center shadow-xs hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className={cn('grid size-10 place-items-center rounded-[14px]', QUICK_TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-xs font-extrabold text-text">{label}</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-extrabold text-text">{toPersianDigits(value)}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </div>
  );
}
