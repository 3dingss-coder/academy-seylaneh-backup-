import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Camera,
  ChevronLeft,
  Crown,
  KeyRound,
  LockKeyhole,
  LogOut,
  MapPin,
  Medal,
  Settings,
  ShieldCheck,
  Star,
  Target,
  UserRound,
} from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { PushOptIn } from '@/components/common/PushOptIn';
import { NotificationPrefsCard } from '@/components/common/NotificationPrefsCard';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { ApiError, api, fileUrl, uploadToSignedUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faNumber } from '@/lib/format';
import { mimeOf } from '@/lib/upload';
import { qk, useHome, useMessages, useNotifications } from '@/lib/queries';
import { toPersianDigits } from '@/lib/digits';
import type { BadgeView, Me } from '@/lib/types';

type ProfileView = 'overview' | 'personal' | 'notifications' | 'security';

const WORKPLACES = ['فروشگاه مرکزی', 'فروشگاه شعبه', 'ویزیت میدانی', 'آنلاین'];

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="بازگشت"
      className="pressable grid size-12 place-items-center rounded-full text-[#0C6A58] hover:bg-[#EAF4EF]"
    >
      <ChevronLeft className="size-7" aria-hidden />
    </button>
  );
}

function SectionHeader({
  title,
  onBack,
  actions,
}: {
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}) {
  if (onBack) {
    return (
      <div className="relative flex min-h-14 items-center justify-center">
        <div className="absolute left-0">
          <BackButton onClick={onBack} />
        </div>
        <h1 className="text-center text-[28px] font-black tracking-tight text-[#075A4D] sm:text-[32px]">
          {title}
        </h1>
      </div>
    );
  }

  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <h1 className="text-[28px] font-black tracking-tight text-[#075A4D] sm:text-[32px]">
        {title}
      </h1>
      <div dir="ltr" className="flex min-w-12 items-center justify-end gap-2">
        {actions}
      </div>
    </div>
  );
}

/** Marketer profile redesigned to the approved mobile reference. */
export function ProfilePage({ embedded = false }: { embedded?: boolean }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ProfileView>('overview');
  const [name, setName] = useState(user?.name ?? '');
  const [residence, setResidence] = useState<Residence>({
    province: user?.province ?? '',
    city: user?.city ?? '',
  });
  const [workplace, setWorkplace] = useState(user?.workplace ?? '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'profile' | 'avatar' | 'pw' | 'out'>('');

  const home = useHome(user?.id);
  const notifications = useNotifications(Boolean(user));
  const messages = useMessages(Boolean(user));
  const badges = useQuery({
    queryKey: qk.badges,
    queryFn: ({ signal }) => api.get<BadgeView[]>('/me/badges', signal),
    enabled: Boolean(user),
  });

  if (!user) return null;

  const unread =
    (notifications.data?.unread ?? 0) + (messages.data?.filter((m) => !m.readAt).length ?? 0);
  const points = home.data?.pointsBalance ?? user.pointsBalance ?? 0;
  const completedCourses = home.data?.counts.completed ?? 0;
  const earnedBadges = badges.data?.filter((badge) => badge.earned).length ?? 0;
  const levelGoal = 500;
  const levelProgress = Math.min(100, Math.max(0, Math.round((points / levelGoal) * 100)));

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (residence.province && !residence.city) {
      setErrors({ city: 'شهر را انتخاب کنید.' });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    const residenceChanged =
      (residence.province || null) !== (user.province ?? null) ||
      (residence.city || null) !== (user.city ?? null);
    if (residenceChanged) {
      patch.province = residence.province;
      patch.city = residence.city;
    }
    if ((workplace || null) !== (user.workplace ?? null)) patch.workplace = workplace || null;
    if (!Object.keys(patch).length) return;

    setBusy('profile');
    try {
      const updated = await api.patch<Me>('/me', patch);
      setUser(updated);
      setName(updated.name);
      setResidence({ province: updated.province ?? '', city: updated.city ?? '' });
      setWorkplace(updated.workplace ?? '');
      setErrors({});
      toast.show({ type: 'success', message: 'ذخیره شد.' });
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      toast.show({ type: 'error', message: errMsg(err) });
    } finally {
      setBusy('');
    }
  };

  const uploadAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mime = mimeOf(file);
    if (!mime.startsWith('image/')) {
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
      toast.show({ type: 'success', message: 'عکس پروفایل ذخیره شد.' });
    } catch (err) {
      toast.show({ type: 'error', message: errMsg(err, 'آپلود عکس انجام نشد.') });
    } finally {
      setBusy('');
    }
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setErrors({ newPassword: 'رمز جدید باید حداقل ۸ نویسه باشد.' });
    setBusy('pw');
    try {
      await api.post('/me/password', { currentPassword: cur, newPassword: next });
      toast.show({ type: 'success', message: 'رمز عوض شد.' });
      setCur('');
      setNext('');
      setErrors({});
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setErrors(Object.keys(fields).length ? fields : { currentPassword: errMsg(err) });
    } finally {
      setBusy('');
    }
  };

  const doLogout = async () => {
    setBusy('out');
    await logout();
    nav('/login', { replace: true });
  };

  const avatar = user.avatarUrl ? (
    <img
      src={fileUrl(user.avatarUrl)}
      alt=""
      className="size-full rounded-full object-cover"
      decoding="async"
    />
  ) : (
    <UserRound className="size-10 text-[#526B66]" aria-hidden />
  );

  const shellClass = embedded
    ? 'stagger mx-auto flex w-full max-w-xl flex-col gap-4'
    : '-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 pb-6 pt-4';

  if (view === 'personal') {
    return (
      <div className={shellClass}>
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5">
          <SectionHeader title="اطلاعات شخصی" onBack={() => setView('overview')} />

          <div className="relative overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_82%_20%,#E7F3EA_0%,transparent_35%),linear-gradient(180deg,#FFFDF5_0%,#F8F4E8_100%)] px-4 pb-5 pt-4">
            <img
              src="/brand/mascot.webp"
              alt=""
              aria-hidden
              className="pointer-events-none absolute -right-8 bottom-0 h-[250px] w-auto max-w-[54%] select-none object-contain drop-shadow-md"
            />
            <div className="relative z-10 mr-auto flex w-[48%] flex-col items-center pt-8">
              <div className="relative">
                <div className="grid size-28 place-items-center overflow-hidden rounded-full border-[10px] border-[#D9E7E1] bg-[#F1F6F3] shadow-sm">
                  {avatar}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  disabled={busy === 'avatar'}
                  aria-label="تغییر عکس پروفایل"
                  className="absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full border-4 border-[#FCF8F0] bg-[#075A73] text-white shadow-md disabled:opacity-50"
                >
                  <Camera className="size-5" aria-hidden />
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={uploadAvatar}
                />
              </div>
              <p className="mt-5 text-lg font-black text-[#153D36]">عکس پروفایل</p>
              <p className="mt-1 text-center text-xs leading-6 text-[#77817E]">
                برای تغییر عکس ضربه بزنید
              </p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <Input
              label="نام و نام خانوادگی"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              icon={<UserRound className="size-5" aria-hidden />}
              className="bg-[#FFFDF8]"
            />

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-text">شماره موبایل</p>
              <div className="flex min-h-14 items-center gap-3 rounded-[18px] bg-[#EFEEE9] px-4 text-[#6E7775]">
                <LockKeyhole className="size-5 shrink-0" aria-hidden />
                <span dir="ltr" className="flex-1 text-end">
                  {user.phone ? toPersianDigits(user.phone) : '—'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-text">کد ملی</p>
              <div className="flex min-h-14 items-center gap-3 rounded-[18px] border border-[#E1DDD4] bg-[#FFFDF8] px-4">
                <ShieldCheck className="size-5 shrink-0 text-[#7B8582]" aria-hidden />
                <span className="flex-1 text-end text-[#344A45]">
                  {user.hasNationalCode ? 'ثبت شده' : 'ثبت نشده'}
                </span>
              </div>
            </div>

            <ResidencePicker
              value={residence}
              onChange={setResidence}
              label="استان"
              provinceError={errors.province}
              cityError={errors.city}
              placeholder="استان"
              disabled={busy === 'profile'}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-workplace" className="text-sm font-semibold text-text">
                محل فعالیت
              </label>
              <div className="relative">
                <select
                  id="profile-workplace"
                  value={workplace}
                  onChange={(e) => setWorkplace(e.target.value)}
                  className="min-h-14 w-full appearance-none rounded-[18px] border border-[#E1DDD4] bg-[#FFFDF8] px-4 pe-11 text-base text-[#1F413B] shadow-xs outline-none focus:border-[#0A765F] focus:ring-4 focus:ring-[#0A765F]/10"
                >
                  <option value="">انتخاب محل فعالیت</option>
                  {WORKPLACES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <MapPin
                  className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#7A8582]"
                  aria-hidden
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={busy === 'profile'}
              className="mt-1 rounded-[22px]"
            >
              ذخیره تغییرات
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'notifications') {
    return (
      <div className={shellClass}>
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
          <SectionHeader title="تنظیمات اعلان‌ها" onBack={() => setView('overview')} />
          <PushOptIn />
          <NotificationPrefsCard />
        </div>
      </div>
    );
  }

  if (view === 'security') {
    return (
      <div className={shellClass}>
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
          <SectionHeader title="تنظیمات حساب" onBack={() => setView('overview')} />
          <Card className="!rounded-[24px] bg-[#FFFDF8] p-5">
            <form onSubmit={changePw} className="flex flex-col gap-3">
              <div className="mb-1 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#F3ECFF] text-[#7B45D1]">
                  <KeyRound className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-black text-[#153D36]">تغییر رمز</h2>
              </div>
              <Input
                label="رمز فعلی"
                type="password"
                ltr
                autoComplete="current-password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                error={errors.currentPassword}
              />
              <Input
                label="رمز جدید"
                type="password"
                ltr
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                error={errors.newPassword}
                hint="حداقل ۸ نویسه"
              />
              <Button
                type="submit"
                variant="primary"
                block
                loading={busy === 'pw'}
                disabled={!cur || !next}
              >
                تغییر رمز
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      title: 'اطلاعات شخصی',
      subtitle: 'مشاهده و ویرایش اطلاعات حساب',
      icon: UserRound,
      iconClass: 'bg-[#0EB784] text-white',
      onClick: () => setView('personal' as const),
    },
    {
      title: 'محل فعالیت',
      subtitle: 'استان، شهر و محل فعالیت شما',
      icon: MapPin,
      iconClass: 'bg-[#5B9CF7] text-white',
      onClick: () => setView('personal' as const),
    },
    {
      title: 'تنظیمات اعلان‌ها',
      subtitle: 'مدیریت اعلان‌ها و پیام‌ها',
      icon: Bell,
      iconClass: 'bg-[#FFB323] text-white',
      onClick: () => setView('notifications' as const),
    },
  ];

  return (
    <div className={shellClass}>
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
        <SectionHeader
          title="پروفایل من"
          actions={
            <>
              <button
                type="button"
                onClick={() => setView('security')}
                aria-label="تنظیمات حساب"
                className="pressable grid size-12 place-items-center rounded-full border border-[#EEE6DA] bg-[#FFFDF8] text-[#596B67] shadow-sm"
              >
                <Settings className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => nav('/messages')}
                aria-label="اعلان‌ها و پیام‌ها"
                className="pressable relative grid size-12 place-items-center rounded-full border border-[#EEE6DA] bg-[#FFFDF8] text-[#596B67] shadow-sm"
              >
                <Bell className="size-6" aria-hidden />
                {unread > 0 && (
                  <span
                    aria-label={`${toPersianDigits(unread)} خوانده نشده`}
                    className="absolute right-1 top-1 size-3 rounded-full border-2 border-[#FFFDF8] bg-[#EF4444]"
                  />
                )}
              </button>
            </>
          }
        />

        <div className="relative min-h-[285px] overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_72%_24%,#E6F2E7_0%,transparent_31%),radial-gradient(circle_at_18%_45%,#F5F0C9_0%,transparent_34%),linear-gradient(180deg,#FFFDF6_0%,#EEF4E4_100%)]">
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,rgba(130,178,96,.22),transparent)]"
          />
          <div
            aria-hidden
            className="absolute -right-10 bottom-10 size-28 rounded-full bg-[#A9CF7B]/35 blur-2xl"
          />
          <img
            src="/brand/mascot.webp"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-7 bottom-0 h-[270px] w-auto max-w-[58%] select-none object-contain drop-shadow-lg"
          />

          <div className="absolute bottom-5 left-4 z-10 flex w-[58%] items-center gap-3 rounded-[28px] border border-white/80 bg-[#FFFDF8]/95 p-4 shadow-[0_15px_34px_-26px_rgba(29,69,57,0.5)] backdrop-blur-sm">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#DDE9E4]">
              {avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[21px] font-black text-[#102F2A]">{user.name}</p>
              <p className="mt-1 text-sm text-[#727E7A]">{ROLE_LABEL[user.role]} سیلانه</p>
            </div>
            <button
              type="button"
              onClick={() => setView('personal')}
              aria-label="ویرایش اطلاعات شخصی"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F1F4F1] text-[#2C5750]"
            >
              <UserRound className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <StatCard
            icon={<Star className="size-8 fill-[#FFB51E] text-[#F4A711]" aria-hidden />}
            value={faNumber(points)}
            label="امتیاز کل"
          />
          <StatCard
            icon={<Target className="size-8 text-[#12A879]" aria-hidden />}
            value={faNumber(completedCourses)}
            label="دوره تکمیل شده"
          />
          <StatCard
            icon={<Crown className="size-8 fill-[#FFB51E] text-[#F0A218]" aria-hidden />}
            value={faNumber(earnedBadges)}
            label="نشان کسب شده"
          />
        </div>

        <Card className="!rounded-[24px] border-[#ECE4D8] bg-[#FFFDF8] p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-full bg-[#FFF6D9] text-[#F0A218]">
              <Medal className="size-9" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#6E7A76]">سطح فعلی شما</p>
              <p className="mt-0.5 text-lg font-black text-[#143D35]">کارآموز حرفه‌ای</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E7E9E4]">
                <div
                  className="h-full rounded-full bg-[#10A67B]"
                  style={{ width: `${levelProgress}%` }}
                  role="progressbar"
                  aria-label="پیشرفت سطح"
                  aria-valuenow={levelProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="mt-1 text-xs text-[#77827F]">
                {faNumber(points)} از {faNumber(levelGoal)} امتیاز
              </p>
            </div>
            <ChevronLeft className="size-6 shrink-0 text-[#7A8582]" aria-hidden />
          </div>
        </Card>

        <div className="flex flex-col gap-2.5">
          {menuItems.map(({ title, subtitle, icon: Icon, iconClass, onClick }) => (
            <button
              key={title}
              type="button"
              onClick={onClick}
              className="pressable flex min-h-[82px] w-full items-center gap-3 rounded-[22px] border border-[#ECE4D8] bg-[#FFFDF8] px-4 py-3 text-start shadow-[0_10px_28px_-26px_rgba(32,60,52,0.45)]"
            >
              <span
                className={cn('grid size-12 shrink-0 place-items-center rounded-[15px]', iconClass)}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-[#173A34]">{title}</span>
                <span className="mt-1 block text-sm text-[#77817E]">{subtitle}</span>
              </span>
              <ChevronLeft className="size-6 shrink-0 text-[#808986]" aria-hidden />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={doLogout}
          disabled={busy === 'out'}
          aria-label="خروج از حساب"
          className="pressable flex min-h-16 w-full items-center justify-center gap-3 rounded-[22px] border border-[#F3DED9] bg-[#FFF7F4] px-4 font-black text-[#E02D2D] shadow-sm disabled:opacity-50"
        >
          <LogOut className="size-6" aria-hidden />
          <span>{busy === 'out' ? 'در حال خروج…' : 'خروج از حساب کاربری'}</span>
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-h-[132px] flex-col items-center justify-center rounded-[22px] border border-[#EFE7DC] bg-[#FFFDF8] px-2 py-4 text-center shadow-[0_10px_26px_-24px_rgba(32,60,52,0.38)]">
      {icon}
      <strong className="mt-2 text-[22px] font-black text-[#123D36]">{value}</strong>
      <span className="mt-1 text-xs leading-5 text-[#7A8581]">{label}</span>
    </div>
  );
}
