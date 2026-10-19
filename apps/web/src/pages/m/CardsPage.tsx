import { useQuery } from '@tanstack/react-query';
import {
  AlarmClockCheck,
  Award,
  Brain,
  Lock,
  Medal,
  Sprout,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { Card, CountUp, EmptyState, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faDate, faNumber } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { BadgeView, PointsData } from '@/lib/types';

const ICONS: Record<string, LucideIcon> = {
  sprout: Sprout,
  'alarm-clock-check': AlarmClockCheck,
  brain: Brain,
  medal: Medal,
  star: Star,
};

const DEFAULT_ICON_TONE = {
  shell: 'border-amber-200 bg-amber-50',
  icon: 'bg-accent text-on-accent',
};

const ICON_TONES: Record<string, { shell: string; icon: string }> = {
  sprout: {
    shell: 'border-primary-200 bg-primary-50',
    icon: 'bg-primary text-on-cta',
  },
  'alarm-clock-check': {
    shell: 'border-amber-200 bg-amber-50',
    icon: 'bg-accent text-on-accent',
  },
  brain: {
    shell: 'border-violet-200 bg-violet-light',
    icon: 'bg-violet text-white',
  },
  medal: DEFAULT_ICON_TONE,
  star: DEFAULT_ICON_TONE,
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
        loading={<Skeleton className="h-[188px] w-full rounded-[28px] sm:h-[216px]" />}
      >
        {(p) => (
          <section aria-label="امتیاز کل">
            <Card
              padded={false}
              className="relative min-h-[188px] overflow-hidden !rounded-[28px] border-amber-200/80 bg-[linear-gradient(135deg,#fffdf5_0%,#fff7dc_52%,#ecfdf5_100%)] shadow-md sm:min-h-[216px]"
            >
              <div
                aria-hidden
                className="absolute -end-16 -top-20 size-56 rounded-full bg-amber-200/40 blur-3xl"
              />
              <div
                aria-hidden
                className="absolute -bottom-24 -start-14 size-64 rounded-full bg-primary-200/35 blur-3xl"
              />

              <img
                src="/brand/mascot.webp"
                alt=""
                width={250}
                height={324}
                decoding="async"
                aria-hidden
                className="pointer-events-none absolute -bottom-12 -start-5 h-[208px] max-w-[48%] select-none object-contain drop-shadow-md sm:-bottom-14 sm:start-5 sm:h-[274px] lg:start-12"
              />

              <div className="relative z-10 flex min-h-[188px] items-center sm:min-h-[216px]">
                <div className="ms-auto w-[64%] py-6 pe-4 ps-2 sm:w-[57%] sm:pe-8 lg:w-[52%]">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-accent-light text-accent-fg shadow-sm">
                      <Award className="size-6" aria-hidden />
                    </span>
                    <p className="text-sm font-bold text-text-secondary sm:text-base">امتیاز کل</p>
                  </div>

                  <div className="flex items-end gap-2">
                    <p
                      className="text-[2.65rem] font-black leading-none text-brand-deep sm:text-6xl"
                      data-testid="points-balance"
                    >
                      <CountUp value={p.balance} format={faNumber} />
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        )}
      </QueryState>

      <section aria-labelledby="badges-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="badges-title" className="text-lg font-extrabold text-text sm:text-xl">
            نشان‌ها
          </h2>
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-2xl bg-accent-light text-accent-fg"
          >
            <Medal className="size-5" />
          </span>
        </div>

        <QueryState
          query={badges}
          loading={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[208px] w-full rounded-[22px]" />
              ))}
            </div>
          }
        >
          {(list) => (
            <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((b) => {
                const Icon = ICONS[b.icon] ?? Medal;
                const tone = ICON_TONES[b.icon] ?? DEFAULT_ICON_TONE;

                return (
                  <li key={b.id} className="min-w-0">
                    <Card
                      className={cn(
                        'relative flex h-full min-h-[208px] flex-col items-center overflow-hidden !rounded-[22px] p-4 text-center',
                        b.earned
                          ? cn(tone.shell, 'shadow-md')
                          : 'border-border bg-surface-2/70 shadow-none',
                      )}
                    >
                      <span
                        className={cn(
                          'relative mb-3 mt-1 flex size-[72px] shrink-0 items-center justify-center rounded-[24px] border shadow-sm',
                          b.earned
                            ? cn(tone.icon, 'border-white/50')
                            : 'border-border bg-surface text-muted-fg',
                        )}
                      >
                        <Icon className="size-8" aria-hidden />
                        {!b.earned && (
                          <span className="absolute -bottom-2 -end-2 flex size-8 items-center justify-center rounded-full border-2 border-surface-2 bg-muted-fg text-white shadow-sm">
                            <Lock className="size-4" aria-hidden />
                            <span className="sr-only">قفل شده</span>
                          </span>
                        )}
                      </span>

                      <p className="text-sm font-extrabold leading-6 text-text">{b.title}</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">{b.description}</p>

                      {b.earnedAt && (
                        <p className="mt-auto pt-3 text-[11px] font-medium text-primary-fg">
                          {faDate(b.earnedAt)}
                        </p>
                      )}

                      {!b.earned && (
                        <p className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-bold text-muted-fg">
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
        <h2 id="ledger-title" className="mb-3 text-lg font-extrabold text-text sm:text-xl">
          تاریخچه امتیاز
        </h2>

        <QueryState
          query={points}
          loading={
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-[72px] w-full rounded-[18px]" />
              <Skeleton className="h-[72px] w-full rounded-[18px]" />
              <Skeleton className="h-[72px] w-full rounded-[18px]" />
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
            <ul className="stagger overflow-hidden rounded-[22px] border border-border bg-surface shadow-sm">
              {p.ledger.map((l) => (
                <li
                  key={l.id}
                  className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-text sm:text-base">
                      {REASON[l.reason] ?? l.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">{faDate(l.createdAt)}</p>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-xl px-2.5 py-1 text-sm font-black sm:text-base',
                      l.amount >= 0
                        ? 'bg-primary-light text-primary-fg'
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
