import { useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { homePathFor, useAuth } from '@/lib/auth';
import { PANEL_LABEL, panelOf } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { StaffLoginPage } from '@/pages/auth/StaffLoginPage';

export function FullPageSpinner() {
  return (
    <div
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#FCF8F0] px-6"
      role="status"
      aria-label="در حال بارگذاری"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 start-1/2 size-80 -translate-x-1/2 rounded-full bg-[#E6F3EA] blur-3xl"
      />
      <div className="relative z-10 flex min-w-48 flex-col items-center rounded-[28px] border border-[#E9E1D5] bg-[#FFFDF8] px-8 py-7 shadow-[0_18px_44px_-34px_rgba(22,66,53,0.42)]">
        <img
          src="/brand/mascot.webp"
          alt=""
          width={96}
          height={124}
          className="h-auto w-24 motion-safe:animate-float"
        />
        <Spinner className="mt-3 size-5 text-primary-fg" />
        <p className="mt-2 text-sm font-bold text-text-secondary">در حال آماده‌سازی...</p>
      </div>
    </div>
  );
}

/** Route guard: unauthenticated → /login; wrong role → own home (UI mirror of server RBAC). */
export function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous' || !user) {
    // /admin and /manager show their own username + password sign-in at the same URL.
    const panel = panelOf(loc.pathname);
    if (panel === 'admin' || panel === 'manager') return <StaffLoginPage panel={panel} />;
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  if (!roles.includes(user.role)) {
    // Panels (/admin, /manager) explain why instead of silently bouncing to another screen.
    const panel = panelOf(loc.pathname);
    if (panel === 'admin' || panel === 'manager')
      return <WrongAccount panel={panel} role={user.role} from={loc.pathname} />;
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  if (user.role === 'marketer' && !user.onboardedAt && loc.pathname !== '/onboarding')
    return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const ROLE_LABEL: Record<Role, string> = {
  marketer: 'بازاریاب',
  manager: 'مدیر',
  admin: 'ادمین',
  superadmin: 'مدیر ارشد',
};

/** Signed in with an account that can't open this panel: offer to switch accounts. */
function WrongAccount({
  panel,
  role,
  from,
}: {
  panel: 'admin' | 'manager';
  role: Role;
  from: string;
}) {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const switchAccount = async () => {
    setBusy(true);
    await logout();
    nav(from, { replace: true });
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-card bg-primary-light text-primary-fg">
          <ShieldAlert className="size-8" aria-hidden />
        </div>
        <h1 className="text-lg font-bold text-text">{PANEL_LABEL[panel]}</h1>
        <p className="mt-2 text-sm leading-7 text-text-secondary">
          شما با حساب «{ROLE_LABEL[role]}» وارد شده‌اید. برای ورود به {PANEL_LABEL[panel]} با حساب{' '}
          {panel === 'admin' ? 'ادمین' : 'مدیر'} وارد شوید.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={() => void switchAccount()} loading={busy}>
            ورود با حساب {panel === 'admin' ? 'ادمین' : 'مدیر'}
          </Button>
          <Button variant="secondary" onClick={() => nav(homePathFor(role), { replace: true })}>
            بازگشت به {PANEL_LABEL[panelOf(homePathFor(role)) as keyof typeof PANEL_LABEL]}
          </Button>
        </div>
      </div>
    </main>
  );
}
