import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Headphones,
  Lock,
  MessageSquareQuote,
  PlayCircle,
} from 'lucide-react';
import {
  Button,
  CountdownChip,
  EmptyState,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductImage } from '@/components/common/ProductImage';
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
        <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6">
          <div className="mx-auto grid w-full max-w-[960px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 w-full rounded-[22px]" />
              <Skeleton className="h-[360px] w-full rounded-[30px]" />
              <Skeleton className="h-16 w-full rounded-[20px]" />
            </div>
            <Skeleton className="h-[560px] w-full rounded-[28px]" />
          </div>
        </div>
      }
    >
      {({ package: p, sections, notes }) => {
        const live = sections.filter((s) => !s.archived);
        const quizSection = live.find((s) => s.quizRequired !== false && s.quizId);
        const current = live.find((s) => s.state !== 'completed' && s.state !== 'locked');

        return (
          <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6">
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

            <div className="mx-auto grid w-full max-w-[960px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <main className="min-w-0">
                <PageHeader
                  title={p.title}
                  back="/learn/all"
                  subtitle={
                    p.product
                      ? `${p.brand?.name} • ${p.product.name}`
                      : p.brand
                        ? `آموزش برند ${p.brand.name}`
                        : undefined
                  }
                />

                <section
                  aria-label="معرفی بسته آموزشی"
                  className="relative overflow-hidden rounded-[30px] border border-[#E7DFD3] bg-[#FFFDF8] shadow-[0_24px_60px_-46px_rgba(24,69,55,.55)]"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -start-20 -top-24 size-72 rounded-full bg-[#ECFDF5] blur-3xl"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-24 -end-20 size-64 rounded-full bg-[#F6EEDC] blur-3xl"
                  />

                  <div className="relative grid grid-cols-[118px_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5 sm:p-5 md:grid-cols-[minmax(0,1fr)_230px] md:gap-7">
                    <div className="order-2 min-w-0 md:order-1">
                      <div className="mb-2.5 flex flex-wrap items-center gap-2">
                        {p.status === 'completed' ? (
                          <StatusBadge status="completed" />
                        ) : (
                          p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
                        )}
                        {p.deadlineAt && (
                          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-white/85 px-2.5 text-[11px] font-bold text-[#596A65] sm:px-3 sm:text-xs">
                            <CalendarDays className="size-3.5" aria-hidden />
                            {faDate(p.deadlineAt)}
                          </span>
                        )}
                      </div>

                      <h2 className="text-[19px] font-black leading-8 text-[#143F36] sm:text-[24px] sm:leading-9 md:text-[27px]">
                        {p.title}
                      </h2>
                      <p className="mt-1.5 line-clamp-4 text-[12px] leading-6 text-[#65736F] sm:text-sm sm:leading-7 md:line-clamp-none md:text-[15px] md:leading-8">
                        {p.description}
                      </p>
                    </div>

                    <div className="order-1 md:order-2">
                      <div className="mx-auto flex aspect-[4/5] w-full max-w-[230px] items-center justify-center overflow-hidden rounded-[24px] border border-[#EAE2D6] bg-[radial-gradient(circle_at_50%_34%,#FFFFFF_0%,#F7F1E5_74%)] p-3 shadow-[0_18px_42px_-34px_rgba(29,67,56,.52)] sm:p-4 md:aspect-[5/6] md:p-5">
                        <ProductImage
                          src={p.product?.imageUrl ?? p.brand?.logoUrl}
                          alt={p.product?.name ?? p.brand?.name ?? p.title}
                          className="h-full w-full !border-0 !bg-transparent !p-0 !shadow-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="relative border-t border-[#ECE4D8] bg-white/76 px-4 py-4 sm:px-5">
                    <div className="mb-2.5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#143F36] sm:text-[15px]">
                          پیشرفت شما
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#667570] sm:text-xs">
                          پیشرفت بسته آموزشی
                        </p>
                      </div>
                      <strong className="shrink-0 text-[24px] font-black leading-none text-[#064E3B] sm:text-[26px]">
                        {faPercent(p.percent)}
                      </strong>
                    </div>
                    <ProgressBar value={p.percent} label="پیشرفت بسته" className="h-2.5" />
                  </div>
                </section>

                {current && (
                  <Button
                    size="lg"
                    block
                    className="mt-4 !min-h-[68px] !rounded-[20px] shadow-[0_14px_30px_-18px_rgba(4,120,87,.6)]"
                    icon={<PlayCircle className="size-6" aria-hidden />}
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

                {notes.length > 0 && (
                  <section
                    aria-label="پیام مدیر"
                    role="note"
                    className="mt-4 overflow-hidden rounded-[24px] border border-[#F0DFC0] bg-[#FFF9ED] shadow-[0_14px_32px_-28px_rgba(115,77,20,.35)]"
                  >
                    <div className="flex items-center gap-2 border-b border-[#F0E1C7] px-4 py-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#FFF1CF] text-[#A95800]">
                        <MessageSquareQuote className="size-5" aria-hidden />
                      </span>
                      <h2 className="text-sm font-black text-[#49361D]">پیام مدیر</h2>
                    </div>
                    <div className="divide-y divide-[#F0E1C7]">
                      {notes.slice(0, 2).map((n) => (
                        <p key={n.id} className="px-4 py-3 text-sm leading-7 text-[#554632]">
                          <b className="font-black">{n.fromName}:</b> {n.body}
                        </p>
                      ))}
                    </div>
                  </section>
                )}

                {quizSection && !quizSection.quizPassed && (
                  <Link
                    to={`/quiz/${quizSection.id}`}
                    data-testid="package-quiz"
                    className="pressable mt-4 flex min-h-16 items-center gap-3 rounded-[24px] border border-[#CFE9DD] bg-[#F3FBF7] px-4 py-3 shadow-[0_14px_32px_-28px_rgba(20,95,70,.4)] hover:border-primary/40 hover:bg-primary-light"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-[#DDF6E9] text-primary-fg">
                      <ClipboardCheck className="size-5" aria-hidden />
                    </span>
                    <p className="min-w-0 flex-1 font-black text-[#143F36]">
                      آزمون این محصول
                    </p>
                    <ChevronLeft className="size-5 shrink-0 text-primary-fg" aria-hidden />
                  </Link>
                )}

                {quizSection?.quizPassed && (
                  <div className="mt-4 flex min-h-16 items-center gap-3 rounded-[24px] border border-success/20 bg-success-light px-4 py-3 text-success-fg">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-white/70">
                      <CheckCircle2 className="size-6" aria-hidden />
                    </span>
                    <p className="text-sm font-black">آزمون این محصول را قبول شده‌ای ✅</p>
                  </div>
                )}
              </main>

              <section
                aria-labelledby="sections-title"
                className="min-w-0 overflow-hidden rounded-[28px] border border-[#E9E1D5] bg-[#FFFDF8] shadow-[0_20px_48px_-40px_rgba(27,67,55,.5)] lg:sticky lg:top-20"
              >
                <div className="flex items-end justify-between gap-3 border-b border-[#ECE4D8] bg-[#FFFEFA] px-4 py-4">
                  <div>
                    <h2 id="sections-title" className="text-base font-black text-[#143F36]">
                      ویدیو و پادکست
                    </h2>
                    <p className="mt-1 text-xs text-[#596A65]">محتوای آموزشی این بسته</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F2EFE8] px-3 py-1 text-xs font-bold text-[#53635E]">
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
                  <ol className="divide-y divide-[#EEE7DD]">
                    {live.map((s) => (
                      <SectionRow key={s.id} s={s} />
                    ))}
                  </ol>
                )}
              </section>
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
  const Icon = locked ? Lock : s.mediaType === 'audio' ? Headphones : PlayCircle;

  const body = (
    <div
      className={cn(
        'pressable relative flex min-h-[96px] items-start gap-3 px-4 py-3.5 transition-colors',
        locked
          ? 'bg-[#F8F7F3] text-muted-fg'
          : inProgress
            ? 'bg-[#F1FBF5] hover:bg-[#EAF7F0]'
            : completed
              ? 'bg-[#FBFEFC] hover:bg-[#F5FBF7]'
              : 'bg-[#FFFDF8] hover:bg-[#FAF8F2]',
      )}
    >
      {inProgress && (
        <span
          aria-hidden
          className="absolute inset-y-3 start-0 w-1 rounded-e-full bg-primary"
        />
      )}

      <span
        className={cn(
          'mt-0.5 grid size-11 shrink-0 place-items-center rounded-[15px] border',
          locked
            ? 'border-[#DFDDD7] bg-[#ECEAE5] text-muted-fg'
            : completed
              ? 'border-success/20 bg-success-light text-success-fg'
              : inProgress
                ? 'border-primary/25 bg-[#DFF7E9] text-primary-fg'
                : 'border-[#DCE7E1] bg-[#F1F8F4] text-primary-fg',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <span className="shrink-0 pt-0.5 text-xs font-black text-[#53635E]">
            {toPersianDigits(s.order)}.
          </span>
          <p
            className={cn(
              'min-w-0 flex-1 text-sm font-black leading-6',
              locked ? 'text-[#75807C]' : 'text-[#183C34]',
            )}
          >
            {s.title}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#596A65]">
          <span>{s.mediaType === 'audio' ? 'صوتی' : 'ویدیو'}</span>
          <span aria-hidden>•</span>
          <span>{faDuration(s.durationSec)}</span>
          {s.percent > 0 && s.state !== 'completed' && (
            <>
              <span aria-hidden>•</span>
              <span className={cn(inProgress && 'font-bold text-primary-fg')}>
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
          <p className="mt-1.5 text-xs leading-6 text-[#6F7A76]">
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
