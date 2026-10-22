import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const manager: Me = {
  ...marketer,
  id: 'manager-first-login',
  name: 'مریم رضایی',
  phone: '09125550123',
  role: 'manager',
  teamId: 'team-tehran',
  managerProfileRequired: true,
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
  localStorage.setItem('ssl.refresh', 'r1');
});
afterEach(() => vi.unstubAllGlobals());

describe('Manager first-login profile setup', () => {
  it('requires profile completion before opening the assigned team panel', async () => {
    const completedUser: Me = {
      ...manager,
      hasNationalCode: true,
      managerProfileRequired: false,
      managerProfileCompletedAt: '2026-10-03T06:30:00.000Z',
    };
    const { calls } = mockApi({
      'POST /v1/auth/refresh': () => ({
        data: { user: manager, idToken: 'manager-token', refreshToken: 'r2', expiresIn: 3600 },
      }),
      'GET /v1/me': () => ({ data: manager }),
      'POST /v1/manager/complete-profile': () => ({ data: completedUser }),
      'GET /v1/manager/dashboard': () => ({
        data: {
          team: { id: 'team-tehran', name: 'تیم تهران' },
          kpis: {
            completionRate: 0,
            completed: 0,
            assigned: 0,
            onTimeRate: 0,
            laggardCount: 0,
            members: 0,
          },
          pendingRetakes: 0,
          laggards: [],
        },
      }),
    });

    renderApp('/manager');
    expect(await screen.findByRole('heading', { name: 'تکمیل پروفایل مدیر' })).toBeInTheDocument();
    expect(screen.queryByText('وضعیت آموزش اعضای تیم')).not.toBeInTheDocument();
    expect(screen.getByLabelText('نام و نام خانوادگی')).toHaveValue('مریم رضایی');
    expect(screen.getByLabelText('استان')).toHaveTextContent('تهران');
    expect(screen.getByLabelText('شهر')).toHaveTextContent('تهران');

    fireEvent.change(screen.getByLabelText('کد ملی'), { target: { value: '1234567891' } });
    fireEvent.change(screen.getByLabelText('رمز جدید'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByLabelText('تکرار رمز جدید'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تکمیل پروفایل و ورود به پنل' }));

    expect(await screen.findByRole('heading', { name: 'تیم تهران' })).toBeInTheDocument();
    expect(screen.getByText('وضعیت آموزش اعضای تیم')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((call) => call.key === 'POST /v1/manager/complete-profile')).toBe(true),
    );
    const submission = calls.find((call) => call.key === 'POST /v1/manager/complete-profile');
    expect(submission?.body).toMatchObject({
      name: 'مریم رضایی',
      nationalCode: '1234567891',
      province: 'تهران',
      city: 'تهران',
      newPassword: 'Password123',
    });
  });
});
