import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Fingerprint, Phone, RefreshCw, UserRound } from 'lucide-react';
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
 * Marketer sign-in / sign-up — visual truth: the «صفحه ثبت نام و ورود» reference board,
 * rebuilt on the high-quality generated assets (`/brand/auth/*`).
 * Functional truth preserved: passwordless phone-or-national-code identity, province-dependent
 * identity kind, unknown-identifier → sign-up conversion, validations, API payloads, redirects.
 *
 * Measured design specs (board px × 390/275): card r28, input h50 r14 (#F4F0E9),
 * CTA h68 full-pill #0E6E4E with a ~50px arrow circle at the end side, progress h10,
 * step titles ~26px extrabold, back = 40px circle with a left chevron.
 */
type Mode = 'login' | 'register';
type Phase = 'form' | 'loading' | 'success' | 'error';

const STEP_DEFS = [
  {
    title: 'نام و نام خانوادگی',
    desc: 'لطفاً نام و نام خانوادگی خود را وارد کنید تا حساب شما ایجاد شود.',
    art: '/brand/auth/auth-step-name.png',
    bubble: 'اول با هم آشنا بشیم 😊',
    bubbleSide: 'right' as const,
  },
  {
    title: 'محل فعالیت شما',
    desc: 'لطفاً محل فعالیت خود را مشخص کنید تا محتوای مناسب‌تری به شما ارائه دهیم.',
    art: '/brand/auth/auth-step-area.png',
    bubble: '',
    bubbleSide: 'right' as const,
  },
  {
    title: 'استان و شهر',
    desc: 'استان و شهر محل فعالیت خود را انتخاب کنید.',
    art: '/brand/auth/auth-step-city.png',
    bubble: 'این اطلاعات به ما کمک می‌کند تا محتوای منطقه‌ای مرتبط با شهر شما را پیشنهاد دهیم.',
    bubbleSide: 'left' as const,
  },
  {
    title: 'کد ملی یا شماره موبایل',
    desc: 'با توجه به محل فعالیت شما، لطفاً کد ملی یا شماره موبایل خود را وارد کنید.',
    art: '/brand/auth/auth-step-id.png',
    bubble: 'با این اطلاعات حساب شما ایجاد می‌شود و می‌توانید وارد شوید.',
    bubbleSide: 'left' as const,
  },
] as const;

/** Input surface of the reference (inline styles beat the shared 8px token for exactness). */
const inputStyle: CSSProperties = { borderRadius: 14, background: '#F4F0E9', minHeight: 50 };

/** Signature pill CTA: label centred, circular arrow at the end side (reference buttons). */
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
  /** Looks inactive (like the reference's unfinished-step button) but stays clickable for validation. */
  soft?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'retry';
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  const isRetry = tone === 'retry';
  const surface = isRetry
    ? 'bg-[#f6d7d3] text-[#b53c34]'
    : soft
      ? 'bg-[#86af99] text-[#17352a] cursor-not-allowed'
      : 'bg-[#0e6e4e] text-white hover:bg-[#0b5c41]';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        minHeight: 60,
        // Color changes immediately with validation so contrast checks never capture an in-between shade.
        transition:
          'transform var(--duration-fast) var(--ease-soft), box-shadow var(--duration-base) var(--ease-soft)',
        ...(soft ? { backgroundColor: '#86af99', color: '#17352a' } : {}),
      }}
      className={`pressable flex w-full items-center gap-3 rounded-full px-3 py-2.5 shadow-sm disabled:opacity-70 ${surface}`}
    >
      <span className="flex-1 text-center text-[17px] font-extrabold">{children}</span>
      <span
        aria-hidden
        className={
          isRetry
            ? 'grid size-10 place-items-center rounded-full bg-[#b53c34]/15'
            : 'grid size-10 place-items-center rounded-full bg-white/25'
        }
      >
        {isRetry ? <RefreshCw className="size-4.5" /> : <ArrowGlyph />}
      </span>
    </button>
  );
}

/** Circular-arrow glyph of the reference CTAs (arrow head toward the end side). */
function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

/** White speech bubble of the wizard illustrations (real text, live in the DOM). */
function SpeechBubble({ text, side }: { text: string; side: 'left' | 'right' }) {
  return (
    <div
      className={`absolute top-1 z-10 max-w-[62%] rounded-[16px] bg-white px-3.5 py-2.5 text-[12.5px] font-semibold leading-6 text-[#2e5c48] shadow-[0_8px_24px_-10px_rgba(11,45,31,0.35)] ${
        side === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      <span
        aria-hidden
        className={`absolute -bottom-2 size-4 rotate-45 rounded-[3px] bg-white ${
          side === 'right' ? 'right-6' : 'left-6'
        }`}
      />
      {text}
    </div>
  );
}

/** Cream wizard page frame (steps + async state cards). */
function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-[#FCF8F0] px-4 pb-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#DDF1E7]/70 blur-3xl"
      />
      <div className="relative z-10 w-full max-w-[460px]">{children}</div>
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
        <div className="mt-14 overflow-hidden rounded-[30px] border border-[#E9E1D5] bg-[#FFFDF8] p-7 text-center shadow-[0_18px_44px_-34px_rgba(22,66,53,0.42)]">
          {phase === 'loading' && (
            <>
              <img src="/brand/auth/auth-loading.png" alt="" className="mx-auto w-52 max-w-full" />
              <h1 className="mt-2 text-[22px] font-extrabold text-[#061a13]">
                در حال ایجاد حساب شما...
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#7a756a]">لطفاً چند لحظه صبر کنید...</p>
              <div className="mx-auto mt-5 h-2.5 w-4/5 overflow-hidden rounded-full bg-[#E7E4DC]">
                <div className="h-full w-2/3 rounded-full bg-[#0B7A60]" />
              </div>
            </>
          )}
          {phase === 'success' && (
            <>
              <img src="/brand/auth/auth-success.png" alt="" className="mx-auto w-56 max-w-full" />
              <h1 className="mt-2 text-[26px] font-extrabold text-[#061a13]">خوش اومدی!</h1>
              <p className="mt-2 text-sm leading-7 text-[#7a756a]">
                حساب شما با موفقیت ایجاد شد. در حال انتقال به داشبورد...
              </p>
            </>
          )}
          {phase === 'error' && (
            <>
              <img src="/brand/auth/auth-error.png" alt="" className="mx-auto w-56 max-w-full" />
              <h1 className="mt-2 text-[22px] font-extrabold text-[#b53c34]">
                اطلاعات وارد شده صحیح نیست
              </h1>
              <p className="mt-2 text-sm leading-7 text-[#7a756a]">
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

  // ── login: the welcome screen (bg art + mascot + white card) ───────────────────────
  if (mode === 'login') {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-[#FCF8F0] px-4 pb-6 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#E5F3EA] blur-3xl"
        />

        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-2.75rem)] w-full max-w-[460px] flex-col justify-center">
          <section className="relative overflow-hidden rounded-[32px] bg-[#075A46] shadow-[0_22px_52px_-34px_rgba(4,78,59,0.58)]">
            <img
              src="/brand/auth/auth-welcome-bg.png"
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover opacity-90"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,65,49,.12),rgba(3,65,49,.56))]"
            />

            <div className="relative z-10 flex min-h-[355px] flex-col px-6 pt-7">
              <h1 className="text-start text-[30px] font-black leading-[1.55] text-white">
                به سیلانه سبز
                <br />
                خوش آمدی!
              </h1>
              <p className="mt-1 text-start text-[14px] font-medium text-white/85">
                یادگیری امروز، موفقیت فردا
              </p>
              <img
                src="/brand/auth/auth-welcome-mascot.png"
                alt=""
                aria-hidden
                className="pointer-events-none mx-auto mt-auto w-[320px] max-w-[92%] select-none object-contain drop-shadow-[0_20px_24px_rgba(0,0,0,.18)]"
              />
            </div>
          </section>

          <section className="relative z-20 mx-3 -mt-8 rounded-[28px] border border-[#EAE2D6] bg-[#FFFDF8] p-5 shadow-[0_20px_52px_-34px_rgba(27,61,51,0.5)] sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-black text-[#153E35]">ورود به حساب</h2>
              <p className="mt-1 text-sm leading-7 text-[#596A65]">
                شماره موبایل یا کد ملی ثبت‌شده را وارد کنید.
              </p>
            </div>

            <form
              onSubmit={submitLogin}
              noValidate
              className="flex flex-col gap-3.5"
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
                style={inputStyle}
                disabled={busy}
              />
              <PillButton type="submit" loading={busy}>
                ورود و ادامه
              </PillButton>
            </form>

            {info && (
              <p
                role="status"
                className="mt-3 rounded-2xl bg-[#EAF5EF] px-3 py-2 text-xs leading-6 text-[#2C5C48]"
              >
                {info}
              </p>
            )}

            <p className="mt-4 text-center text-[11px] leading-6 text-[#625D55]">
              با ورود یا ثبت‌نام، قوانین استفاده و حریم خصوصی سیلانه سبز را می‌پذیرید.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // ── register: four-step wizard (illustration → title → desc → fields → CTA) ─────────
  const stepDef = STEP_DEFS[Math.min(Math.max(step, 1), 4) - 1] ?? STEP_DEFS[0];
  return (
    <AuthFrame>
      <div className="pb-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="بازگشت"
            onClick={() => (step > 1 ? setStep(step - 1) : switchMode('login'))}
            className="pressable grid size-11 place-items-center rounded-full border border-[#E7DED1] bg-[#FFFDF8] text-[#315A52] shadow-sm"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <p className="rounded-full bg-[#EEF6F1] px-3 py-1.5 text-[13px] font-bold text-[#315A52]">
            مرحله {toPersianDigits(step)} از {toPersianDigits(4)}
          </p>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#E8E5DD]">
          <div
            className="h-full rounded-full bg-[#0B7A60] transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="relative mt-5 overflow-hidden rounded-[28px] bg-[#FFFDF8]/70 px-3 pt-2">
          <img
            src={stepDef.art}
            alt=""
            aria-hidden
            className="mx-auto max-h-[290px] w-full max-w-[330px] object-contain"
          />
          {stepDef.bubble ? <SpeechBubble text={stepDef.bubble} side={stepDef.bubbleSide} /> : null}
        </div>

        <h1 className="mt-5 text-[27px] font-black text-[#113F35]">{stepDef.title}</h1>
        <p className="mt-1.5 text-[14px] leading-7 text-[#596A65]">{stepDef.desc}</p>

        {step === 1 && (
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
              style={inputStyle}
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
              style={inputStyle}
              disabled={busy}
            />
          </div>
        )}

        {step === 2 && (
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
        )}

        {step === 3 && (
          <div className="mt-4">
            <ResidencePicker
              value={residence}
              onChange={handleResidenceChange}
              label="استان"
              provinceError={errors.province}
              cityError={errors.city}
              disabled={busy}
            />
          </div>
        )}

        {step === 4 && (
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
              style={inputStyle}
              disabled={busy}
            />
          </div>
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
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            className="min-h-12 text-[13px] font-bold text-[#0e6e4e]"
            onClick={() => switchMode('login')}
          >
            حساب دارید؟ وارد شوید
          </button>
        </div>
      </div>
    </AuthFrame>
  );
}
