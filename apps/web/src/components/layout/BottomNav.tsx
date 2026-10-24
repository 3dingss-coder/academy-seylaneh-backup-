// Generic bottom navigation keeps the original Lucide icons; marketer pages opt into the 3D set.
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Award, Home, SquarePlay, UserRound, type LucideIcon } from 'lucide-react';
import { MarketerIcon, type MarketerIconName } from '@/components/brand/MarketerIcon';
import { CountBadge } from '@/components/ui/CountBadge';
import { cn } from '@/lib/cn';

type BottomNavBase = {
  to: string;
  label: string;
  badge?: number;
  /** Extra path prefixes that belong to this tab (e.g. /packages → آموزش‌ها). */
  match?: string[];
};

export type BottomNavItem = BottomNavBase &
  ({ icon: LucideIcon; image?: never } | { image: MarketerIconName; icon?: never });

const DEFAULT_NAV: BottomNavItem[] = [
  { to: '/', label: 'خانه', icon: Home },
  {
    to: '/learn',
    label: 'آموزش‌ها',
    icon: SquarePlay,
    match: ['/packages', '/sections', '/quiz'],
  },
  { to: '/cards', label: 'مدال', icon: Award },
  { to: '/profile', label: 'پروفایل', icon: UserRound },
];

const inPath = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function BottomNav({ items = DEFAULT_NAV }: { items?: BottomNavItem[] }) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // Publish the real nav height (incl. safe-area inset) so floating elements can sit just above it.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--bottom-nav-h', `${el.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver === 'undefined')
      return () => root.style.removeProperty('--bottom-nav-h');
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bottom-nav-h');
    };
  }, []);
  const activeIdx = items.findIndex((it) =>
    it.to === '/'
      ? pathname === '/'
      : [it.to, ...(it.match ?? [])].some((p) => inPath(pathname, p)),
  );

  return (
    <nav
      ref={navRef}
      aria-label="ناوبری اصلی"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-hero border border-marketer-border bg-marketer-surface shadow-md">
        <ul className="flex items-stretch justify-around px-1.5">
          {items.map((item, i) => {
            const Icon = 'icon' in item ? item.icon : undefined;
            return (
              <li key={`${item.to}-${item.label}`} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={i === activeIdx ? 'page' : undefined}
                  className={cn(
                    'pressable relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-card text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-marketer-brand',
                    i === activeIdx
                      ? 'bg-marketer-brand-soft font-bold text-marketer-brand'
                      : 'font-medium text-marketer-muted hover:bg-marketer-surface-muted hover:text-marketer-ink',
                  )}
                >
                  <span className="relative">
                    {item.image ? (
                      <MarketerIcon name={item.image} className="size-7" />
                    ) : (
                      Icon && <Icon className="size-6" aria-hidden />
                    )}
                    <CountBadge
                      count={item.badge ?? 0}
                      srLabel=" پیام خوانده‌نشده"
                      className="-end-2 -top-1.5"
                    />
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
