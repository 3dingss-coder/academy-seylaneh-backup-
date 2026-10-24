import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Card, CountUp, EmptyState, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { MarketerIcon, type MarketerIconName } from '@/components/brand/MarketerIcon';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faDate, faNumber } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { BadgeView, PointsData } from '@/lib/types';

const ICONS: Record<string, MarketerIconName> = {
  sprout: 'badge-sprout',
  'alarm-clock-check': 'badge-clock',
  brain: 'badge-brain',
  medal: 'badge-medal',
  star: 'badge-star',
};

const DEFAULT_ICON_SHELL = 'border-accent/30 bg-accent-light';
const ICON_SHELLS: Record<string, string> = {
  sprout: 'border-marketer-brand/30 bg-marketer-brand-soft',
  'alarm-clock-check': DEFAULT_ICON_SHELL,
  brain: 'border-violet/25 bg-violet-light',
  medal: DEFAULT_ICON_SHELL,
  star: DEFAULT_ICON_SHELL,
};

const REASON: Record<string, string> = {
  on_time_completion: 'تکمیل به‌موقع',
  first_pass_quiz: 'قبولی در تلاش اول',
  package_completion: 'تکمیل بسته',
  badge: 'نشان جدید',
  policy_penalty: 'کسر امتیاز',
  manual: 'تنظیم مدیر',
};

/** M10 — امتیاز و نشان‌ها (points awarded server-side only). */
export function CardsPage() {
  const points = useQuery({
    queryKey: qk.points,
    queryFn: ({ signal }) => api.get<PointsData>('/me/points', signal),
  });
  const badges = useQuery({
    queryKey: qk.badges,
    queryFn: ({ signal }) => api.get<BadgeView[]>('/me/badges', signal),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="امتیاز و نشان‌ها" />

      <QueryState
        query={points}
        loading={<Skeleton className="h-[188px] w-full rounded-hero sm:h-[216px]" />}
      >
        {(p) => (
          <section aria-label="امتیاز کل">
            <Card
              tone="hero"
              padded={false}
              className="relative min-h-[188px] overflow-hidden !rounded-hero sm:min-h-[216px]"
            >
              <div
                aria-hidden
                className="bg-dots pointer-events-none absolute inset-0 text-white/10 [mask-image:radial-gradient(70%_70%_at_0%_0%,#000,transparent)]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -end-10 -top-12 size-40 rounded-full bg-white/10"
              />

              <div className="relative z-10 flex min-h-[188px] items-center gap-5 px-5 py-6 sm:min-h-[216px] sm:px-8">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-[5px] border-white/20 bg-marketer-surface shadow-md sm:size-20">
                  <MarketerIcon name="badge-star" className="size-10 sm:size-12" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white/90 sm:text-base">امتیاز کل</p>
                  <p
                    className="mt-2 text-4xl font-black leading-none text-white sm:text-6xl"
                    data-testid="points-balance"
                  >
                    <CountUp value={p.balance} format={faNumber} />
                  </p>
                </div>
              </div>
            </Card>
          </section>
        )}
      </QueryState>

      <section aria-labelledby="badges-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="badges-title" className="text-lg font-extrabold text-marketer-ink sm:text-xl">
            نشان‌ها
          </h2>
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-2xl bg-accent-light text-accent-fg"
          >
            <MarketerIcon name="badge-medal" className="size-6" />
          </span>
        </div>

        <QueryState
          query={badges}
          loading={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[208px] w-full rounded-hero" />
              ))}
            </div>
          }
        >
          {(list) => (
            <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((b) => {
                const icon = ICONS[b.icon] ?? 'badge-medal';
                const shell = ICON_SHELLS[b.icon] ?? DEFAULT_ICON_SHELL;

                return (
                  <li key={b.id} className="min-w-0">
                    <Card
                      className={cn(
                        'relative flex h-full min-h-[208px] flex-col items-center overflow-hidden !rounded-hero p-4 text-center',
                        b.earned
                          ? cn(shell, 'shadow-md')
                          : 'border-marketer-border bg-marketer-surface-soft shadow-none',
                      )}
                    >
                      <span className="relative mb-3 mt-1 flex size-[72px] shrink-0 items-center justify-center rounded-2xl border border-marketer-border bg-marketer-surface shadow-sm">
                        <MarketerIcon name={icon} className="size-8" />
                        {!b.earned && (
                          <span className="absolute -bottom-2 -end-2 flex size-8 items-center justify-center rounded-full border-2 border-marketer-surface bg-marketer-brand text-on-cta shadow-sm">
                            <Lock className="size-4" aria-hidden />
                            <span className="sr-only">قفل شده</span>
                          </span>
                        )}
                      </span>

                      <p className="text-sm font-extrabold leading-6 text-marketer-ink">
                        {b.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-marketer-muted">{b.description}</p>

                      {b.earnedAt && (
                        <p className="mt-auto pt-3 text-[11px] font-medium text-marketer-brand">
                          {faDate(b.earnedAt)}
                        </p>
                      )}

                      {!b.earned && (
                        <p className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-bold text-marketer-muted">
                          <Lock className="size-3" aria-hidden />
                          قفل شده
                        </p>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </section>

      <section aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="mb-3 text-lg font-extrabold text-marketer-ink sm:text-xl">
          تاریخچه امتیاز
        </h2>

        <QueryState
          query={points}
          loading={
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-[72px] w-full rounded-card" />
              <Skeleton className="h-[72px] w-full rounded-card" />
              <Skeleton className="h-[72px] w-full rounded-card" />
            </div>
          }
          isEmpty={(p) => p.ledger.length === 0}
          empty={
            <EmptyState
              title="هنوز امتیازی نگرفته‌ای"
              description="با تکمیل به‌موقع آموزش‌ها و قبولی در آزمون امتیاز بگیر."
            />
          }
        >
          {(p) => (
            <ul className="stagger overflow-hidden rounded-hero border border-marketer-border bg-marketer-surface shadow-sm">
              {p.ledger.map((l) => (
                <li
                  key={l.id}
                  className="flex min-h-[72px] items-center justify-between gap-4 border-b border-marketer-border px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-marketer-ink sm:text-base">
                      {REASON[l.reason] ?? l.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-marketer-muted">{faDate(l.createdAt)}</p>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-xl px-2.5 py-1 text-sm font-black sm:text-base',
                      l.amount >= 0
                        ? 'bg-marketer-brand-soft text-marketer-brand'
                        : 'bg-danger-light text-danger-fg',
                    )}
                    dir="ltr"
                  >
                    {l.amount >= 0 ? '+' : ''}
                    {faNumber(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
    </div>
  );
}
