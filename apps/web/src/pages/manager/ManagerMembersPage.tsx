import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  ProgressBar,
  Skeleton,
  StatusBadge,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faPercent, faRelative } from '@/lib/format';
import type { ManagerMemberRow, ManagerMembersResponse } from '@/lib/types';
import { SendMessageDialog } from './SendMessageDialog';

const normalize = (value: string) => value.trim().toLocaleLowerCase('fa');

export function ManagerMembersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [attention, setAttention] = useState<'all' | 'lagging' | 'ready'>('all');
  const [target, setTarget] = useState<ManagerMemberRow | null>(null);
  const navigate = useNavigate();
  const members = useQuery({
    queryKey: ['manager', 'members'],
    queryFn: ({ signal }) => api.get<ManagerMembersResponse>('/manager/members', signal),
  });

  const filtered = useMemo(() => {
    const rows = members.data?.members ?? [];
    const q = normalize(search);
    return rows.filter((member) => {
      if (status !== 'all' && member.status !== status) return false;
      if (attention === 'lagging' && member.stats.lagging === 0) return false;
      if (
        attention === 'ready' &&
        (member.stats.assigned === 0 || member.stats.averageProgress < 80)
      )
        return false;
      if (!q) return true;
      return normalize(
        [member.name, member.phone, member.city, member.province].filter(Boolean).join(' '),
      ).includes(q);
    });
  }, [attention, members.data?.members, search, status]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="تیم من"
        subtitle={
          members.data?.team?.name
            ? `عملکرد و پیگیری اعضای ${members.data.team.name}`
            : 'مدیریت ارتباط با اعضای تیم'
        }
        actions={
          <Button
            variant="secondary"
            icon={<Activity className="size-4" aria-hidden />}
            onClick={() => navigate('/manager/reports')}
          >
            گزارش عملکرد
          </Button>
        }
      />
      <QueryState
        query={members}
        loading={
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-28" />
              ))}
            </div>
            <TableSkeleton rows={6} />
          </>
        }
      >
        {(data) => {
          const assignedPackages = data.members.flatMap((member) => member.packages);
          const avgProgress = assignedPackages.length
            ? Math.round(
                assignedPackages.reduce((sum, pkg) => sum + pkg.percent, 0) /
                  assignedPackages.length,
              )
            : 0;
          const columns = [
            {
              key: 'member',
              header: 'عضو تیم',
              cell: (member: ManagerMemberRow) => (
                <div className="flex min-w-40 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary-light text-sm font-black text-primary-fg">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      member.name.trim().charAt(0)
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{member.name}</span>
                    <span className="block text-xs text-text-secondary" dir="ltr">
                      {toPersianDigits(member.phone ?? '—')}
                    </span>
                  </span>
                </div>
              ),
              sortValue: (member: ManagerMemberRow) => member.name,
            },
            {
              key: 'location',
              header: 'محدوده فعالیت',
              cell: (member: ManagerMemberRow) =>
                [member.city, member.province].filter(Boolean).join('، ') || 'ثبت نشده',
              hideOnMobile: true,
              sortValue: (member: ManagerMemberRow) => member.city ?? member.province,
            },
            {
              key: 'status',
              header: 'وضعیت حساب',
              cell: (member: ManagerMemberRow) => <StatusBadge status={member.status} />,
            },
            {
              key: 'learning',
              header: 'آمادگی آموزشی',
              cell: (member: ManagerMemberRow) => (
                <div className="min-w-36">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span>{faPercent(member.stats.averageProgress)}</span>
                    <span className="text-text-secondary">
                      {toPersianDigits(member.stats.completed)} از{' '}
                      {toPersianDigits(member.stats.assigned)} آموزش
                    </span>
                  </div>
                  <ProgressBar
                    value={member.stats.averageProgress}
                    label={`پیشرفت آموزشی ${member.name}`}
                  />
                </div>
              ),
              sortValue: (member: ManagerMemberRow) => member.stats.averageProgress,
            },
            {
              key: 'attention',
              header: 'نیازمند پیگیری',
              cell: (member: ManagerMemberRow) =>
                member.stats.lagging > 0 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-danger-fg">
                    <AlertTriangle className="size-4" aria-hidden />
                    {toPersianDigits(member.stats.lagging)} آموزش
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-success-fg">
                    <CheckCircle2 className="size-4" aria-hidden />
                    بدون هشدار
                  </span>
                ),
              sortValue: (member: ManagerMemberRow) => member.stats.lagging,
            },
            {
              key: 'activity',
              header: 'آخرین فعالیت',
              cell: (member: ManagerMemberRow) =>
                member.lastActiveAt ? faRelative(member.lastActiveAt) : 'هنوز فعالیتی ثبت نشده',
              hideOnMobile: true,
              sortValue: (member: ManagerMemberRow) => member.lastActiveAt,
            },
            {
              key: 'actions',
              header: 'اقدام',
              cell: (member: ManagerMemberRow) => (
                <Button
                  variant="secondary"
                  icon={<MessageCircle className="size-4" aria-hidden />}
                  aria-label={`ارسال پیام به ${member.name}`}
                  onClick={() => setTarget(member)}
                >
                  پیام
                </Button>
              ),
            },
          ];
          return (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard
                  title="اعضای تیم"
                  value={toPersianDigits(data.totals.members)}
                  icon={Users}
                />
                <KpiCard
                  title="فعال"
                  value={toPersianDigits(data.totals.active)}
                  icon={Activity}
                  tone="primary"
                />
                <KpiCard
                  title="میانگین پیشرفت آموزش"
                  value={faPercent(avgProgress)}
                  subtitle={`${toPersianDigits(assignedPackages.length)} آموزش تخصیص‌یافته`}
                  icon={CheckCircle2}
                  tone="info"
                />
                <KpiCard
                  title="نیازمند پیگیری"
                  value={toPersianDigits(data.totals.lagging)}
                  icon={AlertTriangle}
                  tone={data.totals.lagging ? 'warning' : 'primary'}
                />
              </div>

              <Card className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(15rem,1.5fr)_repeat(3,minmax(0,1fr))]">
                <Input
                  label="جست‌وجوی عضو"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="نام، شماره یا شهر"
                  icon={<Search className="size-4" aria-hidden />}
                />
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-text">
                  وضعیت حساب
                  <select
                    className="min-h-12 rounded-input border border-border bg-surface px-3"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as typeof status)}
                  >
                    <option value="all">همه اعضا</option>
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-text">
                  اولویت پیگیری
                  <select
                    className="min-h-12 rounded-input border border-border bg-surface px-3"
                    value={attention}
                    onChange={(event) => setAttention(event.target.value as typeof attention)}
                  >
                    <option value="all">همه</option>
                    <option value="lagging">دارای آموزش عقب‌مانده</option>
                    <option value="ready">پیشرفت حداقل ۸۰٪</option>
                  </select>
                </label>
                <div className="flex items-end text-sm text-text-secondary" aria-live="polite">
                  <Clock3 className="me-2 size-4 shrink-0" aria-hidden />
                  {toPersianDigits(filtered.length)} نفر از {toPersianDigits(data.members.length)}{' '}
                  عضو
                </div>
              </Card>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-8" aria-hidden />}
                  title={
                    search || status !== 'all' || attention !== 'all'
                      ? 'عضوی با این فیلترها پیدا نشد'
                      : 'هنوز عضوی در این تیم نیست'
                  }
                  description="فیلترها را تغییر دهید یا از مدیر سیستم بخواهید اعضا را به تیم شما اختصاص دهد."
                />
              ) : (
                <DataTable
                  caption="اعضای تیم و وضعیت آموزش"
                  rows={filtered}
                  rowKey={(member) => member.id}
                  rowActionLabel={(member) => `نمایش پرونده ${member.name}`}
                  onRowClick={(member) => navigate(`/manager/members/${member.id}`)}
                  columns={columns}
                />
              )}
            </>
          );
        }}
      </QueryState>

      {target && (
        <SendMessageDialog
          open
          onClose={() => setTarget(null)}
          userId={target.id}
          userName={target.name}
          packages={target.packages.map((pkg) => ({ id: pkg.id, title: pkg.title }))}
        />
      )}
    </div>
  );
}
