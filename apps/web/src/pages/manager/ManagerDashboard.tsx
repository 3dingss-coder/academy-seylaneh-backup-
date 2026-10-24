import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  BarChart3,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Send,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Button, EmptyState, KpiCard, ProgressBar, Skeleton, TableSkeleton } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { Mascot } from '@/components/brand/Mascot';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faPercent, faRelative } from '@/lib/format';
import type { Laggard, ManagerDashboard as Data } from '@/lib/types';
import { SendMessageDialog } from './SendMessageDialog';

/** W1 — داشبورد مدیر: team KPIs + laggards with quick message. */
export function ManagerDashboard() {
  const q = useQuery({
    queryKey: ['manager', 'dashboard'],
    queryFn: ({ signal }) => api.get<Data>('/manager/dashboard', signal),
  });
  const nav = useNavigate();
  const [target, setTarget] = useState<Laggard | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={q}
        loading={
          <>
            <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <TableSkeleton rows={5} />
          </>
        }
      >
        {(d) => (
          <>
            <PageHeader
              title={
                d.team
                  ? d.team.name.trim().startsWith('تیم')
                    ? d.team.name
                    : `تیم ${d.team.name}`
                  : 'داشبورد تیم'
              }
              subtitle="وضعیت آموزش اعضای تیم"
            />
            {!d.team ? (
              /* rare help state (manager spec: mascot only for rare empty/help states) */
              <EmptyState
                title="هنوز تیمی به شما سپرده نشده"
                description="از مدیر سیستم بخواهید شما را مدیر یک تیم کند."
                illustration={<Mascot mood="guide" className="h-24 w-auto" />}
              />
            ) : (
              <>
                <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard
                    title="نرخ تکمیل"
                    value={faPercent(d.kpis.completionRate)}
                    subtitle={`${toPersianDigits(d.kpis.completed)} از ${toPersianDigits(d.kpis.assigned)}`}
                    icon={CheckCircle2}
                    tone="primary"
                  />
                  <KpiCard
                    title="تکمیل به‌موقع"
                    value={faPercent(d.kpis.onTimeRate)}
                    icon={TrendingUp}
                    tone="info"
                  />
                  <KpiCard
                    title="عقب‌مانده"
                    value={toPersianDigits(d.kpis.laggardCount)}
                    subtitle={`از ${toPersianDigits(d.kpis.members)} نفر`}
                    icon={AlarmClock}
                    tone={d.kpis.laggardCount ? 'danger' : 'primary'}
                  />
                  <KpiCard
                    title="درخواست آزمون مجدد"
                    value={toPersianDigits(d.pendingRetakes)}
                    icon={ClipboardList}
                    tone={d.pendingRetakes ? 'warning' : 'primary'}
                  />
                </div>
                <section aria-label="دسترسی سریع" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <QuickAction
                    to="/manager/members"
                    label="تیم من"
                    description="جست‌وجو و پیگیری اعضا"
                    icon={UsersRound}
                  />
                  <QuickAction
                    to="/manager/reports"
                    label="گزارش مدیریتی"
                    description="فیلتر، مقایسه و خروجی گزارش"
                    icon={BarChart3}
                  />
                  <QuickAction
                    to="/manager/campaigns"
                    label="کمپین‌های تیم"
                    description="اعلان آموزشی برای اعضای تیم"
                    icon={BellRing}
                  />
                </section>
                {d.pendingRetakes > 0 && (
                  <Link
                    to="/manager/retakes"
                    className="flex min-h-12 items-center justify-between rounded-card border border-warning/30 bg-warning-light px-3 text-sm font-bold text-text"
                  >
                    {toPersianDigits(d.pendingRetakes)} درخواست آزمون مجدد منتظر بررسی شماست
                    <span className="text-primary-fg">بررسی</span>
                  </Link>
                )}
                <section aria-labelledby="laggards" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h2 id="laggards" className="text-base font-bold">
                      عقب‌مانده‌ها
                    </h2>
                    <Link
                      to="/manager/reports?status=overdue"
                      className="flex min-h-12 items-center px-2 text-sm font-bold text-primary-fg"
                    >
                      گزارش کامل
                    </Link>
                  </div>
                  {d.laggards.length === 0 ? (
                    <EmptyState
                      title="همه اعضا طبق برنامه پیش می‌روند 👏"
                      icon={<Users className="size-8" />}
                    />
                  ) : (
                    <DataTable
                      caption="عقب‌مانده‌ها"
                      rows={d.laggards}
                      rowKey={(r) => `${r.userId}-${r.packageId}`}
                      onRowClick={(r) => nav(`/manager/members/${r.userId}`)}
                      columns={[
                        {
                          key: 'name',
                          header: 'نام',
                          cell: (r) => (
                            <div>
                              <div className="font-bold">{r.name}</div>
                              {r.city && (
                                <div className="text-xs text-text-secondary">{r.city}</div>
                              )}
                            </div>
                          ),
                        },
                        { key: 'pkg', header: 'آموزش', cell: (r) => r.packageTitle },
                        {
                          key: 'pct',
                          header: 'پیشرفت',
                          cell: (r) => (
                            <div className="flex min-w-24 items-center gap-2">
                              <ProgressBar
                                value={r.percent}
                                label={`پیشرفت ${r.name}`}
                                className="flex-1"
                              />
                              <span className="text-xs">{faPercent(r.percent)}</span>
                            </div>
                          ),
                        },
                        {
                          key: 'late',
                          header: 'تأخیر',
                          cell: (r) =>
                            r.overdueDays > 0 ? (
                              <span className="font-bold text-danger">
                                {toPersianDigits(r.overdueDays)} روز
                              </span>
                            ) : r.deadlineAt ? (
                              `مهلت ${faDate(r.deadlineAt)}`
                            ) : (
                              '—'
                            ),
                        },
                        {
                          key: 'stuck',
                          header: 'گیر کرده در',
                          cell: (r) => r.stuckAt ?? '—',
                          hideOnMobile: true,
                        },
                        {
                          key: 'last',
                          header: 'آخرین فعالیت',
                          cell: (r) => (r.lastActivityAt ? faRelative(r.lastActivityAt) : 'هرگز'),
                          hideOnMobile: true,
                        },
                        {
                          key: 'act',
                          header: '',
                          cell: (r) => (
                            <Button
                              variant="secondary"
                              icon={<Send className="size-4" aria-hidden />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTarget(r);
                              }}
                            >
                              پیام
                            </Button>
                          ),
                        },
                      ]}
                    />
                  )}
                </section>
              </>
            )}
          </>
        )}
      </QueryState>
      {target && (
        <SendMessageDialog
          open
          onClose={() => setTarget(null)}
          userId={target.userId}
          userName={target.name}
          packages={[{ id: target.packageId, title: target.packageTitle }]}
          defaultPackageId={target.packageId}
        />
      )}
    </div>
  );
}

function QuickAction({
  to,
  label,
  description,
  icon: Icon,
}: {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-20 items-center gap-3 rounded-2xl border border-[#e1e9e2] bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#b9d5bf] hover:shadow-md"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ec] text-[#176e50] transition-colors group-hover:bg-[#dff0e3]">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-[#183d30]">{label}</span>
        <span className="mt-1 block text-xs text-text-secondary">{description}</span>
      </span>
      <ChevronLeft
        className="size-4 shrink-0 text-[#91a199] transition-transform group-hover:-translate-x-1"
        aria-hidden
      />
    </Link>
  );
}
