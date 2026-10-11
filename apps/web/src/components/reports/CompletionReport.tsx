import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FilterX, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ProgressBar } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { groupByPerson, personKey, type PersonGroup } from '@/lib/people';
import { Select } from '@/components/common/Field';
import { downloadCsv, toCsv } from '@/lib/csv';
import { exportExcel } from '@/lib/excel';
import { fromZonedInput } from '@/lib/dates';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { track } from '@/lib/telemetry';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faPercent, faRelative } from '@/lib/format';
import type { CompletionRow } from '@/lib/types';

const STATUS_LABEL = { new: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل' } as const;
type Filter =
  'brand' | 'product' | 'user' | 'status' | 'team' | 'province' | 'city' | 'from' | 'to';

/** W2 / A-reports — completion report with filters (URL-synced), city filter and professional Excel export. */
export function CompletionReport({
  rows,
  memberLink,
  teams,
  onArchive,
}: {
  rows: CompletionRow[];
  memberLink: (userId: string) => string;
  teams?: Array<{ id: string; name: string }>;
  /** Admin only: delete report rows (they move to the archive). Hidden when not given. */
  onArchive?: (items: Array<{ userId: string; packageId: string }>) => Promise<unknown>;
}) {
  const [toDelete, setToDelete] = useState<{
    label: string;
    items: Array<{ userId: string; packageId: string }>;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const f = (k: Filter) => sp.get(k) ?? '';
  const provinceFilter = f('province');
  const set = (k: Filter, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'brand') next.delete('product');
    if (k === 'province') next.delete('city');
    if (v) track('report_filtered', { filter: k });
    setSp(next, { replace: true });
  };
  const opts = useMemo(() => {
    const brands = new Map<string, string>();
    const products = new Map<string, { name: string; brandId: string | null }>();
    const users = new Map<string, string>(); // person key → name (one entry per unique name)
    const provinces = new Set<string>();
    const citiesByProvince = new Map<string, Set<string>>();
    for (const r of rows) {
      if (r.brandId && r.brandName) brands.set(r.brandId, r.brandName);
      if (r.productId && r.productName)
        products.set(r.productId, { name: r.productName, brandId: r.brandId });
      users.set(personKey(r.userName) || r.userName, r.userName);
      if (r.province) {
        provinces.add(r.province);
        const citySet = citiesByProvince.get(r.province) ?? new Set<string>();
        if (!citiesByProvince.has(r.province)) citiesByProvince.set(r.province, citySet);
        if (r.city) citySet.add(r.city);
      }
    }
    return {
      brands: [...brands],
      products: [...products],
      users: [...users],
      provinces: [...provinces].sort(),
      cities: provinceFilter ? [...(citiesByProvince.get(provinceFilter) ?? [])].sort() : [],
    };
  }, [rows, provinceFilter]);

  const filtered = useMemo(() => {
    const fromStart = fromZonedInput(f('from'));
    const toStart = fromZonedInput(f('to'));
    const from = fromStart ? Date.parse(fromStart) : null;
    const to = toStart ? Date.parse(toStart) + 86_400_000 - 1 : null;
    return rows.filter((r) => {
      if (f('brand') && r.brandId !== f('brand')) return false;
      if (f('product') && r.productId !== f('product')) return false;
      if (f('user') && (personKey(r.userName) || r.userName) !== f('user')) return false;
      if (f('team') && r.teamId !== f('team')) return false;
      if (f('province') && r.province !== f('province')) return false;
      if (f('city') && r.city !== f('city')) return false;
      const st = f('status');
      if (st === 'overdue' ? !r.overdue : st && r.status !== st) return false;
      if (from && (!r.deadlineAt || Date.parse(r.deadlineAt) < from)) return false;
      if (to && (!r.deadlineAt || Date.parse(r.deadlineAt) > to)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sp]);

  // One row per person: same-name accounts (different numbers) are merged into a single row.
  const people = useMemo(
    () => groupByPerson(filtered, (r) => ({ name: r.userName, phone: r.phone })),
    [filtered],
  );
  const packageLines = (g: PersonGroup<CompletionRow>) =>
    [...g.rows].sort(
      (a, b) =>
        Number(b.lagging) - Number(a.lagging) ||
        a.percent - b.percent ||
        a.packageTitle.localeCompare(b.packageTitle, 'fa'),
    );
  const lastActivity = (g: PersonGroup<CompletionRow>) =>
    Math.max(0, ...g.rows.map((r) => (r.lastActivityAt ? Date.parse(r.lastActivityAt) : 0))) ||
    null;

  const exportCsv = () => {
    const csv = toCsv(
      [
        'نام',
        'شماره',
        'استان',
        'شهر',
        'آموزش',
        'برند',
        'محصول',
        'پیشرفت٪',
        'وضعیت',
        'دیرکرد',
        'مهلت',
        'تاریخ تکمیل',
        'به‌موقع',
        'آخرین فعالیت',
        'گیر کرده در',
      ],
      filtered.map((r) => [
        r.userName,
        r.phone ?? '',
        r.province ?? '',
        r.city ?? '',
        r.packageTitle,
        r.brandName,
        r.productName,
        r.percent,
        STATUS_LABEL[r.status],
        r.overdue ? 'بله' : 'خیر',
        r.deadlineAt ? faDate(r.deadlineAt) : '',
        r.completedAt ? faDate(r.completedAt) : '',
        r.onTime === null ? '' : r.onTime ? 'بله' : 'خیر',
        r.lastActivityAt ? faDate(r.lastActivityAt) : '',
        r.stuckAt,
      ]),
    );
    downloadCsv(`completion-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportXlsx = () => {
    void exportExcel({
      sheetName: 'گزارش تکمیل',
      title: 'گزارش تکمیل آموزشی',
      subtitle: 'آکادمی سیلانه',
      fileName: `completion-report-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: 'نام بازاریاب', key: 'userName', width: 22 },
        { header: 'شماره', key: 'phone', width: 14 },
        { header: 'استان', key: 'province', width: 16 },
        { header: 'شهر', key: 'city', width: 16 },
        { header: 'آموزش', key: 'packageTitle', width: 28 },
        { header: 'برند', key: 'brandName', width: 18 },
        { header: 'محصول', key: 'productName', width: 22 },
        { header: 'پیشرفت (٪)', key: 'percent', width: 12, isNumber: true, align: 'center' },
        { header: 'وضعیت', key: 'status', width: 14, align: 'center' },
        { header: 'دیرکرد', key: 'overdue', width: 10, align: 'center' },
        { header: 'مهلت', key: 'deadline', width: 14 },
        { header: 'تاریخ تکمیل', key: 'completed', width: 14 },
        { header: 'تکمیل به‌موقع', key: 'onTime', width: 14, align: 'center' },
        { header: 'آخرین فعالیت', key: 'lastActivity', width: 14 },
        { header: 'گیر کرده در', key: 'stuck', width: 22 },
      ],
      rows: filtered.map((r) => ({
        userName: r.userName,
        phone: r.phone ?? '—',
        province: r.province ?? '—',
        city: r.city ?? '—',
        packageTitle: r.packageTitle,
        brandName: r.brandName ?? '—',
        productName: r.productName ?? '—',
        percent: r.percent,
        status: r.overdue ? 'دیرکرد' : r.lagging ? 'عقب' : STATUS_LABEL[r.status],
        overdue: r.overdue ? 'بله' : 'خیر',
        deadline: r.deadlineAt ? faDate(r.deadlineAt) : '—',
        completed: r.completedAt ? faDate(r.completedAt) : '—',
        onTime: r.onTime === null ? '—' : r.onTime ? 'بله' : 'خیر',
        lastActivity: r.lastActivityAt ? faDate(r.lastActivityAt) : '—',
        stuck: r.stuckAt ?? '—',
      })),
    });
  };

  const any = [...sp.keys()].length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
        {teams && (
          <Select label="تیم" value={f('team')} onChange={(e) => set('team', e.target.value)}>
            <option value="">همه</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="استان"
          value={f('province')}
          onChange={(e) => set('province', e.target.value)}
        >
          <option value="">همه</option>
          {opts.provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select label="شهر" value={f('city')} onChange={(e) => set('city', e.target.value)}>
          <option value="">همه</option>
          {opts.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select label="برند" value={f('brand')} onChange={(e) => set('brand', e.target.value)}>
          <option value="">همه</option>
          {opts.brands.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </Select>
        <Select label="محصول" value={f('product')} onChange={(e) => set('product', e.target.value)}>
          <option value="">همه</option>
          {opts.products
            .filter(([, p]) => !f('brand') || p.brandId === f('brand'))
            .map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
        </Select>
        <Select label="بازاریاب" value={f('user')} onChange={(e) => set('user', e.target.value)}>
          <option value="">همه</option>
          {opts.users.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </Select>
        <Select label="وضعیت" value={f('status')} onChange={(e) => set('status', e.target.value)}>
          <option value="">همه</option>
          <option value="new">شروع‌نشده</option>
          <option value="in_progress">در حال انجام</option>
          <option value="completed">تکمیل</option>
          <option value="overdue">دیرکرد</option>
        </Select>
        <JalaliDateField label="مهلت از" value={f('from')} onChange={(v) => set('from', v)} />
        <JalaliDateField
          label="مهلت تا"
          value={f('to')}
          onChange={(v) => set('to', v)}
          error={
            f('from') && f('to') && f('from') > f('to') ? 'تاریخ پایان قبل از شروع است.' : undefined
          }
        />
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {toPersianDigits(people.length)} نفر · {toPersianDigits(filtered.length)} ردیف آموزش
        </p>
        <div className="flex gap-2">
          {any && (
            <Button
              variant="ghost"
              icon={<FilterX className="size-4" aria-hidden />}
              onClick={() => setSp(new URLSearchParams(), { replace: true })}
            >
              حذف فیلترها
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Download className="size-4" aria-hidden />}
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            خروجی CSV
          </Button>
          <Button
            icon={<FileSpreadsheet className="size-4" aria-hidden />}
            onClick={exportXlsx}
            disabled={filtered.length === 0}
          >
            خروجی اکسل
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length ? 'با این فیلترها نتیجه‌ای نیست' : 'هنوز آموزشی به اعضا داده نشده'}
        />
      ) : (
        <DataTable
          caption="گزارش تکمیل"
          rows={people}
          rowKey={(g) => g.key}
          onRowClick={(g) => nav(memberLink(g.first.userId))}
          columns={[
            {
              key: 'u',
              sortValue: (g) => g.name,
              header: 'نام',
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
              sortValue: (g) =>
                g.rows[0]?.city ? `${g.rows[0].province ?? ''} ${g.rows[0].city}` : null,
              header: 'شهر',
              cell: (g) => {
                const r = g.first;
                return r.city ? (
                  <span className="text-sm">
                    {r.province} • {r.city}
                  </span>
                ) : (
                  '—'
                );
              },
            },
            {
              key: 'p',
              sortValue: (g) => g.rows.length,
              header: 'آموزش‌ها و پیشرفت',
              cell: (g) => (
                <ul className="flex min-w-64 flex-col gap-3">
                  {packageLines(g).map((r) => (
                    <li key={`${r.userId}-${r.packageId}`} className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <span>
                          {r.packageTitle}
                          {(r.brandName || r.productName) && (
                            <span className="block text-xs text-text-secondary">
                              {[r.brandName, r.productName].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs">
                          {r.overdue ? (
                            <b className="text-danger">دیرکرد</b>
                          ) : r.lagging ? (
                            <b className="text-warning-fg">عقب</b>
                          ) : (
                            STATUS_LABEL[r.status]
                          )}
                          {onArchive && (
                            <button
                              type="button"
                              className="pressable rounded p-1 text-danger hover:bg-danger-light"
                              aria-label={`حذف گزارش ${r.packageTitle} برای ${r.userName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDelete({
                                  label: `«${r.packageTitle}» برای ${g.name}`,
                                  items: [{ userId: r.userId, packageId: r.packageId }],
                                });
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={r.percent} label="پیشرفت" className="flex-1" />
                        <span className="text-xs">{faPercent(r.percent)}</span>
                      </div>
                      {r.deadlineAt && (
                        <span className="text-xs text-text-secondary">
                          مهلت: {faDate(r.deadlineAt)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            ...(onArchive
              ? [
                  {
                    key: 'del',
                    header: '',
                    cell: (g: PersonGroup<CompletionRow>) => (
                      <Button
                        variant="ghost"
                        className="px-2 text-danger"
                        aria-label={`حذف همه‌ی گزارش‌های ${g.name}`}
                        icon={<Trash2 className="size-4" aria-hidden />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete({
                            label: `همه‌ی آموزش‌های ${g.name}`,
                            items: g.rows.map((r) => ({
                              userId: r.userId,
                              packageId: r.packageId,
                            })),
                          });
                        }}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'd',
              header: 'مهلت',
              hideOnMobile: true,
              sortValue: (g) =>
                Math.max(0, ...g.rows.map((r) => (r.deadlineAt ? Date.parse(r.deadlineAt) : 0))) ||
                null,
              cell: (g) => {
                const last = g.rows
                  .map((r) => r.deadlineAt)
                  .filter((x): x is string => !!x)
                  .sort()
                  .pop();
                return last ? faDate(last) : '—';
              },
            },
            {
              key: 'l',
              sortValue: (g) => lastActivity(g),
              header: 'آخرین فعالیت',
              cell: (g) => {
                const t = lastActivity(g);
                return t ? faRelative(new Date(t).toISOString()) : 'هرگز';
              },
              hideOnMobile: true,
            },
          ]}
        />
      )}
      {onArchive && (
        <ConfirmDialog
          open={!!toDelete}
          danger
          title="حذف گزارش؟"
          confirmText="حذف و انتقال به آرشیو"
          loading={deleting}
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            if (!toDelete) return;
            setDeleting(true);
            try {
              await onArchive(toDelete.items);
              setToDelete(null);
            } finally {
              setDeleting(false);
            }
          }}
        >
          گزارش {toDelete?.label} از این لیست حذف و به «آرشیو ← گزارش‌ها» منتقل می‌شود. از آنجا
          می‌توانید برگردانید یا برای همیشه پاک کنید.
        </ConfirmDialog>
      )}
    </div>
  );
}
