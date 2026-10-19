// Marketer mobile tabs: خانه | آموزش‌ها | مدال | پروفایل.
// Tests stay inside their course; messages remain on the header bell.
// Targets stay at least 48px, with a warm white floating bar and calm active state.
import { Link, useLocation } from 'react-router-dom';
import { Award, Home, SquarePlay, UserRound, type LucideIcon } from 'lucide-react';
import { CountBadge } from '@/components/ui/CountBadge';
import { cn } from '@/lib/cn';

export interface BottomNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Extra path prefixes that belong to this tab (e.g. /packages → آموزش‌ها). */
  match?: string[];
}

const MARKETER_NAV: BottomNavItem[] = [
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

export function BottomNav({ items = MARKETER_NAV }: { items?: BottomNavItem[] }) {
  const { pathname } = useLocation();
  const activeIdx = items.findIndex((it) =>
    it.to === '/'
      ? pathname === '/'
      : [it.to, ...(it.match ?? [])].some((p) => inPath(pathname, p)),
  );
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-[24px] border border-[#EAE2D7] bg-[#FFFDF8]/96 shadow-[0_10px_30px_-18px_rgba(30,62,52,0.22)] backdrop-blur-xl">
        <ul className="flex items-stretch justify-around px-1.5">
          {items.map(({ to, label, icon: Icon, badge }, i) => (
            <li key={`${to}-${label}`} className="flex-1">
              <Link
                to={to}
                aria-current={i === activeIdx ? 'page' : undefined}
                className={cn(
                  'pressable relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[16px] text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                  i === activeIdx
                    ? 'bg-primary-light/70 font-bold text-primary-fg'
                    : 'font-medium text-text-secondary hover:bg-[#F7F3EA] hover:text-text',
                )}
              >
                <span className="relative">
                  <Icon className="size-6" aria-hidden />
                  <CountBadge
                    count={badge ?? 0}
                    srLabel=" پیام خوانده‌نشده"
                    className="-end-2 -top-1.5"
                  />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
