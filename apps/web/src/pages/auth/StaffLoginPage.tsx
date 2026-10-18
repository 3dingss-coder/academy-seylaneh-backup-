import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, UserRound } from 'lucide-react';
import { Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TITLE = { admin: 'پنل ادمین', manager: 'پنل مدیر' } as const;

/** Username + password sign-in shown at /admin and /manager when nobody is signed in.
 *  Visual truth: «ورود ادمین / منتور» card of the auth reference board. */
export function StaffLoginPage({ panel }: { panel: 'admin' | 'manager' }) {
  const { staffLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('نام کاربری و رمز عبور را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      await staffLogin({ panel, username: username.trim(), password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'خطایی رخ داد. دوباره تلاش کنید.');
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#013021]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -start-40 size-[420px] rounded-full bg-[#0e6e4e]/40 blur-3xl"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center px-4 pb-10">
        <div className="mt-12 flex items-end justify-center gap-1">
          {/* Staff sign-in stays formal: brand mark only, no mascot (mascot guide: Admin/Manager rare). */}
          <span className="rounded-[18px] bg-white p-3 shadow-lg">
            <img
              src="/icons/logo-full.png"
              alt="هلدینگ سیلانه‌سبز"
              width={160}
              height={64}
              className="h-12 w-auto"
            />
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-white">آکادمی سیلانه</h1>
        <p className="mt-1 text-sm text-white/80">{TITLE[panel]}</p>

        <div className="mt-8 w-full rounded-[24px] bg-[#fefcf9] p-6 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[#fba032]">
              <Lock className="size-4.5 text-[#061a13]" />
            </span>
            <h2 className="text-lg font-extrabold text-[#061a13]">ورود ادمین / منتور</h2>
          </div>
          <p className="mt-1.5 text-xs leading-6 text-[#8a8578]">ورود مشترکان ادمین‌ها و منتورها</p>

          <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3" aria-busy={busy}>
            <Input
              label="نام کاربری"
              ltr
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              icon={<UserRound className="size-5" />}
              disabled={busy}
            />
            <Input
              label="رمز عبور"
              type="password"
              ltr
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<KeyRound className="size-5" />}
              disabled={busy}
            />
            {error && (
              <p role="alert" className="rounded-2xl bg-[#f6d7d3] px-3 py-2 text-sm text-[#b53c34]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="pressable mt-2 flex min-h-14 w-full items-center gap-3 rounded-full bg-[#0e6e4e] px-3 py-3 text-white shadow-sm hover:bg-[#0b5c41] disabled:cursor-not-allowed disabled:bg-[#86af99]"
            >
              <span className="flex-1 text-center text-base font-extrabold">
                {busy ? 'در حال ورود…' : 'ورود'}
              </span>
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white/20">
                <svg
                  viewBox="0 0 24 24"
                  className="size-4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
