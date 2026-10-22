import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpen,
  ChevronLeft,
  CircleHelp,
  LogOut,
  Menu,
  Package,
  Search,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageTransition } from '@/components/layout/PageTransition';
import { api } from '@/lib/api';
import { isItemActive } from '@/lib/navMatch';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/format';
import type { AdminBrand, AdminPackage, AdminProduct } from '@/lib/types';
import type { PanelNavItem } from '@/layouts/PanelLayout';

/** Admin shell shared by every admin route: RTL content, a persistent right rail, and responsive navigation. */
export function AdminPanelLayout({ title, items }: { title: string; items: PanelNavItem[] }) {
  const { pathname } = useLocation();
  const current = getActiveItem(pathname, items);
  const pageTitle = getPageTitle(pathname, current?.label ?? title);
  const isDetail = Boolean(current && pathname !== current.to);
  const backTo = current?.to ?? '/admin';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const closeOnDesktopResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnDesktopResize);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnDesktopResize);
    };
  }, [mobileOpen]);

  return (
    <div data-testid="admin-panel-shell" className="min-h-dvh bg-[#f8f7f2]" dir="rtl">
      <div className="flex min-h-dvh" dir="rtl">
        <DesktopSidebar title={title} items={items} />
        <div className="min-w-0 flex-1 bg-[#f8f7f2]">
          <DesktopHeader />
          <MobileHeader
            pageTitle={pageTitle}
            isDetail={isDetail}
            backTo={backTo}
            onOpenMenu={() => setMobileOpen(true)}
            menuOpen={mobileOpen}
            menuId="admin-mobile-nav"
          />
          <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6">
            <Breadcrumb title={title} items={items} />
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
      {mobileOpen && (
        <MobileMenu
          id="admin-mobile-nav"
          title={title}
          items={items}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </div>
  );
}

function DesktopSidebar({ title, items }: { title: string; items: PanelNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <aside
      aria-label={title}
      className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-e border-[#e7e3d8] bg-[#fffdf5] text-[#25362f] xl:w-[248px] lg:flex"
      dir="rtl"
    >
      <Link
        to="/admin"
        aria-label="داشبورد سیلانه"
        className="flex h-[76px] shrink-0 items-center px-5"
      >
        <AppLogo withTitle className="[&_img]:h-8 [&_img]:w-auto" />
      </Link>
      <nav aria-label="فهرست اصلی ادمین" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-2 px-3 text-[11px] font-bold text-[#52645b]">مدیریت آکادمی</p>
        <NavList items={items} pathname={pathname} variant="rail" />
      </nav>
      <div className="mx-3 mb-3 flex h-28 shrink-0 items-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#e7f6ed] to-[#f4f0df] px-2 pt-2">
        <img
          src="/brand/mascot.webp"
          alt=""
          aria-hidden="true"
          className="h-full w-24 object-contain object-bottom"
        />
        <p className="mb-4 ms-2 text-xs font-bold leading-5 text-[#32624c]">
          همه‌چیز برای مدیریت آموزش‌ها آماده است
        </p>
      </div>
    </aside>
  );
}

function NavList({
  items,
  pathname,
  onNavigate,
  variant = 'dark',
}: {
  items: PanelNavItem[];
  pathname: string;
  onNavigate?: () => void;
  variant?: 'dark' | 'light' | 'rail';
}) {
  const active = getActiveItem(pathname, items);
  const rail = variant === 'rail';
  const light = variant === 'light' || rail;
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon }) => {
        const selected = active?.to === to;
        return (
          <li key={to}>
            <Link
              to={to}
              onClick={onNavigate}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'group relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors duration-150',
                rail &&
                  selected &&
                  'after:absolute after:inset-y-2 after:start-0 after:w-1 after:rounded-e-full after:bg-[#059669]',
                light
                  ? selected
                    ? rail
                      ? 'bg-[#e4f5e9] font-bold text-[#075b44]'
                      : 'bg-[#08704f] font-bold text-white shadow-sm'
                    : 'font-medium text-[#46564e] hover:bg-[#eff5ee] hover:text-[#075b44]'
                  : selected
                    ? 'bg-white/15 font-bold text-white shadow-sm ring-1 ring-inset ring-white/10'
                    : 'font-medium text-white/80 hover:bg-white/10 hover:text-white',
              )}
              dir="rtl"
            >
              <Icon
                className={cn('size-[18px] shrink-0', rail && selected && 'text-[#047857]')}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-right">{label}</span>
              {selected && (
                <ChevronLeft className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopHeader() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setAccountOpen(false), [pathname]);
  useEffect(() => {
    if (!accountOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAccountOpen(false);
      accountTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountOpen]);

  return (
    <header className="sticky top-0 z-30 hidden h-[72px] items-center justify-between gap-5 border-b border-[#ece9df] bg-[#fffdf8]/95 px-5 backdrop-blur-sm lg:flex xl:px-8">
      <div className="min-w-0 flex-1">
        <QuickSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <HeaderLink to="/admin/mentor" label="راهنمای پنل">
          <CircleHelp className="size-5" aria-hidden="true" />
        </HeaderLink>
        <HeaderLink to="/admin/notifications" label="اعلان‌ها">
          <Bell className="size-5" aria-hidden="true" />
        </HeaderLink>
        <div ref={accountRef} className="relative ms-2">
          <button
            ref={accountTriggerRef}
            type="button"
            aria-controls="admin-account-popover"
            aria-expanded={accountOpen}
            aria-label={`حساب کاربری ${user?.name ?? ''}`}
            onClick={() => setAccountOpen((open) => !open)}
            className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-start transition-colors hover:bg-[#f5f5f0]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e9f3ee] text-sm font-extrabold text-[#075b44]">
              {user?.name.trim().charAt(0) || <UserRound className="size-5" aria-hidden="true" />}
            </span>
            <span className="hidden min-w-[6rem] sm:block">
              <span className="block max-w-36 truncate text-sm font-bold text-[#173e35]">
                {user?.name ?? 'کاربر'}
              </span>
              <span className="block text-xs text-[#52645b]">
                {user ? ROLE_LABEL[user.role] : ''}
              </span>
            </span>
          </button>
          {accountOpen && (
            <div
              id="admin-account-popover"
              role="group"
              aria-label="حساب کاربری"
              className="absolute end-0 top-full z-40 mt-2 w-48 rounded-xl border border-border bg-white p-1.5 shadow-lg"
            >
              <Link
                to="/admin/profile"
                onClick={() => setAccountOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text hover:bg-background"
              >
                <UserRound className="size-4" aria-hidden="true" />
                پروفایل
              </Link>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  void logout();
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-danger-fg hover:bg-danger-light"
              >
                <LogOut className="size-4" aria-hidden="true" />
                خروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="flex size-11 items-center justify-center rounded-full text-[#4a6259] transition-colors hover:bg-[#f2f5f1] hover:text-[#075b44]"
    >
      {children}
    </Link>
  );
}

interface QuickSearchResult {
  key: string;
  title: string;
  detail: string;
  to: string;
  icon: LucideIcon;
}

function QuickSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setDebouncedQuery('');
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(term), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['admin', 'quick-search', debouncedQuery],
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const q = encodeURIComponent(debouncedQuery);
      const [brands, products, packages] = await Promise.all([
        api.get<AdminBrand[]>('/admin/brands', signal),
        api.get<AdminProduct[]>(`/admin/products?q=${q}`, signal),
        api.get<AdminPackage[]>(`/admin/packages?q=${q}`, signal),
      ]);
      const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
      const needle = debouncedQuery.toLocaleLowerCase();
      const results: QuickSearchResult[] = [
        ...brands
          .filter(
            (brand) =>
              brand.name.toLocaleLowerCase().includes(needle) ||
              (brand.nameLatin ?? '').toLocaleLowerCase().includes(needle),
          )
          .slice(0, 3)
          .map((brand) => ({
            key: `brand:${brand.id}`,
            title: brand.name,
            detail: 'برند',
            to: `/admin/content/brands/${brand.id}`,
            icon: Tag,
          })),
        ...products.slice(0, 3).map((product) => ({
          key: `product:${product.id}`,
          title: product.name,
          detail: brandName.get(product.brandId) ?? 'محصول',
          to: `/admin/content/brands/${product.brandId}`,
          icon: Package,
        })),
        ...packages.slice(0, 3).map((pkg) => ({
          key: `package:${pkg.id}`,
          title: pkg.title,
          detail: brandName.get(pkg.brandId ?? '') ?? 'بسته آموزشی',
          to: `/admin/packages/${pkg.id}`,
          icon: BookOpen,
        })),
      ];
      return results.slice(0, 8);
    },
  });

  const results = debouncedQuery === query.trim() ? (search.data ?? []) : [];

  function selectResult(to: string) {
    navigate(to);
    setQuery('');
    setDebouncedQuery('');
    setOpen(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    setOpen(true);
    setDebouncedQuery(term);
    if (results[0]) selectResult(results[0].to);
  }

  return (
    <div
      className="relative max-w-[480px]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <form role="search" onSubmit={submit}>
        <label className="sr-only" htmlFor="admin-quick-search">
          جستجو در برندها، محصولات یا محتوای آموزشی
        </label>
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-[#66756e]"
          aria-hidden="true"
        />
        <input
          id="admin-quick-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="جستجو در برندها، محصولات یا محتوای آموزشی…"
          className="h-11 w-full rounded-full border border-transparent bg-[#f5f5f0] pe-4 ps-11 text-sm text-[#173e35] outline-none transition focus:border-[#9cc8b4] focus:bg-white focus:ring-2 focus:ring-[#d8ebe1]"
          dir="rtl"
        />
      </form>
      {open && query.trim() && (
        <div className="absolute start-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-lg">
          {query.trim().length < 2 ? (
            <p className="px-3 py-3 text-sm text-text-secondary" dir="rtl">
              برای جستجو دست‌کم دو نویسه وارد کنید.
            </p>
          ) : query.trim() !== debouncedQuery || search.isFetching ? (
            <p className="px-3 py-3 text-sm text-text-secondary" dir="rtl" aria-live="polite">
              در حال جستجو…
            </p>
          ) : search.isError ? (
            <p className="px-3 py-3 text-sm text-danger-fg" dir="rtl" role="status">
              جستجو انجام نشد؛ دوباره تلاش کنید.
            </p>
          ) : results.length ? (
            <ul id="admin-quick-search-results" className="max-h-80 overflow-y-auto">
              {results.map(({ key, title, detail, to, icon: Icon }) => (
                <li key={key}>
                  <Link
                    to={to}
                    onClick={() => {
                      setQuery('');
                      setDebouncedQuery('');
                      setOpen(false);
                    }}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm text-text hover:bg-background"
                    dir="ltr"
                  >
                    <Icon className="size-4 shrink-0 text-primary-fg" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-right" dir="rtl">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="block truncate text-xs text-text-secondary">{detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-text-secondary" dir="rtl" role="status">
              موردی پیدا نشد.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MobileHeader({
  pageTitle,
  isDetail,
  backTo,
  onOpenMenu,
  menuOpen,
  menuId,
}: {
  pageTitle: string;
  isDetail: boolean;
  backTo: string;
  onOpenMenu: () => void;
  menuOpen: boolean;
  menuId: string;
}) {
  return (
    <header className="sticky top-0 z-30 grid h-14 grid-cols-[48px_minmax(0,1fr)_48px] items-center border-b border-[#ece9df] bg-[#fffdf8] px-2 lg:hidden">
      {isDetail ? (
        <Link
          to={backTo}
          aria-label="بازگشت"
          className="flex size-11 items-center justify-center rounded-full text-[#3e584f] hover:bg-[#f4f5f1]"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="باز کردن فهرست"
          aria-controls={menuId}
          aria-expanded={menuOpen}
          className="flex size-11 items-center justify-center rounded-full text-[#3e584f] hover:bg-[#f4f5f1]"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      )}
      <p
        aria-hidden="true"
        className="truncate px-2 text-center text-base font-bold text-[#173e35]"
        dir="rtl"
      >
        {pageTitle}
      </p>
      <Link
        to="/admin/notifications"
        aria-label="اعلان‌ها"
        className="flex size-11 items-center justify-center rounded-full text-[#3e584f] hover:bg-[#f4f5f1]"
      >
        <Bell className="size-5" aria-hidden="true" />
      </Link>
    </header>
  );
}

function MobileMenu({
  id,
  title,
  items,
  onClose,
}: {
  id: string;
  title: string;
  items: PanelNavItem[];
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableElements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    const initialFocus =
      dialog?.querySelector<HTMLElement>('[data-autofocus="true"]') ?? focusableElements()[0];
    initialFocus?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = previousBodyOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="بستن فهرست"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
      />
      <aside
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[min(86vw,22rem)] flex-col bg-[#fffdf5] text-[#25362f] shadow-xl"
        dir="rtl"
      >
        <div
          className="flex h-16 shrink-0 items-center justify-between border-b border-[#e7e3d8] px-4"
          dir="ltr"
        >
          <AppLogo withTitle={false} className="[&_img]:h-8 [&_img]:w-auto" />
          <button
            type="button"
            aria-label="بستن فهرست"
            data-autofocus="true"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-[#47574f] hover:bg-[#f1f4ea]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          <p className="mb-2 px-3 text-[11px] font-bold text-[#52645b]">{title}</p>
          <NavList items={items} pathname={pathname} onNavigate={onClose} variant="rail" />
          <div className="mt-auto border-t border-[#e7e3d8] pt-3">
            <Link
              to="/admin/profile"
              onClick={onClose}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#43574f] hover:bg-[#eff5ee]"
            >
              <UserRound className="size-5" aria-hidden="true" />
              <span className="flex-1">{user?.name ?? 'پروفایل'}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                onClose();
                void logout();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#43574f] hover:bg-[#eff5ee]"
            >
              <LogOut className="size-5" aria-hidden="true" />
              خروج
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function getActiveItem(pathname: string, items: PanelNavItem[]) {
  return items
    .filter((item) => isItemActive(pathname, item))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function getPageTitle(pathname: string, fallback: string) {
  if (pathname === '/admin') return 'داشبورد';
  if (/^\/admin\/content\/brands\/[^/]+$/.test(pathname)) return 'جزئیات برند';
  if (/^\/admin\/packages\/[^/]+$/.test(pathname)) return 'ویرایشگر بسته آموزشی';
  if (/^\/admin\/quizzes\/[^/]+$/.test(pathname)) return 'سازنده آزمون';
  if (/^\/admin\/users\/[^/]+$/.test(pathname)) return 'جزئیات کاربر';
  if (pathname === '/admin/push-campaigns/automations') return 'اتوماسیون';
  if (pathname === '/admin/push-campaigns/automations/new') return 'اتوماسیون جدید';
  if (pathname === '/admin/push-campaigns/automations/runs') return 'اجرای اتوماسیون';
  if (pathname === '/admin/push-campaigns/automations/trace') return 'ردیابی اتوماسیون';
  if (pathname.startsWith('/admin/push-campaigns/automations/')) return 'جزئیات اتوماسیون';
  if (pathname === '/admin/push-campaigns/new' || /^\/admin\/push-campaigns\/[^/]+$/.test(pathname))
    return 'ویرایشگر کمپین';
  return fallback;
}
