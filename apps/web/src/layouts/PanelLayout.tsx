import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, UserRound, type LucideIcon } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageTransition } from '@/components/layout/PageTransition';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/format';
import { isItemActive } from '@/lib/navMatch';

export interface PanelNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that keep this entry highlighted (detail pages). */
  match?: string[];
}

/** RTL manager shell: persistent team navigation, clear account context, compact mobile dock. */
export function PanelLayout({
  title,
  items,
  mobileItems = items.slice(0, 5),
}: {
  title: string;
  items: PanelNavItem[];
  mobileItems?: PanelNavItem[];
}) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  return (
    <div dir="rtl" className="min-h-dvh bg-[#f5f7f5]">
      <header className="sticky top-0 z-30 border-b border-[#e4e9e5] bg-white/95 shadow-[0_2px_12px_rgba(26,51,39,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <AppLogo className="shrink-0" />
            <span className="hidden h-8 w-px bg-[#e3e9e4] sm:block" aria-hidden />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-extrabold text-[#183d30]">{title}</p>
              <p className="truncate text-[11px] text-[#73847a]">فضای اختصاصی مدیریت تیم</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/manager/profile"
              className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-start transition-colors hover:bg-[#f2f6f2] sm:px-3"
              aria-label={`نمایش پروفایل ${user?.name ?? ''}`}
            >
              <span className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-[#dce8de] bg-[#eaf4ec] text-sm font-black text-[#176e50]">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  user?.name.trim().charAt(0)
                )}
              </span>
              <span className="hidden max-w-40 sm:block">
                <span className="block truncate text-xs font-extrabold text-[#183d30]">
                  {user?.name}
                </span>
                <span className="block truncate text-[10px] text-[#74857b]">
                  {user ? ROLE_LABEL[user.role] : ''}
                </span>
              </span>
              <UserRound className="hidden size-4 text-[#74857b] sm:block" aria-hidden />
            </Link>
            <span className="h-8 w-px bg-[#e3e9e4]" aria-hidden />
            <button
              type="button"
              onClick={() => void logout()}
              className="flex min-h-12 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-[#65756c] transition-colors hover:bg-[#fff2ee] hover:text-[#a43d2d] sm:px-3 sm:text-sm"
              aria-label="خروج از حساب"
            >
              <LogOut className="size-[18px]" aria-hidden />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-[1600px]">
        <Sidebar title={title} items={items} />
        <main className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-5 lg:px-8 lg:pb-8 lg:pt-7">
          <div className="mx-auto max-w-[1380px]">
            <Breadcrumb title={title} items={items} />
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <nav
        aria-label="ناوبری پنل مدیر"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7e0] bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 shadow-[0_-8px_28px_rgba(23,46,35,0.10)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl items-stretch justify-around gap-1">
          {mobileItems.map(({ to, label, icon: Icon, match }) => (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to.split('/').length <= 2}
                aria-label={label}
                aria-current={
                  isItemActive(pathname, { to, label, icon: Icon, match }) ? 'page' : undefined
                }
                className={({ isActive }) => {
                  const active =
                    isActive || isItemActive(pathname, { to, label, icon: Icon, match });
                  return cn(
                    'flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-bold transition-colors',
                    active ? 'bg-[#eaf4ec] text-[#126c4b]' : 'text-[#708078] hover:bg-[#f4f7f4]',
                  );
                }}
              >
                <Icon className="size-[18px]" aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
