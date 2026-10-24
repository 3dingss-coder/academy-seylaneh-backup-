import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLogo } from '@/components/brand/AppLogo';
import { MarketerIcon, type MarketerIconName } from '@/components/brand/MarketerIcon';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageTransition } from '@/components/layout/PageTransition';
import { CountBadge } from '@/components/ui/CountBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { clearSubject, isSubjectRoute } from '@/lib/pageContext';
import { prefetchMarketerPages } from '@/lib/marketerPages';
import { flushBeats } from '@/lib/offline-queue';
import { useOnline } from '@/lib/online';
import { useMessages, useNotifications } from '@/lib/queries';

const DESKTOP_NAV: Array<{
  to: string;
  label: string;
  image: MarketerIconName;
  match?: string[];
}> = [
  { to: '/', label: 'خانه', image: 'home' },
  {
    to: '/learn',
    label: 'آموزش‌ها',
    image: 'learning',
    match: ['/learn/all', '/packages', '/sections', '/quiz'],
  },
  { to: '/messages', label: 'پیام‌ها', image: 'messages' },
  { to: '/cards', label: 'کارت‌ها', image: 'cards' },
  { to: '/mentor', label: 'منتور', image: 'mentor' },
];

/** Marketer shell: shared top bar, desktop navigation, and the four original mobile tabs. */
export function MarketerLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [failedProfileAvatar, setFailedProfileAvatar] = useState<string | null>(null);
  const profileAvatarSrc = user?.avatarUrl ? fileUrl(user.avatarUrl) : null;
  // The learning roadmap is an immersive, one-purpose screen with its own back/list actions.
  const isLearningPath = pathname === '/learn';
  const notifications = useNotifications();
  const messages = useMessages();
  const qc = useQueryClient();
  const online = useOnline();
  const unreadMessages = messages.data?.filter((m) => !m.readAt).length ?? 0;
  const unread = (notifications.data?.unread ?? 0) + unreadMessages;

  useEffect(() => prefetchMarketerPages(), []);

  useEffect(() => {
    if (!isSubjectRoute(pathname)) clearSubject();
  }, [pathname]);

  useEffect(() => {
    const sync = () =>
      void flushBeats().then((n) => {
        if (n) void qc.invalidateQueries({ queryKey: ['me'] });
      });
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc]);

  return (
    <div
      className={cn(
        'min-h-dvh',
        isLearningPath ? 'bg-marketer-path-canvas pb-0' : 'bg-marketer-canvas pb-28 lg:pb-8',
      )}
    >
      {!isLearningPath && (
        <header className="sticky top-0 z-30 border-b border-marketer-border bg-marketer-surface/95 shadow-xs">
          <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-3 px-4 lg:px-6">
            <Link to="/" aria-label="خانه" className="shrink-0">
              <AppLogo />
            </Link>

            <nav aria-label="ناوبری اصلی" className="hidden items-center gap-1 lg:flex">
              {DESKTOP_NAV.map(({ to, label, image, match }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'pressable flex min-h-12 items-center gap-1.5 rounded-card px-3 text-sm font-bold transition-colors',
                      isActive || match?.some((p) => pathname.startsWith(p))
                        ? 'bg-marketer-brand-soft text-marketer-brand'
                        : 'text-marketer-muted hover:bg-marketer-surface-muted hover:text-marketer-ink',
                    )
                  }
                >
                  <MarketerIcon name={image} className="size-6" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center">
              <Link
                to="/messages"
                aria-label={
                  unread
                    ? `پیام‌ها و اعلان‌ها — ${toPersianDigits(unread)} خوانده‌نشده`
                    : 'پیام‌ها و اعلان‌ها'
                }
                className="relative flex size-12 items-center justify-center rounded-card text-marketer-muted hover:bg-marketer-surface-muted hover:text-marketer-ink"
              >
                <MarketerIcon name="notification" className="size-6" />
                <CountBadge count={unread} className="end-2 top-2" />
              </Link>
              <Link
                to="/profile"
                aria-label="پروفایل"
                className="flex size-12 items-center justify-center rounded-card text-marketer-muted hover:bg-marketer-surface-muted hover:text-marketer-ink"
              >
                {profileAvatarSrc && failedProfileAvatar !== profileAvatarSrc ? (
                  <img
                    src={profileAvatarSrc}
                    alt=""
                    aria-hidden
                    decoding="async"
                    className="size-8 rounded-full object-cover"
                    onError={() => setFailedProfileAvatar(profileAvatarSrc)}
                  />
                ) : (
                  <MarketerIcon name="profile" className="size-8" />
                )}
              </Link>
            </div>
          </div>
        </header>
      )}

      {!online && (
        <div
          role="status"
          className="mx-auto mt-2 flex max-w-[920px] items-center justify-center gap-2 rounded-card border border-warning/20 bg-warning-light px-4 py-2.5 text-sm font-bold text-text shadow-xs"
        >
          <WifiOff className="size-4 text-warning" aria-hidden />
          اتصال اینترنت قطع است. پیشرفت شما ذخیره می‌شود و بعد از اتصال ارسال می‌گردد.
        </div>
      )}

      <main
        className={
          isLearningPath ? 'mx-auto max-w-none p-0' : 'mx-auto max-w-[1240px] px-4 py-4 lg:px-6'
        }
      >
        <PageTransition>
          <Suspense
            fallback={
              <div
                className="mx-auto flex w-full max-w-[920px] flex-col gap-3 rounded-hero border border-marketer-border bg-marketer-surface p-4 shadow-md"
                aria-busy
              >
                <Skeleton className="h-8 w-1/2 rounded-xl" />
                <Skeleton className="h-40 w-full rounded-hero" />
                <Skeleton className="h-14 w-full rounded-card" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </PageTransition>
      </main>

      {!isLearningPath && (
        <BottomNav
          items={[
            { to: '/', label: 'خانه', image: 'home' },
            {
              to: '/learn',
              label: 'آموزش‌ها',
              image: 'learning',
              match: ['/learn/all', '/packages', '/sections', '/quiz'],
            },
            { to: '/messages', label: 'پیام‌ها', image: 'messages', badge: unread },
            { to: '/cards', label: 'کارت‌ها', image: 'cards' },
          ]}
        />
      )}
    </div>
  );
}
