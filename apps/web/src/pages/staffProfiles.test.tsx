import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { AdminProfilePage } from './admin/AdminProfilePage';
import { ManagerProfilePage } from './manager/ManagerProfilePage';

const mocks = vi.hoisted(() => ({
  user: null as Me | null,
  setUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mocks.user, setUser: mocks.setUser, logout: mocks.logout }),
}));

function renderProfile(element: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>{element}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.setUser.mockReset();
  mocks.logout.mockReset().mockResolvedValue(undefined);
});

describe('role-specific staff profiles', () => {
  it('renders an Admin account and settings without marketer learning stats', () => {
    mocks.user = { ...marketer, id: 'admin-1', name: 'ادمین سامانه', role: 'admin', teamId: null };
    renderProfile(<AdminProfilePage />);

    expect(screen.getByRole('heading', { name: 'پروفایل ادمین' })).toBeInTheDocument();
    expect(screen.getByText('حساب پنل مدیریت')).toBeInTheDocument();
    expect(screen.getAllByText('ادمین')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'امنیت حساب' })).toBeInTheDocument();
    expect(screen.queryByText('امتیاز کل')).not.toBeInTheDocument();
    expect(screen.queryByText('نشان کسب شده')).not.toBeInTheDocument();
  });

  it('renders the Manager’s own team and assigned area, not the marketer profile', async () => {
    mocks.user = {
      ...marketer,
      id: 'manager-1',
      name: 'مدیر تیم',
      role: 'manager',
      teamId: 'team-a',
      province: 'تهران',
      city: 'تهران',
    };
    mockApi({
      'GET /v1/manager/profile': () => ({
        data: {
          team: { id: 'team-a', name: 'تیم تهران' },
          managementArea: { province: 'تهران', city: 'تهران' },
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      }),
    });
    renderProfile(<ManagerProfilePage />);

    expect(await screen.findByRole('heading', { name: 'پروفایل مدیر' })).toBeInTheDocument();
    expect(await screen.findByText('تیم تهران')).toBeInTheDocument();
    expect(screen.getByText('تهران، تهران')).toBeInTheDocument();
    expect(screen.getByText(/محدودهٔ مدیریت و انتساب تیم/)).toBeInTheDocument();
    expect(screen.queryByText('امتیاز کل')).not.toBeInTheDocument();
    expect(screen.queryByText('نشان کسب شده')).not.toBeInTheDocument();
  });
});
