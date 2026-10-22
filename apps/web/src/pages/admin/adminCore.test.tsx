import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };
const manager: Me = { ...marketer, id: 'm1', name: 'مدیر تیم', role: 'manager', teamId: 't1' };

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const kpis = {
  marketers: 3,
  activeMarketers: 2,
  activationRate: 60,
  wau: 2,
  mau: 2,
  wauMau: 100,
  onTimeCompletionRate: 0.5,
  firstPassRate: 0.5,
  avgDelayHours: 2,
  completions: 1,
  nudgeReengagementRate: 0.1,
};

const ADMIN_DASHBOARD = {
  kpis,
  content: { published: 2, drafts: 1, unassigned: 3, archived: 0 },
  pendingRetakes: 1,
};

const MANAGER_DASHBOARD = {
  team: { id: 't1', name: 'شمال' },
  kpis: {
    members: 5,
    completionRate: 0.4,
    onTimeRate: 0.8,
    laggardCount: 0,
    avgDelayDays: 1,
    assigned: 10,
    completed: 4,
  },
  laggards: [],
  pendingRetakes: 0,
};

const signIn = (user: Me, extra: Record<string, () => unknown>) => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: user }),
    ...extra,
  };
};

describe('admin shell + core — enterprise console contracts', () => {
  it('renders all admin navigation items and preserves the existing routes', async () => {
    mockApi(
      signIn(admin, {
        'GET /v1/admin/dashboard': () => ({ data: ADMIN_DASHBOARD }),
      }),
    );
    renderApp('/admin');
    fireEvent.click(await screen.findByRole('tab', { name: 'مشارکت' }, { timeout: 5000 }));
    expect(await screen.findByText('WAU / MAU')).toBeInTheDocument();
    for (const label of [
      'داشبورد',
      'محتوای آموزشی',
      'کتابخانه رسانه',
      'رفتار منتور',
      'مسیرها و مخاطبان',
      'کاربران',
      'تیم‌ها',
      'گزارش‌ها',
      'آزمون‌های مجدد',
      'آرشیو',
      'اعلان‌ها',
      'کمپین‌های Push',
      'اتوماسیون',
      'سیاست‌ها',
      'لاگ تغییرات',
      'پروفایل',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('searches real brands, products and learning content', async () => {
    mockApi(
      signIn(admin, {
        'GET /v1/admin/content/tree': () => ({
          data: {
            brands: [
              {
                id: 'brand-kaman',
                name: 'کامان',
                logoUrl: '',
                logoIsFallback: false,
                productCount: 4,
                brandLevelPackages: 0,
                packageCount: 2,
              },
            ],
            unassignedCount: 0,
          },
        }),
        'GET /v1/admin/packages?unassigned=true': () => ({ data: [] }),
        'GET /v1/admin/packages?status=archived': () => ({ data: [] }),
        'GET /v1/admin/brands': () => ({
          data: [
            {
              id: 'brand-kaman',
              name: 'کامان',
              nameLatin: 'Comeon',
              logoUrl: '',
              logoIsFallback: false,
              sortOrder: 1,
              archived: false,
            },
          ],
        }),
        'GET /v1/admin/products': () => ({ data: [] }),
        'GET /v1/admin/packages': () => ({ data: [] }),
      }),
    );
    renderApp('/admin/content');
    await screen.findByRole('tab', { name: /برندها/ });
    const search = screen.getByRole('searchbox', {
      name: 'جستجو در برندها، محصولات یا محتوای آموزشی',
    });
    fireEvent.change(search, { target: { value: 'کامان' } });
    await screen.findByText('برند', {}, { timeout: 5000 });
    const result = screen.getByText('برند').closest('a');
    expect(result).toHaveAttribute('href', '/admin/content/brands/brand-kaman');
  });

  it('keeps the manager navigation separate from admin (no merged menus)', async () => {
    mockApi(
      signIn(manager, {
        'GET /v1/manager/dashboard': () => ({ data: MANAGER_DASHBOARD }),
      }),
    );
    renderApp('/manager');
    expect(await screen.findByText('تیم شمال', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByText('گزارش تکمیل').length).toBeGreaterThan(0);
    expect(screen.getAllByText('آزمون مجدد').length).toBeGreaterThan(0);
    // admin-only areas must not leak into the manager console
    expect(screen.queryAllByText('سیاست‌ها')).toHaveLength(0);
    expect(screen.queryAllByText('کمپین‌های Push')).toHaveLength(0);
    expect(screen.queryAllByText('لاگ تغییرات')).toHaveLength(0);
    expect(screen.queryAllByText('محتوای آموزشی')).toHaveLength(0);
  });

  it('uses one shared right-rail admin shell and preserves the mascot and navigation', async () => {
    mockApi(
      signIn(admin, {
        'GET /v1/admin/dashboard': () => ({ data: ADMIN_DASHBOARD }),
      }),
    );
    renderApp('/admin');
    expect(await screen.findByTestId('admin-panel-shell')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'فهرست اصلی ادمین' })).toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'پنل ادمین' });
    expect(rail).toBeInTheDocument();
    expect(rail.querySelector('img[src="/brand/mascot.webp"]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'داشبورد سیلانه' })).toBeInTheDocument();
  });

  it('uses the admin profile header and keeps notification links inside the admin console', async () => {
    mockApi(
      signIn(admin, {
        'GET /v1/me/home': () => ({
          data: {
            nextItem: null,
            totalProgress: 0,
            counts: { inProgress: 0, new: 0, completed: 2, overdue: 0 },
            pointsBalance: 100,
            packages: [],
          },
        }),
        'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
        'GET /v1/me/messages': () => ({ data: [] }),
        'GET /v1/me/badges': () => ({ data: [] }),
        'GET /v1/admin/notification-templates': () => ({ data: [] }),
      }),
    );
    renderApp('/admin/profile');
    expect(await screen.findByRole('heading', { name: 'پروفایل من' })).toBeInTheDocument();
    expect(screen.getAllByText('پنل مدیریت').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'اعلان‌ها و پیام‌ها' }));
    expect(await screen.findByRole('tab', { name: /صندوق من/ })).toBeInTheDocument();
  });

  it('content status cards deep-link into the real content tabs', async () => {
    mockApi(
      signIn(admin, {
        'GET /v1/admin/dashboard': () => ({ data: ADMIN_DASHBOARD }),
      }),
    );
    renderApp('/admin');
    const unassigned = await screen.findByRole('link', { name: /بدون تخصیص/ }, { timeout: 5000 });
    expect(unassigned).toHaveAttribute('href', '/admin/content?tab=unassigned');
    expect(screen.getByRole('link', { name: /منتشرشده/ })).toHaveAttribute(
      'href',
      '/admin/content',
    );
  });
});
