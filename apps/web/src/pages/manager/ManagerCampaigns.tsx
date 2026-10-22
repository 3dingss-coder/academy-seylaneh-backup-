import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Download,
  FileEdit,
  Megaphone,
  Plus,
  Send,
  Smartphone,
  Users,
  XCircle,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/Table';
import { Button, Card, EmptyState, Input, KpiCard, Skeleton, useToast } from '@/components/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { Select, Textarea } from '@/components/common/Field';
import { PushPreview, type PreviewChannel } from '@/pages/admin/PushPreview';
import { PushTemplatePicker } from '@/pages/admin/PushTemplatePicker';
import { copyFromTemplate } from '@/pages/admin/pushTemplates';
import {
  EMPTY_FORM,
  CHANNEL_LABEL,
  STATUS_META,
  faTehranDateTime,
  formFromCampaign,
  isEditable,
  payloadFromForm,
  validateForm,
  type AudienceChannel,
  type CampaignDetail,
  type CampaignForm,
  type CampaignStatus,
  type PushCampaign,
} from '@/pages/admin/pushCampaignModel';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faNumber } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { downloadCsv, toCsv } from '@/lib/csv';

interface ManagerCampaignDashboard {
  counts: {
    total: number;
    draft: number;
    scheduled: number;
    inProgress: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  providerRequests: { attempted: number; accepted: number; failed: number; noDevice: number };
  recent: PushCampaign[];
}
interface CampaignPage {
  items: PushCampaign[];
  nextCursor: string | null;
  total: number;
}
interface AudiencePreview {
  users: number;
  withPushDevice: number;
  webDevices: number;
  androidDevices: number;
  note: string;
}

const FILTER_OPTIONS: Array<{ value: 'all' | CampaignStatus; label: string }> = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'draft', label: 'پیش‌نویس' },
  { value: 'scheduled', label: 'زمان‌بندی‌شده' },
  { value: 'queued', label: 'در صف' },
  { value: 'sending', label: 'در حال ارسال' },
  { value: 'sent', label: 'ارسال‌شده' },
  { value: 'sent_with_errors', label: 'ارسال‌شده با خطا' },
  { value: 'failed', label: 'ناموفق' },
  { value: 'cancelled', label: 'لغوشده' },
];

export function ManagerCampaignsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'all' | CampaignStatus>('all');
  const dashboard = useQuery({
    queryKey: ['manager', 'campaigns', 'dashboard'],
    queryFn: ({ signal }) =>
      api.get<ManagerCampaignDashboard>('/manager/campaigns/dashboard', signal),
  });
  const list = useInfiniteQuery({
    queryKey: ['manager', 'campaigns', 'list', status],
    initialPageParam: '' as string,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      if (status !== 'all') params.set('status', status);
      return api.get<CampaignPage>(`/manager/campaigns?${params.toString()}`, signal);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<PushCampaign>[] = [
    {
      key: 'name',
      header: 'کمپین',
      cell: (campaign) => (
        <div className="min-w-40">
          <span className="block font-extrabold text-[#1b4234]">{campaign.name}</span>
          <span className="mt-0.5 block max-w-[28rem] truncate text-xs text-text-secondary">
            {campaign.title}
          </span>
        </div>
      ),
      sortValue: (campaign) => campaign.name,
    },
    {
      key: 'audience',
      header: 'مخاطب',
      cell: (campaign) => (
        <div className="min-w-32 text-xs leading-6">
          <span className="block font-semibold">تیم خودم</span>
          <span className="text-text-secondary">{CHANNEL_LABEL[campaign.audience.channel]}</span>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'وضعیت',
      cell: (campaign) => <CampaignBadge status={campaign.status} />,
      sortValue: (campaign) => campaign.status,
    },
    {
      key: 'date',
      header: 'ارسال / ایجاد',
      cell: (campaign) => (
        <span className="whitespace-nowrap text-xs">
          {campaign.scheduledAt
            ? faTehranDateTime(campaign.scheduledAt)
            : faTehranDateTime(campaign.createdAt)}
        </span>
      ),
      hideOnMobile: true,
      sortValue: (campaign) => campaign.scheduledAt ?? campaign.createdAt,
    },
    {
      key: 'requests',
      header: 'وضعیت درخواست‌های ارسال',
      cell: (campaign) => (
        <span className="whitespace-nowrap text-xs">
          {faNumber(campaign.summary?.accepted ?? 0)} پذیرفته‌شده از{' '}
          {faNumber(campaign.summary?.attempted ?? 0)}
        </span>
      ),
      hideOnMobile: true,
      sortValue: (campaign) => campaign.summary?.attempted ?? 0,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="کمپین‌های تیم"
        subtitle="ساخت و پیگیری اعلان‌های آموزشی برای اعضای تیم خودتان"
        actions={
          <Button
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => navigate('/manager/campaigns/new')}
          >
            کمپین جدید
          </Button>
        }
      />
      <Card
        tone="brand"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[#176e50]">
            <BellRing className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-extrabold text-[#183d30]">پیام درست، برای تیم درست</h2>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-text-secondary">
              مخاطبان این فضا فقط اعضای تیم شما هستند. عدد «پذیرفته‌شده» وضعیت درخواست در سرویس
              ارسال است و به معنی تحویل قطعی یا دیده‌شدن اعلان نیست.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => navigate('/manager/campaigns/new')}
        >
          ساخت کمپین
        </Button>
      </Card>

      <QueryState
        query={dashboard}
        loading={
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-28" />
            ))}
          </div>
        }
      >
        {(data) => (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="خلاصه کمپین‌های تیم">
              <KpiCard title="کل کمپین‌ها" value={faNumber(data.counts.total)} icon={Megaphone} />
              <KpiCard
                title="پیش‌نویس"
                value={faNumber(data.counts.draft)}
                subtitle="بدون ارسال"
                icon={FileEdit}
                tone="info"
              />
              <KpiCard
                title="زمان‌بندی‌شده"
                value={faNumber(data.counts.scheduled)}
                subtitle={
                  data.counts.inProgress
                    ? `${faNumber(data.counts.inProgress)} در صف یا در حال ارسال`
                    : 'در انتظار زمان ارسال'
                }
                icon={CalendarClock}
                tone="warning"
              />
              <KpiCard
                title="ارسال‌شده"
                value={faNumber(data.counts.sent)}
                subtitle={`ناموفق: ${faNumber(data.counts.failed)}`}
                icon={CheckCircle2}
                tone="primary"
              />
            </div>
            <Card className="flex flex-col gap-2 border-dashed bg-white/80 text-xs leading-6 text-text-secondary sm:flex-row sm:items-center sm:justify-between">
              <span>
                در مجموع {faNumber(data.providerRequests.attempted)} درخواست ثبت شده؛{' '}
                {faNumber(data.providerRequests.accepted)} درخواست توسط سرویس ارسال پذیرفته شده است.
              </span>
              <span className="font-semibold">بدون دادهٔ تحویل، بازشدن یا تبدیل</span>
            </Card>
          </>
        )}
      </QueryState>

      <section className="flex flex-col gap-3" aria-label="فهرست کمپین‌ها">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#183d30]">تاریخچهٔ کمپین‌ها</h2>
            <p className="mt-1 text-xs text-text-secondary">
              کمپین‌ها به تفکیک وضعیت؛ ردیف را برای جزئیات انتخاب کنید.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="فیلتر وضعیت"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="min-w-48"
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              icon={<Download className="size-4" aria-hidden />}
              onClick={() => exportCampaignCsv(items)}
            >
              خروجی CSV
            </Button>
          </div>
        </div>
        <QueryState query={list} loading={<Skeleton className="h-80" />}>
          {() =>
            items.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="size-8" aria-hidden />}
                title={
                  status === 'all'
                    ? 'هنوز کمپینی برای تیم ثبت نشده است'
                    : 'کمپینی با این وضعیت پیدا نشد'
                }
                description="با یک پیام آموزشی شفاف، اعضای تیم را به مسیر یادگیری مرتبط هدایت کنید."
                actionText="ساخت کمپین"
                onAction={() => navigate('/manager/campaigns/new')}
              />
            ) : (
              <>
                <DataTable
                  caption="تاریخچه کمپین‌های تیم"
                  rows={items}
                  columns={columns}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/manager/campaigns/${row.id}`)}
                  rowActionLabel={(row) => `نمایش کمپین ${row.name}`}
                />
                {list.hasNextPage && (
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      loading={list.isFetchingNextPage}
                      onClick={() => void list.fetchNextPage()}
                    >
                      نمایش کمپین‌های بیشتر
                    </Button>
                  </div>
                )}
              </>
            )
          }
        </QueryState>
      </section>
    </div>
  );
}

function exportCampaignCsv(items: PushCampaign[]) {
  const csv = toCsv(
    [
      'نام',
      'عنوان',
      'وضعیت',
      'کانال',
      'زمان‌بندی',
      'تعداد هدف',
      'درخواست ارسال‌شده',
      'پذیرفته‌شده توسط سرویس',
      'ناموفق',
    ],
    items.map((campaign) => [
      campaign.name,
      campaign.title,
      STATUS_META[campaign.status].label,
      CHANNEL_LABEL[campaign.audience.channel],
      campaign.scheduledAt ? faTehranDateTime(campaign.scheduledAt) : '',
      campaign.targetCount ?? '',
      campaign.summary?.attempted ?? 0,
      campaign.summary?.accepted ?? 0,
      campaign.summary?.failed ?? 0,
    ]),
  );
  downloadCsv(`team-campaigns-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

function CampaignEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const campaignId = id && id !== 'new' ? id : undefined;
  const detail = useQuery({
    queryKey: ['manager', 'campaigns', 'detail', campaignId],
    queryFn: ({ signal }) => api.get<CampaignDetail>(`/manager/campaigns/${campaignId}`, signal),
    enabled: Boolean(campaignId),
  });
  if (!campaignId) return <CampaignEditor key="new" campaign={null} />;
  return (
    <QueryState query={detail} loading={<Skeleton className="h-[36rem]" />}>
      {(data) =>
        !isEditable(data.campaign.status) || data.campaign.createdBy !== user?.id ? (
          <div className="flex flex-col gap-4">
            <PageHeader
              title={data.campaign.name}
              subtitle={<CampaignBadge status={data.campaign.status} />}
              back="/manager/campaigns"
            />
            {data.campaign.createdBy !== user?.id && (
              <Card className="border-info/30 bg-info-light text-sm text-info-fg">
                این کمپین برای تیم شما قابل مشاهده است؛ فقط سازنده می‌تواند آن را ویرایش کند.
              </Card>
            )}
            <CampaignResults detail={data} />
          </div>
        ) : (
          <CampaignEditor
            key={`${data.campaign.id}-${data.campaign.version}`}
            campaign={data.campaign}
          />
        )
      }
    </QueryState>
  );
}

function CampaignEditor({ campaign }: { campaign: PushCampaign | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const teamId = user?.teamId ?? '';
  const isNew = !campaign;
  const [form, setForm] = useState<CampaignForm>(() =>
    campaign
      ? {
          ...formFromCampaign(campaign),
          audienceType: 'team',
          targetId: campaign.audience.targetId ?? '',
        }
      : { ...EMPTY_FORM, audienceType: 'team', targetId: teamId, channel: 'any' },
  );
  const [previewChannel, setPreviewChannel] = useState<PreviewChannel>('web');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<number | null>(campaign?.version ?? null);
  const [savedId, setSavedId] = useState<string | null>(campaign?.id ?? null);
  const [confirm, setConfirm] = useState<'send' | 'schedule' | null>(null);
  const sendKeyRef = useRef<string | null>(null);

  const preview = useQuery({
    queryKey: ['manager', 'campaigns', 'preview', form.channel],
    queryFn: () =>
      api.post<AudiencePreview>('/manager/campaigns/audience-preview', { channel: form.channel }),
    enabled: Boolean(teamId),
    staleTime: 30_000,
  });

  const invalidate = (idToRefresh?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['manager', 'campaigns'] });
    if (idToRefresh)
      void queryClient.invalidateQueries({
        queryKey: ['manager', 'campaigns', 'detail', idToRefresh],
      });
  };
  const persist = async (schedule: boolean): Promise<CampaignDetail> => {
    const body = payloadFromForm(form, schedule);
    const result = savedId
      ? await api.patch<CampaignDetail>(`/manager/campaigns/${savedId}`, { ...body, version })
      : await api.post<CampaignDetail>('/manager/campaigns', body);
    setSavedId(result.campaign.id);
    setVersion(result.campaign.version);
    invalidate(result.campaign.id);
    return result;
  };
  const surfaceError = (error: unknown) => {
    if (error instanceof Error && 'fields' in error) {
      const fields = (error as { fields?: Record<string, string> }).fields;
      if (fields && Object.keys(fields).length) setErrors(fields);
    }
    toast.show({ type: 'error', message: errMsg(error) });
  };

  const saveDraft = useMutation({
    mutationFn: () => persist(false),
    onSuccess: (result) => {
      toast.show({ type: 'success', message: 'پیش‌نویس ذخیره شد؛ هنوز اعلانی ارسال نشده است.' });
      if (isNew) navigate(`/manager/campaigns/${result.campaign.id}`, { replace: true });
    },
    onError: surfaceError,
  });
  const schedule = useMutation({
    mutationFn: () => persist(true),
    onSuccess: (result) => {
      setConfirm(null);
      toast.show({
        type: 'success',
        message: `کمپین برای ${faTehranDateTime(result.campaign.scheduledAt)} زمان‌بندی شد.`,
      });
      navigate(`/manager/campaigns/${result.campaign.id}`, { replace: true });
    },
    onError: (error) => {
      setConfirm(null);
      surfaceError(error);
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!sendKeyRef.current) sendKeyRef.current = crypto.randomUUID();
      const saved = await persist(false);
      return api.post<CampaignDetail>(
        `/manager/campaigns/${saved.campaign.id}/send`,
        {},
        { 'Idempotency-Key': sendKeyRef.current },
      );
    },
    onSuccess: (result) => {
      sendKeyRef.current = null;
      setConfirm(null);
      toast.show({
        type: 'success',
        message: 'درخواست ارسال ثبت شد. وضعیت پردازش را در جزئیات کمپین دنبال کنید.',
      });
      navigate(`/manager/campaigns/${result.campaign.id}`, { replace: true });
    },
    onError: (error) => {
      setConfirm(null);
      surfaceError(error);
    },
  });

  const set = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const { [key as string]: _removed, ...rest } = current;
      void _removed;
      return rest;
    });
  };
  const applyTemplate = (template: Parameters<typeof copyFromTemplate>[0]) => {
    const copy = copyFromTemplate(template);
    setForm((current) => ({ ...current, ...copy }));
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !Object.keys(copy).includes(key)),
      ),
    );
    toast.show({ type: 'info', message: `قالب «${template.category}» روی فرم اعمال شد.` });
  };
  const validate = (scheduleMode: boolean) => {
    const candidate = scheduleMode ? form : { ...form, scheduleDate: '', scheduleTime: '' };
    const nextErrors = validateForm(candidate);
    if (!teamId) nextErrors.audience = 'حساب شما به تیمی متصل نیست.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const dateTime = form.scheduleDate ? `${form.scheduleDate}T${form.scheduleTime || '18:00'}` : '';
  const busy = saveDraft.isPending || schedule.isPending || send.isPending;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={campaign ? 'ویرایش کمپین تیم' : 'کمپین جدید تیم'}
        subtitle="اعلان را برای تیم خودتان تنظیم کنید؛ مخاطب در سمت سرور نیز کنترل می‌شود."
        back={campaign ? `/manager/campaigns/${campaign.id}` : '/manager/campaigns'}
        actions={<PushTemplatePicker label="استفاده از قالب آماده" onPick={applyTemplate} />}
      />
      <Card tone="brand" className="flex items-start gap-3 text-sm leading-6">
        <Users className="mt-0.5 size-5 shrink-0 text-primary-fg" aria-hidden />
        <p>
          مخاطب به‌صورت ثابت به تیم حساب شما محدود است. پیش‌نمایش تعداد دستگاه‌ها تقریبی است و هنگام
          ارسال دوباره محاسبه می‌شود.
        </p>
      </Card>
      {!teamId && (
        <Card className="border-danger/30 bg-danger-light text-sm text-danger-fg">
          این حساب به تیمی متصل نیست و امکان ساخت یا ارسال کمپین ندارد.
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] xl:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4" aria-label="اطلاعات کمپین">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary-light text-primary-fg">
                ۱
              </span>
              <h2 className="text-base font-extrabold text-[#183d30]">محتوا و مخاطب</h2>
            </div>
            <Input
              label="نام داخلی کمپین"
              hint="فقط در پنل مدیر دیده می‌شود."
              value={form.name}
              maxLength={80}
              onChange={(event) => set('name', event.target.value)}
              error={errors.name}
            />
            <Input
              label="عنوان اعلان"
              value={form.title}
              maxLength={80}
              onChange={(event) => set('title', event.target.value)}
              error={errors.title}
            />
            <Textarea
              label="متن پیام"
              value={form.body}
              maxLength={300}
              onChange={(event) => set('body', event.target.value)}
              error={errors.body}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="تصویر اعلان (اختیاری)"
                dir="ltr"
                value={form.imageUrl}
                onChange={(event) => set('imageUrl', event.target.value)}
                error={errors.imageUrl}
                placeholder="https://…"
              />
              <Select
                label="مقصد پس از کلیک"
                value={form.actionRef}
                onChange={(event) => set('actionRef', event.target.value)}
                error={errors.actionRef}
              >
                <option value="/messages">صندوق پیام‌ها</option>
                <option value="/">صفحه خانه</option>
                <option value="/learn">آموزش‌ها</option>
                <option value="/cards">کارت‌های آموزشی</option>
                <option value="/mentor">منتور</option>
                <option value="/profile">پروفایل</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="مخاطبان"
                value="team"
                disabled
                hint="فقط اعضای تیم حساب شما"
                onChange={() => undefined}
              >
                <option value="team">تیم من</option>
              </Select>
              <Select
                label="کانال دستگاه"
                value={form.channel}
                onChange={(event) => set('channel', event.target.value as AudienceChannel)}
              >
                {(Object.keys(CHANNEL_LABEL) as AudienceChannel[]).map((channel) => (
                  <option key={channel} value={channel}>
                    {CHANNEL_LABEL[channel]}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
          <Card className="flex flex-col gap-4" aria-label="زمان‌بندی کمپین">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-info-light text-info-fg">
                ۲
              </span>
              <h2 className="text-base font-extrabold text-[#183d30]">زمان‌بندی</h2>
            </div>
            <JalaliDateField
              label="زمان ارسال (اختیاری)"
              mode="datetime"
              value={dateTime}
              onChange={(value) => {
                const [date = '', time = ''] = value.split('T');
                setForm((current) => ({ ...current, scheduleDate: date, scheduleTime: time }));
                setErrors((current) => {
                  const { scheduleDate: _date, scheduleTime: _time, ...rest } = current;
                  void _date;
                  void _time;
                  return rest;
                });
              }}
              disablePast
              defaultTime="09:00"
              error={errors.scheduleDate}
              hint="تاریخ و ساعت بر اساس منطقه زمانی تهران ذخیره می‌شود. اگر خالی بماند، کمپین به‌صورت پیش‌نویس ذخیره می‌شود."
            />
            {form.scheduleTime && (
              <p className="-mt-2 text-xs text-text-secondary">
                زمان انتخاب‌شده در تهران: {toPersianDigits(form.scheduleTime)}
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-24">
          <Card className="flex flex-col gap-3" aria-label="پیش‌نمایش اعلان">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-warning-light text-warning-fg">
                <Smartphone className="size-4" aria-hidden />
              </span>
              <h2 className="text-base font-extrabold text-[#183d30]">پیش‌نمایش اعلان</h2>
            </div>
            <PushPreview
              title={form.title}
              body={form.body}
              imageUrl={form.imageUrl}
              actionRef={form.actionRef}
              channel={previewChannel}
              onChannelChange={setPreviewChannel}
            />
          </Card>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-[#183d30]">برآورد مخاطب</h2>
              <Users className="size-5 text-primary-fg" aria-hidden />
            </div>
            {preview.isPending ? (
              <Skeleton className="h-20" />
            ) : preview.data ? (
              <div className="grid grid-cols-2 gap-3">
                <PreviewNumber label="اعضای هدف" value={preview.data.users} />
                <PreviewNumber label="دارای دستگاه پوش" value={preview.data.withPushDevice} />
                <PreviewNumber label="دستگاه وب" value={preview.data.webDevices} />
                <PreviewNumber label="دستگاه اندروید" value={preview.data.androidDevices} />
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                برآورد مخاطب در دسترس نیست؛ قبل از ارسال دوباره بررسی می‌شود.
              </p>
            )}
            <p className="text-xs leading-6 text-text-secondary">
              {preview.data?.note ?? 'این برآورد تضمین تحویل یا مشاهده نیست.'}
            </p>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-[4.5rem] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7de] bg-white/95 p-3 shadow-lg backdrop-blur-xl lg:bottom-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<FileEdit className="size-4" aria-hidden />}
            loading={saveDraft.isPending}
            disabled={busy || !teamId}
            onClick={() => validate(false) && saveDraft.mutate()}
          >
            ذخیره پیش‌نویس
          </Button>
          <Button
            variant="secondary"
            icon={<CalendarClock className="size-4" aria-hidden />}
            loading={schedule.isPending}
            disabled={busy || !teamId}
            onClick={() => validate(true) && setConfirm('schedule')}
          >
            زمان‌بندی
          </Button>
        </div>
        <Button
          icon={<Send className="size-4" aria-hidden />}
          loading={send.isPending}
          disabled={busy || !teamId}
          onClick={() => validate(false) && setConfirm('send')}
        >
          ذخیره و ارسال
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === 'schedule'}
        title="زمان‌بندی کمپین"
        confirmText="تأیید زمان‌بندی"
        loading={schedule.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => schedule.mutate()}
      >
        اعلان برای{' '}
        {faTehranDateTime(
          form.scheduleDate && form.scheduleTime ? payloadFromForm(form, true).scheduledAt : null,
        )}{' '}
        در صف ارسال قرار می‌گیرد. زمان با منطقهٔ زمانی تهران محاسبه شده است.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'send'}
        title="ارسال اعلان برای تیم"
        confirmText="ثبت درخواست ارسال"
        loading={send.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => send.mutate()}
      >
        کمپین برای اعضای تیم شما ثبت می‌شود. سرویس ارسال نتیجهٔ درخواست‌ها را گزارش می‌کند؛ تحویل یا
        مشاهدهٔ اعلان تضمین و ردیابی نمی‌شود.
      </ConfirmDialog>
    </div>
  );
}

function CampaignDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<'send' | 'cancel' | 'archive' | null>(null);
  const detail = useQuery({
    queryKey: ['manager', 'campaigns', 'detail', id],
    queryFn: ({ signal }) => api.get<CampaignDetail>(`/manager/campaigns/${id}`, signal),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['manager', 'campaigns'] });
    void queryClient.invalidateQueries({ queryKey: ['manager', 'campaigns', 'detail', id] });
  };
  const sendKeyRef = useRef<string | null>(null);
  const send = useMutation({
    mutationFn: () => {
      if (!sendKeyRef.current) sendKeyRef.current = crypto.randomUUID();
      return api.post<CampaignDetail>(
        `/manager/campaigns/${id}/send`,
        {},
        { 'Idempotency-Key': sendKeyRef.current },
      );
    },
    onSuccess: () => {
      sendKeyRef.current = null;
      setConfirm(null);
      invalidate();
      toast.show({ type: 'success', message: 'درخواست ارسال در صف قرار گرفت.' });
    },
    onError: (error) => {
      setConfirm(null);
      toast.show({ type: 'error', message: errMsg(error) });
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.post<CampaignDetail>(`/manager/campaigns/${id}/cancel`, {}),
    onSuccess: () => {
      setConfirm(null);
      invalidate();
      toast.show({ type: 'success', message: 'کمپین لغو شد.' });
    },
    onError: (error) => {
      setConfirm(null);
      toast.show({ type: 'error', message: errMsg(error) });
    },
  });
  const archive = useMutation({
    mutationFn: () => api.del(`/manager/campaigns/${id}`),
    onSuccess: () => {
      setConfirm(null);
      invalidate();
      toast.show({ type: 'success', message: 'کمپین بایگانی شد.' });
      navigate('/manager/campaigns');
    },
    onError: (error) => {
      setConfirm(null);
      toast.show({ type: 'error', message: errMsg(error) });
    },
  });
  return (
    <QueryState query={detail} loading={<Skeleton className="h-[36rem]" />}>
      {(data) => {
        const campaign = data.campaign;
        const canManage = campaign.createdBy === user?.id;
        const canEdit = canManage && isEditable(campaign.status);
        const canCancel = canManage && ['draft', 'scheduled'].includes(campaign.status);
        const canArchive =
          canManage &&
          ['draft', 'cancelled', 'sent', 'sent_with_errors', 'failed'].includes(campaign.status);
        return (
          <div className="flex flex-col gap-4">
            <PageHeader
              title={campaign.name}
              back="/manager/campaigns"
              subtitle={
                <span className="flex flex-wrap items-center gap-2">
                  <CampaignBadge status={campaign.status} />
                  <span className="text-xs text-text-secondary">
                    مخاطب: تیم خودم • {CHANNEL_LABEL[campaign.audience.channel]}
                  </span>
                </span>
              }
              actions={
                <>
                  {canEdit && (
                    <Button
                      variant="secondary"
                      icon={<FileEdit className="size-4" aria-hidden />}
                      onClick={() => navigate(`/manager/campaigns/${id}/edit`)}
                    >
                      ویرایش
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      icon={<Send className="size-4" aria-hidden />}
                      onClick={() => setConfirm('send')}
                    >
                      ارسال اکنون
                    </Button>
                  )}
                </>
              }
            />
            {!canManage && (
              <Card className="border-info/30 bg-info-light text-sm text-info-fg">
                این کمپین برای تیم شما قابل مشاهده است؛ فقط سازنده می‌تواند آن را تغییر دهد یا ارسال
                کند.
              </Card>
            )}
            <CampaignResults detail={data} />
            {canCancel && (
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-extrabold">کنترل کمپین</h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    در صورت تغییر برنامه می‌توانید کمپین را لغو کنید.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon={<XCircle className="size-4" aria-hidden />}
                  onClick={() => setConfirm('cancel')}
                >
                  لغو کمپین
                </Button>
              </Card>
            )}
            {canArchive && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={() => setConfirm('archive')}
                >
                  بایگانی کمپین
                </Button>
              </div>
            )}
            <ConfirmDialog
              open={confirm === 'send'}
              title="ارسال کمپین"
              confirmText="ثبت درخواست ارسال"
              loading={send.isPending}
              onClose={() => setConfirm(null)}
              onConfirm={() => send.mutate()}
            >
              اعلان برای اعضای تیم شما در صف ارسال قرار می‌گیرد. وضعیت سرویس ارسال را می‌بینید؛ این
              آمار، تحویل یا دیده‌شدن را نشان نمی‌دهد.
            </ConfirmDialog>
            <ConfirmDialog
              open={confirm === 'cancel'}
              title="لغو کمپین"
              confirmText="لغو کمپین"
              danger
              loading={cancel.isPending}
              onClose={() => setConfirm(null)}
              onConfirm={() => cancel.mutate()}
            >
              زمان‌بندی کمپین متوقف می‌شود. در صورت نیاز می‌توانید آن را بعداً بایگانی کنید.
            </ConfirmDialog>
            <ConfirmDialog
              open={confirm === 'archive'}
              title="بایگانی کمپین"
              confirmText="بایگانی"
              danger
              loading={archive.isPending}
              onClose={() => setConfirm(null)}
              onConfirm={() => archive.mutate()}
            >
              کمپین از فهرست جاری تیم خارج می‌شود. تاریخچهٔ ارسال و گزارش آن حذف نمی‌شود.
            </ConfirmDialog>
          </div>
        );
      }}
    </QueryState>
  );
}

function CampaignResults({ detail }: { detail: CampaignDetail }) {
  const campaign = detail.campaign;
  const summary = campaign.summary;
  const batches = detail.batches;
  const columns: Column<CampaignDetail['batches'][number]>[] = [
    {
      key: 'batch',
      header: 'بخش ارسال',
      cell: (row) => faNumber(row.index + 1),
      sortValue: (row) => row.index,
    },
    {
      key: 'status',
      header: 'وضعیت',
      cell: (row) => (
        <CampaignBadge
          status={
            row.status === 'pending'
              ? 'queued'
              : row.status === 'interrupted'
                ? 'failed'
                : row.status
          }
        />
      ),
    },
    {
      key: 'users',
      header: 'کاربران در بخش',
      cell: (row) => faNumber(row.users),
      sortValue: (row) => row.users,
    },
    {
      key: 'attempted',
      header: 'درخواست‌ها',
      cell: (row) => faNumber(row.attempted),
      sortValue: (row) => row.attempted,
    },
    {
      key: 'accepted',
      header: 'پذیرفته‌شده',
      cell: (row) => faNumber(row.accepted),
      sortValue: (row) => row.accepted,
    },
    {
      key: 'failed',
      header: 'ناموفق',
      cell: (row) => faNumber(row.failed),
      sortValue: (row) => row.failed,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          title="کاربران هدف"
          value={campaign.targetCount === null ? '—' : faNumber(campaign.targetCount)}
          icon={Users}
        />
        <KpiCard
          title="درخواست ارسال‌شده"
          value={faNumber(summary.attempted)}
          icon={Send}
          tone="info"
        />
        <KpiCard
          title="پذیرفته‌شده توسط سرویس"
          value={faNumber(summary.accepted)}
          icon={CheckCircle2}
          tone="primary"
        />
        <KpiCard
          title="ناموفق"
          value={faNumber(summary.failed)}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>
      <Card className="flex items-start gap-3 border-info/25 bg-info-light/40 text-xs leading-6 text-text-secondary">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-info-fg" aria-hidden />
        <p>
          «پذیرفته‌شده» یعنی سرویس ارسال درخواست را پذیرفته است. دادهٔ تحویل به دستگاه، مشاهده،
          بازشدن، فروش یا تبدیل در دسترس نیست.{' '}
          {campaign.scheduledAt
            ? `زمان برنامه‌ریزی‌شده: ${faTehranDateTime(campaign.scheduledAt)}.`
            : ''}
        </p>
      </Card>
      {campaign.lastError && (
        <Card className="border-danger/30 bg-danger-light text-sm text-danger-fg">
          آخرین خطای ثبت‌شده: {campaign.lastError}
        </Card>
      )}
      {batches.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-extrabold text-[#183d30]">جزئیات نوبت‌های پردازش</h2>
          <DataTable
            caption="نوبت‌های ارسال کمپین"
            rows={batches}
            columns={columns}
            rowKey={(row) => String(row.index)}
          />
          {detail.batchesTruncated && (
            <p className="text-xs text-text-secondary">
              برای این کمپین تعداد زیادی نوبت ثبت شده است؛ در این نما فقط بخشی از تاریخچه نمایش داده
              می‌شود.
            </p>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-2">
          <h2 className="font-extrabold text-[#183d30]">جزئیات ارسال</h2>
          <p className="text-sm text-text-secondary">
            {campaign.status === 'draft' || campaign.status === 'scheduled'
              ? 'هنوز نوبت ارسالی ایجاد نشده است.'
              : 'جزئیات نوبت‌های ارسال هنوز ثبت نشده است.'}
          </p>
        </Card>
      )}
    </div>
  );
}

function CampaignBadge({ status }: { status: CampaignStatus | 'pending' | 'interrupted' }) {
  const normalized: CampaignStatus =
    status === 'pending' ? 'queued' : status === 'interrupted' ? 'failed' : status;
  const meta = STATUS_META[normalized];
  const Icon =
    status === 'sent'
      ? CheckCircle2
      : status === 'failed' || status === 'sent_with_errors'
        ? AlertTriangle
        : status === 'scheduled'
          ? CalendarClock
          : status === 'draft'
            ? FileEdit
            : Send;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold',
        meta.tone === 'success'
          ? 'border-success/25 bg-success-light text-success-fg'
          : meta.tone === 'warning'
            ? 'border-warning/25 bg-warning-light text-warning-fg'
            : meta.tone === 'danger'
              ? 'border-danger/25 bg-danger-light text-danger-fg'
              : meta.tone === 'info'
                ? 'border-info/25 bg-info-light text-info-fg'
                : 'border-border bg-background text-text-secondary',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {status === 'pending' ? 'در انتظار' : status === 'interrupted' ? 'متوقف‌شده' : meta.label}
    </span>
  );
}

function PreviewNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-black text-[#183d30]">{faNumber(value)}</p>
    </div>
  );
}

export function ManagerCampaignRoute() {
  const { id } = useParams();
  const { pathname } = useLocation();
  if (id === 'new' || id === undefined || pathname.endsWith('/edit')) return <CampaignEditorPage />;
  return <CampaignDetailPage />;
}
