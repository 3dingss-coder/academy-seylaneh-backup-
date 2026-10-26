import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  Clock3,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  TableSkeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { Select, Tabs } from '@/components/common/Field';
import { ProvinceMultiSelect } from '@/components/common/ProvinceMultiSelect';
import { QueryState } from '@/components/common/QueryState';
import { api, fileUrl } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { faDateTime } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import type { AdminTeam, ManagerAccessRequestView } from '@/lib/types';
import { ak, useTeams } from './adminQueries';

type RequestFilter = 'open' | 'all' | 'approved' | 'rejected';

const OPEN_STATUSES = new Set(['pending', 'review_requested']);
const REQUEST_STATUS: Record<
  ManagerAccessRequestView['status'],
  { label: string; classes: string }
> = {
  pending: { label: 'در انتظار بررسی', classes: 'border-amber-200 bg-amber-50 text-amber-800' },
  review_requested: { label: 'بازبینی دوباره', classes: 'border-sky-200 bg-sky-50 text-sky-800' },
  approved: { label: 'تأیید شده', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  rejected: { label: 'رد شده', classes: 'border-rose-200 bg-rose-50 text-rose-800' },
};

/** Admin-only review queue. Every application field is returned by the protected Admin API. */
export function ManagerAccessRequestsPanel() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<RequestFilter>('open');
  const [approval, setApproval] = useState<ManagerAccessRequestView | null>(null);
  const [rejection, setRejection] = useState<ManagerAccessRequestView | null>(null);
  const [teamId, setTeamId] = useState('');
  const [managerProvinces, setManagerProvinces] = useState<string[]>([]);
  const [phoneReviewed, setPhoneReviewed] = useState(false);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const requests = useQuery({
    queryKey: ['admin', 'manager-access-requests'],
    queryFn: ({ signal }) =>
      api.get<ManagerAccessRequestView[]>('/admin/manager-access-requests', signal),
    staleTime: 15_000,
  });
  const teams = useTeams();

  const approve = useMutation({
    mutationFn: (request: ManagerAccessRequestView) =>
      api.post(`/admin/manager-access-requests/${request.id}/approve`, {
        teamId: teamId || null,
        managerProvinces,
        phoneReviewedExternally: phoneReviewed,
      }),
    onSuccess: async () => {
      toast.show({
        type: 'success',
        message:
          'حساب مدیر فعال شد و گزارش‌های استان‌های انتخاب‌شده را می‌بیند؛ حساب بازاریاب همان شماره دست‌نخورده می‌ماند.',
      });
      setApproval(null);
      setPhoneReviewed(false);
      setTeamId('');
      setManagerProvinces([]);
      await invalidate();
    },
    onError: (cause) => setFormError(errMsg(cause)),
  });
  const reject = useMutation({
    mutationFn: (request: ManagerAccessRequestView) =>
      api.post(`/admin/manager-access-requests/${request.id}/reject`, { reason }),
    onSuccess: async () => {
      toast.show({ type: 'success', message: 'نتیجه برای متقاضی ثبت شد.' });
      setRejection(null);
      setReason('');
      await invalidate();
    },
    onError: (cause) => setFormError(errMsg(cause)),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'manager-access-requests'] }),
      queryClient.invalidateQueries({ queryKey: ak.users }),
      queryClient.invalidateQueries({ queryKey: ak.teams }),
    ]);
  };

  // A team may have any number of Managers; its primary `managerId` is only a legacy pointer.
  const availableTeams = teams.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#143f36]">مدیریت نقش مدیران و درخواست‌ها</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            اطلاعات کامل درخواست را بررسی کنید؛ حساب Manager تا زمان تأیید غیرفعال می‌ماند.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void requests.refetch()}
          loading={requests.isFetching}
        >
          تازه‌سازی درخواست‌ها
        </Button>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <b className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden /> بررسی شماره تماس
        </b>
        <span className="mt-1 block text-xs leading-6 text-amber-800">
          پیش از فعال‌سازی، شماره تماس را دستی بررسی و نتیجه را در مرحلهٔ تأیید ثبت کنید.
        </span>
      </div>

      <QueryState query={requests} loading={<TableSkeleton rows={5} />}>
        {(items) => {
          const pendingCount = items.filter((request) => OPEN_STATUSES.has(request.status)).length;
          const visible = items.filter((request) => {
            if (filter === 'open') return OPEN_STATUSES.has(request.status);
            if (filter === 'approved') return request.status === 'approved';
            if (filter === 'rejected') return request.status === 'rejected';
            return true;
          });
          return (
            <>
              <Tabs<RequestFilter>
                label="وضعیت درخواست‌های مدیر"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'open', label: 'نیازمند بررسی', count: pendingCount },
                  { value: 'all', label: 'همه درخواست‌ها', count: items.length },
                  { value: 'approved', label: 'تأییدشده' },
                  { value: 'rejected', label: 'ردشده' },
                ]}
              />
              {searchParams.get('tab') === 'manager-requests' &&
                pendingCount > 0 &&
                filter !== 'open' && (
                  <p className="text-xs font-bold text-[#64776b]">
                    {toPersianDigits(pendingCount)} درخواست برای بررسی اولیه یا بازبینی دوباره در صف
                    است.
                  </p>
                )}
              {visible.length === 0 ? (
                <EmptyState
                  title={
                    filter === 'open' ? 'درخواستی برای بررسی نیست' : 'درخواستی در این دسته نیست'
                  }
                  description="درخواست‌های جدید مدیر در همین بخش نمایش داده می‌شوند."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {visible.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      teams={teams.data ?? []}
                      onApprove={() => {
                        setFormError('');
                        setPhoneReviewed(false);
                        setTeamId('');
                        // The requested province is pre-granted; Admin can widen it here.
                        setManagerProvinces([request.managementProvince]);
                        setApproval(request);
                      }}
                      onReject={() => {
                        setFormError('');
                        setReason('');
                        setRejection(request);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </QueryState>

      <Modal
        open={Boolean(approval)}
        onClose={() => {
          if (!approve.isPending) setApproval(null);
          setFormError('');
        }}
        title="تأیید و فعال‌سازی حساب مدیر"
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={approve.isPending} onClick={() => setApproval(null)}>
              انصراف
            </Button>
            <Button
              loading={approve.isPending}
              disabled={(!teamId && managerProvinces.length === 0) || !phoneReviewed}
              icon={<Check className="size-4" aria-hidden />}
              onClick={() => approval && approve.mutate(approval)}
            >
              تأیید و فعال‌سازی
            </Button>
          </>
        }
      >
        {approval && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-[#e2e9df] bg-[#f8faf6] p-3 text-sm leading-6">
              پس از تأیید، <b>{approval.fullName}</b> با نقش مدیر فعال می‌شود و گزارش‌های
              بازاریاب‌های استان‌های انتخاب‌شده را می‌بیند.
              {approval.existingAccount &&
                ' حساب بازاریاب او با همین شماره جدا و دست‌نخورده باقی می‌ماند.'}
            </div>
            <ProvinceMultiSelect
              value={managerProvinces}
              onChange={setManagerProvinces}
              hint="استان درخواستی متقاضی از قبل انتخاب شده است؛ می‌توانید استان‌های بیشتری اضافه کنید."
            />
            <Select
              label="تیم دستی (اختیاری)"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">بدون تیم دستی</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              <input
                type="checkbox"
                checked={phoneReviewed}
                onChange={(event) => setPhoneReviewed(event.target.checked)}
                className="mt-1 size-4 accent-[#0d704e]"
              />
              <span>با متقاضی تماس گرفته‌ام و شمارهٔ درج‌شده را بررسی کرده‌ام.</span>
            </label>
            {formError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejection)}
        onClose={() => {
          if (!reject.isPending) setRejection(null);
          setFormError('');
        }}
        title="رد درخواست دسترسی مدیر"
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={reject.isPending} onClick={() => setRejection(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              loading={reject.isPending}
              icon={<X className="size-4" aria-hidden />}
              disabled={reason.trim().length < 5}
              onClick={() => rejection && reject.mutate(rejection)}
            >
              ثبت نتیجه
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-text-secondary">
            {rejection?.fullName} با رمز ثبت‌شده می‌تواند نتیجه و توضیح شما را مشاهده و برای بازبینی
            پیام بفرستد.
          </p>
          <Textarea
            label="توضیح برای متقاضی"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={600}
            rows={4}
            hint="این متن به متقاضی نمایش داده می‌شود."
          />
          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {formError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function RequestCard({
  request,
  teams,
  onApprove,
  onReject,
}: {
  request: ManagerAccessRequestView;
  teams: AdminTeam[];
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = REQUEST_STATUS[request.status];
  const canReview = OPEN_STATUSES.has(request.status);
  const managerAccountId = request.managerUserId ?? request.userId;
  const assignedTeam =
    teams.find((team) => team.id === request.grantedTeamId) ??
    teams.find(
      (team) => team.managerId === managerAccountId || team.managerIds?.includes(managerAccountId),
    );

  return (
    <Card className="flex flex-col gap-4 border-[#e3e8df] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#e5e9e0] bg-[#f1f6ef] text-[#1f694b]">
            {request.avatarUrl ? (
              <img
                src={fileUrl(request.avatarUrl)}
                alt={`تصویر ${request.fullName}`}
                className="size-full object-cover"
              />
            ) : (
              <UserRound className="size-6" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="break-words font-black text-[#143f36]">{request.fullName}</h3>
            <p className="mt-1 text-xs text-text-secondary">
              ثبت درخواست: {faDateTime(request.createdAt)}
            </p>
            {request.existingAccount && (
              <p className="mt-1 text-xs font-bold text-[#0d704e]">
                متقاضی حساب بازاریاب دارد؛ پس از تأیید، حساب مدیر جداگانه ساخته می‌شود
              </p>
            )}
          </div>
        </div>
        <span
          className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-extrabold ${status.classes}`}
        >
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-2xl bg-[#f8faf6] p-3 text-sm sm:grid-cols-2">
        <InfoRow
          icon={<Phone className="size-4" />}
          label="شماره موبایل"
          value={toPersianDigits(request.phone)}
          ltr
        />
        <InfoRow
          icon={<ShieldCheck className="size-4" />}
          label="کد ملی"
          value={request.nationalCode ? toPersianDigits(request.nationalCode) : 'در دسترس نیست'}
          ltr
        />
        <InfoRow
          icon={<MapPin className="size-4" />}
          label="محدوده مدیریت درخواستی"
          value={`${request.managementCity}، ${request.managementProvince}`}
        />
        <InfoRow
          icon={<Clock3 className="size-4" />}
          label="وضعیت شماره"
          value={request.phoneReviewedExternally ? 'بررسی دستی ثبت شده' : 'در انتظار بررسی دستی'}
        />
      </div>

      {request.status === 'approved' && (
        <p className="text-xs text-text-secondary">
          {(request.grantedProvinces?.length ?? 0) > 0 && (
            <>
              استان‌های تحت مدیریت:{' '}
              <b className="text-[#245640]">{request.grantedProvinces?.join('، ')}</b>
            </>
          )}
          {assignedTeam && (
            <>
              {' · '}تیم تخصیص‌یافته: <b className="text-[#245640]">{assignedTeam.name}</b>
            </>
          )}
        </p>
      )}
      {request.reviewNote && request.status === 'rejected' && (
        <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-sm leading-6 text-rose-900">
          <b className="block text-xs">توضیح رد درخواست</b>
          {request.reviewNote}
        </div>
      )}
      {request.appeals.map((appeal, index) => (
        <div
          key={`${appeal.submittedAt}-${index}`}
          className={`rounded-xl border p-3 text-sm leading-6 ${request.status === 'review_requested' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-[#e7ece4] bg-white text-[#56665c]'}`}
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold">
            <MessageSquareText className="size-4" aria-hidden /> پیام بازبینی{' '}
            {toPersianDigits(index + 1)} · {faDateTime(appeal.submittedAt)}
          </div>
          {appeal.message}
        </div>
      ))}

      {canReview && (
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0ea] pt-3 sm:flex-row sm:justify-end">
          <Button variant="danger" onClick={onReject} icon={<X className="size-4" aria-hidden />}>
            رد درخواست
          </Button>
          <Button onClick={onApprove} icon={<Check className="size-4" aria-hidden />}>
            بررسی و فعال‌سازی
          </Button>
        </div>
      )}
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
  ltr = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <span className="mt-0.5 shrink-0 text-[#5d8068]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-text-secondary">{label}</p>
        <p
          dir={ltr ? 'ltr' : undefined}
          className={`mt-0.5 break-words font-bold text-[#234b3b] ${ltr ? 'text-left' : ''}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
