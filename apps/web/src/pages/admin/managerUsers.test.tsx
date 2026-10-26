import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { AdminTeam, Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'admin-1', name: 'ادمین', role: 'admin', teamId: null };
const team: AdminTeam = {
  id: 'team-tehran',
  name: 'تیم تهران',
  managerId: null,
  managerName: null,
  managerIds: [],
  managers: [],
  activeManagerCount: 0,
  province: 'تهران',
  city: 'تهران',
  memberCount: 0,
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

const signIn = (extra: Record<string, unknown> = {}) => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    'GET /v1/admin/users': () => ({ data: [] }),
    'GET /v1/admin/teams': () => ({ data: [team] }),
    'GET /v1/admin/brands': () => ({ data: [] }),
    ...extra,
  };
};

describe('Admin Manager account controls', () => {
  it('creates a Manager for the chosen provinces (no team needed) and reveals the temporary password once', async () => {
    const created: Me = {
      ...marketer,
      id: 'new-manager',
      name: 'مریم رضایی',
      phone: '09125550123',
      role: 'manager',
      teamId: null,
      managerProvinces: ['تهران', 'مازندران'],
      managerProfileRequired: true,
    };
    const { calls } = mockApi(
      signIn({
        'POST /v1/admin/users': () => ({
          status: 201,
          data: { user: created, temporaryPassword: 'TempManager94' },
        }),
      }),
    );
    renderApp('/admin/users');

    fireEvent.click(await screen.findByRole('button', { name: 'کاربر جدید' }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog', { name: 'ساخت کاربر جدید' });
    fireEvent.change(within(dialog).getByLabelText('نام'), { target: { value: 'مریم' } });
    fireEvent.change(within(dialog).getByLabelText('نام خانوادگی'), {
      target: { value: 'رضایی' },
    });
    fireEvent.change(within(dialog).getByLabelText('شماره موبایل'), {
      target: { value: '09125550123' },
    });
    // Multi-select the supervised provinces; a team is optional now.
    fireEvent.click(await within(dialog).findByRole('button', { name: 'تهران' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'مازندران' }));
    expect(within(dialog).getByText('۲ استان انتخاب شده')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ساخت حساب' }));

    expect(await screen.findByText('رمز موقت مدیر — نمایش یک‌باره')).toBeInTheDocument();
    expect(screen.getByText('TempManager94')).toBeInTheDocument();
    expect(screen.getByText(/نیازی به درخواست دسترسی ندارد/)).toBeInTheDocument();
    expect(screen.getByText(/استان‌های تحت مدیریت: تهران، مازندران/)).toBeInTheDocument();
    const request = calls.find((call) => call.key === 'POST /v1/admin/users');
    expect(request?.body).toMatchObject({
      firstName: 'مریم',
      lastName: 'رضایی',
      phone: '09125550123',
      role: 'manager',
      teamId: null,
      managerProvinces: ['تهران', 'مازندران'],
    });
  });

  it('lets Admin block an existing Manager through the account status control', async () => {
    const manager: Me = {
      ...marketer,
      id: 'manager-1',
      name: 'مریم مدیر',
      phone: '09125550999',
      role: 'manager',
      teamId: team.id,
    };
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/users': () => ({ data: [manager] }),
        'PATCH /v1/admin/users/manager-1': () => ({
          data: { user: { ...manager, status: 'inactive' } },
        }),
      }),
    );
    renderApp('/admin/users');
    const [editButton] = await screen.findAllByRole('button', { name: 'ویرایش مریم مدیر' });
    if (!editButton) throw new Error('Manager edit button was not rendered');
    fireEvent.click(editButton);
    const dialog = await screen.findByRole('dialog', { name: 'ویرایش مریم مدیر' });
    const status = within(dialog).getByLabelText('دسترسی پنل مدیر');
    expect(status).toHaveValue('active');
    fireEvent.change(status, { target: { value: 'inactive' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }));

    await waitFor(() =>
      expect(calls.some((call) => call.key === 'PATCH /v1/admin/users/manager-1')).toBe(true),
    );
    const patch = calls.find((call) => call.key === 'PATCH /v1/admin/users/manager-1');
    expect(patch?.body).toMatchObject({ role: 'manager', status: 'inactive', teamId: team.id });
  });
});
