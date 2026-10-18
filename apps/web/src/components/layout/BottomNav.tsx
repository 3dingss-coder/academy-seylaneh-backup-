// Adapted from helper kit: «اپ بازاریاب/کامپوننت‌ها/common/BottomNav.tsx»
// — board «تمامی صفحات اپلیکیشن بازاریاب» tabs: خانه | دوره‌ها | آزمون‌ها | مدال | پروفایل
//   (پیام‌ها lives on the header bell «پیام‌ها و اعلان‌ها»; آزمون‌ها → /learn until the exams page);
//   router links instead of AppContext; 48px targets; tokens instead of emerald.
// Design refresh: floating frosted bar, active marker glides between tabs (transform only).
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Home, ShieldCheck, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import { CountBadge } from '@/components/ui/CountBadge';
import { cn } from '@/lib/cn';

export interface BottomNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Extra path prefixes that belong to this tab (e.g. /packages → دوره‌ها). */
  match?: string[];
}

const MARKETER_NAV: BottomNavItem[] = [
  { to: '/', label: 'خانه', icon: Home },
  { to: '/learn', label: 'دوره‌ها', icon: BookOpen, match: ['/packages', '/sections', '/quiz'] },
  { to: '/learn', label: 'آزمون‌ها', icon: ShieldCheck },
  { to: '/cards', label: 'مدال', icon: Trophy },
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
      <div className="glass pointer-events-auto relative mx-auto max-w-md rounded-[22px] border border-border/70 shadow-lg">
        {/* sliding marker */}
        <span
          aria-hidden
          className={cn(
            'absolute top-0 flex h-1 transition-[transform,opacity] duration-300 ease-soft',
            activeIdx < 0 && 'opacity-0',
          )}
          style={{
            width: `${100 / items.length}%`,
            insetInlineStart: 0,
            transform: `translateX(${Math.max(activeIdx, 0) * (document.dir === 'ltr' ? 100 : -100)}%)`,
          }}
        >
          <span className="mx-auto h-1 w-8 rounded-full bg-primary" />
        </span>
        <ul className="flex items-stretch justify-around px-1">
          {items.map(({ to, label, icon: Icon, badge }, i) => (
            <li key={`${to}-${label}`} className="flex-1">
              <Link
                to={to}
                aria-current={i === activeIdx ? 'page' : undefined}
                className={cn(
                  'pressable relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-card text-xs',
                  i === activeIdx
                    ? 'font-bold text-primary-fg'
                    : 'font-medium text-text-secondary hover:text-text',
                )}
              >
                <span
                  className={cn(
                    'relative transition-transform duration-300 ease-spring',
                    i === activeIdx && '-translate-y-0.5 scale-110',
                  )}
                >
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
