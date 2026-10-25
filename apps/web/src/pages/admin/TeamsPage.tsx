import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, ShieldCheck, UserRound, UserX, UsersRound } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  Modal,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import type { AdminTeam, ProvinceTeam } from '@/lib/types';
import { faNumber, faRelative } from '@/lib/format';
import { useProvinceTeams, useTeams, useUsers } from './adminQueries';

/** A6 — تیم‌ها: city territory + any number of team-scoped Managers. */
export function TeamsPage() {
  const teams = useTeams();
  const [edit, setEdit] = useState<AdminTeam | 'new' | null>(null);
  const memberCount = teams.data?.reduce((total, team) => total + team.memberCount, 0);
  const teamsWithoutManager = teams.data?.filter(
    (team) => (team.activeManagerCount ?? Number(Boolean(team.managerId))) === 0,
  ).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        variant="admin"
        title="تیم‌ها"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEdit('new')}>
            تیم جدید
          </Button>
        }
      />
      <section aria-label="خلاصهٔ تیم‌ها" className="stagger grid grid-cols-2 gap-3 xl:grid-cols-3">
        <KpiCard
          title="تیم‌های ثبت‌شده"
          value={teams.data ? toPersianDigits(teams.data.length) : '—'}
          icon={UsersRound}
        />
        <KpiCard
          title="اعضای تیم‌ها"
          value={memberCount !== undefined ? toPersianDigits(memberCount) : '—'}
          subtitle="اعضای صریح و بازاریاب‌های محدودهٔ شهر"
          icon={UserRound}
          tone="info"
        />
        <KpiCard
          title="بدون مدیر"
          value={teamsWithoutManager !== undefined ? toPersianDigits(teamsWithoutManager) : '—'}
          subtitle="تیم‌هایی که مدیر فروش ندارند"
          icon={UserX}
          tone="warning"
        />
      </section>
      <QueryState
        query={teams}
        loading={<TableSkeleton rows={4} />}
        isEmpty={(l) => l.length === 0}
        empty={
          <EmptyState
            title="هنوز تیمی ساخته نشده"
            actionText="ساخت تیم"
            onAction={() => setEdit('new')}
          />
        }
      >
        {(list) => (
          <DataTable
            caption="تیم‌ها"
            rows={list}
            rowKey={(t) => t.id}
            columns={[
              {
                key: 'n',
                header: 'نام تیم',
                cell: (t) => <span className="font-bold">{t.name}</span>,
              },
              {
                key: 'area',
                header: 'محدوده',
                cell: (t) =>
                  t.city && t.province ? (
                    <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
                      <MapPin className="size-3.5" aria-hidden /> {t.city}، {t.province}
                    </span>
                  ) : (
                    <span className="text-text-secondary">بدون محدودهٔ شهری</span>
                  ),
                hideOnMobile: true,
              },
              {
                key: 'm',
                header: 'مدیران',
                cell: (t) => {
                  const assigned =
                    t.managers ??
                    (t.managerName
                      ? [
                          {
                            id: t.managerId ?? t.managerName,
                            name: t.managerName,
                            status: 'active' as const,
                          },
                        ]
                      : []);
                  return assigned.length ? (
                    <div className="flex flex-wrap gap-1">
                      {assigned.map((manager) => (
                        <span
                          key={manager.id}
                          className={
                            manager.status === 'active'
                              ? 'rounded-full bg-[#e8f4eb] px-2 py-1 text-xs font-semibold text-[#176647]'
                              : 'rounded-full bg-[#f2eee5] px-2 py-1 text-xs font-semibold text-[#73634c]'
                          }
                        >
                          {manager.name}
                          {manager.status === 'inactive' ? ' · دسترسی مسدود' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-warning-fg">تعیین نشده</span>
                  );
                },
              },
              { key: 'c', header: 'اعضا', cell: (t) => toPersianDigits(t.memberCount) },
              {
                key: 'e',
                header: '',
                cell: (t) => (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`ویرایش ${t.name}`}
                    icon={<Pencil className="size-4" />}
                    onClick={() => setEdit(t)}
                  />
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <ProvinceTeamsSection />
      {edit && (
        <TeamDialog initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

/**
 * «تیم‌های خودکار استانی» — marketers are grouped by their residence province automatically;
 * a Manager assigned to a province sees exactly these people. Nothing to build or maintain
 * here: the groups follow live registrations, and scope is granted from the Users page.
 */
function ProvinceTeamsSection() {
  const provinceTeams = useProvinceTeams();
  return (
    <section aria-label="تیم‌های خودکار استانی" className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-black text-[#143f36]">تیم‌های خودکار استانی</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          هر بازاریاب بر اساس استان محل فعالیتش به‌صورت خودکار عضو تیم همان استان است و داخل تیم بر
          اساس شهر دسته‌بندی می‌شود. برای اینکه مدیری گزارش‌های یک استان را ببیند، کافی است در صفحهٔ
          کاربران آن استان را به «استان‌های تحت مدیریت» او اضافه کنید — نیازی به ساخت تیم نیست.
        </p>
      </div>
      <QueryState
        query={provinceTeams}
        loading={<TableSkeleton rows={4} />}
        isEmpty={(view) => view.provinces.length === 0 && view.unassigned.memberCount === 0}
        empty={
          <EmptyState
            title="هنوز بازاریابی با استان ثبت‌شده نیست"
            description="استان محل فعالیت هنگام ثبت‌نام گرفته می‌شود و تیم استانی به‌صورت خودکار شکل می‌گیرد."
          />
        }
      >
        {(view) => (
          <div className="flex flex-col gap-3">
            {view.provinces.map((group) => (
              <ProvinceTeamCard key={group.province} group={group} />
            ))}
            {view.unassigned.memberCount > 0 && (
              <Card className="border-[#e3e8df] p-4 sm:p-5">
                <h3 className="font-black text-[#143f36]">بدون استان ثبت‌شده</h3>
                <p className="mt-1 text-xs leading-6 text-text-secondary">
                  {faNumber(view.unassigned.memberCount)} بازاریاب هنوز استان محل فعالیت ندارند و در
                  هیچ تیم استانی دیده نمی‌شوند؛ از صفحهٔ کاربران محل فعالیت آن‌ها را کامل کنید.
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {view.unassigned.members.map((member) => (
                    <li
                      key={member.id}
                      className="rounded-full bg-[#f2eee5] px-2.5 py-1 text-xs font-semibold text-[#73634c]"
                    >
                      {member.name}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </QueryState>
    </section>
  );
}

function ProvinceTeamCard({ group }: { group: ProvinceTeam }) {
  const byCity = new Map<string, ProvinceTeam['members']>();
  for (const member of group.members) {
    const city = member.city ?? 'شهر ثبت‌نشده';
    byCity.set(city, [...(byCity.get(city) ?? []), member]);
  }
  const cities = [...byCity.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
  return (
    <Card className="border-[#e3e8df] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-black text-[#143f36]">
            <MapPin className="size-4 text-[#5d8068]" aria-hidden />
            تیم {group.province}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            {faNumber(group.memberCount)} بازاریاب · {faNumber(group.activeMemberCount)} فعال ·{' '}
            {faNumber(cities.length)} شهر
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {group.managers.length ? (
            group.managers.map((manager) => (
              <span
                key={manager.id}
                className={
                  manager.status === 'active'
                    ? 'inline-flex items-center gap-1 rounded-full bg-[#e8f4eb] px-2.5 py-1 text-xs font-semibold text-[#176647]'
                    : 'inline-flex items-center gap-1 rounded-full bg-[#f2eee5] px-2.5 py-1 text-xs font-semibold text-[#73634c]'
                }
              >
                <ShieldCheck className="size-3.5" aria-hidden />
                {manager.name}
                {manager.status === 'inactive' ? ' · دسترسی مسدود' : ''}
              </span>
            ))
          ) : (
            <span className="text-xs font-semibold text-warning-fg">مدیر استانی تعیین نشده</span>
          )}
        </div>
      </div>
      {group.members.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer text-sm font-bold text-primary-fg">
            اعضا بر اساس شهر
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {cities.map(([city, members]) => (
              <div key={city}>
                <h4 className="text-xs font-extrabold text-[#234b3b]">
                  {city} · {faNumber(members.length)} نفر
                </h4>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="rounded-full bg-[#f8faf6] px-2.5 py-1 text-xs text-[#234b3b] ring-1 ring-[#e5e9e0]"
                      title={
                        member.lastActiveAt
                          ? `آخرین فعالیت: ${faRelative(member.lastActiveAt)}`
                          : undefined
                      }
                    >
                      {member.name}
                      {member.status === 'inactive' ? ' · غیرفعال' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function TeamDialog({ initial, onClose }: { initial?: AdminTeam; onClose: () => void }) {
  const users = useUsers();
  const [name, setName] = useState(initial?.name ?? '');
  const [managerIds, setManagerIds] = useState<string[]>(
    initial?.managerIds ??
      initial?.managers?.map((manager) => manager.id) ??
      (initial?.managerId ? [initial.managerId] : []),
  );
  const [residence, setResidence] = useState<Residence>({
    province: initial?.province ?? '',
    city: initial?.city ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        managerIds,
        province: residence.province || null,
        city: residence.city || null,
      };
      return initial
        ? api.patch(`/admin/teams/${initial.id}`, body)
        : api.post('/admin/teams', body);
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      const warnings = (r as { warnings?: string[] } | undefined)?.warnings ?? [];
      toast.show({
        type: warnings.length ? 'warning' : 'success',
        message: warnings.length ? `ذخیره شد. ${warnings.join(' ')}` : 'ذخیره شد.',
      });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  const candidates = (users.data ?? []).filter(
    (user) =>
      user.role === 'manager' &&
      user.status !== 'blacklisted' &&
      (user.status === 'active' || managerIds.includes(user.id)),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'ویرایش تیم' : 'تیم جدید'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2}
            onClick={() => {
              if (residence.province && !residence.city) {
                setErrors({ city: 'شهر را انتخاب کنید.' });
                return;
              }
              m.mutate();
            }}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="نام تیم"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <section className="rounded-2xl border border-[#e7ece4] bg-[#fbfcf8] p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#183f35]">
            <MapPin className="size-4" aria-hidden /> محدودهٔ شهری تیم
          </h3>
          <p className="mb-3 text-xs leading-5 text-text-secondary">
            بازاریاب‌های همین شهر و استان، حتی اگر پیش‌تر به تیم دیگری منتسب شده باشند، در گزارش‌های
            همهٔ مدیران این تیم دیده می‌شوند. محدودهٔ هر شهر فقط به یک تیم اختصاص می‌یابد.
          </p>
          <ResidencePicker
            value={residence}
            onChange={setResidence}
            label="استان"
            provinceError={errors.province}
            cityError={errors.city}
            clearable
          />
        </section>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-text">مدیران تیم</legend>
          <p className="text-xs leading-5 text-text-secondary">
            می‌توانید هر تعداد مدیر فعال را به یک تیم اختصاص دهید. مدیران غیرفعالِ همین تیم برای
            امکان بازگردانی نمایش داده می‌شوند.
          </p>
          {candidates.length ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border p-2">
              {candidates.map((manager) => {
                const selected = managerIds.includes(manager.id);
                const disabled = manager.status !== 'active' && !selected;
                return (
                  <label
                    key={manager.id}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={(event) =>
                        setManagerIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, manager.id])]
                            : current.filter((id) => id !== manager.id),
                        )
                      }
                      aria-label={`اختصاص ${manager.name} به تیم`}
                      className="size-4 accent-primary"
                    />
                    <span className="flex-1 text-sm font-semibold text-text">{manager.name}</span>
                    <span className="text-xs text-text-secondary">
                      {manager.status === 'active' ? 'فعال' : 'دسترسی مسدود'}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-3 text-sm text-text-secondary">
              هنوز حساب مدیر فعالی ندارید. ابتدا از صفحهٔ کاربران یک مدیر بسازید.
            </p>
          )}
          {errors.managerIds && <p className="text-xs text-danger-fg">{errors.managerIds}</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
