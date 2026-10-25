import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me, ProvinceTeamsView } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'admin-1', name: 'ادمین', role: 'admin', teamId: null };

const signIn = (extra: Record<string, unknown> = {}) => ({
  'POST /v1/auth/refresh': () => ({
    data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
  }),
  'GET /v1/me': () => ({ data: admin }),
  'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
  'GET /v1/admin/users': () => ({ data: [] }),
  'GET /v1/admin/teams': () => ({ data: [] }),
  'GET /v1/admin/brands': () => ({ data: [] }),
  'GET /v1/admin/province-teams': () => ({
    data: {
      provinces: [],
      unassigned: { memberCount: 0, members: [] },
    } satisfies ProvinceTeamsView,
  }),
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  session.clear();
  localStorage.setItem('ssl.refresh', 'r1');
});
afterEach(() => vi.unstubAllGlobals());

describe('Automatic province teams', () => {
  it('groups marketers by province and city with their province Managers', async () => {
    const view: ProvinceTeamsView = {
      provinces: [
        {
          province: 'تهران',
          memberCount: 2,
          activeMemberCount: 2,
          managers: [
            {
              id: 'mgr-1',
              name: 'احمد رضایی',
              phone: '09120000001',
              status: 'active',
              teamId: null,
              managerProvinces: ['تهران', 'مازندران'],
            },
          ],
          members: [
            {
              id: 'u1',
              name: 'سارا احمدی',
              phone: '09120000002',
              city: 'تهران',
              status: 'active',
              teamId: 'team-seylane',
              pointsBalance: 10,
              lastActiveAt: null,
            },
            {
              id: 'u2',
              name: 'علی رضایی',
              phone: '09120000003',
              city: 'ری',
              status: 'active',
              teamId: 'team-seylane',
              pointsBalance: 5,
              lastActiveAt: null,
            },
          ],
        },
      ],
      unassigned: {
        memberCount: 1,
        members: [
          {
            id: 'u3',
            name: 'بازاریاب بی‌استان',
            phone: '09120000004',
            city: null,
            status: 'active',
            teamId: null,
            pointsBalance: 0,
            lastActiveAt: null,
          },
        ],
      },
    };
    mockApi(signIn({ 'GET /v1/admin/province-teams': () => ({ data: view }) }));
    renderApp('/admin/teams');

    expect(
      await screen.findByText('تیم‌های خودکار استانی', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('تیم تهران')).toBeInTheDocument();
    expect(screen.getByText(/احمد رضایی/)).toBeInTheDocument();
    expect(screen.getByText('سارا احمدی')).toBeInTheDocument();
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText(/تهران · ۱ نفر/)).toBeInTheDocument();
    expect(screen.getByText(/ری · ۱ نفر/)).toBeInTheDocument();
    expect(screen.getByText('بدون استان ثبت‌شده')).toBeInTheDocument();
    expect(screen.getByText('بازاریاب بی‌استان')).toBeInTheDocument();
  });

  it('promoting a marketer creates a separate Manager account and shows its one-time password', async () => {
    const person: Me = {
      ...marketer,
      id: 'marketer-1',
      name: 'علی بازاریاب',
      phone: '09125550111',
      role: 'marketer',
      province: 'تهران',
      city: 'تهران',
    };
    const { calls } = mockApi(
      signIn({
        'GET /v1/admin/users': () => ({ data: [person] }),
        'PATCH /v1/admin/users/marketer-1': () => ({
          data: {
            user: person,
            warnings: ['حساب بازاریاب دست‌نخورده ماند.'],
            createdManager: {
              user: {
                ...person,
                id: 'manager-9',
                role: 'manager',
                managerProvinces: ['تهران'],
              },
              temporaryPassword: 'ManagerTemp42',
            },
          },
        }),
      }),
    );
    renderApp('/admin/users');

    const [editButton] = await screen.findAllByRole('button', { name: 'ویرایش علی بازاریاب' });
    if (!editButton) throw new Error('edit button missing');
    fireEvent.click(editButton);
    const dialog = await screen.findByRole('dialog', { name: 'ویرایش علی بازاریاب' });
    fireEvent.change(within(dialog).getByLabelText('نقش'), { target: { value: 'manager' } });
    expect(within(dialog).getByText(/حساب مدیر جداگانه/)).toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'تهران' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'ذخیره' }));

    expect(await within(dialog).findByText('ManagerTemp42')).toBeInTheDocument();
    expect(within(dialog).getByText(/حساب بازاریاب/)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((call) => call.key === 'PATCH /v1/admin/users/marketer-1')).toBe(true),
    );
    const patch = calls.find((call) => call.key === 'PATCH /v1/admin/users/marketer-1');
    expect(patch?.body).toMatchObject({ role: 'manager', managerProvinces: ['تهران'] });
  });
});
