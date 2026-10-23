import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Lock, MessageSquareQuote } from 'lucide-react';
import {
  Button,
  CountdownChip,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { ProductImage } from '@/components/common/ProductImage';
import { MarketerIcon } from '@/components/brand/MarketerIcon';
import { QueryState } from '@/components/common/QueryState';
import { MentorLauncher } from '@/components/learning/MentorSheet';
import { RememberPage } from '@/lib/pageContext';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faDuration, faPercent } from '@/lib/format';
import { usePackage } from '@/lib/queries';
import type { SectionView } from '@/lib/types';

/** M5 — package detail. Functionality stays authoritative; this file only composes the UI. */
export function PackagePage() {
  const { id = '' } = useParams();
  const q = usePackage(id);
  const nav = useNavigate();

  return (
    <QueryState
      query={q}
      loading={
        <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
          <div className="mx-auto w-full max-w-[1180px]">
            <Skeleton className="h-20 w-full rounded-hero" />
            <Skeleton className="mt-4 h-[390px] w-full rounded-hero" />
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
              <Skeleton className="h-[520px] w-full rounded-hero" />
              <Skeleton className="h-[520px] w-full rounded-hero" />
            </div>
          </div>
        </div>
      }
    >
      {({ package: p, sections, notes }) => {
        const live = sections.filter((s) => !s.archived);
        const quizSection = live.find((s) => s.quizRequired !== false && s.quizId);
        const current = live.find((s) => s.state !== 'completed' && s.state !== 'locked');

        return (
          <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
            <RememberPage
              kind="package"
              brandId={p.brand?.id ?? null}
              brandName={p.brand?.name ?? null}
              productId={p.product?.id ?? null}
              productName={p.product?.name ?? null}
              packageId={p.id}
              packageTitle={p.title}
              progressPercent={p.percent}
              activityLine={`آموزش «${p.title}» را باز کرد`}
            />

            <div className="mx-auto w-full max-w-[1180px]">
              <nav
                aria-label="مسیر صفحه"
                className="mb-4 flex min-h-12 items-center gap-2 overflow-x-auto whitespace-nowrap text-xs font-bold text-marketer-muted sm:text-sm"
              >
                <Link
                  to="/learn/all"
                  className="pressable inline-flex min-h-12 items-center gap-1 rounded-full px-2 text-marketer-brand hover:bg-marketer-surface"
                >
                  آموزش‌ها
                </Link>
                {p.brand?.name && (
                  <>
                    <ChevronLeft className="size-4 shrink-0 text-marketer-muted" aria-hidden />
                    <span>{p.brand.name}</span>
                  </>
                )}
                {p.product?.name && (
                  <>
                    <ChevronLeft className="size-4 shrink-0 text-marketer-muted" aria-hidden />
                    <span className="max-w-[15rem] truncate">{p.product.name}</span>
                  </>
                )}
              </nav>

              <section
                id="package-about"
                aria-label="معرفی بسته آموزشی"
                className="relative overflow-hidden rounded-hero border border-marketer-border bg-marketer-surface shadow-md"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -start-16 -top-20 size-64 rounded-full bg-marketer-brand-soft blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -end-16 size-64 rounded-full bg-accent-light blur-3xl"
                />

                <div
                  className="relative grid grid-cols-1 items-stretch lg:min-h-[350px] lg:grid-cols-[44%_56%]"
                  style={{ direction: 'ltr' }}
                >
                  <div
                    dir="rtl"
                    className="relative min-h-[250px] overflow-hidden border-b border-marketer-border bg-marketer-surface-soft p-2 sm:min-h-[300px] sm:p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5"
                  >
                    <ProductImage
                      src={p.product?.imageUrl ?? p.brand?.logoUrl}
                      alt={p.product?.name ?? p.brand?.name ?? p.title}
                      className="h-full w-full !rounded-hero !border-0 !bg-transparent !p-0 !shadow-none"
                    />
                  </div>

                  <div
                    dir="rtl"
                    className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8 lg:pe-10"
                  >
                    {p.brand?.name && (
                      <span className="mb-3 w-fit rounded-full border border-marketer-brand/20 bg-marketer-brand-soft px-3 py-1.5 text-xs font-black text-marketer-brand shadow-xs">
                        {p.brand.name}
                      </span>
                    )}

                    <h1 className="text-[21px] font-black leading-8 text-marketer-ink sm:text-[28px] sm:leading-10 lg:text-[36px] lg:leading-[1.45]">
                      {p.title}
                    </h1>

                    <p className="mt-2 line-clamp-4 text-[12px] leading-6 text-marketer-muted sm:text-sm sm:leading-7 lg:line-clamp-none lg:max-w-[94%] lg:text-[15px] lg:leading-8">
                      {p.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {p.status === 'completed' ? (
                        <StatusBadge status="completed" />
                      ) : (
                        p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
                      )}

                      {p.deadlineAt && (
                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-marketer-border bg-marketer-surface px-3 text-xs font-bold text-marketer-muted shadow-xs">
                          <MarketerIcon name="deadline" className="size-4" />
                          {faDate(p.deadlineAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="relative grid gap-3 border-t border-marketer-border bg-marketer-surface-soft/95 p-3.5 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-stretch lg:px-5"
                  style={{ direction: 'ltr' }}
                >
                  <div
                    dir="rtl"
                    className="rounded-card border border-marketer-border bg-marketer-surface p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-marketer-ink sm:text-[15px]">
                          پیشرفت شما
                        </p>
                        <p className="mt-1 text-xs text-marketer-muted">پیشرفت بسته</p>
                      </div>
                      <strong className="shrink-0 text-[27px] font-black leading-none text-marketer-brand">
                        {faPercent(p.percent)}
                      </strong>
                    </div>
                    <ProgressBar value={p.percent} label="پیشرفت بسته" className="h-2.5" />
                  </div>

                  {current && (
                    <Button
                      dir="rtl"
                      size="lg"
                      block
                      className="!min-h-[82px] !rounded-card shadow-brand"
                      icon={
                        <MarketerIcon
                          name={
                            current.state === 'quiz'
                              ? 'quiz'
                              : current.mediaType === 'audio'
                                ? 'audio'
                                : 'video'
                          }
                          className="size-7"
                        />
                      }
                      onClick={() =>
                        nav(
                          current.state === 'quiz'
                            ? `/quiz/${current.id}`
                            : `/sections/${current.id}`,
                        )
                      }
                    >
                      <span className="flex min-w-0 flex-col items-center leading-tight">
                        <span className="text-[16px] font-black sm:text-[17px]">
                          {current.state === 'quiz'
                            ? 'شروع آزمون'
                            : current.state === 'in_progress'
                              ? 'ادامه قسمت فعلی'
                              : 'شروع قسمت'}
                        </span>
                        <span className="mt-1 max-w-full truncate text-[11px] font-medium opacity-85 sm:text-xs">
                          {current.title} • {faDuration(current.durationSec)}
                        </span>
                      </span>
                    </Button>
                  )}
                </div>
              </section>

              <nav
                aria-label="بخش‌های صفحه محصول"
                className="mt-4 grid grid-cols-2 overflow-hidden rounded-card border border-marketer-border bg-marketer-surface p-1 shadow-xs"
              >
                <a
                  href="#package-sections"
                  className="pressable flex min-h-11 items-center justify-center rounded-xl border-b-2 border-marketer-brand bg-marketer-brand-soft px-3 text-sm font-black text-marketer-brand"
                >
                  آموزش‌ها
                </a>
                <a
                  href="#package-about"
                  className="pressable flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold text-marketer-muted hover:bg-marketer-surface-muted"
                >
                  درباره محصول
                </a>
              </nav>

              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                <section
                  id="package-sections"
                  aria-labelledby="sections-title"
                  className="min-w-0 overflow-hidden rounded-hero border border-marketer-border bg-marketer-surface shadow-md"
                >
                  <div className="flex items-end justify-between gap-3 border-b border-marketer-border bg-marketer-surface-soft px-4 py-3.5 sm:px-5">
                    <div>
                      <h2
                        id="sections-title"
                        className="text-base font-black text-marketer-ink sm:text-lg"
                      >
                        قسمت‌های آموزشی
                      </h2>
                      <p className="mt-1 text-xs text-marketer-muted">
                        ویدیو و پادکست‌های این محصول
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-marketer-surface-muted px-3 py-1 text-xs font-bold text-marketer-muted">
                      {toPersianDigits(live.length)} قسمت
                    </span>
                  </div>

                  {live.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        title="این بسته هنوز قسمتی ندارد"
                        description="به مدیر اطلاع داده شد."
                      />
                    </div>
                  ) : (
                    <ol className="space-y-2 p-3 sm:p-4">
                      {live.map((s) => (
                        <SectionRow key={s.id} s={s} />
                      ))}
                    </ol>
                  )}
                </section>

                <aside className="flex min-w-0 flex-col gap-3">
                  {notes.length > 0 && (
                    <section
                      aria-label="پیام مدیر"
                      role="note"
                      className="overflow-hidden rounded-hero border border-warning/20 bg-warning-light shadow-sm"
                    >
                      <div className="flex items-center gap-2 border-b border-warning/20 px-4 py-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-light text-accent-fg">
                          <MessageSquareQuote className="size-5" aria-hidden />
                        </span>
                        <h2 className="text-sm font-black text-marketer-ink">پیام مدیر</h2>
                      </div>
                      <div className="divide-y divide-warning/20">
                        {notes.slice(0, 2).map((n) => (
                          <p key={n.id} className="px-4 py-3 text-sm leading-7 text-marketer-ink">
                            <b className="font-black">{n.fromName}:</b> {n.body}
                          </p>
                        ))}
                      </div>
                    </section>
                  )}

                  {quizSection && !quizSection.quizPassed && (
                    <section className="rounded-hero border border-marketer-brand/20 bg-marketer-brand-soft p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-marketer-brand-soft text-marketer-brand">
                          <MarketerIcon name="quiz" className="size-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-marketer-ink">آزمون این محصول</p>
                          <p className="mt-1 text-xs leading-6 text-marketer-muted">
                            پس از مشاهده آموزش‌ها، آزمون را از همین بخش شروع کنید.
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/quiz/${quizSection.id}`}
                        data-testid="package-quiz"
                        className="pressable mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cta px-4 text-sm font-black text-on-cta shadow-sm hover:bg-cta-hover"
                      >
                        <MarketerIcon name="quiz" className="size-5" />
                        شروع آزمون
                      </Link>
                    </section>
                  )}

                  {quizSection?.quizPassed && (
                    <div className="flex min-h-[96px] items-center gap-3 rounded-hero border border-success/20 bg-success-light px-4 py-3 text-success-fg">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-marketer-surface">
                        <CheckCircle2 className="size-6" aria-hidden />
                      </span>
                      <p className="text-sm font-black">آزمون این محصول را قبول شده‌ای ✅</p>
                    </div>
                  )}
                </aside>
              </div>
            </div>

            <MentorLauncher packageId={p.id} />
          </div>
        );
      }}
    </QueryState>
  );
}

function SectionRow({ s }: { s: SectionView }) {
  const locked = s.state === 'locked';
  const inProgress = s.state === 'in_progress';
  const completed = s.state === 'completed';

  const body = (
    <div
      className={cn(
        'pressable relative flex min-h-[88px] items-center gap-3 rounded-card border px-3 py-3 shadow-xs transition-colors sm:px-4',
        locked
          ? 'border-marketer-border bg-marketer-surface-muted text-marketer-muted'
          : inProgress
            ? 'border-marketer-brand/25 bg-marketer-brand-soft hover:bg-marketer-surface-muted'
            : completed
              ? 'border-success/20 bg-success-light hover:brightness-95'
              : 'border-marketer-border bg-marketer-surface hover:bg-marketer-surface-soft',
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border',
          locked
            ? 'border-marketer-border bg-marketer-surface-muted text-marketer-muted'
            : completed
              ? 'border-success/20 bg-success-light text-success-fg'
              : inProgress
                ? 'border-marketer-brand/25 bg-marketer-brand-soft text-marketer-brand'
                : 'border-marketer-brand/20 bg-marketer-brand-soft text-marketer-brand',
        )}
      >
        {locked ? (
          <Lock className="size-5" aria-hidden />
        ) : (
          <MarketerIcon name={s.mediaType === 'audio' ? 'audio' : 'video'} className="size-6" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <span className="shrink-0 pt-0.5 text-xs font-black text-marketer-muted">
            {toPersianDigits(s.order)}.
          </span>
          <p
            className={cn(
              'min-w-0 flex-1 text-sm font-black leading-6',
              locked ? 'text-marketer-muted' : 'text-marketer-ink',
            )}
          >
            {s.title}
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-marketer-muted">
          <span>{s.mediaType === 'audio' ? 'صوتی' : 'ویدیو'}</span>
          <span aria-hidden>•</span>
          <span>{faDuration(s.durationSec)}</span>
          {s.percent > 0 && s.state !== 'completed' && (
            <>
              <span aria-hidden>•</span>
              <span className={cn(inProgress && 'font-bold text-marketer-brand')}>
                {faPercent(s.percent)} دیده شده
              </span>
            </>
          )}
        </div>

        {inProgress && s.percent > 0 && (
          <ProgressBar
            value={s.percent}
            label={`پیشرفت ${s.title}`}
            className="mt-2 h-1.5 max-w-[220px]"
          />
        )}

        {locked && (
          <p className="mt-1.5 text-xs leading-6 text-marketer-muted">
            {s.lockReason ?? 'ابتدا قسمت قبل را کامل کنید.'}
          </p>
        )}
      </div>

      <StatusBadge status={s.state} className="shrink-0" />
    </div>
  );

  if (locked) {
    return (
      <li title="ابتدا قسمت قبل را کامل کنید.">
        <div aria-disabled="true">{body}</div>
      </li>
    );
  }

  return (
    <li>
      <Link to={`/sections/${s.id}`} data-testid="section-row" className="block">
        {body}
      </Link>
    </li>
  );
}
