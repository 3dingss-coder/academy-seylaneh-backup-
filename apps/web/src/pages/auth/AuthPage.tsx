import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Fingerprint, Phone, RefreshCw, UserRound } from 'lucide-react';
import { ResidencePicker, type Residence } from '@/components/common/ResidencePicker';
import { Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { canAccess } from '@/lib/roles';
import { toLatinDigits, toPersianDigits } from '@/lib/digits';
import {
  isNationalCodeShape,
  normalizeNationalCode,
  provinceUsesNationalCode,
} from '@/lib/nationalCode';
import { track } from '@/lib/telemetry';
import type { Role } from '@/lib/types';

/**
 * Marketer sign-in / sign-up — visual truth: the «صفحه ثبت نام و ورود» reference board.
 * - Login = the deep-green welcome screen + white card.
 * - Sign-up = a four-step wizard (name → activity location → province/city → identity).
 * Functional truth preserved: passwordless phone-or-national-code identity, province-dependent
 * identity kind, unknown-identifier → sign-up conversion, validations and the API payloads.
 */
type Mode = 'login' | 'register';
type Phase = 'form' | 'loading' | 'success' | 'error';

const STEP_TITLES = [
  {
    title: 'نام و نام خانوادگی',
    desc: 'لطفاً نام و نام خانوادگی خود را وارد کنید تا حساب شما ایجاد شود.',
  },
  {
    title: 'محل فعالیت شما',
    desc: 'لطفاً محل فعالیت خود را مشخص کنید تا محتوای مناسب‌تری به شما ارائه دهیم.',
  },
  { title: 'استان و شهر', desc: 'استان و شهر محل فعالیت خود را انتخاب کنید.' },
  {
    title: 'کد ملی یا شماره موبایل',
    desc: 'با توجه به محل فعالیت شما، لطفاً کد ملی یا شماره موبایل خود را وارد کنید.',
  },
] as const;

/** Signature pill CTA of the reference: label centred, circular arrow at the end side. */
function PillButton({
  children,
  disabled,
  soft,
  loading,
  tone = 'primary',
  type = 'button',
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  /** Looks inactive (design) but stays clickable so validation copy can explain what is missing. */
  soft?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'retry';
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  const isRetry = tone === 'retry';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={
        isRetry
          ? 'pressable flex min-h-14 w-full items-center gap-3 rounded-full bg-[#f6d7d3] px-3 py-3 text-[#b53c34] disabled:opacity-60'
          : `pressable flex min-h-14 w-full items-center gap-3 rounded-full px-3 py-3 text-white shadow-sm ${
              disabled || soft
                ? 'cursor-not-allowed bg-[#86af99]'
                : 'bg-[#0e6e4e] hover:bg-[#0b5c41]'
            }`
      }
    >
      <span className="flex-1 text-center text-base font-extrabold">{children}</span>
      <span
        aria-hidden
        className={
          isRetry
            ? 'grid size-9 place-items-center rounded-full bg-[#b53c34]/15'
            : 'grid size-9 place-items-center rounded-full bg-white/20'
        }
      >
        {isRetry ? <RefreshCw className="size-4.5" /> : <ArrowLeft className="size-4.5" />}
      </span>
    </button>
  );
}

/** Cream wizard page frame (steps + async state cards). */
function AuthFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#fcf6f0] px-4 pb-10">
      <div className={`w-full ${wide ? 'max-w-[480px]' : 'max-w-[420px]'}`}>{children}</div>
    </div>
  );
}

export function AuthPage({ initial = 'login' }: { initial?: Mode }) {
  const { status, user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>(initial);
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<Phase>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [residence, setResidence] = useState<Residence>({ province: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated' && user) {
    const from = (loc.state as { from?: string } | null)?.from;
    return (
      <Navigate
        to={from && from !== '/login' && canAccess(user.role, from) ? from : homePathFor(user.role)}
        replace
      />
    );
  }

  const requiresNationalCode = provinceUsesNationalCode(residence.province);
  const fullName = `${firstName} ${lastName}`.trim();

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setStep(1);
    setPhase('form');
    if (nextMode === 'register') track('signup_started');
    setErrors({});
    setInfo('');
  };

  const handleResidenceChange = (next: Residence) => {
    if (next.province && next.province !== residence.province && identifier) {
      const nextUsesNationalCode = provinceUsesNationalCode(next.province);
      const existingLooksLikeNationalCode = isNationalCodeShape(identifier);
      const existingLooksLikePhone = /^09\d{9}$/.test(toLatinDigits(identifier.trim()));
      if (
        (nextUsesNationalCode && existingLooksLikePhone) ||
        (!nextUsesNationalCode && existingLooksLikeNationalCode)
      ) {
        // Don't leave a phone number in the national-code field (or vice versa) after a province change.
        setIdentifier('');
        setErrors((current) => {
          const nextErrors = { ...current };
          delete nextErrors.identifier;
          return nextErrors;
        });
        setInfo(
          nextUsesNationalCode
            ? 'استان انتخاب‌شده کد ملی می‌خواهد؛ شماره موبایل قبلی پاک شد. در مرحلهٔ آخر، کد ملی را وارد کنید.'
            : 'استان انتخاب‌شده شماره موبایل می‌خواهد؛ کد ملی قبلی پاک شد. در مرحلهٔ آخر، شماره موبایل را وارد کنید.',
        );
      }
    }
    setResidence(next);
  };

  const validateStep = (which: number) => {
    const e: Record<string, string> = {};
    if (which === 1) {
      if (firstName.trim().length < 1) e.firstName = 'نام را بنویسید.';
      if (lastName.trim().length < 1) e.lastName = 'نام خانوادگی را بنویسید.';
      else if (fullName.length < 2) e.firstName = 'نام و نام خانوادگی را بنویسید.';
    }
    if (which === 2 && !residence.province) e.province = 'استان محل فعالیت خود را انتخاب کنید.';
    if (which === 3 && !residence.city) e.city = 'شهر محل فعالیت خود را انتخاب کنید.';
    if (which === 4) {
      const value = toLatinDigits(identifier.trim());
      if (requiresNationalCode && !normalizeNationalCode(value))
        e.identifier = 'کد ملی معتبر ۱۰ رقمی وارد کنید.';
      else if (!requiresNationalCode && !/^09\d{9}$/.test(value))
        e.identifier = 'شماره موبایل معتبر وارد کنید.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateLogin = () => {
    const e: Record<string, string> = {};
    const value = toLatinDigits(identifier.trim());
    if (isNationalCodeShape(value)) {
      if (!normalizeNationalCode(value)) e.identifier = 'کد ملی معتبر ۱۰ رقمی وارد کنید.';
    } else if (!/^09\d{9}$/.test(value)) {
      e.identifier = 'شماره موبایل ۱۱ رقمی یا کد ملی معتبر وارد کنید.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const finish = async (u: { role: Role; onboardedAt?: string | null }) => {
    const from = (loc.state as { from?: string } | null)?.from;
    const target =
      u.role === 'marketer' && !u.onboardedAt
        ? '/onboarding'
        : from && from !== '/login' && canAccess(u.role, from)
          ? from
          : homePathFor(u.role);
    setPhase('success');
    await new Promise((resolve) => setTimeout(resolve, 1400));
    nav(target, { replace: true });
  };

  const submitLogin = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validateLogin()) return;
    setBusy(true);
    const id = toLatinDigits(identifier.trim());
    const identityKind = isNationalCodeShape(id) ? 'nationalCode' : 'phone';
    try {
      const u = await login({ kind: identityKind, value: id });
      await finish(u);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') {
        setMode('register');
        track('signup_started');
        setStep(1);
        setErrors({});
        setInfo(
          `این ${identityKind === 'nationalCode' ? 'کد ملی' : 'شماره موبایل'} هنوز ثبت‌نام نشده است. نام و محل فعالیت خود را وارد کنید تا حساب‌تان ساخته شود.`,
        );
      } else if (e instanceof ApiError && Object.keys(e.fields).length) {
        setErrors({
          ...e.fields,
          ...(e.fields[identityKind] ? { identifier: e.fields[identityKind] } : {}),
        });
      } else if (e instanceof ApiError && e.code === 'CONFLICT') {
        setErrors({ identifier: e.message });
      } else {
        setPhase('error');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    for (const which of [1, 2, 3, 4] as const) {
      if (!validateStep(which)) {
        setStep(which);
        return;
      }
    }
    setBusy(true);
    setPhase('loading');
    const id = toLatinDigits(identifier.trim());
    try {
      const u = requiresNationalCode
        ? await register({
            name: fullName,
            nationalCode: id,
            province: residence.province,
            city: residence.city,
          })
        : await register({
            name: fullName,
            phone: id,
            province: residence.province,
            city: residence.city,
          });
      await finish(u);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        const identityField = requiresNationalCode ? 'nationalCode' : 'phone';
        setErrors({
          ...e.fields,
          ...(e.fields[identityField] ? { identifier: e.fields[identityField] } : {}),
        });
        setPhase('form');
      } else if (e instanceof ApiError && e.code === 'CONFLICT') {
        setErrors({ identifier: e.message });
        setPhase('form');
        setStep(4);
      } else {
        setPhase('error');
      }
    } finally {
      setBusy(false);
    }
  };

  const nextFrom = (which: number) => () => {
    if (!validateStep(which)) return;
    setInfo('');
    setStep(Math.min(4, which + 1));
  };

  // ── designed async state cards (loading / success / error) ─────────────────────────
  if (phase === 'loading' || phase === 'success' || phase === 'error') {
    return (
      <AuthFrame>
        <div className="mt-16 rounded-[24px] border border-[#eae1d4] bg-[#fefcf9] p-7 text-center shadow-sm">
          {phase === 'loading' && (
            <>
              <img src="/brand/auth/loading.png" alt="" className="mx-auto w-56 max-w-full" />
              <h1 className="mt-3 text-xl font-extrabold text-[#061a13]">
                در حال ایجاد حساب شما...
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#6b675c]">لطفاً چند لحظه صبر کنید...</p>
              <div className="mx-auto mt-5 h-2 w-4/5 overflow-hidden rounded-full bg-[#eae1d4]">
                <div className="h-full w-2/3 rounded-full bg-[#1e8650]" />
              </div>
            </>
          )}
          {phase === 'success' && (
            <>
              <img src="/brand/auth/success.png" alt="" className="mx-auto w-56 max-w-full" />
              <h1 className="mt-3 text-2xl font-extrabold text-[#061a13]">خوش اومدی!</h1>
              <p className="mt-2 text-sm leading-7 text-[#6b675c]">
                حساب شما با موفقیت ایجاد شد. در حال انتقال به داشبورد...
              </p>
            </>
          )}
          {phase === 'error' && (
            <>
              <img src="/brand/auth/error.png" alt="" className="mx-auto w-56 max-w-full" />
              <h1 className="mt-3 text-xl font-extrabold text-[#b53c34]">
                اطلاعات وارد شده صحیح نیست
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#6b675c]">
                لطفاً اطلاعات را بررسی کنید و دوباره تلاش کنید.
              </p>
              <div className="mx-auto mt-5 max-w-[280px]">
                <PillButton tone="retry" onClick={() => setPhase('form')}>
                  تلاش مجدد
                </PillButton>
              </div>
            </>
          )}
        </div>
      </AuthFrame>
    );
  }

  // ── login: deep-green welcome screen + white card ─────────────────────────────────
  if (mode === 'login') {
    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#013021]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -start-40 size-[420px] rounded-full bg-[#0e6e4e]/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -end-32 size-[380px] rounded-full bg-[#0e6e4e]/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-32 size-[420px] rounded-full bg-[#1a7d55]/45 blur-3xl"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-4">
          <h1 className="mt-12 text-center text-[28px] font-extrabold leading-10 text-white sm:text-3xl">
            به سیلانه سبز
            <br />
            خوش آمدی!
          </h1>
          <p className="mt-2 text-center text-sm text-white/80">یادگیری امروز، موفقیت فردا</p>
          <div className="mt-2 flex flex-1 items-center justify-center">
            <img
              src="/brand/auth/welcome.png"
              alt=""
              aria-hidden
              className="w-[320px] max-w-full [mask-image:radial-gradient(118%_112%_at_50%_44%,#000_55%,transparent_93%)]"
            />
          </div>

          <div className="-mt-6 rounded-[24px] bg-[#fefcf9] p-5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.5)]">
            <form
              onSubmit={submitLogin}
              noValidate
              className="flex flex-col gap-3"
              aria-busy={busy}
            >
              <Input
                label="شماره موبایل یا کد ملی"
                placeholder="شماره موبایل یا کد ملی خود را وارد کنید"
                hideLabel
                ltr
                inputMode="tel"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                error={errors.identifier}
                icon={<Phone className="size-5" />}
                disabled={busy}
              />
              <PillButton type="submit" loading={busy}>
                ورود و ادامه
              </PillButton>
            </form>
            {info && (
              <p
                role="status"
                className="mt-3 rounded-2xl bg-[#eaf3ee] px-3 py-2 text-xs leading-6 text-[#2c5c48]"
              >
                {info}
              </p>
            )}
            <p className="mt-4 text-center text-[11px] leading-6 text-[#8a8578]">
              با ورود یا ثبت‌نام، قوانین استفاده و حریم خصوصی سیلانه سبز را می‌پذیرید.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── register: four-step wizard ────────────────────────────────────────────────────
  const stepDef = STEP_TITLES[Math.min(Math.max(step, 1), 4) - 1] ?? { title: '', desc: '' };
  return (
    <AuthFrame>
      <div className="pt-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="بازگشت"
            onClick={() => (step > 1 ? setStep(step - 1) : switchMode('login'))}
            className="pressable grid size-11 place-items-center rounded-full border border-[#e4dcce] bg-[#fefcf9] text-[#41413e]"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <p className="text-sm font-bold text-[#41413e]">
            مرحله {toPersianDigits(step)} از {toPersianDigits(4)}
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e4dcce]">
          <div
            className="h-full rounded-full bg-[#1e8650] transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold text-[#061a13]">{stepDef.title}</h1>
        <p className="mt-2 text-sm leading-7 text-[#6b675c]">{stepDef.desc}</p>

        {step === 1 && (
          <>
            <img src="/brand/auth/step-name.png" alt="" className="mx-auto mt-4 w-60 max-w-full" />
            <div className="mt-4 flex flex-col gap-3">
              <Input
                label="نام"
                placeholder="نام"
                hideLabel
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                error={errors.firstName}
                icon={<UserRound className="size-5" />}
                disabled={busy}
              />
              <Input
                label="نام خانوادگی"
                placeholder="نام خانوادگی"
                hideLabel
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                error={errors.lastName}
                icon={<UserRound className="size-5" />}
                disabled={busy}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <img src="/brand/auth/step-area.png" alt="" className="mx-auto mt-4 w-64 max-w-full" />
            <div className="mt-4">
              <ResidencePicker
                value={residence}
                onChange={handleResidenceChange}
                label="انتخاب محل فعالیت شما"
                placeholder="انتخاب محل فعالیت شما"
                hideCity
                hideLabel
                provinceError={errors.province}
                disabled={busy}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mt-2">
              <ResidencePicker
                value={residence}
                onChange={handleResidenceChange}
                label="استان"
                provinceError={errors.province}
                cityError={errors.city}
                disabled={busy}
              />
            </div>
            <img src="/brand/auth/step-city.png" alt="" className="mx-auto mt-4 w-52 max-w-full" />
            <p className="sr-only">
              این اطلاعات به ما کمک می‌کند تا محتوای منطقه‌ای مرتبط با شهر شما را پیشنهاد دهیم.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <img src="/brand/auth/step-id.png" alt="" className="mx-auto mt-4 w-64 max-w-full" />
            <p className="sr-only">با این اطلاعات حساب شما ایجاد می‌شود و می‌توانید وارد شوید.</p>
            <div className="mt-4">
              <Input
                label={requiresNationalCode ? 'کد ملی' : 'شماره موبایل'}
                placeholder={
                  requiresNationalCode ? 'کد ملی خود را وارد کنید' : 'شماره موبایل خود را وارد کنید'
                }
                ltr
                inputMode={requiresNationalCode ? 'numeric' : 'tel'}
                autoComplete={requiresNationalCode ? 'off' : 'tel'}
                maxLength={requiresNationalCode ? 10 : undefined}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                error={errors.identifier}
                hint={
                  requiresNationalCode
                    ? 'برای ورودهای بعدی از همین کد ملی استفاده می‌شود.'
                    : undefined
                }
                icon={
                  requiresNationalCode ? (
                    <Fingerprint className="size-5" />
                  ) : (
                    <Phone className="size-5" />
                  )
                }
                disabled={busy}
              />
            </div>
          </>
        )}

        {info && (
          <p
            role="status"
            className="mt-3 rounded-2xl bg-[#eaf3ee] px-3 py-2 text-xs leading-6 text-[#2c5c48]"
          >
            {info}
          </p>
        )}

        <div className="mt-5">
          {step < 4 ? (
            <PillButton onClick={nextFrom(step)} soft={step === 2 && !residence.province}>
              ادامه
            </PillButton>
          ) : (
            <PillButton onClick={() => void submitRegister()} loading={busy}>
              ثبت‌نام و ورود
            </PillButton>
          )}
        </div>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="min-h-12 text-sm font-bold text-[#0e6e4e]"
            onClick={() => switchMode('login')}
          >
            حساب دارید؟ وارد شوید
          </button>
        </div>
      </div>
    </AuthFrame>
  );
}
