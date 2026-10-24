import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileQuestion,
  ListFilter,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  KpiCard,
  Select,
  TableSkeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { faDateTime, faDuration, faNumber, faPercent, faRelative } from '@/lib/format';
import type { RetakeItem } from '@/lib/types';

type RetakeStatus = 'pending' | 'approved' | 'rejected';
type DateRange = 'all' | 'today' | '7' | '30';
type Decision = 'approve' | 'reject';

const STATUS_ORDER: RetakeStatus[] = ['pending', 'approved', 'rejected'];
const EMPTY_RETAKE_ITEMS: RetakeItem[] = [];
const STATUS_LABEL: Record<RetakeStatus, string> = {
  pending: 'در انتظار بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
};
const STATUS_TONE: Record<RetakeStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
};

const retakeQuery = (status: RetakeStatus) => ({
  queryKey: ['admin', 'retakes', status],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api.get<RetakeItem[]>(`/admin/retake-requests?status=${status}`, signal),
  staleTime: 30_000,
});

/** Admin review workspace for escalated and system-wide retake requests. */
export function AdminRetakeRequestsPage() {
  const queries = useQueries({ queries: STATUS_ORDER.map(retakeQuery) });
  const [status, setStatus] = useState<RetakeStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [packageFilter, setPackageFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [decision, setDecision] = useState<{ item: RetakeItem; value: Decision } | null>(null);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeQuery = queries[STATUS_ORDER.indexOf(status)];
  const items = activeQuery?.data ?? EMPTY_RETAKE_ITEMS;
  const pending = queries[0]?.data ?? [];
  const approved = queries[1]?.data ?? [];
  const rejected = queries[2]?.data ?? [];
  const reviewed = [...approved, ...rejected].filter((item) => item.reviewedAt);
  const averageResponseHours = reviewed.length
    ? reviewed.reduce((total, item) => {
        const hours = (Date.parse(item.reviewedAt ?? '') - Date.parse(item.createdAt)) / 3_600_000;
        return total + (Number.isFinite(hours) ? Math.max(0, hours) : 0);
      }, 0) / reviewed.length
    : null;

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const now = Date.now();
    const since =
      dateRange === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : dateRange === '7' || dateRange === '30'
          ? now - Number(dateRange) * 24 * 60 * 60 * 1000
          : null;
    return items.filter((item) => {
      const matchesSearch =
        !needle ||
        [item.userName, item.userCity, item.userProvince, item.packageTitle, item.sectionTitle]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(needle));
      const matchesPackage = packageFilter === 'all' || item.packageTitle === packageFilter;
      const createdAt = Date.parse(item.createdAt);
      const matchesDate = since === null || (Number.isFinite(createdAt) && createdAt >= since);
      return matchesSearch && matchesPackage && matchesDate;
    });
  }, [dateRange, items, packageFilter, search]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const packageNames = [...new Set(items.map((item) => item.packageTitle).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'fa'),
  );

  const mutation = useMutation({
    mutationFn: (value: { id: string; decision: Decision }) =>
      api.post(`/admin/retake-requests/${value.id}/${value.decision}`, {
        note: note.trim() || null,
      }),
    onSuccess: (_result, value) => {
      toast.show({
        type: 'success',
        message:
          value.decision === 'approve' ? 'درخواست تأیید و یک فرصت دیگر ثبت شد.' : 'درخواست رد شد.',
      });
      setDecision(null);
      setNote('');
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'retakes'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.show({ type: 'error', message: errMsg(error) }),
  });

  const statTabs = STATUS_ORDER.map((item) => ({
    value: item,
    label: STATUS_LABEL[item],
    count: queries[STATUS_ORDER.indexOf(item)]?.data?.length,
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        variant="admin"
        title="درخواست‌های آزمون مجدد"
        subtitle="درخواست‌های اعضا را بررسی کنید و برای موردهای واجد شرایط فرصت تازه ثبت کنید."
        actions={
          <Link
            to="/admin/reports"
            className="inline-flex min-h-12 items-center gap-2 rounded-card border border-border bg-surface px-4 text-sm font-bold text-primary-fg transition hover:bg-primary-light"
          >
            <FileQuestion className="size-4" aria-hidden />
            گزارش‌های آموزشی
          </Link>
        }
      />

      <Card className="relative flex flex-col items-center gap-3 overflow-hidden border-[#dceadd] bg-gradient-to-l from-[#eaf8ee] via-[#f6fbf3] to-white sm:flex-row sm:justify-between sm:pe-28">
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold text-[#16815d]">بازبینی منصفانه و شفاف</p>
          <h2 className="mt-1 text-lg font-black text-[#143f36] sm:text-xl">
            هر درخواست را با سابقهٔ آزمون و وضعیت عضو بسنجید
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#5a6f63]">
            تأیید، فرصت دیگری برای همان آزمون ایجاد می‌کند. تصمیم شما ثبت می‌شود و به عضو اطلاع داده
            خواهد شد.
          </p>
        </div>
        <img
          src="/brand/mascot.webp"
          alt=""
          aria-hidden="true"
          className="hidden h-28 w-24 shrink-0 object-contain object-bottom sm:block"
        />
      </Card>

      <section
        aria-label="خلاصهٔ درخواست‌ها"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          title="در انتظار بررسی"
          value={queries[0]?.data ? faNumber(pending.length) : '—'}
          subtitle="درخواست‌های باز"
          icon={Clock3}
          tone="warning"
        />
        <KpiCard
          title="تأییدشده"
          value={queries[1]?.data ? faNumber(approved.length) : '—'}
          subtitle="همهٔ درخواست‌های بررسی‌شده"
          icon={CheckCircle2}
          tone="primary"
        />
        <KpiCard
          title="ردشده"
          value={queries[2]?.data ? faNumber(rejected.length) : '—'}
          subtitle="همهٔ درخواست‌های بررسی‌شده"
          icon={X}
          tone="danger"
        />
        <KpiCard
          title="میانگین زمان پاسخ"
          value={
            averageResponseHours === null
              ? '—'
              : faDuration(Math.round(averageResponseHours * 3600))
          }
          subtitle={
            reviewed.length
              ? `${faNumber(reviewed.length)} پاسخ ثبت‌شده`
              : 'پس از نخستین بررسی محاسبه می‌شود'
          }
          icon={CalendarDays}
          tone="info"
        />
      </section>

      <section aria-label="فهرست درخواست‌ها" className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-sm lg:flex-row lg:items-end">
          <div className="relative min-w-0 flex-1">
            <label
              htmlFor="retake-search"
              className="mb-1.5 block text-xs font-bold text-text-secondary"
            >
              جستجو
            </label>
            <Search
              className="pointer-events-none absolute start-3 top-[2.35rem] size-4 text-text-secondary"
              aria-hidden
            />
            <input
              id="retake-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="نام عضو، آموزش، بخش یا شهر…"
              className="min-h-12 w-full rounded-input border border-border bg-surface px-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Select
            label="آموزش"
            value={packageFilter}
            onChange={(event) => setPackageFilter(event.target.value)}
            className="min-w-40"
          >
            <option value="all">همهٔ آموزش‌ها</option>
            {packageNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            label="تاریخ درخواست"
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRange)}
            className="min-w-40"
          >
            <option value="all">همهٔ تاریخ‌ها</option>
            <option value="today">امروز</option>
            <option value="7">۷ روز گذشته</option>
            <option value="30">۳۰ روز گذشته</option>
          </Select>
          <div className="flex items-center gap-2 text-xs text-text-secondary lg:pb-3">
            <ListFilter className="size-4" aria-hidden />
            <span>{faNumber(filtered.length)} مورد</span>
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-2 shadow-sm sm:p-3">
          <div className="mb-3">
            <div className="sr-only" aria-live="polite">
              {faNumber(filtered.length)} درخواست در وضعیت {STATUS_LABEL[status]}
            </div>
            {/* Tabs includes live counts when each query has resolved. */}
            <StatusTabs
              value={status}
              onChange={(value) => {
                setStatus(value);
                setSelectedId(null);
                setPackageFilter('all');
              }}
              items={statTabs}
            />
          </div>
          {activeQuery?.isPending ? (
            <TableSkeleton rows={5} />
          ) : activeQuery?.isError && activeQuery.data === undefined ? (
            <ErrorState
              message="درخواست‌ها بارگذاری نشدند."
              onRetry={() => void activeQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                items.length === 0
                  ? status === 'pending'
                    ? 'درخواستی در انتظار نیست'
                    : 'موردی برای نمایش نیست'
                  : 'با این فیلتر موردی پیدا نشد'
              }
              description={
                items.length === 0
                  ? 'با ثبت درخواست جدید، موارد اینجا نمایش داده می‌شوند.'
                  : 'عبارت جستجو یا فیلترهای انتخاب‌شده را تغییر دهید.'
              }
              icon={<FileQuestion className="size-7" aria-hidden />}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[850px] border-separate border-spacing-y-1 text-sm">
                  <caption className="sr-only">فهرست درخواست‌های آزمون مجدد</caption>
                  <thead>
                    <tr className="text-right text-xs font-bold text-text-secondary">
                      <th scope="col" className="px-3 py-2">
                        عضو
                      </th>
                      <th scope="col" className="px-3 py-2">
                        آموزش و بخش
                      </th>
                      <th scope="col" className="px-3 py-2">
                        تاریخ درخواست
                      </th>
                      <th scope="col" className="px-3 py-2">
                        نمره‌های قبلی
                      </th>
                      <th scope="col" className="px-3 py-2">
                        وضعیت
                      </th>
                      <th scope="col" className="px-3 py-2">
                        جزئیات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          item.id === selected?.id
                            ? 'bg-[#eaf7ed]'
                            : 'bg-[#fbfbf8] hover:bg-[#f3f8f2]'
                        }
                      >
                        <td className="rounded-s-xl px-3 py-3">
                          <Link
                            to={`/admin/users/${item.userId}`}
                            className="font-bold text-primary-fg hover:underline"
                          >
                            {item.userName}
                          </Link>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {[item.userCity, item.userProvince].filter(Boolean).join('، ') ||
                              'مکان ثبت نشده'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-text">
                            {item.packageTitle || 'آموزش حذف‌شده'}
                          </p>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {item.sectionTitle || 'بخش حذف‌شده'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-text-secondary">
                          {faDateTime(item.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-text">
                          {item.scores.length ? item.scores.map(faPercent).join('، ') : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={item.status} />
                        </td>
                        <td className="rounded-e-xl px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-pressed={item.id === selected?.id}
                            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 font-bold text-primary-fg hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            نمایش
                            <ChevronDown className="size-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2 lg:hidden">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <Card
                      className={`p-3 ${item.id === selected?.id ? 'border-primary/40 bg-[#f3faf5]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/admin/users/${item.userId}`}
                            className="font-bold text-primary-fg hover:underline"
                          >
                            {item.userName}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {item.packageTitle} · {item.sectionTitle}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {faRelative(item.createdAt)}
                          </p>
                        </div>
                        <StatusPill status={item.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
                        <p className="text-xs text-text-secondary">
                          نمره‌ها:{' '}
                          {item.scores.length ? item.scores.map(faPercent).join('، ') : '—'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-pressed={item.id === selected?.id}
                          className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          جزئیات <ChevronDown className="size-4" aria-hidden />
                        </button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {selected && (
          <RequestDetails
            item={selected}
            onDecision={(value) => setDecision({ item: selected, value })}
            busy={mutation.isPending}
          />
        )}
      </section>

      <ConfirmDialog
        open={decision !== null}
        title={decision?.value === 'approve' ? 'تأیید درخواست آزمون مجدد' : 'رد درخواست آزمون مجدد'}
        confirmText={decision?.value === 'approve' ? 'تأیید و اعطای فرصت' : 'رد درخواست'}
        danger={decision?.value === 'reject'}
        loading={mutation.isPending}
        onClose={() => {
          setDecision(null);
          setNote('');
        }}
        onConfirm={() =>
          decision && mutation.mutate({ id: decision.item.id, decision: decision.value })
        }
      >
        <div className="space-y-3">
          <p>
            {decision?.item.userName} — {decision?.item.sectionTitle}
          </p>
          <Textarea
            label="یادداشت برای ثبت در سوابق (اختیاری)"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs text-text-secondary">نتیجهٔ تصمیم برای عضو ارسال می‌شود.</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function StatusTabs({
  value,
  onChange,
  items,
}: {
  value: RetakeStatus;
  onChange: (value: RetakeStatus) => void;
  items: Array<{ value: RetakeStatus; label: string; count?: number }>;
}) {
  return (
    <div
      role="tablist"
      aria-label="وضعیت درخواست‌ها"
      className="flex gap-1 overflow-x-auto rounded-input border border-border bg-surface-2 p-1"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-bold transition sm:min-h-12 sm:px-3 sm:text-sm ${value === item.value ? 'bg-white text-primary-fg shadow-sm' : 'text-text-secondary hover:bg-white/70'}`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="rounded-full bg-surface-2 px-1.5 text-xs">{faNumber(item.count)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: RetakeStatus }) {
  const Icon = status === 'pending' ? Clock3 : status === 'approved' ? Check : X;
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-bold ${STATUS_TONE[status]}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {status === 'pending' ? 'در انتظار بررسی' : status === 'approved' ? 'تأییدشده' : 'ردشده'}
    </span>
  );
}

function RequestDetails({
  item,
  onDecision,
  busy,
}: {
  item: RetakeItem;
  onDecision: (decision: Decision) => void;
  busy: boolean;
}) {
  const title = item.userName || 'عضو';
  return (
    <Card className="overflow-hidden border-[#dceadd] p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-l from-[#f1faf3] to-white px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-bold text-primary-fg">جزئیات درخواست</p>
          <h2 className="mt-1 text-lg font-black text-text">{title}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {item.packageTitle} · {item.sectionTitle}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-[1fr_1fr_0.8fr]">
        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-text">
            <UserRound className="size-4 text-primary-fg" aria-hidden /> اطلاعات عضو
          </h3>
          <Link
            to={`/admin/users/${item.userId}`}
            className="mt-3 inline-flex min-h-10 items-center font-bold text-primary-fg hover:underline"
          >
            مشاهدهٔ پروندهٔ کاربر
          </Link>
          <DetailLine
            label="شهر و استان"
            value={[item.userCity, item.userProvince].filter(Boolean).join('، ') || 'ثبت نشده'}
          />
          <DetailLine label="تاریخ درخواست" value={faDateTime(item.createdAt)} />
          <DetailLine label="زمان ثبت" value={faRelative(item.createdAt)} />
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-text">
            <FileQuestion className="size-4 text-primary-fg" aria-hidden /> سابقهٔ آزمون
          </h3>
          <p className="mt-3 text-sm font-semibold text-text">
            {item.packageTitle || 'آموزش حذف‌شده'}
          </p>
          <p className="text-xs text-text-secondary">{item.sectionTitle || 'بخش حذف‌شده'}</p>
          <DetailLine
            label="نمره‌های ثبت‌شده"
            value={item.scores.length ? item.scores.map(faPercent).join('، ') : 'نمره‌ای ثبت نشده'}
          />
          <DetailLine label="تعداد تلاش‌های ثبت‌شده" value={faNumber(item.scores.length)} />
          {item.escalated && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              این درخواست به مدیر سیستم ارجاع شده است؛ بررسی آن در این صفحه مجاز است.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-text">
            <CalendarDays className="size-4 text-primary-fg" aria-hidden /> نتیجهٔ بررسی
          </h3>
          {item.reviewedAt ? (
            <>
              <DetailLine label="تاریخ بررسی" value={faDateTime(item.reviewedAt)} />
              <DetailLine
                label="مدت پاسخ"
                value={faDuration(
                  Math.max(0, Date.parse(item.reviewedAt) - Date.parse(item.createdAt)) / 1000,
                )}
              />
              {item.reviewNote && (
                <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm leading-6 text-text-secondary">
                  یادداشت: {item.reviewNote}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              هنوز تصمیمی برای این درخواست ثبت نشده است.
            </p>
          )}
          {item.status === 'pending' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="danger"
                icon={<X className="size-4" aria-hidden />}
                disabled={busy}
                onClick={() => onDecision('reject')}
                className="flex-1 sm:flex-none"
              >
                رد درخواست
              </Button>
              <Button
                icon={<Check className="size-4" aria-hidden />}
                disabled={busy}
                onClick={() => onDecision('approve')}
                className="flex-1 sm:flex-none"
              >
                تأیید و اعطای فرصت
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-2 text-sm">
      <span className="shrink-0 text-text-secondary">{label}</span>
      <span className="text-end font-semibold text-text">{value}</span>
    </div>
  );
}
