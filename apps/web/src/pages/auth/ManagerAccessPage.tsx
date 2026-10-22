import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  CircleAlert,
  ClipboardCheck,
  KeyRound,
  LockKeyhole,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Button, Card, Input, Modal, Textarea } from '@/components/ui';
import { ApiError, api, fileUrl, uploadToSignedUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { mimeOf } from '@/lib/upload';
import { toPersianDigits } from '@/lib/digits';
import type { ManagerAccessAuthResult } from '@/lib/types';

type AccessNotice = Exclude<ManagerAccessAuthResult, { state: 'active' }>;
type Screen = 'phone' | 'signin' | 'apply' | 'review';
type FormSection = 'identity' | 'area' | 'account';

const INITIAL_RESIDENCE: Residence = { province: '', city: '' };

/** Manager-only entry: phone/password sign-in plus inactive-until-approved access applications. */
export function ManagerAccessPage() {
  const { managerAccessLogin } = useAuth();
  const avatarInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [screen, setScreen] = useState<Screen>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [residence, setResidence] = useState<Residence>(INITIAL_RESIDENCE);
  const [avatarUploadId, setAvatarUploadId] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<AccessNotice | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [editSection, setEditSection] = useState<FormSection | null>(null);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const lookupPhone = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy('lookup');
    try {
      const result = await api.post<{ flow: 'apply' | 'sign_in' | 'unavailable'; phone: string }>(
        '/auth/manager-access/lookup',
        { phone },
      );
      setPhone(result.phone);
      setPassword('');
      setNotice(null);
      if (result.flow === 'apply') setScreen('apply');
      else if (result.flow === 'sign_in') setScreen('signin');
      else setError('این شماره برای ساخت حساب مدیر در دسترس نیست. با ادمین تماس بگیرید.');
    } catch (cause) {
      setError(errMsg(cause));
    } finally {
      setBusy('');
    }
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy('signin');
    try {
      const result = await managerAccessLogin({ phone, password });
      if (result.state === 'active') return;
      setNotice(result);
      setAppealOpen(false);
      setAppealMessage('');
    } catch (cause) {
      setError(errMsg(cause));
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
      setError('فقط تصویر PNG، JPEG یا WebP مجاز است.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم عکس پروفایل حداکثر ۵ مگابایت است.');
      return;
    }

    setError('');
    setAvatarUploadId('');
    setBusy('avatar');
    const nextPreview = URL.createObjectURL(file);
    try {
      const ticket = await api.post<{
        uploadId: string;
        upload: { url: string; method: string; headers: Record<string, string> };
      }>('/auth/manager-access/avatar-upload-url', {
        fileName: file.name,
        mime,
        sizeBytes: file.size,
      });
      await uploadToSignedUrl(ticket.upload, file);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = nextPreview;
      setAvatarPreview(nextPreview);
      setAvatarUploadId(ticket.uploadId);
    } catch (cause) {
      URL.revokeObjectURL(nextPreview);
      setError(errMsg(cause, 'آپلود عکس انجام نشد. دوباره تلاش کنید.'));
    } finally {
      setBusy('');
    }
  };

  const reviewDetails = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (fullName.trim().length < 2) nextErrors.fullName = 'نام و نام خانوادگی را وارد کنید.';
    if (nationalCode.trim().length !== 10) nextErrors.nationalCode = 'کد ملی ۱۰ رقمی وارد کنید.';
    if (!residence.province) nextErrors.managementProvince = 'استان مدیریت را انتخاب کنید.';
    if (!residence.city) nextErrors.managementCity = 'شهر مدیریت را انتخاب کنید.';
    if (password.length < 8) nextErrors.password = 'رمز عبور باید حداقل ۸ نویسه باشد.';
    else if (!/[A-Za-z\u0600-\u06FF]/.test(password) || !/\d|[۰-۹]/.test(password))
      nextErrors.password = 'رمز عبور باید دست‌کم یک حرف و یک عدد داشته باشد.';
    if (password !== confirmPassword)
      nextErrors.confirmPassword = 'تکرار رمز با رمز عبور یکسان نیست.';
    if (!avatarUploadId) nextErrors.avatar = 'یک عکس پروفایل انتخاب و آپلود کنید.';
    if (residence.province && !residence.city)
      nextErrors.managementCity = 'شهر مدیریت را انتخاب کنید.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('موارد مشخص‌شده را کامل کنید.');
      return;
    }
    setError('');
    setEditSection(null);
    setScreen('review');
  };

  const discardApplication = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setFullName('');
    setNationalCode('');
    setResidence(INITIAL_RESIDENCE);
    setAvatarUploadId('');
    setAvatarPreview('');
    setErrors({});
    setEditSection(null);
  };

  const submitRequest = async () => {
    if (!avatarUploadId) {
      setError('عکس پروفایل خود را دوباره انتخاب کنید.');
      setScreen('apply');
      return;
    }
    setError('');
    setBusy('request');
    try {
      await api.post('/auth/manager-access/requests', {
        phone,
        fullName: fullName.trim(),
        nationalCode: nationalCode.trim(),
        managementProvince: residence.province,
        managementCity: residence.city,
        password,
        avatarUploadId,
      });
      setPassword('');
      setConfirmPassword('');
      discardApplication();
      setConfirmationOpen(true);
    } catch (cause) {
      setErrors(cause instanceof ApiError ? cause.fields : {});
      setError(errMsg(cause));
      if (cause instanceof ApiError && Object.keys(cause.fields).length) setScreen('apply');
    } finally {
      setBusy('');
    }
  };

  const submitAppeal = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy('appeal');
    try {
      const result = await api.post<{ status: 'review_requested'; message: string }>(
        '/auth/manager-access/appeals',
        { phone, password, message: appealMessage },
      );
      setPassword('');
      setNotice({ state: 'review_requested', message: result.message });
      setAppealOpen(false);
      setAppealMessage('');
    } catch (cause) {
      setError(errMsg(cause));
    } finally {
      setBusy('');
    }
  };

  const returnToPhone = () => {
    setScreen('phone');
    setPassword('');
    setConfirmPassword('');
    setNotice(null);
    setAppealOpen(false);
    setAppealMessage('');
    setError('');
    setBusy('');
    discardApplication();
  };

  const edit = (section: FormSection) => {
    setEditSection(section);
    setErrors({});
    setError('');
    setScreen('apply');
    requestAnimationFrame(() => {
      document.getElementById(`manager-application-${section}`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    });
  };

  return (
    <main
      dir="rtl"
      className="relative min-h-dvh overflow-hidden bg-[#f6f3ec] px-3 pb-10 pt-5 sm:px-6 sm:pt-8"
    >
      <img
        src="/brand/auth/auth-welcome-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.13]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-36 end-[-5rem] size-96 rounded-full bg-[#c8e4d2]/70 blur-3xl"
      />
      <div className="relative mx-auto flex w-full max-w-[760px] flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/admin"
            className="flex items-center gap-3 rounded-2xl bg-white/90 p-2.5 shadow-sm"
          >
            <img src="/icons/logo-full.png" alt="هلدینگ سیلانه‌سبز" className="h-10 w-auto" />
          </Link>
          <span className="rounded-full border border-[#d9e5dc] bg-white/75 px-3 py-2 text-xs font-bold text-[#476456]">
            ورود اختصاصی مدیران
          </span>
        </header>

        <section className="overflow-hidden rounded-[30px] border border-[#dfe7dc] bg-white/95 shadow-[0_24px_70px_-45px_rgba(12,61,43,0.45)]">
          <div className="bg-gradient-to-l from-[#0d6448] via-[#0e7351] to-[#1c8962] px-5 py-6 text-white sm:px-8 sm:py-8">
            <p className="text-xs font-bold text-white/75">پنل مدیران بازاریابی</p>
            <h1 className="mt-1 text-2xl font-black sm:text-[30px]">
              {screen === 'phone'
                ? 'ورود یا درخواست دسترسی'
                : screen === 'signin'
                  ? 'ورود به پنل مدیر'
                  : screen === 'review'
                    ? 'بازبینی اطلاعات'
                    : 'تکمیل درخواست مدیریت'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/80">
              {screen === 'phone'
                ? 'شماره موبایل خود را وارد کنید تا مسیر ورود یا ثبت درخواست مدیر نمایش داده شود.'
                : screen === 'signin'
                  ? 'با همان شماره موبایل و رمز عبور حساب مدیر وارد شوید.'
                  : screen === 'review'
                    ? 'اطلاعات را بررسی کنید؛ هر بخش را می‌توانید با آیکن مداد ویرایش کنید.'
                    : 'مشخصات، محدوده مدیریت، عکس و رمز ورود خود را ثبت کنید.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-7">
            {screen === 'phone' && !notice && (
              <form
                onSubmit={lookupPhone}
                className="flex flex-col gap-4"
                aria-busy={busy === 'lookup'}
              >
                <div className="rounded-2xl border border-[#dbe8dc] bg-[#f5faf5] p-4 text-sm leading-7 text-[#546b5f]">
                  <div className="mb-1 flex items-center gap-2 font-extrabold text-[#174d3b]">
                    <ShieldCheck className="size-5" aria-hidden />
                    دسترسی فقط پس از بررسی ادمین فعال می‌شود
                  </div>
                  اگر هنوز حساب مدیر ندارید، از همین‌جا درخواست دسترسی بفرستید. شماره موبایل در این
                  سامانه با پیامک تأیید نمی‌شود و باید پیش از فعال‌سازی توسط ادمین بررسی شود.
                </div>
                <Input
                  label="شماره موبایل"
                  ltr
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  icon={<Phone className="size-5" aria-hidden />}
                  disabled={Boolean(busy)}
                />
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button type="submit" loading={busy === 'lookup'} size="lg" block>
                  بررسی شماره موبایل
                  <ArrowLeft className="size-4" aria-hidden />
                </Button>
                <p className="text-center text-xs text-[#7e8981]">
                  ادمین هستید؟{' '}
                  <Link className="font-bold text-[#0b6c4c] underline" to="/admin">
                    ورود به پنل ادمین
                  </Link>
                </p>
              </form>
            )}

            {screen === 'signin' && !notice && (
              <form onSubmit={signIn} className="flex flex-col gap-4" aria-busy={busy === 'signin'}>
                <div className="flex items-center justify-between rounded-2xl bg-[#f5f7f4] px-4 py-3">
                  <div>
                    <p className="text-xs text-[#78837b]">شماره حساب مدیر</p>
                    <p
                      dir="ltr"
                      className="mt-1 text-sm font-extrabold tracking-wide text-[#174d3b]"
                    >
                      {toPersianDigits(phone)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-bold text-[#0d704e]"
                    onClick={returnToPhone}
                  >
                    تغییر شماره
                  </button>
                </div>
                <Input
                  label="رمز عبور"
                  type="password"
                  ltr
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  icon={<KeyRound className="size-5" aria-hidden />}
                  disabled={Boolean(busy)}
                />
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button type="submit" loading={busy === 'signin'} size="lg" block>
                  ورود به پنل مدیر
                  <ArrowLeft className="size-4" aria-hidden />
                </Button>
              </form>
            )}

            {screen === 'apply' && (
              <form
                onSubmit={reviewDetails}
                className="flex flex-col gap-4"
                aria-busy={busy === 'avatar'}
              >
                <div className="flex items-center justify-between rounded-2xl bg-[#f5f7f4] px-4 py-3">
                  <div>
                    <p className="text-xs text-[#78837b]">شماره درخواست</p>
                    <p
                      dir="ltr"
                      className="mt-1 text-sm font-extrabold tracking-wide text-[#174d3b]"
                    >
                      {toPersianDigits(phone)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-bold text-[#0d704e]"
                    onClick={returnToPhone}
                  >
                    تغییر شماره
                  </button>
                </div>

                <section
                  id="manager-application-identity"
                  className={`rounded-2xl border p-4 ${editSection === 'identity' ? 'border-[#0d8057] bg-[#f8fcf8]' : 'border-[#e6e9e2] bg-white'}`}
                >
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#174d3b]">
                    <UserRound className="size-4" aria-hidden /> اطلاعات هویتی
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="نام و نام خانوادگی"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      error={errors.fullName}
                      disabled={Boolean(busy)}
                    />
                    <Input
                      label="کد ملی"
                      ltr
                      inputMode="numeric"
                      autoComplete="off"
                      value={nationalCode}
                      onChange={(event) => setNationalCode(event.target.value)}
                      error={errors.nationalCode}
                      disabled={Boolean(busy)}
                    />
                  </div>
                </section>

                <section
                  id="manager-application-area"
                  className={`rounded-2xl border p-4 ${editSection === 'area' ? 'border-[#0d8057] bg-[#f8fcf8]' : 'border-[#e6e9e2] bg-white'}`}
                >
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#174d3b]">
                    <MapPin className="size-4" aria-hidden /> محدوده مدیریت درخواستی
                  </h2>
                  <ResidencePicker
                    value={residence}
                    onChange={setResidence}
                    label="محدوده مدیریت"
                    cityError={errors.managementCity}
                  />
                  {errors.managementProvince && (
                    <p className="mt-1 text-xs font-semibold text-danger-fg">
                      {errors.managementProvince}
                    </p>
                  )}
                </section>

                <section
                  id="manager-application-account"
                  className={`rounded-2xl border p-4 ${editSection === 'account' ? 'border-[#0d8057] bg-[#f8fcf8]' : 'border-[#e6e9e2] bg-white'}`}
                >
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#174d3b]">
                    <LockKeyhole className="size-4" aria-hidden /> عکس و اطلاعات ورود
                  </h2>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dce6dc] bg-[#eef6ef] text-[#2b7354]">
                        {avatarPreview ? (
                          <img
                            src={fileUrl(avatarPreview)}
                            alt="پیش‌نمایش عکس پروفایل"
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserRound className="size-7" aria-hidden />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#244b39]">تصویر پروفایل</p>
                        <p className="mt-1 text-xs leading-5 text-[#7e8981]">
                          PNG، JPEG یا WebP · حداکثر ۵ مگابایت
                        </p>
                      </div>
                    </div>
                    <input
                      ref={avatarInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      aria-label="انتخاب تصویر پروفایل"
                      onChange={uploadAvatar}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      loading={busy === 'avatar'}
                      icon={<Camera className="size-4" aria-hidden />}
                      onClick={() => avatarInput.current?.click()}
                    >
                      {avatarUploadId ? 'تغییر تصویر' : 'انتخاب تصویر'}
                    </Button>
                  </div>
                  {errors.avatar && (
                    <p className="mt-2 text-xs font-semibold text-danger-fg">{errors.avatar}</p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="رمز عبور برای ورود بعد از تأیید"
                      type="password"
                      ltr
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      error={errors.password}
                      hint="حداقل ۸ نویسه و شامل حرف و عدد"
                      disabled={Boolean(busy)}
                    />
                    <Input
                      label="تکرار رمز عبور"
                      type="password"
                      ltr
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      error={errors.confirmPassword}
                      disabled={Boolean(busy)}
                    />
                  </div>
                </section>

                <div className="rounded-2xl border border-[#f0ddbd] bg-[#fff9ed] p-3 text-xs leading-6 text-[#765f3d]">
                  <div className="flex items-center gap-2 font-extrabold">
                    <CircleAlert className="size-4" aria-hidden /> تأیید شماره با پیامک انجام
                    نمی‌شود
                  </div>
                  تا زمان تصمیم ادمین، حساب شما غیرفعال است. ادمین باید اطلاعات و مالکیت شماره تماس
                  را پیش از فعال‌سازی بررسی کند.
                </div>
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  {editSection ? (
                    <Button type="button" variant="ghost" onClick={() => setScreen('review')}>
                      بازگشت به بازبینی
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" onClick={returnToPhone}>
                      انصراف
                    </Button>
                  )}
                  <Button type="submit" size="lg">
                    بازبینی اطلاعات
                    <ClipboardCheck className="size-4" aria-hidden />
                  </Button>
                </div>
              </form>
            )}

            {screen === 'review' && (
              <div className="flex flex-col gap-4">
                <ReviewSection title="اطلاعات هویتی" onEdit={() => edit('identity')}>
                  <ReviewRow label="نام و نام خانوادگی" value={fullName.trim() || '—'} />
                  <ReviewRow label="شماره موبایل" value={toPersianDigits(phone)} ltr />
                  <ReviewRow label="کد ملی" value={toPersianDigits(nationalCode)} ltr />
                </ReviewSection>
                <ReviewSection title="محدوده مدیریت" onEdit={() => edit('area')}>
                  <ReviewRow label="استان" value={residence.province || '—'} />
                  <ReviewRow label="شهر" value={residence.city || '—'} />
                </ReviewSection>
                <ReviewSection title="تصویر و اطلاعات ورود" onEdit={() => edit('account')}>
                  <div className="flex items-center gap-3">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dce6dc] bg-[#eef6ef] text-[#2b7354]">
                      {avatarPreview ? (
                        <img
                          src={fileUrl(avatarPreview)}
                          alt="تصویر پروفایل انتخاب‌شده"
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-6" aria-hidden />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#244b39]">تصویر پروفایل انتخاب شد</p>
                      <p className="mt-1 text-xs text-[#7e8981]">
                        رمز عبور برای ورود امن ثبت می‌شود و در بازبینی نمایش داده نمی‌شود.
                      </p>
                    </div>
                  </div>
                </ReviewSection>
                <div className="rounded-2xl border border-[#dbe8dc] bg-[#f5faf5] p-4 text-sm leading-7 text-[#546b5f]">
                  <div className="flex items-center gap-2 font-extrabold text-[#174d3b]">
                    <ShieldCheck className="size-5" aria-hidden /> قبل از ارسال
                  </div>
                  پس از تأیید ادمین، حساب فعال می‌شود و می‌توانید با همین شماره و رمز وارد پنل مدیر
                  خود شوید. شماره موبایل در این مرحله با پیامک تأیید نشده است.
                </div>
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => setScreen('apply')}>
                    ویرایش اطلاعات
                  </Button>
                  <Button
                    loading={busy === 'request'}
                    size="lg"
                    onClick={() => void submitRequest()}
                  >
                    ارسال درخواست به ادمین
                    <ArrowLeft className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}

            {notice && (
              <div className="flex flex-col gap-4">
                <AccessStatus notice={notice} />
                {notice.state === 'rejected' && !appealOpen && (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <Button variant="ghost" onClick={returnToPhone}>
                      انصراف
                    </Button>
                    <Button
                      onClick={() => setAppealOpen(true)}
                      icon={<Pencil className="size-4" aria-hidden />}
                    >
                      درخواست بازبینی
                    </Button>
                  </div>
                )}
                {notice.state === 'rejected' && appealOpen && (
                  <form
                    onSubmit={submitAppeal}
                    className="flex flex-col gap-3"
                    aria-busy={busy === 'appeal'}
                  >
                    <Textarea
                      label="پیام درخواست بازبینی"
                      value={appealMessage}
                      onChange={(event) => setAppealMessage(event.target.value)}
                      minLength={10}
                      maxLength={800}
                      rows={5}
                      hint="توضیح دهید چه نکته‌ای را می‌خواهید دوباره بررسی کنیم."
                    />
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                      <Button type="button" variant="ghost" onClick={() => setAppealOpen(false)}>
                        انصراف
                      </Button>
                      <Button type="submit" loading={busy === 'appeal'}>
                        ارسال پیام برای بازبینی
                      </Button>
                    </div>
                  </form>
                )}
                {notice.state !== 'rejected' && (
                  <Button variant="secondary" onClick={returnToPhone}>
                    بازگشت
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
        <footer className="text-center text-xs leading-6 text-[#718077]">
          اطلاعات هویتی فقط برای بررسی درخواست دسترسی مدیر استفاده می‌شود.
        </footer>
      </div>

      <Modal
        open={confirmationOpen}
        onClose={() => {
          setConfirmationOpen(false);
          setScreen('phone');
        }}
        title="درخواست دسترسی ثبت شد"
        size="md"
        footer={
          <Button
            block
            onClick={() => {
              setConfirmationOpen(false);
              setScreen('phone');
            }}
          >
            متوجه شدم
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-[#e6f4ea] text-[#0b7850]">
            <Check className="size-8" aria-hidden />
          </span>
          <p className="text-sm leading-7 text-text-secondary">
            درخواست و اطلاعات شما برای بررسی ادمین ارسال شد. پس از تأیید، حساب فعال می‌شود و با همین
            شماره موبایل و رمز می‌توانید وارد پنل مدیر خود شوید.
          </p>
          <p className="rounded-xl bg-[#fff8e9] px-3 py-2 text-xs leading-6 text-[#765f3d]">
            شماره با پیامک تأیید نشده است؛ برای پیگیری وضعیت، دوباره به همین صفحه برگردید و با شماره
            و رمز ثبت‌شده وارد شوید.
          </p>
        </div>
      </Modal>
    </main>
  );
}

function ErrorMessage({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/20 bg-danger-light px-3 py-2 text-sm leading-6 text-danger-fg"
    >
      {children}
    </p>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e4e9df] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-black text-[#174d3b]">{title}</h2>
        <button
          type="button"
          aria-label={`ویرایش ${title}`}
          onClick={onEdit}
          className="pressable grid size-11 place-items-center rounded-xl text-[#0b704e] hover:bg-[#eef7ef]"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[#77837a]">{label}</span>
      <b
        dir={ltr ? 'ltr' : undefined}
        className={ltr ? 'text-left text-[#244b39]' : 'text-[#244b39]'}
      >
        {value}
      </b>
    </div>
  );
}

function AccessStatus({ notice }: { notice: AccessNotice }) {
  const isRejected = notice.state === 'rejected';
  const isPending = notice.state === 'pending';
  const isReview = notice.state === 'review_requested';
  const Icon = isRejected
    ? CircleAlert
    : isPending
      ? ClipboardCheck
      : isReview
        ? BadgeCheck
        : ShieldCheck;
  const tone = isRejected
    ? 'border-[#f0cbc5] bg-[#fff5f3] text-[#863d33]'
    : isPending || isReview
      ? 'border-[#d7e8d8] bg-[#f5faf5] text-[#315c45]'
      : 'border-[#eadfca] bg-[#fff9ed] text-[#765f3d]';

  return (
    <Card className={`flex flex-col gap-3 border ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/70">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-black">
            {isRejected
              ? 'درخواست دسترسی تأیید نشد'
              : isPending
                ? 'در انتظار بررسی ادمین'
                : isReview
                  ? 'درخواست بازبینی ارسال شد'
                  : 'دسترسی مدیر فعال نیست'}
          </h2>
          <p className="mt-1 text-sm leading-7">{notice.message}</p>
          {isRejected && notice.reviewNote && (
            <div className="mt-3 rounded-xl border border-[#f0d7d2] bg-white/80 p-3 text-sm leading-7">
              <span className="font-extrabold">توضیح ادمین: </span>
              {notice.reviewNote}
            </div>
          )}
        </div>
      </div>
      {isRejected && (
        <p className="border-t border-current/10 pt-2 text-xs leading-6">
          می‌توانید درخواست بازبینی بفرستید یا برای اکنون از این صفحه خارج شوید. شماره با پیامک
          تأیید نشده است.
        </p>
      )}
    </Card>
  );
}
