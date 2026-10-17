import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  Headphones,
  PlayCircle,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import {
  Button,
  Card,
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

/** M3 — Home («کار بعدی»): the single most important screen. */
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
    <div className="stagger flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-hero bg-hero px-5 py-6 shadow-lg sm:px-7 sm:py-7">
        <div aria-hidden className="bg-dots absolute inset-0 text-white/[0.05]" />
        <div
          aria-hidden
          className="absolute -end-20 -top-24 size-56 rounded-full bg-primary-300/15 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -start-16 size-48 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/70">سلام {user?.name.split(' ')[0]}</p>
            <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">کار بعدی تو</h1>
            <p className="mt-2 max-w-lg text-sm leading-7 text-white/70">
              قدم بعدی مسیر یادگیریت را از همین‌جا ادامه بده.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white/85 sm:flex">
            <Target className="size-4 text-accent" aria-hidden />
            مسیر امروز
          </div>
        </div>
      </section>
      <StaleBanner
        show={home.isError && home.data !== undefined}
        onRetry={() => void home.refetch()}
      />
      <QueryState
        query={home}
        loading={
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-44 w-full" />
            <PackageCardSkeleton />
            <PackageCardSkeleton />
          </div>
        }
        isEmpty={(d) => d.packages.length === 0}
        empty={
          <EmptyState
            title="هنوز آموزشی ندارید"
            description="منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید."
            illustration={<Mascot mood="thinking" className="h-24 w-auto" />}
          />
        }
      >
        {(d) => (
          <>
            {d.nextItem ? (
              <Card
                tone="hero"
                className={cn(
                  'relative overflow-hidden p-5 sm:p-6',
                  highlight && 'ring-4 ring-primary/40',
                )}
                data-testid="next-item"
              >
                {/* brand texture: dot grid + soft circles (decorative) */}
                <div
                  aria-hidden
                  className="bg-dots pointer-events-none absolute inset-0 text-white/10 [mask-image:radial-gradient(70%_70%_at_0%_0%,#000,transparent)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -end-10 -top-12 size-40 rounded-full bg-white/10"
                />
                <p className="relative mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">
                  <Sparkles className="size-3.5" aria-hidden />
                  کار بعدی
                </p>
                <div className="relative grid grid-cols-[96px_1fr] gap-4 sm:grid-cols-[112px_1fr]">
                  <div className="relative self-start">
                    <div className="absolute -inset-3 rounded-[24px] bg-white/10 blur-xl" />
                    <ProductImage
                      src={d.nextItem.imageUrl}
                      alt={d.nextItem.packageTitle}
                      className="relative size-24 rounded-[20px] border border-white/20 bg-white/95 object-contain p-2 shadow-md sm:size-28"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-lg font-extrabold leading-8 text-white">
                      {d.nextItem.packageTitle}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
                      {d.nextItem.mediaType === 'audio' ? (
                        <Headphones className="size-4" aria-hidden />
                      ) : (
                        <PlayCircle className="size-4" aria-hidden />
                      )}
                      <span className="line-clamp-1">{d.nextItem.sectionTitle}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {d.nextItem.deadlineAt && <CountdownChip deadline={d.nextItem.deadlineAt} />}
                      <span className="text-xs text-white/85">
                        {faDuration(d.nextItem.durationSec)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  block
                  variant="light"
                  className="relative mt-5 min-h-14 rounded-[16px] text-base font-extrabold"
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
              </Card>
            ) : (
              <Card tone="brand" className="flex items-center gap-3">
                {/* success state (handoff: mascot may support success moments) */}
                <Mascot mood="success" className="h-24 w-auto shrink-0" />
                <div>
                  <p className="font-bold text-text">همه آموزش‌ها را تمام کردی! 🎉</p>
                  <p className="text-sm text-text-secondary">
                    آموزش جدید که فعال شود، اینجا می‌بینی.
                  </p>
                </div>
              </Card>
            )}

            {topNudge && (
              <Link
                to={topNudge.actionRef ?? '/mentor'}
                className="pressable flex items-start gap-3 rounded-card border border-info/30 bg-info-light p-3 text-sm text-text hover:shadow-sm"
              >
                <Sparkles className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
                <span>{topNudge.message}</span>
              </Link>
            )}

            <Card className="overflow-hidden p-0">
              <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing value={d.totalProgress} size={84} stroke={8} label="پیشرفت کلی" />
                  <div>
                    <p className="text-xs font-bold text-primary-fg">پیشرفت کلی</p>
                    <p className="mt-1 text-sm text-text-secondary">روند یادگیری این دوره</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="در حال انجام" value={d.counts.inProgress} icon={PlayCircle} />
                  <Stat label="جدید" value={d.counts.new} icon={BookOpenCheck} />
                  <Stat label="تکمیل" value={d.counts.completed} icon={CheckCircle2} />
                </div>
              </div>
              <Link
                to="/cards"
                className="pressable flex min-h-14 items-center justify-between border-t border-accent/20 bg-accent-light px-4 text-accent-fg"
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <span className="grid size-9 place-items-center rounded-full bg-accent/15">
                    <Trophy className="size-5" aria-hidden />
                  </span>
                  امتیاز شما
                </span>
                <span className="text-lg font-extrabold">{faNumber(d.pointsBalance)}</span>
              </Link>
            </Card>

            {d.counts.overdue > 0 && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger-light p-3 text-sm text-danger-fg"
              >
                <BellRing className="size-5" aria-hidden />
                مهلت {toPersianDigits(d.counts.overdue)} آموزش گذشته است. هر چه زودتر تمامش کن.
              </div>
            )}

            <section aria-labelledby="my-trainings" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="my-trainings" className="text-base font-bold text-text">
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

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof PlayCircle;
}) {
  return (
    <div className="rounded-card border border-border bg-background p-3 text-center">
      <Icon className="mx-auto mb-2 size-5 text-primary-fg" aria-hidden />
      <p className="text-xl font-extrabold text-text">{toPersianDigits(value)}</p>
      <p className="mt-0.5 text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}
