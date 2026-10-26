import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileQuestion,
  KeyRound,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  Modal,
  ProgressBar,
  StatusBadge,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { Select, Tabs } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { ProvinceMultiSelect } from '@/components/common/ProvinceMultiSelect';
import { QueryState } from '@/components/common/QueryState';
import { DataTable } from '@/components/admin/DataTable';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { MemberTimeline } from '@/components/reports/MemberTimeline';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { groupByPerson, type PersonGroup } from '@/lib/people';
import { toLatinDigits, toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDateTime, faNumber, faPercent, faRelative } from '@/lib/format';
import type { Me, Role, Timeline } from '@/lib/types';
import { useBrands, useTeams, useUsers } from './adminQueries';
import { ManagerAccessRequestsPanel } from './ManagerAccessRequestsPanel';

/** The account an admin edits by default for a person: the one used most recently. */
function primaryOf(g: PersonGroup<Me>): Me {
  return (
    [...g.rows].sort((a, b) =>
      (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt),
    )[0] ?? g.first
  );
}

/** A6 — کاربران: role, team, status, brand access, password reset, delete (→ archive). */
export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'manager-requests' ? 'requests' : 'accounts';
  const selectTab = (tab: 'accounts' | 'requests') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'requests') next.set('tab', 'manager-requests');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };
  const users = useUsers();
  const teams = useTeams();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');
  const [city, setCity] = useState('');
  const [edit, setEdit] = useState<{ accounts: Me[]; id: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [del, setDel] = useState<PersonGroup<Me> | null>(null);
  const editUser = edit
    ? (edit.accounts.find((a) => a.id === edit.id) ?? edit.accounts[0])
    : undefined;
  const teamName = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t.name])),
    [teams.data],
  );
  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const u of users.data ?? []) if (u.city) s.add(u.city);
    return [...s].sort();
  }, [users.data]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        variant="admin"
        title="کاربران"
        subtitle="مدیریت نقش‌ها، تیم‌ها و درخواست‌های دسترسی مدیران"
        actions={
          activeTab === 'accounts' ? (
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setCreateOpen(true)}
            >
              کاربر جدید
            </Button>
          ) : undefined
        }
      />
      <Tabs
        label="بخش‌های مدیریت کاربران"
        value={activeTab}
        onChange={selectTab}
        items={[
          { value: 'accounts', label: 'کاربران و نقش‌ها' },
          { value: 'requests', label: 'درخواست‌های مدیران' },
        ]}
      />
      {activeTab === 'requests' ? (
        <ManagerAccessRequestsPanel />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Input
              label="جستجو"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              icon={<Search className="size-5" />}
              placeholder="نام یا شماره"
            />
            <Select label="نقش" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">همه</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select label="تیم" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">همه</option>
              <option value="none">بدون تیم</option>
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select label="شهر" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">همه</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <QueryState query={users} loading={<TableSkeleton rows={8} />}>
            {(list) => {
              const needle = q.trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
              const rows = list.filter(
                (u) =>
                  (!needle ||
                    u.name.includes(needle) ||
                    (u.phone ?? '').includes(needle) ||
                    (u.email ?? '').includes(needle) ||
                    (u.province ?? '').includes(needle) ||
                    (u.city ?? '').includes(needle)) &&
                  (!role || u.role === role) &&
                  (!team || (team === 'none' ? !u.teamId : u.teamId === team)) &&
                  (!city || u.city === city),
              );
              // One row per person: accounts that share a name are merged and their numbers are
              // listed (small) under the name, so the number is what tells two people apart.
              const people = groupByPerson(rows, (u) => ({
                name: u.name,
                phone: u.phone ?? u.email,
              }));
              const uniq = (l: Array<string | null | undefined>) => [
                ...new Set(l.filter((x): x is string => !!x)),
              ];
              return people.length === 0 ? (
                <EmptyState title="کاربری پیدا نشد" />
              ) : (
                <DataTable
                  caption="کاربران"
                  rows={people}
                  rowKey={(g) => g.key}
                  columns={[
                    {
                      key: 'n',
                      header: 'نام',
                      sortValue: (g) => g.name,
                      cell: (g) => (
                        <div>
                          <Link
                            to={`/admin/users/${primaryOf(g).id}`}
                            className="font-bold text-primary-fg"
                          >
                            {g.name}
                          </Link>
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
                      cell: (g) => {
                        const l = uniq(
                          g.rows.map((u) =>
                            u.province ? `${u.province} • ${u.city ?? ''}` : null,
                          ),
                        );
                        return l.length ? (
                          <div className="flex flex-col">
                            {l.map((x) => (
                              <span key={x}>{x}</span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        );
                      },
                      hideOnMobile: true,
                    },
                    {
                      key: 'r',
                      header: 'نقش',
                      cell: (g) => uniq(g.rows.map((u) => ROLE_LABEL[u.role])).join('، '),
                    },
                    {
                      key: 't',
                      header: 'تیم / استان‌های تحت مدیریت',
                      cell: (g) => {
                        const teams = uniq(
                          g.rows.map((u) => (u.teamId ? teamName.get(u.teamId) : null)),
                        );
                        const provinces = uniq(
                          g.rows.flatMap((u) =>
                            u.role === 'manager' ? (u.managerProvinces ?? []) : [],
                          ),
                        );
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span>{teams.join('، ') || '—'}</span>
                            {provinces.length > 0 && (
                              <span className="text-[11px] leading-5 text-text-secondary">
                                استان‌ها: {provinces.join('، ')}
                              </span>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      key: 's',
                      header: 'وضعیت',
                      cell: (g) => (
                        <div className="flex flex-col items-start gap-1">
                          {uniq(g.rows.map((u) => u.status)).map((st) => (
                            <StatusBadge key={st} status={st as Me['status']} />
                          ))}
                        </div>
                      ),
                    },
                    {
                      key: 'pt',
                      header: 'امتیاز',
                      sortValue: (g) => g.rows.reduce((n, u) => n + u.pointsBalance, 0),
                      cell: (g) => faNumber(g.rows.reduce((n, u) => n + u.pointsBalance, 0)),
                      hideOnMobile: true,
                    },
                    {
                      key: 'a',
                      header: 'آخرین فعالیت',
                      sortValue: (g) =>
                        Math.max(
                          0,
                          ...g.rows.map((u) => (u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0)),
                        ) || null,
                      cell: (g) => {
                        const last = g.rows
                          .map((u) => u.lastActiveAt)
                          .filter((x): x is string => !!x)
                          .sort()
                          .pop();
                        return last ? faRelative(last) : 'هرگز';
                      },
                      hideOnMobile: true,
                    },
                    {
                      key: 'e',
                      header: '',
                      cell: (g) => (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            className="px-2"
                            aria-label={`ویرایش ${g.name}`}
                            icon={<Pencil className="size-4" />}
                            onClick={() => setEdit({ accounts: g.rows, id: primaryOf(g).id })}
                          />
                          <Button
                            variant="ghost"
                            className="px-2 text-danger"
                            aria-label={`حذف ${g.name}`}
                            icon={<Trash2 className="size-4" />}
                            onClick={() => setDel(g)}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
              );
            }}
          </QueryState>
          {editUser && edit && (
            <UserDialog
              key={editUser.id}
              user={editUser}
              accounts={edit.accounts}
              onSwitch={(id) => setEdit({ ...edit, id })}
              onClose={() => setEdit(null)}
            />
          )}
          {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} />}
          {del && <DeleteUsersDialog group={del} onClose={() => setDel(null)} />}
        </>
      )}
    </div>
  );
}

interface CreatedAdminUser {
  user: Me;
  temporaryPassword: string | null;
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const teams = useTeams();
  const qc = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'marketer' | 'manager'>('manager');
  const [teamId, setTeamId] = useState('');
  const [managerProvinces, setManagerProvinces] = useState<string[]>([]);
  const [residence, setResidence] = useState<Residence>({ province: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<CreatedAdminUser | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.post<CreatedAdminUser>('/admin/users', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        role,
        teamId: teamId || null,
        ...(role === 'manager' ? { managerProvinces } : {}),
        // A marketer's residence puts them in their automatic province team right away.
        ...(role === 'marketer' && residence.province
          ? { province: residence.province, city: residence.city }
          : {}),
      }),
    onSuccess: (result) => {
      setCreated(result);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'حساب کاربر ساخته شد.' });
    },
    onError: (cause) => {
      setErrors(cause instanceof ApiError ? cause.fields : {});
      toast.show({ type: 'error', message: errMsg(cause) });
    },
  });
  const selectedTeam = teams.data?.find((team) => team.id === (created?.user.teamId ?? teamId));
  return (
    <Modal
      open
      onClose={onClose}
      title={created ? 'حساب ساخته شد' : 'ساخت کاربر جدید'}
      size="md"
      footer={
        created ? (
          <Button onClick={onClose}>بستن</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              انصراف
            </Button>
            <Button
              loading={create.isPending}
              disabled={
                firstName.trim().length < 2 ||
                lastName.trim().length < 2 ||
                !phone.trim() ||
                (role === 'manager' && !teamId && managerProvinces.length === 0) ||
                (role === 'marketer' && Boolean(residence.province) && !residence.city)
              }
              onClick={() => create.mutate()}
            >
              ساخت حساب
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-[#c9dfcc] bg-[#f1f8f1] p-4">
            <p className="font-extrabold text-[#145b43]">{created.user.name}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {ROLE_LABEL[created.user.role]}
              {selectedTeam ? ` · ${selectedTeam.name}` : ''}
            </p>
            {created.user.role === 'manager' &&
              (created.user.managerProvinces?.length ?? 0) > 0 && (
                <p className="mt-1 text-sm text-text-secondary">
                  استان‌های تحت مدیریت: {created.user.managerProvinces?.join('، ')}
                </p>
              )}
            <p className="mt-2 text-sm">
              شمارهٔ ورود:{' '}
              <b dir="ltr" className="inline-block font-mono">
                {toPersianDigits(created.user.phone ?? '')}
              </b>
            </p>
          </div>
          {created.user.role === 'manager' && created.temporaryPassword ? (
            <div role="status" className="rounded-2xl border border-[#efd9a6] bg-[#fff8e8] p-4">
              <p className="text-sm font-extrabold text-[#70520e]">رمز موقت مدیر — نمایش یک‌باره</p>
              <p dir="ltr" className="mt-2 select-all text-center font-mono text-xl font-black">
                {created.temporaryPassword}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#67583a]">
                این رمز را مستقیماً در اختیار مدیر بگذارید. حساب فعال است و نیازی به درخواست دسترسی
                ندارد؛ در نخستین ورود، تکمیل پروفایل و ساخت رمز شخصی الزامی است.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 text-sm leading-6 text-text-secondary">
              حساب بازاریاب ساخته شد و طبق روش ورود معمول بازاریابان در دسترس است.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="نام"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              error={errors.firstName}
              autoComplete="given-name"
              disabled={create.isPending}
            />
            <Input
              label="نام خانوادگی"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              error={errors.lastName}
              autoComplete="family-name"
              disabled={create.isPending}
            />
          </div>
          <Input
            label="شماره موبایل"
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={errors.phone}
            autoComplete="tel"
            disabled={create.isPending}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="نقش"
              value={role}
              onChange={(event) => setRole(event.target.value as 'marketer' | 'manager')}
              error={errors.role}
              disabled={create.isPending}
            >
              <option value="marketer">{ROLE_LABEL.marketer}</option>
              <option value="manager">{ROLE_LABEL.manager}</option>
            </Select>
            <Select
              label={role === 'manager' ? 'تیم مدیر (اختیاری)' : 'تیم'}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              error={errors.teamId}
              disabled={create.isPending}
              hint={
                role === 'manager'
                  ? 'مدیر با انتخاب استان‌ها نیازی به تیم ندارد؛ تیم فقط برای گروه‌بندی دستی است.'
                  : 'اختیاری'
              }
            >
              <option value="">بدون تیم</option>
              {(teams.data ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.city ? ` · ${team.city}` : ''}
                </option>
              ))}
            </Select>
          </div>
          {role === 'manager' ? (
            <>
              <ProvinceMultiSelect
                value={managerProvinces}
                onChange={setManagerProvinces}
                error={errors.managerProvinces}
                disabled={create.isPending}
                hint="گزارش‌های همهٔ بازاریاب‌های این استان‌ها — از جمله بازاریاب‌هایی که قبلاً ثبت‌نام کرده‌اند — در پنل مدیر دیده می‌شود."
              />
              <p className="rounded-xl border border-[#dce9dc] bg-[#f6faf5] p-3 text-xs leading-6 text-[#52645b]">
                مدیر بلافاصله حساب فعال می‌گیرد و گزارش‌های بازاریاب‌های استان‌های انتخاب‌شده را
                می‌بیند؛ پیش از دیدن گزارش‌ها باید پروفایل خود را کامل و رمز موقت را عوض کند.
              </p>
            </>
          ) : (
            <ResidencePicker
              value={residence}
              onChange={setResidence}
              label="استان و شهر محل فعالیت (اختیاری)"
              cityError={errors.city}
              provinceError={errors.province}
              clearable
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/** «حذف کاربر»: the chosen numbers are blocked and moved to the archive blacklist. */
function DeleteUsersDialog({ group, onClose }: { group: PersonGroup<Me>; onClose: () => void }) {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const deletable = group.rows.filter((u) => u.id !== me?.id);
  const [picked, setPicked] = useState<string[]>(deletable.map((u) => u.id));
  const run = useMutation({
    mutationFn: async () => {
      for (const id of picked) await api.del(`/admin/users/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: 'success',
        message: 'به آرشیو (لیست سیاه) منتقل شد. این شماره دیگر نمی‌تواند وارد اپ شود.',
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
      danger
      title={`حذف ${group.name}؟`}
      confirmText="حذف و انتقال به لیست سیاه"
      loading={run.isPending}
      onClose={onClose}
      onConfirm={() => picked.length && run.mutate()}
    >
      <p>
        شماره‌ی انتخاب‌شده مسدود می‌شود و کاربر دیگر نمی‌تواند وارد اپ شود یا دوباره ثبت‌نام کند.
        اطلاعاتش در{' '}
        <b className="inline-flex items-center gap-1">
          <Archive className="size-3.5" aria-hidden /> آرشیو
        </b>{' '}
        می‌ماند و فقط با «حذف از آرشیو» برای همیشه پاک می‌شود.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {group.rows.map((u) => {
          const self = u.id === me?.id;
          return (
            <li key={u.id}>
              <label className="flex min-h-12 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={self}
                  checked={picked.includes(u.id)}
                  onChange={(e) =>
                    setPicked((l) =>
                      e.target.checked ? [...l, u.id] : l.filter((x) => x !== u.id),
                    )
                  }
                />
                <span dir="ltr">{toPersianDigits(u.phone ?? u.email ?? u.id)}</span>
                {self && <span className="text-xs">(حساب خودتان؛ قابل حذف نیست)</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </ConfirmDialog>
  );
}

function UserDialog({
  user,
  accounts,
  onSwitch,
  onClose,
}: {
  user: Me;
  accounts: Me[];
  onSwitch: (id: string) => void;
  onClose: () => void;
}) {
  const { user: me } = useAuth();
  const teams = useTeams();
  const brands = useBrands();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? '');
  const [managerProvinces, setManagerProvinces] = useState<string[]>(user.managerProvinces ?? []);
  const [telegramChatId, setTelegramChatId] = useState(user.telegramChatId ?? '');
  const [createdManager, setCreatedManager] = useState<{
    user: Me;
    temporaryPassword: string;
  } | null>(null);
  const [status, setStatus] = useState(user.status);
  const [brandIds, setBrandIds] = useState<string[]>(user.brandIds);
  const [residence, setResidence] = useState<Residence>({
    province: user.province ?? '',
    city: user.city ?? '',
  });
  const [reset, setReset] = useState(false);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const canPrivileged = me?.role === 'superadmin';
  const promoting = user.role === 'marketer' && role === 'manager';
  const save = useMutation({
    mutationFn: () =>
      api.patch<{
        warnings?: string[];
        createdManager?: { user: Me; temporaryPassword: string };
      }>(`/admin/users/${user.id}`, {
        name: name.trim(),
        role,
        teamId: teamId || null,
        ...(role === 'manager'
          ? { managerProvinces, telegramChatId: toLatinDigits(telegramChatId).trim() || null }
          : {}),
        status,
        brandIds,
        // null clears the pair (the API rejects a stray city without its province).
        province: residence.province || null,
        city: residence.city || null,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      const warnings = r?.warnings ?? [];
      // Granting Manager access created a separate account: keep the dialog open so the
      // one-time password is not lost, and say plainly that the marketer account survived.
      if (r?.createdManager) {
        setCreatedManager(r.createdManager);
        toast.show({
          type: 'success',
          message: 'حساب مدیر جداگانه ساخته شد؛ حساب بازاریاب با همین شماره برقرار است.',
        });
        return;
      }
      // Changes that detach a team or revoke a role must not be swallowed by a generic toast.
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
  const doReset = useMutation({
    mutationFn: () =>
      api.post<{ method: 'email' | 'temporary'; temporaryPassword: string | null }>(
        `/admin/users/${user.id}/reset-password`,
      ),
    onSuccess: (r) => {
      setReset(false);
      if (r.temporaryPassword) setTempPwd(r.temporaryPassword);
      else toast.show({ type: 'success', message: 'لینک بازیابی به ایمیل کاربر ارسال شد.' });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const submit = () => {
    if (residence.province && !residence.city) {
      setErrors({ city: 'شهر را انتخاب کنید.' });
      return;
    }
    if (role === 'manager' && !teamId && managerProvinces.length === 0) {
      setErrors({ managerProvinces: 'دست‌کم یک استان تحت مدیریت انتخاب کنید.' });
      return;
    }
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`ویرایش ${user.name}`}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<KeyRound className="size-4" aria-hidden />}
            onClick={() => setReset(true)}
          >
            بازتنظیم رمز
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {accounts.length > 1 && (
          <Select
            label="شماره‌ی این کاربر"
            value={user.id}
            onChange={(e) => onSwitch(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {toPersianDigits(a.phone ?? a.email ?? a.id)}
              </option>
            ))}
          </Select>
        )}
        {tempPwd && (
          <div
            role="status"
            className="rounded-card border border-primary/30 bg-primary-light p-3 text-sm"
          >
            رمز موقت:{' '}
            <b dir="ltr" className="select-all font-mono text-base">
              {tempPwd}
            </b>
            <p className="mt-1 text-xs text-text-secondary">
              این رمز فقط یک بار نمایش داده می‌شود. آن را به کاربر بدهید تا بعد از ورود عوض کند.
            </p>
          </div>
        )}
        <Input
          label="نام"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            label="نقش"
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              // Promoting a marketer spawns a *separate* Manager account; its team starts
              // empty instead of silently inheriting the marketer's own team.
              if (user.role === 'marketer' && next === 'manager') setTeamId('');
              if (user.role === 'marketer' && next === 'marketer') setTeamId(user.teamId ?? '');
              setRole(next);
            }}
            error={errors.role}
          >
            <option value="marketer">{ROLE_LABEL.marketer}</option>
            <option value="manager">{ROLE_LABEL.manager}</option>
            <option value="admin" disabled={!canPrivileged && user.role !== 'admin'}>
              {ROLE_LABEL.admin}
            </option>
            <option value="superadmin" disabled={!canPrivileged}>
              {ROLE_LABEL.superadmin}
            </option>
          </Select>
          <Select
            label={promoting ? 'تیم مدیر (اختیاری)' : 'تیم'}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            error={errors.teamId}
          >
            <option value="">بدون تیم</option>
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            label={role === 'manager' ? 'دسترسی پنل مدیر' : 'وضعیت حساب'}
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            error={errors.status}
            hint={
              role === 'manager' ? 'مسدودسازی، ورود و نشست‌های فعلی مدیر را می‌بندد.' : undefined
            }
          >
            <option value="active">{role === 'manager' ? 'فعال — اجازهٔ ورود' : 'فعال'}</option>
            <option value="inactive">
              {role === 'manager' ? 'مسدود — ورود بسته است' : 'غیرفعال'}
            </option>
          </Select>
        </div>
        {createdManager && (
          <div role="status" className="rounded-2xl border border-[#efd9a6] bg-[#fff8e8] p-4">
            <p className="text-sm font-extrabold text-[#70520e]">
              حساب مدیر جداگانه ساخته شد — رمز موقت مدیر، نمایش یک‌باره
            </p>
            <p dir="ltr" className="mt-2 select-all text-center font-mono text-xl font-black">
              {createdManager.temporaryPassword}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#67583a]">
              حساب بازاریاب «{user.name}» با همین شماره دست‌نخورده ماند و ورود بازاریاب مثل قبل کار
              می‌کند. مدیر با همین شماره و این رمز از پنل مدیر وارد می‌شود و در نخستین ورود رمز شخصی
              می‌سازد.
            </p>
          </div>
        )}
        {promoting && !createdManager && (
          <p className="rounded-xl border border-[#dce9dc] bg-[#f6faf5] p-3 text-xs leading-6 text-[#52645b]">
            با ذخیره، برای همین شماره یک <b>حساب مدیر جداگانه</b> ساخته می‌شود و حساب بازاریاب —
            ورود، سابقهٔ آموزش و امتیازها — دست‌نخورده می‌ماند. رمز موقت مدیر بعد از ذخیره همین‌جا
            یک بار نمایش داده می‌شود.
          </p>
        )}
        {role === 'manager' && (
          <ProvinceMultiSelect
            value={managerProvinces}
            onChange={setManagerProvinces}
            error={errors.managerProvinces}
            hint="گزارش‌های همهٔ بازاریاب‌های این استان‌ها در پنل مدیر دیده می‌شود؛ نیازی به ساخت تیم نیست."
          />
        )}
        {role === 'manager' && (
          <Input
            label="شناسهٔ گفت‌وگوی تلگرام (گزارش روزانهٔ ساعت ۹)"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            error={errors.telegramChatId}
            ltr
            inputMode="numeric"
            placeholder="123456789"
            hint="مدیر از ربات تلگرام با دستور /start این شناسه را می‌گیرد؛ خالی = بدون گزارش تلگرامی."
          />
        )}
        <ResidencePicker
          value={residence}
          onChange={setResidence}
          label="محل فعالیت"
          cityError={errors.city}
          clearable
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">برندهای مرتبط (برای انتساب برندی)</legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {(brands.data ?? [])
              .filter((b) => !b.archived)
              .map((b) => {
                const on = brandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setBrandIds((l) => (on ? l.filter((x) => x !== b.id) : [...l, b.id]))
                    }
                    className={
                      on
                        ? 'min-h-12 rounded-full border border-primary bg-primary-light px-3 text-sm font-bold text-primary-fg'
                        : 'min-h-12 rounded-full border border-border px-3 text-sm text-text-secondary'
                    }
                  >
                    {b.name}
                  </button>
                );
              })}
          </div>
        </fieldset>
      </div>
      <ConfirmDialog
        open={reset}
        title="بازتنظیم رمز؟"
        loading={doReset.isPending}
        onClose={() => setReset(false)}
        onConfirm={() => doReset.mutate()}
        confirmText="بازتنظیم"
      >
        همه نشست‌های فعلی کاربر بسته می‌شود. برای کاربران موبایلی یک رمز موقت ساخته می‌شود.
      </ConfirmDialog>
    </Modal>
  );
}

export function AdminUserDetail() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: ({ signal }) => api.get<Timeline>(`/admin/users/${id}`, signal),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="admin" title="جزئیات کاربر" back="/admin/users" />
      <QueryState query={q} loading={<TableSkeleton rows={6} />}>
        {(data) => <AdminUserWorkspace data={data} />}
      </QueryState>
    </div>
  );
}

type UserDetailTab = 'overview' | 'learning' | 'messages';

function AdminUserWorkspace({ data }: { data: Timeline }) {
  const [tab, setTab] = useState<UserDetailTab>('overview');
  const { user, packages, messages } = data;
  const completed = packages.filter((pkg) => pkg.status === 'completed');
  const inProgress = packages.filter((pkg) => pkg.status === 'in_progress');
  const attemptCount = packages.reduce(
    (sum, pkg) =>
      sum + pkg.sections.reduce((sectionSum, section) => sectionSum + section.attempts.length, 0),
    0,
  );
  const recentPackages = [...packages].sort(
    (a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card
        tone="brand"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/15 bg-white text-2xl font-black text-primary-fg sm:size-[76px]">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              user.name.trim().charAt(0) || <UserRound className="size-8" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-[#143f36] sm:text-2xl">{user.name}</h2>
              <StatusBadge status={user.status} />
            </div>
            <p className="mt-1 text-sm font-semibold text-text-secondary">
              {ROLE_LABEL[user.role]}
              {user.teamId ? ` · شناسهٔ تیم ${user.teamId}` : ''}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {[user.city, user.province].filter(Boolean).join('، ') || 'محل فعالیت ثبت نشده'}
              {' · '}عضویت از {faDateTime(user.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {user.phone && (
            <a
              href={`tel:${user.phone}`}
              dir="ltr"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-white px-3 text-sm font-bold text-primary-fg hover:bg-primary-light"
            >
              <Phone className="size-4" aria-hidden />
              {toPersianDigits(user.phone)}
            </a>
          )}
          {user.email && (
            <a
              href={`mailto:${user.email}`}
              dir="ltr"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-white px-3 text-sm font-bold text-primary-fg hover:bg-primary-light"
            >
              <Mail className="size-4" aria-hidden />
              <span className="max-w-48 truncate">{user.email}</span>
            </a>
          )}
        </div>
      </Card>

      <section
        aria-label="آمار یادگیری کاربر"
        className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <KpiCard
          title="آموزش‌های تخصیص‌یافته"
          value={faNumber(packages.length)}
          subtitle="بسته‌های ثبت‌شده برای این کاربر"
          icon={BookOpen}
        />
        <KpiCard
          title="تکمیل‌شده"
          value={faNumber(completed.length)}
          subtitle="آموزش‌های به پایان رسیده"
          icon={CheckCircle2}
          tone="primary"
        />
        <KpiCard
          title="در حال انجام"
          value={faNumber(inProgress.length)}
          subtitle="آموزش‌های فعال کاربر"
          icon={Clock3}
          tone="warning"
        />
        <KpiCard
          title="تلاش‌های آزمون"
          value={faNumber(attemptCount)}
          subtitle="تلاش‌های ثبت‌شده در آموزش‌ها"
          icon={FileQuestion}
          tone="info"
        />
      </section>

      <Tabs
        label="بخش‌های پروندهٔ کاربر"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'نمای کلی' },
          { value: 'learning', label: 'پیشرفت آموزشی', count: packages.length },
          { value: 'messages', label: 'پیام‌ها و یادداشت‌ها', count: messages.length },
        ]}
      />

      {tab === 'overview' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <Card className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 font-extrabold text-[#143f36]">
              <UserRound className="size-5 text-primary-fg" aria-hidden /> اطلاعات حساب
            </h3>
            <UserDetailLine label="نام و نام خانوادگی" value={user.name} />
            <UserDetailLine
              label="شماره تلفن"
              value={user.phone ? toPersianDigits(user.phone) : 'ثبت نشده'}
              ltr={!!user.phone}
            />
            <UserDetailLine label="ایمیل" value={user.email ?? 'ثبت نشده'} ltr={!!user.email} />
            <UserDetailLine
              label="استان و شهر"
              value={[user.province, user.city].filter(Boolean).join('، ') || 'ثبت نشده'}
            />
            <UserDetailLine label="شناسهٔ کاربر" value={user.id} ltr />
            <UserDetailLine
              label="آخرین فعالیت"
              value={user.lastActiveAt ? faRelative(user.lastActiveAt) : 'هنوز فعالیتی ثبت نشده'}
            />
            <UserDetailLine label="امتیاز فعلی" value={faNumber(user.pointsBalance)} />
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold text-[#143f36]">آموزش‌های اخیر</h3>
              <button
                type="button"
                onClick={() => setTab('learning')}
                className="min-h-10 rounded-lg px-3 text-sm font-bold text-primary-fg hover:bg-primary-light"
              >
                مشاهدهٔ پیشرفت کامل
              </button>
            </div>
            {recentPackages.length === 0 ? (
              <EmptyState title="آموزشی به این کاربر تخصیص داده نشده" />
            ) : (
              <ul className="flex flex-col gap-2">
                {recentPackages.slice(0, 5).map((pkg) => (
                  <li key={pkg.id} className="rounded-xl border border-border bg-surface-2/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-text">{pkg.title}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {pkg.status === 'completed'
                            ? 'تکمیل‌شده'
                            : pkg.status === 'in_progress'
                              ? 'در حال انجام'
                              : 'شروع‌نشده'}
                          {pkg.lastActivityAt ? ` · ${faRelative(pkg.lastActivityAt)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-extrabold text-primary-fg">
                        {faPercent(pkg.percent)}
                      </span>
                    </div>
                    <ProgressBar
                      value={pkg.percent}
                      label={`پیشرفت ${pkg.title}`}
                      className="mt-2"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="xl:col-span-2">
            <h3 className="flex items-center gap-2 font-extrabold text-[#143f36]">
              <MessageSquareText className="size-5 text-primary-fg" aria-hidden /> آخرین پیام‌ها و
              یادداشت‌ها
            </h3>
            {messages.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">
                هنوز پیام یا یادداشتی ثبت نشده است.
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {[...messages]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 4)
                  .map((message) => (
                    <li
                      key={message.id}
                      className="rounded-xl border border-border bg-surface-2/60 p-3"
                    >
                      <p className="whitespace-pre-line text-sm leading-6 text-text">
                        {message.body}
                      </p>
                      <p className="mt-2 text-xs text-text-secondary">
                        {message.type === 'note' ? 'یادداشت' : 'پیام'} ·{' '}
                        {faDateTime(message.createdAt)} ·{' '}
                        {message.readAt ? 'خوانده‌شده' : 'خوانده‌نشده'}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      ) : tab === 'learning' ? (
        <MemberTimeline data={data} canMessage={false} />
      ) : (
        <UserMessageHistory data={data} />
      )}
    </div>
  );
}

function UserDetailLine({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span
        dir={ltr ? 'ltr' : undefined}
        className="max-w-[70%] break-all text-end font-semibold text-text"
      >
        {value}
      </span>
    </div>
  );
}

function UserMessageHistory({ data }: { data: Timeline }) {
  return data.messages.length === 0 ? (
    <EmptyState
      title="پیام یا یادداشتی ثبت نشده"
      description="پیام‌ها و یادداشت‌های مرتبط با پرونده در این بخش نمایش داده می‌شوند."
    />
  ) : (
    <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {[...data.messages]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((message) => (
          <li key={message.id}>
            <Card className="h-full">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-bold text-[#143f36]">
                  <MessageSquareText className="size-4 text-primary-fg" aria-hidden />
                  {message.type === 'note' ? 'یادداشت' : 'پیام'}
                </h3>
                <span className="text-xs text-text-secondary">{faDateTime(message.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text">{message.body}</p>
              <p className="mt-3 border-t border-border pt-2 text-xs text-text-secondary">
                {message.readAt ? 'خوانده‌شده' : 'خوانده‌نشده'}
              </p>
            </Card>
          </li>
        ))}
    </ul>
  );
}
