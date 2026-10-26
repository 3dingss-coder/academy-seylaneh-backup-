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

  it('after profile completion, asks the Manager to pair Telegram by mobile number', async () => {
    const completedUser: Me = {
      ...manager,
      hasNationalCode: true,
      managerProfileRequired: false,
      managerProfileCompletedAt: '2026-10-03T06:30:00.000Z',
    };
    let paired = false;
    mockApi({
      'POST /v1/auth/refresh': () => ({
        data: { user: manager, idToken: 'manager-token', refreshToken: 'r2', expiresIn: 3600 },
      }),
      'GET /v1/me': () => ({
        data: paired ? { ...completedUser, telegramChatId: '777001' } : manager,
      }),
      'POST /v1/manager/complete-profile': () => ({ data: completedUser }),
      'GET /v1/manager/profile': () => ({
        data: {
          team: { id: 'team-tehran', name: 'تیم تهران' },
          managerProvinces: ['تهران'],
          managementArea: { province: 'تهران', city: 'تهران' },
          createdAt: '2026-10-01T00:00:00.000Z',
          telegram: { configured: true, botUsername: 'seylane_reports_bot', connected: paired },
        },
      }),
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
    fireEvent.change(screen.getByLabelText('کد ملی'), { target: { value: '1234567891' } });
    fireEvent.change(screen.getByLabelText('رمز جدید'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByLabelText('تکرار رمز جدید'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تکمیل پروفایل و ورود به پنل' }));

    // The connect step: bot link + phone-share instructions tied to the Manager's own number.
    expect(
      await screen.findByRole('heading', { name: 'اتصال به ربات تلگرام' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ورود به ربات تلگرام/ })).toHaveAttribute(
      'href',
      'https://t.me/seylane_reports_bot',
    );
    expect(screen.getByText(/۰۹۱۲۵۵۵۰۱۲۳/)).toBeInTheDocument();

    // Simulate the bot visit: the number got paired, «وصل شدم» detects it and enters the panel.
    paired = true;
    fireEvent.click(screen.getByRole('button', { name: 'وصل شدم، بررسی کن' }));
    expect(await screen.findByRole('heading', { name: 'تیم تهران' })).toBeInTheDocument();
  });
});
