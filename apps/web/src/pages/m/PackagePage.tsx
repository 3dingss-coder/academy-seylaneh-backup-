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
              <nav
                aria-label="مسیر صفحه"
                className="mb-4 flex min-h-12 items-center gap-2 overflow-x-auto whitespace-nowrap text-xs font-bold text-[#61706B] sm:text-sm"
              >
                <Link
                  to="/learn/all"
                  className="pressable inline-flex min-h-12 items-center gap-1 rounded-full px-2 text-primary-fg hover:bg-[#FFFDF8]"
                >
                  آموزش‌ها
                </Link>
                {p.brand?.name && (
                  <>
                    <ChevronLeft className="size-4 shrink-0 text-[#8A9490]" aria-hidden />
                    <span>{p.brand.name}</span>
                  </>
                )}
                {p.product?.name && (
                  <>
                    <ChevronLeft className="size-4 shrink-0 text-[#8A9490]" aria-hidden />
                    <span className="max-w-[15rem] truncate">{p.product.name}</span>
                  </>
                )}
              </nav>

              <section
                id="package-about"
                aria-label="معرفی بسته آموزشی"
                className="relative overflow-hidden rounded-[30px] border border-[#E7DFD3] bg-[#FFFDF8] shadow-[0_24px_60px_-44px_rgba(24,69,55,.55)]"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -start-16 -top-20 size-64 rounded-full bg-[#EAF6EE] blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -end-16 size-64 rounded-full bg-[#F7EEDC] blur-3xl"
                />

                <div
                  className="relative grid grid-cols-1 items-stretch lg:min-h-[350px] lg:grid-cols-[44%_56%]"
                  style={{ direction: 'ltr' }}
                >
                  <div
                    dir="rtl"
                    className="relative min-h-[250px] overflow-hidden border-b border-[#ECE4D8] bg-[radial-gradient(circle_at_50%_46%,#FFFFFF_0%,#F2E9DC_74%)] p-2 sm:min-h-[300px] sm:p-4 lg:min-h-0 lg:border-b-0 lg:border-r lg:p-5"
                  >
                    <ProductImage
                      src={p.product?.imageUrl ?? p.brand?.logoUrl}
                      alt={p.product?.name ?? p.brand?.name ?? p.title}
                      className="h-full w-full !rounded-[22px] !border-0 !bg-transparent !p-0 !shadow-none"
                    />
                  </div>

                  <div dir="rtl" className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8 lg:pe-10">
                    {p.brand?.name && (
                      <span className="mb-3 w-fit rounded-full border border-[#CFE6D9] bg-[#EFF9F3] px-3 py-1.5 text-xs font-black text-[#176B55] shadow-xs">
                        {p.brand.name}
                      </span>
                    )}

                    <h1 className="text-[21px] font-black leading-8 text-[#102F2A] sm:text-[28px] sm:leading-10 lg:text-[36px] lg:leading-[1.45]">
                      {p.title}
                    </h1>

                    <p className="mt-2 line-clamp-4 text-[12px] leading-6 text-[#63716D] sm:text-sm sm:leading-7 lg:line-clamp-none lg:max-w-[94%] lg:text-[15px] lg:leading-8">
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

                <div
                  className="relative grid gap-3 border-t border-[#ECE4D8] bg-[#FFFEFA]/95 p-3.5 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-stretch lg:px-5"
                  style={{ direction: 'ltr' }}
                >
                  <div
                    dir="rtl"
                    className="rounded-[20px] border border-[#E8E1D6] bg-[#FFFDF8] p-4 shadow-[0_12px_28px_-24px_rgba(27,67,55,.35)]"
                  >
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
                      dir="rtl"
                      size="lg"
                      block
                      className="!min-h-[82px] !rounded-[20px] shadow-[0_16px_34px_-20px_rgba(4,120,87,.62)]"
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

              <nav
                aria-label="بخش‌های صفحه محصول"
                className="mt-4 grid grid-cols-2 overflow-hidden rounded-[18px] border border-[#ECE4D8] bg-[#FFFDF8] p-1 shadow-xs"
              >
                <a
                  href="#package-sections"
                  className="pressable flex min-h-11 items-center justify-center rounded-[14px] border-b-2 border-primary bg-[#F3F9F5] px-3 text-sm font-black text-primary-fg"
                >
                  آموزش‌ها
                </a>
                <a
                  href="#package-about"
                  className="pressable flex min-h-11 items-center justify-center rounded-[14px] px-3 text-sm font-bold text-[#65736F] hover:bg-[#F8F5EE]"
                >
                  درباره محصول
                </a>
              </nav>

              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                <section
                  id="package-sections"
                  aria-labelledby="sections-title"
                  className="min-w-0 overflow-hidden rounded-[24px] border border-[#E9E1D5] bg-[#FFFDF8] shadow-[0_18px_42px_-36px_rgba(27,67,55,.48)]"
                >
                  <div className="flex items-end justify-between gap-3 border-b border-[#ECE4D8] bg-[#FFFEFA] px-4 py-3.5 sm:px-5">
                    <div>
                      <h2
                        id="sections-title"
                        className="text-base font-black text-[#143F36] sm:text-lg"
                      >
                        قسمت‌های آموزشی
                      </h2>
                      <p className="mt-1 text-xs text-[#596A65]">ویدیو و پادکست‌های این محصول</p>
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
                      className="overflow-hidden rounded-[22px] border border-[#F0DFC0] bg-[#FFF9ED] shadow-[0_14px_32px_-28px_rgba(115,77,20,.35)]"
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
                    <section className="rounded-[22px] border border-[#CFE9DD] bg-[#F3FBF7] p-4 shadow-[0_14px_32px_-28px_rgba(20,95,70,.4)]">
                      <div className="flex items-start gap-3">
                        <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[#DDF6E9] text-primary-fg">
                          <ClipboardCheck className="size-6" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-[#143F36]">آزمون این محصول</p>
                          <p className="mt-1 text-xs leading-6 text-[#667570]">
                            پس از مشاهده آموزش‌ها، آزمون را از همین بخش شروع کنید.
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/quiz/${quizSection.id}`}
                        data-testid="package-quiz"
                        className="pressable mt-3 flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-cta px-4 text-sm font-black text-on-cta shadow-sm hover:bg-cta-hover"
                      >
                        <ClipboardCheck className="size-5" aria-hidden />
                        شروع آزمون
                      </Link>
                    </section>
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
        'pressable relative flex min-h-[88px] items-center gap-3 rounded-[18px] border px-3 py-3 shadow-xs transition-colors sm:px-4',
        locked
          ? 'border-[#E2DED7] bg-[#F6F4EF] text-muted-fg'
          : inProgress
            ? 'border-[#CFE8D9] bg-[#F1FBF5] hover:bg-[#EAF7F0]'
            : completed
              ? 'border-[#DCE9E1] bg-[#FBFEFC] hover:bg-[#F5FBF7]'
              : 'border-[#E8E1D7] bg-[#FFFDF8] hover:bg-[#FAF8F2]',
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-[14px] border',
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

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#596A65]">
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
