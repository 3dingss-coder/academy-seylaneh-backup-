import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Camera, KeyRound, LogOut, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { NotificationPrefsCard } from '@/components/common/NotificationPrefsCard';
import { PageHeader } from '@/components/common/PageHeader';
import { PushOptIn } from '@/components/common/PushOptIn';
import { Button, Card, Input, useToast } from '@/components/ui';
import { ApiError, api, fileUrl, uploadToSignedUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL } from '@/lib/format';
import { mimeOf } from '@/lib/upload';
import { toPersianDigits } from '@/lib/digits';
import type { ManagerProfileView, Me } from '@/lib/types';
import { TelegramReportCard } from './TelegramReportCard';

type ProfileTab = 'profile' | 'notifications' | 'security';

/** Manager identity and assigned team scope, kept separate from the marketer profile. */
export function ManagerProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ProfileTab>('profile');
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const profile = useQuery({
    queryKey: ['manager', 'profile'],
    queryFn: ({ signal }) => api.get<ManagerProfileView>('/manager/profile', signal),
    enabled: Boolean(user),
  });
  if (!user) return null;

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setErrors({ name: 'نام را وارد کنید.' });
      return;
    }
    setBusy('profile');
    setErrors({});
    try {
      const updated = await api.patch<Me>('/me', { name: name.trim() });
      setUser(updated);
      setName(updated.name);
      toast.show({ type: 'success', message: 'مشخصات مدیر ذخیره شد.' });
    } catch (cause) {
      setErrors(cause instanceof ApiError ? cause.fields : {});
      toast.show({ type: 'error', message: errMsg(cause) });
    } finally {
      setBusy('');
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const mime = mimeOf(file);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      toast.show({ type: 'error', message: 'فقط تصویر PNG، JPEG یا WebP مجاز است.' });
      return;
    }
    setBusy('avatar');
    try {
      const ticket = await api.post<{
        path: string;
        upload: { url: string; method: string; headers: Record<string, string> };
      }>('/me/avatar/upload-url', {
        fileName: file.name,
        mime,
        sizeBytes: file.size,
      });
      await uploadToSignedUrl(ticket.upload, file);
      const updated = await api.post<Me>('/me/avatar/finalize', { path: ticket.path });
      setUser(updated);
      toast.show({ type: 'success', message: 'عکس پروفایل مدیر ذخیره شد.' });
    } catch (cause) {
      toast.show({ type: 'error', message: errMsg(cause, 'آپلود عکس انجام نشد.') });
    } finally {
      setBusy('');
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = 'رمز فعلی را وارد کنید.';
    if (newPassword.length < 8) nextErrors.newPassword = 'رمز جدید باید حداقل ۸ نویسه باشد.';
    else if (!/[A-Za-z\u0600-\u06FF]/.test(newPassword) || !/\d|[۰-۹]/.test(newPassword))
      nextErrors.newPassword = 'رمز جدید باید شامل حرف و عدد باشد.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setBusy('password');
    setErrors({});
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast.show({ type: 'success', message: 'رمز ورود مدیر تغییر کرد.' });
    } catch (cause) {
      const fields = cause instanceof ApiError ? cause.fields : {};
      setErrors(Object.keys(fields).length ? fields : { currentPassword: errMsg(cause) });
    } finally {
      setBusy('');
    }
  };

  const signOut = async () => {
    setBusy('logout');
    await logout();
    navigate('/manager', { replace: true });
  };

  const role = ROLE_LABEL[user.role] ?? user.role;
  const team = profile.data?.team;
  const area = profile.data?.managementArea;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="پروفایل مدیر"
        subtitle="مشخصات حساب، محدوده مدیریت و تنظیمات ورود"
        actions={
          <Button
            variant="ghost"
            icon={<LogOut className="size-4" aria-hidden />}
            loading={busy === 'logout'}
            onClick={() => void signOut()}
          >
            خروج
          </Button>
        }
      />
      <div
        role="tablist"
        aria-label="بخش‌های پروفایل مدیر"
        className="flex gap-1 overflow-x-auto rounded-card border border-border bg-surface p-1"
      >
        <ProfileTabButton
          active={tab === 'profile'}
          onClick={() => setTab('profile')}
          icon={<UserRound className="size-4" />}
        >
          پروفایل و تیم
        </ProfileTabButton>
        <ProfileTabButton
          active={tab === 'notifications'}
          onClick={() => setTab('notifications')}
          icon={<Bell className="size-4" />}
        >
          اعلان‌ها
        </ProfileTabButton>
        <ProfileTabButton
          active={tab === 'security'}
          onClick={() => setTab('security')}
          icon={<KeyRound className="size-4" />}
        >
          امنیت حساب
        </ProfileTabButton>
      </div>

      {tab === 'profile' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <Card tone="brand" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <div className="grid size-24 place-items-center overflow-hidden rounded-3xl border border-white bg-white text-[#245640] shadow-sm">
                  {user.avatarUrl ? (
                    <img
                      src={fileUrl(user.avatarUrl)}
                      alt="عکس پروفایل مدیر"
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserRound className="size-10" aria-hidden />
                  )}
                </div>
                <button
                  type="button"
                  aria-label="تغییر عکس پروفایل مدیر"
                  onClick={() => avatarInput.current?.click()}
                  disabled={busy === 'avatar'}
                  className="pressable absolute -bottom-2 -end-2 grid size-11 place-items-center rounded-2xl border-2 border-white bg-[#0b704e] text-white shadow-sm disabled:opacity-50"
                >
                  <Camera className="size-5" aria-hidden />
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="انتخاب عکس پروفایل مدیر"
                  onChange={uploadAvatar}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <p className="text-xs font-bold text-[#47705c]">حساب مدیریت تیم</p>
                <h2 className="mt-1 break-words text-2xl font-black text-[#143f36]">{user.name}</h2>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#c9dfcc] bg-white/80 px-3 py-1.5 text-sm font-extrabold text-[#1b6549]">
                  <ShieldCheck className="size-4" aria-hidden /> {role}
                </div>
              </div>
            </div>
            <form
              onSubmit={saveName}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            >
              <Input
                label="نام نمایشی"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={errors.name}
                autoComplete="name"
                disabled={busy === 'profile'}
              />
              <Button type="submit" loading={busy === 'profile'}>
                ذخیره مشخصات
              </Button>
            </form>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eef5f0] text-[#176647]">
                <UsersRound className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-black text-[#143f36]">تیم و محدودهٔ دسترسی</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  شما گزارش‌های همهٔ بازاریاب‌های استان‌های تحت مدیریت‌تان را می‌بینید؛ محدوده را
                  ادمین تعیین می‌کند.
                </p>
              </div>
            </div>
            <ReadOnlyField
              label="استان‌های تحت مدیریت"
              value={
                profile.isLoading
                  ? 'در حال بارگذاری…'
                  : profile.data?.managerProvinces?.length
                    ? profile.data.managerProvinces.join('، ')
                    : 'استانی تخصیص داده نشده'
              }
            />
            <ReadOnlyField
              label="تیم دستی"
              value={profile.isLoading ? 'در حال بارگذاری…' : (team?.name ?? 'بدون تیم دستی')}
            />
            <ReadOnlyField
              label="شهر محل استقرار"
              value={[area?.city, area?.province].filter(Boolean).join('، ') || 'ثبت نشده'}
            />
            <ReadOnlyField
              label="شماره ورود"
              value={user.phone ? toPersianDigits(user.phone) : 'ثبت نشده'}
              ltr
            />
            <div className="rounded-xl border border-[#e7ece4] bg-[#f8faf6] p-3 text-xs leading-6 text-[#66756c]">
              محدودهٔ مدیریت و انتساب تیم از پروفایل شما قابل تغییر نیست؛ برای به‌روزرسانی با ادمین
              هماهنگ کنید.
            </div>
          </Card>
          <TelegramReportCard />
        </div>
      )}

      {tab === 'notifications' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <PushOptIn />
          <NotificationPrefsCard />
        </div>
      )}

      {tab === 'security' && (
        <Card className="max-w-2xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#f0ecfb] text-[#6847a5]">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-black text-[#143f36]">تغییر رمز عبور</h2>
              <p className="mt-1 text-sm text-text-secondary">
                رمز پنل مدیر را خصوصی نگه دارید و در اختیار اعضای تیم نگذارید.
              </p>
            </div>
          </div>
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Input
              label="رمز فعلی"
              type="password"
              ltr
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              error={errors.currentPassword}
            />
            <Input
              label="رمز جدید"
              type="password"
              ltr
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              error={errors.newPassword}
              hint="حداقل ۸ نویسه و شامل حرف و عدد"
            />
            <Button
              type="submit"
              loading={busy === 'password'}
              disabled={!currentPassword || !newPassword}
            >
              تغییر رمز
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function ProfileTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`pressable flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-input px-3 text-sm font-bold ${active ? 'bg-cta bg-brand-gradient text-on-cta shadow-sm' : 'text-text-secondary hover:bg-surface-2'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ReadOnlyField({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
      <span className="text-xs text-text-secondary">{label}</span>
      <b
        dir={ltr ? 'ltr' : undefined}
        className={ltr ? 'text-left text-sm text-[#244b39]' : 'text-sm text-[#244b39]'}
      >
        {value}
      </b>
    </div>
  );
}
