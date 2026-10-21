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
          <div className="mx-auto w-full max-w-[1180px]">
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="mt-4 h-[390px] w-full rounded-[30px]" />
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
              <Skeleton className="h-[520px] w-full rounded-[28px]" />
              <Skeleton className="h-[520px] w-full rounded-[28px]" />
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

            <div className="mx-auto w-full max-w-[1180px]">
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
                className="relative overflow-hidden rounded-[30px] border border-[#E7DFD3] bg-[#FFFDF8] shadow-[0_24px_60px_-44px_rgba(24,69,55,.55)]"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -start-20 -top-24 size-72 rounded-full bg-[#ECFDF5] blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-24 -end-16 size-72 rounded-full bg-[#F7EEDC] blur-3xl"
                />

                <div className="relative grid min-h-[260px] grid-cols-[42%_minmax(0,1fr)] items-stretch sm:min-h-[300px] lg:min-h-[340px] lg:grid-cols-[42%_58%]">
                  <div className="relative order-1 overflow-hidden border-e border-[#ECE4D8] bg-[radial-gradient(circle_at_48%_42%,#FFFFFF_0%,#F5EFE3_72%)] p-3 sm:p-5 lg:p-7">
                    <ProductImage
                      src={p.product?.imageUrl ?? p.brand?.logoUrl}
                      alt={p.product?.name ?? p.brand?.name ?? p.title}
                      className="h-full w-full !rounded-[24px] !border-0 !bg-transparent !p-0 !shadow-none"
                    />
                  </div>

                  <div className="order-2 flex min-w-0 flex-col justify-center p-4 sm:p-6 lg:p-8">
                    {p.brand?.name && (
                      <span className="mb-3 w-fit rounded-full border border-[#CFE6D9] bg-[#EFF9F3] px-3 py-1.5 text-xs font-black text-[#176B55]">
                        {p.brand.name}
                      </span>
                    )}

                    <h2 className="text-[20px] font-black leading-8 text-[#123D35] sm:text-[27px] sm:leading-10 lg:text-[34px] lg:leading-[1.5]">
                      {p.title}
                    </h2>

                    <p className="mt-2 line-clamp-4 text-[12px] leading-6 text-[#63716D] sm:text-sm sm:leading-7 lg:line-clamp-none lg:text-[15px] lg:leading-8">
                      {p.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {p.status === 'completed' ? (
                        <StatusBadge status="completed" />
                      ) : (
                        p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />
                      )}

                      {p.deadlineAt && (
                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#E6DED1] bg-[#FFFDF8] px-3 text-xs font-bold text-[#596A65] shadow-xs">
                          <CalendarDays className="size-4" aria-hidden />
                          {faDate(p.deadlineAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative grid gap-3 border-t border-[#ECE4D8] bg-[#FFFEFA]/95 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(250px,360px)] sm:items-stretch sm:p-5">
                  <div className="rounded-[22px] border border-[#E8E1D6] bg-[#FFFDF8] p-4 shadow-[0_12px_28px_-24px_rgba(27,67,55,.35)]">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#143F36] sm:text-[15px]">
                          پیشرفت شما
                        </p>
                        <p className="mt-1 text-xs text-[#667570]">پیشرفت بسته</p>
                      </div>
                      <strong className="shrink-0 text-[27px] font-black leading-none text-[#064E3B]">
                        {faPercent(p.percent)}
                      </strong>
                    </div>
                    <ProgressBar value={p.percent} label="پیشرفت بسته" className="h-2.5" />
                  </div>

                  {current && (
                    <Button
                      size="lg"
                      block
                      className="!min-h-[82px] !rounded-[22px] shadow-[0_16px_34px_-20px_rgba(4,120,87,.62)]"
                      icon={<PlayCircle className="size-7" aria-hidden />}
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

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
                <section
                  aria-labelledby="sections-title"
                  className="min-w-0 overflow-hidden rounded-[28px] border border-[#E9E1D5] bg-[#FFFDF8] shadow-[0_20px_48px_-40px_rgba(27,67,55,.5)]"
                >
                  <div className="flex items-end justify-between gap-3 border-b border-[#ECE4D8] bg-[#FFFEFA] px-4 py-4 sm:px-5">
                    <div>
                      <h2
                        id="sections-title"
                        className="text-base font-black text-[#143F36] sm:text-lg"
                      >
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

                <aside className="flex min-w-0 flex-col gap-4">
                  {notes.length > 0 && (
                    <section
                      aria-label="پیام مدیر"
                      role="note"
                      className="overflow-hidden rounded-[24px] border border-[#F0DFC0] bg-[#FFF9ED] shadow-[0_14px_32px_-28px_rgba(115,77,20,.35)]"
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
                      className="pressable flex min-h-[116px] items-center gap-3 rounded-[24px] border border-[#CFE9DD] bg-[#F3FBF7] px-4 py-4 shadow-[0_14px_32px_-28px_rgba(20,95,70,.4)] hover:border-primary/40 hover:bg-primary-light"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[#DDF6E9] text-primary-fg">
                        <ClipboardCheck className="size-6" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-[#143F36]">آزمون این محصول</p>
                        <p className="mt-1 text-xs leading-6 text-[#667570]">
                          پس از مشاهده آموزش‌ها، آزمون را از همین بخش شروع کنید.
                        </p>
                      </div>
                      <ChevronLeft className="size-5 shrink-0 text-primary-fg" aria-hidden />
                    </Link>
                  )}

                  {quizSection?.quizPassed && (
                    <div className="flex min-h-[96px] items-center gap-3 rounded-[24px] border border-success/20 bg-success-light px-4 py-3 text-success-fg">
                      <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-white/70">
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
  const Icon = locked ? Lock : s.mediaType === 'audio' ? Headphones : PlayCircle;

  const body = (
    <div
      className={cn(
        'pressable relative flex min-h-[96px] items-start gap-3 px-4 py-3.5 transition-colors sm:px-5',
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
