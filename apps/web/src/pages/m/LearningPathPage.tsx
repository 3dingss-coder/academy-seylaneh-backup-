import { ArrowRight, Check, ChevronLeft, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Skeleton } from '@/components/ui';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { Mascot } from '@/components/brand/Mascot';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faPercent } from '@/lib/format';
import { usePackages } from '@/lib/queries';
import type { PackageSummary } from '@/lib/types';

const STEP_HEIGHT = 132;
const NODE_X = [49, 52, 34, 45, 35, 49] as const;

function nodeXAt(index: number) {
  return NODE_X[index % NODE_X.length] ?? NODE_X[0];
}

function makeRoadPath(count: number) {
  const points = Array.from({ length: count }, (_, index) => ({
    x: nodeXAt(index) * 10,
    y: index * STEP_HEIGHT + STEP_HEIGHT / 2,
  }));
  const first = points[0];
  if (!first) return '';

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    if (!previous) return path;
    const bend = (point.x - previous.x) * 0.55;
    return `${path} C ${previous.x + bend} ${previous.y + STEP_HEIGHT * 0.42}, ${point.x - bend} ${point.y - STEP_HEIGHT * 0.42}, ${point.x} ${point.y}`;
  }, `M ${first.x} ${first.y}`);
}

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
      node: 'bg-[#07845F] text-white',
      text: 'text-[#047857]',
    };
  }
  if (course.status === 'in_progress') {
    return {
      label: 'در حال یادگیری',
      icon: Check,
      node: 'bg-[#F4A62A] text-white',
      text: 'text-[#8A5600]',
    };
  }
  return {
    label: 'شروع‌نشده',
    icon: Circle,
    node: 'bg-[#E3E1DA] text-[#64748B]',
    text: 'text-[#64748B]',
  };
}

/** M4 — learner roadmap; all-courses list remains one tap away. */
export function LearningPathPage() {
  const q = usePackages();

  return (
    <div className="min-h-[100dvh] bg-[#FCF7EE] px-4 py-4">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col gap-3">
        <header className="relative flex min-h-12 items-center justify-center">
          <Link
            to="/"
            aria-label="بازگشت به خانه"
            className="pressable absolute left-0 grid size-12 place-items-center rounded-full text-[#17352A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-fg"
          >
            <ChevronLeft className="size-7" aria-hidden="true" />
          </Link>
          <h1 className="text-xl font-extrabold text-[#17352A] sm:text-2xl">مسیر یادگیری من</h1>
        </header>
        <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />
        <QueryState
          query={q}
          loading={
            <div className="flex flex-col gap-3 rounded-hero border border-[#EEE7DC] bg-[#FFFCF6] p-4">
              <Skeleton className="h-48 w-2/5 rounded-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
          {(list) => {
            const steps = orderByLearningPath(list);
            const height = steps.length * STEP_HEIGHT;
            const path = makeRoadPath(steps.length);

            return (
              <section
                aria-label="مسیر آموزش‌های من"
                className="relative isolate flex flex-1 flex-col gap-3 overflow-hidden bg-[#FCF7EE] px-1 pb-4 sm:px-5"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-gradient-to-b from-[#E6F1DF] via-[#F0F4E9] to-[#FFFCF6]"
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 240 560"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute left-0 top-24 h-[520px] w-[46%] text-[#BDD9B6]"
                >
                  <path d="M0 104C44 64 91 68 126 108C78 119 46 159 0 165Z" fill="#D5E8CD" />
                  <path d="M0 214C52 171 90 185 122 226C73 233 45 271 0 277Z" fill="#C9E1C0" />
                  <path d="M0 344C54 302 92 316 126 357C75 366 43 405 0 408Z" fill="#D7E9CE" />
                  <path d="M12 530C53 474 91 476 130 510C83 523 53 551 22 560Z" fill="#C6DEBC" />
                  <path
                    d="M11 116C22 205 20 314 35 462"
                    fill="none"
                    stroke="#A9C99F"
                    strokeWidth="5"
                  />
                </svg>
                {steps.length > 0 && (
                  <div className="pointer-events-none absolute left-0 top-5 z-10 w-[39%] max-w-64">
                    <Mascot mood="guide" className="h-48 w-auto sm:h-60" />
                  </div>
                )}

                {steps.length === 0 ? (
                  <div className="relative z-20 flex min-h-72 flex-col items-center justify-center px-4 pt-40 text-center">
                    <EmptyState
                      title="هنوز مسیری برایت فعال نشده"
                      description="وقتی آموزشی به تو اختصاص داده شود، مسیر یادگیری‌ات همین‌جا نمایش داده می‌شود."
                      illustration={<Mascot mood="thinking" className="h-24 w-auto" />}
                    />
                  </div>
                ) : (
                  <div className="relative z-20 pt-40 sm:pt-48">
                    <div className="relative" style={{ height }}>
                      <svg
                        aria-hidden="true"
                        viewBox={`0 0 1000 ${height}`}
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      >
                        <path
                          d={path}
                          fill="none"
                          stroke="#D8E3D2"
                          strokeWidth="25"
                          strokeLinecap="round"
                        />
                        <path
                          d={path}
                          fill="none"
                          stroke="#F8F5EE"
                          strokeWidth="12"
                          strokeLinecap="round"
                        />
                      </svg>
                      <ol aria-label="گام‌های مسیر یادگیری" className="relative">
                        {steps.map((course, index) => {
                          const state = stepStatus(course);
                          const Icon = state.icon;
                          const nodeX = nodeXAt(index);
                          return (
                            <li key={course.id} className="relative h-[132px]">
                              <Link
                                to={`/packages/${course.id}`}
                                data-testid="learning-path-step"
                                aria-label={`${toPersianDigits(index + 1)}. ${course.title} — ${state.label}`}
                                className="pressable absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-fg"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'absolute top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[6px] border-[#FFFCF6] shadow-md sm:size-16',
                                    state.node,
                                  )}
                                  style={{ left: `${nodeX}%` }}
                                >
                                  <Icon className="size-6 sm:size-7" aria-hidden="true" />
                                </span>
                                <span className="absolute right-0 top-1/2 w-[39%] -translate-y-1/2 text-right">
                                  <span className="block line-clamp-2 text-sm font-extrabold leading-6 text-[#17352A] sm:text-base">
                                    {toPersianDigits(index + 1)}. {course.title}
                                  </span>
                                  <span
                                    className={cn(
                                      'mt-1 block text-xs font-bold sm:text-sm',
                                      state.text,
                                    )}
                                  >
                                    {state.label}
                                    {course.status === 'in_progress' && (
                                      <span className="ms-1">· {faPercent(course.percent)}</span>
                                    )}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                )}

                <Link
                  to="/learn/all"
                  data-testid="all-courses-link"
                  className="pressable relative z-30 mt-auto flex min-h-[68px] items-center gap-3 rounded-full bg-cta px-3 text-on-cta shadow-brand transition-colors hover:bg-cta-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg sm:px-4"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15">
                    <ArrowRight className="size-6" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-center text-base font-extrabold sm:text-lg">
                    مشاهده تمام دوره‌ها
                  </span>
                  <span aria-hidden="true" className="size-12 shrink-0" />
                </Link>
              </section>
            );
          }}
        </QueryState>
      </div>
    </div>
  );
}
