import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PushOptIn } from '@/components/common/PushOptIn';
import { NotificationPrefsCard } from '@/components/common/NotificationPrefsCard';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { ROLE_LABEL, faDate } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';

/** Profile: name, password change, logout (shared by all roles). */
export function ProfilePage({ embedded = false }: { embedded?: boolean }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'name' | 'pw' | 'out'>('');
  if (!user) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('name');
    try {
      setUser(await api.patch<Me>('/me', { name: name.trim() }));
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      setErrors({});
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      toast.show({ type: 'error', message: errMsg(err) });
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
      const f = err instanceof ApiError ? err.fields : {};
      setErrors(Object.keys(f).length ? f : { currentPassword: errMsg(err) });
    } finally {
      setBusy('');
    }
  };

  const contact = user.phone ?? user.email ?? '';

  return (
    <div
      className={
        embedded
          ? 'stagger mx-auto flex w-full max-w-xl flex-col gap-4'
          : '-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-7'
      }
    >
      <div className={embedded ? 'contents' : 'mx-auto flex w-full max-w-[760px] flex-col gap-5'}>
        {!embedded && <PageHeader title="پروفایل" />}

        <Card
          padded={false}
          className="relative min-h-[245px] overflow-hidden !rounded-[30px] border-[#E9E1D5] bg-[linear-gradient(180deg,#FFFDF8_0%,#F7F3E9_100%)] shadow-[0_18px_42px_-34px_rgba(28,66,56,0.42)] sm:min-h-[270px]"
        >
          <div
            aria-hidden
            className="absolute -end-16 -top-16 size-64 rounded-full bg-[#E7F2E9] blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-24 start-4 size-64 rounded-full bg-[#FFF1C8] blur-3xl"
          />

          {!embedded && (
            <img
              src="/brand/mascot.webp"
              alt=""
              width={250}
              height={324}
              decoding="async"
              aria-hidden
              className="pointer-events-none absolute -bottom-12 -start-8 h-[220px] w-auto max-w-[46%] select-none object-contain drop-shadow-md sm:-bottom-14 sm:start-2 sm:h-[275px]"
            />
          )}

          <div
            className={
              embedded
                ? 'relative z-10 flex min-h-[245px] items-center p-5'
                : 'relative z-10 ms-auto flex min-h-[245px] w-[66%] items-center px-4 py-6 sm:min-h-[270px] sm:w-[58%] sm:px-7'
            }
          >
            <div className="w-full">
              <div className="mb-4 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[#D8E5DD] bg-[#F3F8F4] text-xl font-black text-[#0D6B57] shadow-sm"
                >
                  {user.name.trim().charAt(0)}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-black text-[#123E35] sm:text-2xl">
                    {user.name}
                  </h1>
                  <p className="mt-0.5 text-sm font-bold text-[#5D706A]">{ROLE_LABEL[user.role]}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-[#66736F]">
                {contact && (
                  <p className="flex items-center gap-2">
                    <UserRound className="size-4 shrink-0 text-[#0D6B57]" aria-hidden />
                    <span dir="ltr" className="truncate">
                      {toPersianDigits(contact)}
                    </span>
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-[#0D6B57]" aria-hidden />
                  <span>عضو از {faDate(user.createdAt)}</span>
                </p>
              </div>
            </div>
          </div>
        </Card>

        <section aria-labelledby="profile-personal-heading">
          <Card className="!rounded-[24px] border-[#E9E1D5] bg-[#FFFDF8] p-4 shadow-[0_12px_30px_-28px_rgba(32,60,52,0.42)] sm:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[#EAF5EF] text-[#0D6B57]">
                <UserRound className="size-5" aria-hidden />
              </span>
              <div>
                <h2 id="profile-personal-heading" className="text-base font-black text-[#143F36]">
                  اطلاعات شخصی
                </h2>
                <p className="mt-0.5 text-xs text-[#74817D]">نام نمایشی حساب کاربری</p>
              </div>
            </div>

            <form onSubmit={saveName} className="flex flex-col gap-3">
              <Input
                label="نام و نام خانوادگی"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                className="border-[#E6DED3] bg-[#FFFEFA]"
              />
              <Button
                type="submit"
                variant="primary"
                loading={busy === 'name'}
                disabled={name.trim() === user.name}
                icon={<Save className="size-4" aria-hidden />}
                className="sm:self-end sm:min-w-40"
              >
                ذخیره نام
              </Button>
            </form>
          </Card>
        </section>

        <div className="[&>div]:!rounded-[24px] [&>div]:border-[#E9E1D5] [&>div]:bg-[#FFFDF8] [&>div]:shadow-[0_12px_30px_-28px_rgba(32,60,52,0.42)]">
          <PushOptIn />
        </div>

        <div className="[&>div]:!rounded-[24px] [&>div]:border-[#E9E1D5] [&>div]:bg-[#FFFDF8] [&>div]:shadow-[0_12px_30px_-28px_rgba(32,60,52,0.42)]">
          <NotificationPrefsCard />
        </div>

        <section aria-labelledby="profile-password-heading">
          <Card className="!rounded-[24px] border-[#E9E1D5] bg-[#FFFDF8] p-4 shadow-[0_12px_30px_-28px_rgba(32,60,52,0.42)] sm:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[#F3ECFF] text-[#7B45D1]">
                <KeyRound className="size-5" aria-hidden />
              </span>
              <div>
                <h2 id="profile-password-heading" className="text-base font-black text-[#143F36]">
                  تغییر رمز
                </h2>
                <p className="mt-0.5 text-xs text-[#74817D]">
                  برای حفظ امنیت حساب، رمز را محرمانه نگه دارید.
                </p>
              </div>
            </div>

            <form onSubmit={changePw} className="flex flex-col gap-3">
              <Input
                label="رمز فعلی"
                type="password"
                ltr
                autoComplete="current-password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                error={errors.currentPassword}
                className="border-[#E6DED3] bg-[#FFFEFA]"
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
                className="border-[#E6DED3] bg-[#FFFEFA]"
              />
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'pw'}
                disabled={!cur || !next}
                className="sm:self-end sm:min-w-40"
              >
                تغییر رمز
              </Button>
            </form>
          </Card>
        </section>

        <div className="pt-1">
          <Button
            variant="danger"
            block
            loading={busy === 'out'}
            icon={<LogOut className="size-5" aria-hidden />}
            className="border border-[#F2D7D3] bg-[#FFF4F1] text-[#C5342C] shadow-none hover:bg-[#FDE9E5]"
            onClick={async () => {
              setBusy('out');
              await logout();
              nav('/login', { replace: true });
            }}
          >
            خروج از حساب
          </Button>
        </div>
      </div>
    </div>
  );
}
