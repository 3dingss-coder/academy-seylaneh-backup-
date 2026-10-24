import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, Card, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';

/** Mandatory first-login identity/profile setup for Managers provisioned by an Admin. */
export function ManagerProfileCompletionPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [nationalCode, setNationalCode] = useState('');
  const [residence, setResidence] = useState<Residence>({
    province: user?.province ?? '',
    city: user?.city ?? '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (name.trim().length < 2) nextErrors.name = 'نام و نام خانوادگی را وارد کنید.';
    if (!nationalCode.trim()) nextErrors.nationalCode = 'کد ملی را وارد کنید.';
    if (!residence.province) nextErrors.province = 'استان محدودهٔ مدیریت را انتخاب کنید.';
    if (!residence.city) nextErrors.city = 'شهر محدودهٔ مدیریت را انتخاب کنید.';
    if (newPassword.length < 8) nextErrors.newPassword = 'رمز جدید باید حداقل ۸ نویسه باشد.';
    else if (!/[A-Za-z\u0600-\u06FF]/.test(newPassword) || !/[0-9۰-۹]/.test(newPassword))
      nextErrors.newPassword = 'رمز جدید باید شامل حرف و عدد باشد.';
    if (newPassword !== confirmPassword)
      nextErrors.confirmPassword = 'تکرار رمز با رمز جدید یکسان نیست.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const completed = await api.post<Me>('/manager/complete-profile', {
        name: name.trim(),
        nationalCode: nationalCode.trim(),
        province: residence.province,
        city: residence.city,
        newPassword,
      });
      setUser(completed);
      toast.show({ type: 'success', message: 'پروفایل تکمیل شد؛ وارد پنل تیم خود می‌شوید.' });
      navigate('/manager', { replace: true });
    } catch (cause) {
      setErrors(cause instanceof ApiError ? cause.fields : {});
      toast.show({ type: 'error', message: errMsg(cause, 'ذخیرهٔ پروفایل انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-[#f7f7f2] px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader
          title="تکمیل پروفایل مدیر"
          subtitle="پیش از دسترسی به گزارش‌های تیم، مشخصات خود را کامل و رمز موقت را عوض کنید."
        />
        <Card tone="brand" className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-[#176647] shadow-sm">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-black text-[#143f36]">خوش آمدید، {user.name}</h1>
              <p className="mt-1 text-sm leading-6 text-[#52645b]">
                برای ادامه، نام کامل، کد ملی و محدودهٔ مدیریت را ثبت کنید و یک رمز شخصی بسازید. کد
                ملی به‌صورت رمزنگاری‌شده نگهداری می‌شود.
              </p>
              {user.phone && (
                <p className="mt-2 text-xs font-semibold text-[#52645b]">
                  شمارهٔ ورود: <span dir="ltr">{toPersianDigits(user.phone)}</span>
                </p>
              )}
            </div>
          </div>
        </Card>

        <form onSubmit={submit} noValidate>
          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 font-extrabold text-[#143f36]">
              <UserRound className="size-5" aria-hidden /> مشخصات مدیر
            </h2>
            <Input
              label="نام و نام خانوادگی"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
              autoComplete="name"
              disabled={busy}
            />
            <Input
              label="کد ملی"
              value={nationalCode}
              onChange={(event) => setNationalCode(event.target.value)}
              error={errors.nationalCode}
              inputMode="numeric"
              autoComplete="off"
              disabled={busy}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 flex items-center gap-2 text-sm font-bold text-text">
                <MapPin className="size-4" aria-hidden /> محدودهٔ مدیریت
              </legend>
              <ResidencePicker
                value={residence}
                onChange={setResidence}
                label="استان"
                provinceError={errors.province}
                cityError={errors.city}
                disabled={busy}
              />
            </fieldset>

            <div className="border-t border-border pt-4">
              <h2 className="mb-3 flex items-center gap-2 font-extrabold text-[#143f36]">
                <KeyRound className="size-5" aria-hidden /> رمز شخصی
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="رمز جدید"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  error={errors.newPassword}
                  autoComplete="new-password"
                  disabled={busy}
                />
                <Input
                  label="تکرار رمز جدید"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  error={errors.confirmPassword}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                رمز باید دست‌کم ۸ نویسه و شامل حرف و عدد باشد. رمز موقت پس از ذخیره دیگر قابل
                استفاده نیست.
              </p>
            </div>
            <div className="flex justify-start">
              <Button type="submit" loading={busy}>
                تکمیل پروفایل و ورود به پنل
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </main>
  );
}
