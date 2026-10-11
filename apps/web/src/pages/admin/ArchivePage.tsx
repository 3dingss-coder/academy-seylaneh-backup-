import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button, EmptyState, TableSkeleton, useToast } from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDate, faPercent } from '@/lib/format';
import { groupByPerson, type PersonGroup } from '@/lib/people';
import type { ArchivedReportRow, ArchivedUser } from '@/lib/types';
import { useArchivedReports, useArchivedUsers } from './adminQueries';

type Tab = 'blacklist' | 'reports';

/** آرشیو — deleted users («لیست سیاه») and deleted reports. Deleting here removes the data. */
export function ArchivePage() {
  const [tab, setTab] = useState<Tab>('blacklist');
  const users = useArchivedUsers();
  const reports = useArchivedReports();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="آرشیو"
        subtitle="کاربران و گزارش‌های حذف‌شده. حذف از آرشیو، اطلاعات را برای همیشه از دیتابیس پاک می‌کند."
      />
      <Tabs
        label="آرشیو"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'blacklist', label: 'لیست سیاه', count: users.data?.length },
          { value: 'reports', label: 'گزارش‌ها', count: reports.data?.length },
        ]}
      />
      {tab === 'blacklist' ? <BlacklistTab /> : <ReportsTab />}
    </div>
  );
}

function BlacklistTab() {
  const q = useArchivedUsers();
  const [act, setAct] = useState<{
    group: PersonGroup<ArchivedUser>;
    mode: 'restore' | 'purge';
  } | null>(null);
  return (
    <>
      <p className="text-sm text-text-secondary">
        این شماره‌ها نمی‌توانند وارد اپ شوند یا ثبت‌نام کنند. با «بازگردانی» دوباره اجازه‌ی ورود
        دارند.
      </p>
      <QueryState query={q} loading={<TableSkeleton rows={5} />}>
        {(list) => {
          const people = groupByPerson(list, (u) => ({ name: u.name, phone: u.phone ?? u.email }));
          return people.length === 0 ? (
            <EmptyState title="لیست سیاه خالی است" />
          ) : (
            <DataTable
              caption="لیست سیاه"
              rows={people}
              rowKey={(g) => g.key}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  sortValue: (g) => g.name,
                  cell: (g) => (
                    <div>
                      <span className="font-bold">{g.name}</span>
                      {g.phones.map((p) => (
                        <span
                          key={p}
                          dir="ltr"
                          className="block text-start text-[11px] leading-5 text-text-secondary"
                        >
                          {toPersianDigits(p)}
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'loc',
                  header: 'محل فعالیت',
                  hideOnMobile: true,
                  cell: (g) => {
                    const u = g.first;
                    return u.province ? `${u.province} • ${u.city ?? ''}` : '—';
                  },
                },
                {
                  key: 'r',
                  header: 'نقش',
                  hideOnMobile: true,
                  cell: (g) => [...new Set(g.rows.map((u) => ROLE_LABEL[u.role]))].join('، '),
                },
                {
                  key: 'at',
                  header: 'تاریخ حذف',
                  sortValue: (g) =>
                    Math.max(0, ...g.rows.map((u) => Date.parse(u.blacklistedAt ?? ''))) || null,
                  cell: (g) => {
                    const last = g.rows
                      .map((u) => u.blacklistedAt)
                      .filter((x): x is string => !!x)
                      .sort()
                      .pop();
                    return last ? faDate(last) : '—';
                  },
                },
                {
                  key: 'act',
                  header: '',
                  cell: (g) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        icon={<RotateCcw className="size-4" aria-hidden />}
                        onClick={() => setAct({ group: g, mode: 'restore' })}
                      >
                        بازگردانی
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-danger"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        aria-label={`حذف ${g.name} از آرشیو`}
                        onClick={() => setAct({ group: g, mode: 'purge' })}
                      >
                        حذف از آرشیو
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      {act && <UserActionDialog {...act} onClose={() => setAct(null)} />}
    </>
  );
}

/** Restore or permanently delete the chosen numbers of one person. */
function UserActionDialog({
  group,
  mode,
  onClose,
}: {
  group: PersonGroup<ArchivedUser>;
  mode: 'restore' | 'purge';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(group.rows.map((u) => u.id));
  const run = useMutation({
    mutationFn: async () => {
      for (const id of picked) {
        if (mode === 'restore') await api.post(`/admin/archive/users/${id}/restore`);
        else await api.del(`/admin/archive/users/${id}`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message:
          mode === 'restore'
            ? 'از آرشیو خارج شد و دوباره می‌تواند از اپ استفاده کند.'
            : 'برای همیشه از دیتابیس حذف شد.',
      });
      onClose();
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  return (
    <ConfirmDialog
      open
      danger={mode === 'purge'}
      title={mode === 'restore' ? `بازگردانی ${group.name}؟` : `حذف ${group.name} از آرشیو؟`}
      confirmText={mode === 'restore' ? 'بازگردانی و اجازه‌ی ورود' : 'حذف برای همیشه'}
      loading={run.isPending}
      onClose={onClose}
      onConfirm={() => picked.length && run.mutate()}
    >
      <p>
        {mode === 'restore'
          ? 'کاربر از لیست سیاه خارج می‌شود و با همین شماره دوباره می‌تواند وارد اپ شود.'
          : 'حساب، پیشرفت آموزشی، نتایج آزمون، امتیازها و همه‌ی داده‌های این کاربر برای همیشه پاک می‌شود و قابل بازگشت نیست.'}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {group.rows.map((u) => (
          <li key={u.id}>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={picked.includes(u.id)}
                onChange={(e) =>
                  setPicked((l) => (e.target.checked ? [...l, u.id] : l.filter((x) => x !== u.id)))
                }
              />
              <span dir="ltr">{toPersianDigits(u.phone ?? u.email ?? u.id)}</span>
            </label>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

function ReportsTab() {
  const q = useArchivedReports();
  const qc = useQueryClient();
  const toast = useToast();
  const [purge, setPurge] = useState<ArchivedReportRow | null>(null);
  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    toast.show({ type: 'success', message });
  };
  const restore = useMutation({
    mutationFn: (r: ArchivedReportRow) =>
      api.post('/admin/archive/reports/restore', { userId: r.userId, packageId: r.packageId }),
    onSuccess: () => done('به گزارش‌ها برگشت.'),
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const remove = useMutation({
    mutationFn: (r: ArchivedReportRow) =>
      api.post('/admin/archive/reports/purge', { userId: r.userId, packageId: r.packageId }),
    onSuccess: () => {
      setPurge(null);
      done('گزارش و داده‌های آن برای همیشه حذف شد.');
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <>
      <p className="text-sm text-text-secondary">
        گزارش‌هایی که از صفحه‌ی گزارش‌ها حذف شده‌اند. «حذف از آرشیو» پیشرفت و نتیجه‌ی آزمون‌های آن
        آموزش را برای همیشه پاک می‌کند.
      </p>
      <QueryState query={q} loading={<TableSkeleton rows={5} />}>
        {(list) => {
          const people = groupByPerson(list, (r) => ({ name: r.userName, phone: r.phone }));
          return people.length === 0 ? (
            <EmptyState title="گزارشی در آرشیو نیست" />
          ) : (
            <DataTable
              caption="گزارش‌های آرشیوشده"
              rows={people}
              rowKey={(g) => g.key}
              columns={[
                {
                  key: 'n',
                  header: 'نام',
                  sortValue: (g) => g.name,
                  cell: (g) => (
                    <div>
                      <span className="font-bold">{g.name}</span>
                      {g.phones.map((p) => (
                        <span
                          key={p}
                          dir="ltr"
                          className="block text-start text-[11px] leading-5 text-text-secondary"
                        >
                          {toPersianDigits(p)}
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'p',
                  header: 'آموزش‌های حذف‌شده',
                  cell: (g) => (
                    <ul className="flex flex-col gap-2">
                      {g.rows.map((r) => (
                        <li
                          key={`${r.userId}-${r.packageId}`}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            {r.packageTitle || r.packageId}
                            <span className="block text-xs text-text-secondary">
                              {[r.brandName, r.productName].filter(Boolean).join(' • ')}
                              {` · ${faPercent(r.percent)} · ${faDate(r.archivedAt)}`}
                            </span>
                          </span>
                          <span className="flex gap-1">
                            <Button
                              variant="secondary"
                              icon={<RotateCcw className="size-4" aria-hidden />}
                              loading={restore.isPending && restore.variables === r}
                              onClick={() => restore.mutate(r)}
                            >
                              بازگردانی
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-danger"
                              icon={<Trash2 className="size-4" aria-hidden />}
                              aria-label={`حذف ${r.packageTitle} از آرشیو`}
                              onClick={() => setPurge(r)}
                            >
                              حذف از آرشیو
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          );
        }}
      </QueryState>
      <ConfirmDialog
        open={!!purge}
        danger
        title="حذف گزارش از آرشیو؟"
        confirmText="حذف برای همیشه"
        loading={remove.isPending}
        onClose={() => setPurge(null)}
        onConfirm={() => purge && remove.mutate(purge)}
      >
        پیشرفت و نتیجه‌ی آزمون‌های «{purge?.packageTitle}» برای {purge?.userName} برای همیشه از
        دیتابیس پاک می‌شود و قابل بازگشت نیست.
      </ConfirmDialog>
    </>
  );
}
