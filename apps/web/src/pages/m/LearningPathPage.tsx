import { ArrowRight, Check, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Skeleton } from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { Mascot } from '@/components/brand/Mascot';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faPercent } from '@/lib/format';
import { usePackages } from '@/lib/queries';
import type { PackageSummary } from '@/lib/types';

interface NodePosition {
  topPct: number;
  circleLeftPct: number;
  circleTopPct: number;
  textOffsetPct: number;
}

const SEGMENT_NODE_POSITIONS: readonly NodePosition[] = [
  {
    topPct: 17.2,
    circleLeftPct: 51.33,
    circleTopPct: 16.61,
    textOffsetPct: 60.2,
  },
  {
    topPct: 41.8,
    circleLeftPct: 53.03,
    circleTopPct: 40.89,
    textOffsetPct: 62.5,
  },
  {
    topPct: 64.2,
    circleLeftPct: 26.67,
    circleTopPct: 62.98,
    textOffsetPct: 37.5,
  },
  {
    topPct: 85.2,
    circleLeftPct: 46.87,
    circleTopPct: 84.03,
    textOffsetPct: 56.8,
  },
] as const;

const ITEMS_PER_SEGMENT = SEGMENT_NODE_POSITIONS.length;

function orderByLearningPath(packages: PackageSummary[]) {
  return packages
    .map((course, index) => ({ course, index }))
    .sort((a, b) => a.course.pathOrder - b.course.pathOrder || a.index - b.index)
    .map(({ course }) => course);
}

function stepStatus(course: PackageSummary) {
  if (course.status === 'completed') {
    return {
      label: 'تکمیل‌شده',
      icon: Check,
      node: 'bg-cta text-on-cta shadow-sm',
      text: 'text-marketer-brand',
    };
  }
  if (course.status === 'in_progress') {
    return {
      label: 'در حال یادگیری',
      icon: Check,
      node: 'border-2 border-accent/40 bg-accent text-on-accent shadow-sm',
      text: 'text-accent-fg',
    };
  }
  return {
    label: 'شروع‌نشده',
    icon: Check,
    node: 'border-2 border-marketer-border bg-marketer-surface text-marketer-muted shadow-xs',
    text: 'text-marketer-muted',
  };
}

/** M4 — learner roadmap matching مسیر یادگیری من.png with alternating mascot segments on scroll; all-courses list remains one tap away. */
export function LearningPathPage() {
  const q = usePackages();

  return (
    <div className="min-h-[100dvh] bg-marketer-path-canvas px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-[460px] flex-col gap-2">
        <header className="relative flex min-h-12 items-center justify-center">
          <Link
            to="/"
            aria-label="بازگشت به خانه"
            className="pressable absolute left-0 grid size-12 place-items-center rounded-full text-marketer-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-marketer-brand"
          >
            <ChevronLeft className="size-7" aria-hidden="true" />
          </Link>
          <h1 className="text-xl font-extrabold text-marketer-ink sm:text-2xl">مسیر یادگیری من</h1>
        </header>
        <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />
        <QueryState
          query={q}
          loading={
            <div className="flex flex-col gap-3 rounded-hero border border-marketer-border bg-marketer-surface-soft p-4">
              <Skeleton className="h-48 w-2/5 rounded-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
          {(list) => {
            const steps = orderByLearningPath(list);
            const segments: PackageSummary[][] = [];
            for (let i = 0; i < steps.length; i += ITEMS_PER_SEGMENT) {
              segments.push(steps.slice(i, i + ITEMS_PER_SEGMENT));
            }

            return (
              <section
                aria-label="مسیر آموزش‌های من"
                className="relative isolate flex flex-1 flex-col gap-3 overflow-hidden rounded-hero bg-marketer-path-canvas pb-4"
              >
                {steps.length === 0 ? (
                  <div className="relative z-20 flex min-h-72 flex-col items-center justify-center px-4 py-12 text-center">
                    <EmptyState
                      title="هنوز مسیری برایت فعال نشده"
                      description="وقتی آموزشی به تو اختصاص داده شود، مسیر یادگیری‌ات همین‌جا نمایش داده می‌شود."
                      illustration={<Mascot mood="thinking" className="h-24 w-auto" />}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {segments.map((segPackages, segIdx) => {
                      const mascotOnRight = segIdx % 2 === 1;
                      const hasNextSegment = segIdx < segments.length - 1;
                      const count = segPackages.length;

                      return (
                        <div
                          key={`segment-${segIdx}`}
                          data-testid="learning-path-segment"
                          data-mascot-side={mascotOnRight ? 'right' : 'left'}
                          className="flex flex-col"
                        >
                          <div dir="ltr" className="relative w-full select-none overflow-hidden">
                            <img
                              src="/brand/m/m-learning-path-scene.webp"
                              alt=""
                              aria-hidden="true"
                              className={cn(
                                'block h-auto w-full object-contain',
                                mascotOnRight && 'scale-x-[-1]',
                              )}
                            />

                            {/* Hide unused baked-in milestone nodes when the final segment has fewer than 4 items */}
                            {count < 4 && (
                              <>
                                {count <= 1 && (
                                  <div
                                    aria-hidden="true"
                                    style={
                                      mascotOnRight
                                        ? { left: 0, right: '42%', top: '26%', bottom: '8%' }
                                        : { left: '42%', right: 0, top: '26%', bottom: '8%' }
                                    }
                                    className="pointer-events-none absolute bg-marketer-path-canvas"
                                  />
                                )}
                                {count <= 2 && (
                                  <div
                                    aria-hidden="true"
                                    style={
                                      mascotOnRight
                                        ? { left: 0, right: '19%', top: '48%', bottom: '8%' }
                                        : { left: '19%', right: 0, top: '48%', bottom: '8%' }
                                    }
                                    className="pointer-events-none absolute bg-marketer-path-canvas"
                                  />
                                )}
                                {count === 3 && (
                                  <div
                                    aria-hidden="true"
                                    style={
                                      mascotOnRight
                                        ? { left: 0, right: '34%', top: '70%', bottom: '6%' }
                                        : { left: '34%', right: 0, top: '70%', bottom: '6%' }
                                    }
                                    className="pointer-events-none absolute bg-marketer-path-canvas"
                                  />
                                )}
                              </>
                            )}

                            {/* Seamless sage-green connector into the next segment when scrolling */}
                            {hasNextSegment && (
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 100 22"
                                preserveAspectRatio="none"
                                style={{
                                  left: '40%',
                                  width: '20%',
                                  top: '88%',
                                  height: '12%',
                                }}
                                className="pointer-events-none absolute"
                              >
                                <path
                                  d={
                                    mascotOnRight
                                      ? 'M 65 0 C 65 11, 56 15, 56 22'
                                      : 'M 35 0 C 35 11, 44 15, 44 22'
                                  }
                                  fill="none"
                                  stroke="var(--color-marketer-brand)"
                                  strokeWidth="9"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}

                            <ol
                              aria-label={`گام‌های مسیر یادگیری — بخش ${toPersianDigits(segIdx + 1)}`}
                              className="m-0 list-none p-0"
                            >
                              {segPackages.map((course, idxInSeg) => {
                                const index = segIdx * ITEMS_PER_SEGMENT + idxInSeg;
                                const pos = SEGMENT_NODE_POSITIONS[idxInSeg];
                                if (!pos) return null;
                                const circleLeft = mascotOnRight
                                  ? 100 - pos.circleLeftPct
                                  : pos.circleLeftPct;
                                const state = stepStatus(course);
                                const Icon = state.icon;
                                const numberedTitle = `${toPersianDigits(index + 1)}. ${course.title}`;

                                return (
                                  <li key={course.id}>
                                    <Link
                                      to={`/packages/${course.id}`}
                                      data-testid="learning-path-step"
                                      aria-label={`${numberedTitle} — ${state.label}`}
                                      className="group"
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{
                                          left: `${circleLeft}%`,
                                          top: `${pos.circleTopPct}%`,
                                        }}
                                        className={cn(
                                          'pressable absolute flex size-[11.2%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform group-hover:scale-105',
                                          state.node,
                                        )}
                                      >
                                        <Icon
                                          className="size-[58%] stroke-[3.2]"
                                          aria-hidden="true"
                                        />
                                      </span>

                                      <span
                                        dir="rtl"
                                        style={
                                          mascotOnRight
                                            ? {
                                                left: '4.2%',
                                                right: `${pos.textOffsetPct}%`,
                                                top: `${pos.topPct}%`,
                                              }
                                            : {
                                                left: `${pos.textOffsetPct}%`,
                                                right: '4.2%',
                                                top: `${pos.topPct}%`,
                                              }
                                        }
                                        className="absolute -translate-y-1/2 rounded-xl bg-marketer-path-canvas/85 px-1.5 py-0.5 text-right backdrop-blur-[2px] transition-colors group-hover:bg-marketer-path-canvas"
                                      >
                                        <span className="block line-clamp-2 text-[14.5px] font-extrabold leading-snug text-marketer-ink group-hover:text-marketer-brand sm:text-base">
                                          {numberedTitle}
                                        </span>
                                        <span
                                          className={cn(
                                            'mt-0.5 block text-xs font-bold sm:text-sm',
                                            state.text,
                                          )}
                                        >
                                          {state.label}
                                          {course.status === 'in_progress' && (
                                            <span className="ms-1">
                                              · {faPercent(course.percent)}
                                            </span>
                                          )}
                                        </span>
                                      </span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ol>
                          </div>

                          {hasNextSegment && (
                            <div
                              aria-hidden="true"
                              className="relative -my-2 h-6 w-full overflow-hidden bg-marketer-path-canvas"
                            >
                              <svg
                                viewBox="0 0 100 24"
                                preserveAspectRatio="none"
                                className="h-full w-full"
                              >
                                <path
                                  d={
                                    mascotOnRight
                                      ? 'M 51.2 0 C 51.2 12, 51.33 12, 51.33 24'
                                      : 'M 48.8 0 C 48.8 12, 48.67 12, 48.67 24'
                                  }
                                  fill="none"
                                  stroke="var(--color-marketer-brand)"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-auto px-3 pt-1">
                  <Link
                    to="/learn/all"
                    data-testid="all-courses-link"
                    className="pressable relative z-30 flex min-h-[64px] items-center justify-center rounded-full bg-brand-gradient px-14 text-on-cta shadow-brand transition-transform hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand"
                  >
                    <span className="text-center text-base font-extrabold sm:text-lg">
                      مشاهده تمام دوره‌ها
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-marketer-brand"
                    >
                      <ArrowRight className="size-6" aria-hidden="true" />
                    </span>
                  </Link>
                </div>
              </section>
            );
          }}
        </QueryState>
      </div>
    </div>
  );
}
