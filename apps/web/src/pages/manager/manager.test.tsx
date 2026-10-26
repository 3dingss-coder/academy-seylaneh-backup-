import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import { ToastProvider } from '@/components/ui';
import type {
  Laggard,
  ManagerDashboard as Data,
  ManagerMembersResponse,
  RetakeItem,
} from '@/lib/types';
import { ManagerDashboard } from './ManagerDashboard';
import { ManagerMembersPage } from './ManagerMembersPage';
import { RetakeList } from '@/components/reports/RetakeList';

const LAGGARD: Laggard = {
  userId: 'u2',
  name: 'سارا احمدی',
  province: 'تهران',
  city: 'تهران',
  packageId: 'p1',
  packageTitle: 'آموزش شامپو دافی',
  percent: 20,
  deadlineAt: null,
  overdueDays: 3,
  lastActivityAt: null,
  stuckAt: 'بخش اول',
};

const KPIs = {
  members: 5,
  completionRate: 0.4,
  onTimeRate: 0.8,
  laggardCount: 1,
  avgDelayDays: 2,
  assigned: 10,
  completed: 4,
};

const DATA_TEAM: Data = {
  team: { id: 't1', name: 'فروش تهران' },
  kpis: KPIs,
  laggards: [LAGGARD],
  pendingRetakes: 2,
};

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

/** noUncheckedIndexedAccess-safe first element. */
function first<T>(list: ArrayLike<T>): T {
  const el = list[0];
  if (el === undefined) throw new Error('expected a non-empty list');
  return el;
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/manager']}>
          <ManagerDashboard />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderMembers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/manager/members']}>
          <ManagerMembersPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManagerDashboard — team health first, people needing attention actionable', () => {
  it('renders team KPIs, the pending-retake banner link and an actionable laggard row', async () => {
    mockApi({ 'GET /v1/manager/dashboard': () => ({ data: DATA_TEAM }) });
    renderDashboard();
    expect(await screen.findByText('تیم فروش تهران')).toBeInTheDocument();
    expect(screen.getByText('نرخ تکمیل')).toBeInTheDocument();
    expect(screen.getByText('تکمیل به‌موقع')).toBeInTheDocument();
    expect(screen.getByText('عقب‌مانده')).toBeInTheDocument();
    expect(screen.getByText('درخواست آزمون مجدد')).toBeInTheDocument();
    // pending retakes banner is a real link to the review queue
    const banner = screen.getByRole('link', { name: /درخواست آزمون مجدد منتظر بررسی/ });
    expect(banner).toHaveAttribute('href', '/manager/retakes');
    // laggard row is actionable: quick message opens the dialog
    expect(screen.getAllByText('سارا احمدی').length).toBeGreaterThan(0);
    fireEvent.click(first(screen.getAllByRole('button', { name: 'پیام' })));
    expect(await screen.findByRole('dialog', { name: 'ارسال به سارا احمدی' })).toBeInTheDocument();
  });

  it('laggard row click opens the member detail (not just a KPI number)', async () => {
    mockApi({ 'GET /v1/manager/dashboard': () => ({ data: DATA_TEAM }) });
    const { container } = renderDashboard();
    await screen.findByText('تیم فروش تهران');
    const rows = container.querySelectorAll('tbody tr');
    fireEvent.click(first(rows));
    expect(screen.getByTestId('loc')).toHaveTextContent('/manager/members/u2');
  });

  it('no-team state is the rare help state carrying the decorative mascot', async () => {
    mockApi({
      'GET /v1/manager/dashboard': () => ({
        data: { ...DATA_TEAM, team: null },
      }),
    });
    const { container } = renderDashboard();
    expect(await screen.findByText('هنوز استان یا تیمی به شما سپرده نشده')).toBeInTheDocument();
    const mascot = container.querySelector('img[src="/brand/mascot.webp"]');
    expect(mascot).not.toBeNull();
    expect(mascot).toHaveAttribute('alt', '');
  });

  it('a province-only Manager (no team at all) sees the dashboard of their provinces', async () => {
    mockApi({
      'GET /v1/manager/dashboard': () => ({
        data: { ...DATA_TEAM, team: null, provinces: ['تهران', 'مازندران'] },
      }),
    });
    const { container } = renderDashboard();
    expect(
      await screen.findByText(/وضعیت آموزش بازاریاب‌های استان‌های تهران، مازندران/),
    ).toBeInTheDocument();
    expect(screen.getByText('نرخ تکمیل')).toBeInTheDocument();
    expect(screen.queryByText('هنوز استان یا تیمی به شما سپرده نشده')).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/mascot.webp"]')).toBeNull();
  });

  it('all-good team state has no mascot (rare-only rule) and keeps its status language', async () => {
    mockApi({
      'GET /v1/manager/dashboard': () => ({
        data: { ...DATA_TEAM, laggards: [], pendingRetakes: 0, kpis: { ...KPIs, laggardCount: 0 } },
      }),
    });
    const { container } = renderDashboard();
    expect(await screen.findByText('همه اعضا طبق برنامه پیش می‌روند 👏')).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/mascot.webp"]')).toBeNull();
  });
});

describe('ManagerMembersPage — team-scoped member workbench', () => {
  const MEMBERS: ManagerMembersResponse = {
    team: { id: 't1', name: 'فروش تهران' },
    totals: { members: 1, active: 1, inactive: 0, lagging: 1 },
    members: [
      {
        id: 'u2',
        name: 'سارا احمدی',
        avatarUrl: null,
        phone: '09121234567',
        province: 'تهران',
        city: 'تهران',
        status: 'active',
        createdAt: '2026-10-01T00:00:00.000Z',
        lastActiveAt: '2026-10-20T10:00:00.000Z',
        stats: { assigned: 2, completed: 1, averageProgress: 50, lagging: 1 },
        packages: [
          {
            id: 'p1',
            title: 'آموزش شامپو دافی',
            brandName: 'دافی',
            productName: 'شامپو',
            status: 'in_progress',
            percent: 50,
            overdue: true,
            deadlineAt: null,
            completedAt: null,
          },
        ],
      },
    ],
  };

  it('shows actual team learning status, supports search and opens a direct follow-up', async () => {
    mockApi({ 'GET /v1/manager/members': () => ({ data: MEMBERS }) });
    renderMembers();
    expect(await screen.findByText(/عملکرد و پیگیری اعضای فروش تهران/)).toBeInTheDocument();
    expect(screen.getAllByText('آمادگی آموزشی').length).toBeGreaterThan(0);
    expect(screen.getAllByText('سارا احمدی').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('جست‌وجوی عضو'), { target: { value: 'تهران' } });
    expect(screen.getAllByText('سارا احمدی').length).toBeGreaterThan(0);
    fireEvent.click(first(screen.getAllByRole('button', { name: 'ارسال پیام به سارا احمدی' })));
    expect(await screen.findByRole('dialog', { name: 'ارسال به سارا احمدی' })).toBeInTheDocument();
    expect(screen.getByText('آموزش شامپو دافی')).toBeInTheDocument();
  });

  it('shows an explicit no-match state instead of presenting invented members', async () => {
    mockApi({
      'GET /v1/manager/members': () => ({
        data: {
          ...MEMBERS,
          members: [],
          totals: { members: 0, active: 0, inactive: 0, lagging: 0 },
        },
      }),
    });
    renderMembers();
    expect(
      await screen.findByText('هنوز بازاریابی در محدودهٔ مدیریت شما نیست'),
    ).toBeInTheDocument();
  });
});

describe('RetakeList — approve/reject flow preserved', () => {
  const RETAKE: RetakeItem = {
    id: 'r1',
    userId: 'u2',
    userName: 'سارا احمدی',
    userProvince: 'تهران',
    userCity: 'تهران',
    quizId: 'q1',
    sectionTitle: 'بخش اول',
    packageTitle: 'آموزش شامپو دافی',
    status: 'pending',
    escalated: false,
    scores: [0.4, 0.6],
    createdAt: '2026-10-10T10:00:00.000Z',
  };

  function renderRetakes() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <RetakeList
              base="/manager"
              memberLink={(id) => `/manager/members/${id}`}
              isAdmin={false}
            />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('pending request shows member link + scores and approve posts the decision with a note', async () => {
    const { calls } = mockApi({
      'GET /v1/manager/retake-requests?status=pending': () => ({ data: [RETAKE] }),
      'POST /v1/manager/retake-requests/r1/approve': () => ({ data: { ok: true } }),
    });
    renderRetakes();
    const memberLink = await screen.findByRole('link', { name: 'سارا احمدی' });
    expect(memberLink).toHaveAttribute('href', '/manager/members/u2');
    expect(screen.getByText(/بخش اول/)).toBeInTheDocument();

    fireEvent.click(first(screen.getAllByRole('button', { name: 'تأیید' })));
    const dialog = await screen.findByRole('dialog', { name: 'تأیید آزمون مجدد' });
    fireEvent.change(within(dialog).getByLabelText('یادداشت (اختیاری)'), {
      target: { value: 'یک فرصت دیگر' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید' }));

    await screen.findByText('تأیید شد؛ یک فرصت دیگر داده شد.');
    const post = calls.find((c) => c.key === 'POST /v1/manager/retake-requests/r1/approve');
    expect(post).toBeTruthy();
    expect(post?.body).toMatchObject({ note: 'یک فرصت دیگر' });
  });
});
