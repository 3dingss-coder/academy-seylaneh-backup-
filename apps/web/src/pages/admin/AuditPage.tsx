import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, ScrollText, Search, Users } from 'lucide-react';
import { EmptyState, Input, KpiCard, TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { faDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { useUsers } from './adminQueries';

/** A10 — لاگ تغییرات (append-only audit log). */
export function AuditPage() {
  const q = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: ({ signal }) => api.get<AuditEntry[]>('/admin/audit-logs', signal),
  });
  const users = useUsers();
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const [filter, setFilter] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="admin" title="لاگ تغییرات" subtitle="همه تغییرات مدیریتی ثبت می‌شود" />
      <Input
        label="جست‌وجو در عملیات، موجودیت یا انجام‌دهنده"
        ltr
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="package.published یا نام مدیر"
        icon={<Search className="size-4" aria-hidden />}
      />
      <QueryState query={q} loading={<TableSkeleton rows={10} />}>
        {(list) => {
          const needle = filter.trim().toLocaleLowerCase();
          const rows = list.filter((entry) => {
            if (!needle) return true;
            const actor =
              entry.actorId === 'system' ? 'سیستم' : (names.get(entry.actorId) ?? entry.actorId);
            return [entry.action, entry.entity, entry.entityId, actor]
              .join(' ')
              .toLocaleLowerCase()
              .includes(needle);
          });
          const actors = new Set(rows.map((entry) => entry.actorId));
          const today = new Date().toDateString();
          const todayCount = rows.filter(
            (entry) => new Date(entry.createdAt).toDateString() === today,
          ).length;
          const latest = rows.reduce<AuditEntry | null>(
            (current, entry) =>
              !current || Date.parse(entry.createdAt) > Date.parse(current.createdAt)
                ? entry
                : current,
            null,
          );
          return (
            <div className="flex flex-col gap-3">
              <section
                aria-label="خلاصهٔ تغییرات مدیریتی"
                className="stagger grid grid-cols-2 gap-3 xl:grid-cols-3"
              >
                <KpiCard
                  title="تغییرات در این نما"
                  value={toPersianDigits(rows.length)}
                  icon={ScrollText}
                />
                <KpiCard
                  title="انجام‌دهندگان یکتا"
                  value={toPersianDigits(actors.size)}
                  icon={Users}
                  tone="info"
                />
                <KpiCard
                  title="فعالیت امروز"
                  value={toPersianDigits(todayCount)}
                  subtitle={
                    latest ? `آخرین ثبت: ${faDateTime(latest.createdAt)}` : 'هنوز تغییری ثبت نشده'
                  }
                  icon={Clock3}
                  tone="primary"
                />
              </section>
              {rows.length === 0 ? (
                <EmptyState
                  title={list.length ? 'با این جست‌وجو نتیجه‌ای نیست' : 'هنوز تغییری ثبت نشده'}
                />
              ) : (
                <DataTable
                  caption="لاگ تغییرات"
                  rows={rows}
                  rowKey={(a) => a.id}
                  columns={[
                    { key: 't', header: 'زمان', cell: (a) => faDateTime(a.createdAt) },
                    {
                      key: 'u',
                      header: 'انجام‌دهنده',
                      cell: (a) =>
                        a.actorId === 'system' ? 'سیستم' : (names.get(a.actorId) ?? a.actorId),
                    },
                    {
                      key: 'a',
                      header: 'عملیات',
                      cell: (a) => (
                        <code dir="ltr" className="text-xs">
                          {a.action}
                        </code>
                      ),
                    },
                    {
                      key: 'e',
                      header: 'موجودیت',
                      cell: (a) => (
                        <code dir="ltr" className="text-xs">{`${a.entity}/${a.entityId}`}</code>
                      ),
                      hideOnMobile: true,
                    },
                    {
                      key: 'c',
                      header: 'تغییر',
                      hideOnMobile: true,
                      cell: (a) => (
                        <details>
                          <summary className="cursor-pointer text-xs text-primary-fg">
                            جزئیات
                          </summary>
                          <pre
                            dir="ltr"
                            className="max-w-md overflow-x-auto whitespace-pre-wrap text-[11px] text-text-secondary"
                          >
                            {JSON.stringify({ before: a.before, after: a.after }, null, 1)}
                          </pre>
                        </details>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
