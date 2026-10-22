import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { ManagerAccessRequestView, Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'admin-1', name: 'ادمین', role: 'admin', teamId: null };
const application: ManagerAccessRequestView = {
  id: 'request-1',
  userId: 'request-1',
  fullName: 'مریم درخواست‌دهنده',
  phone: '09125550125',
  nationalCode: '1234567891',
  managementProvince: 'تهران',
  managementCity: 'تهران',
  avatarUrl: 'https://example.test/manager-avatar.png',
  status: 'pending',
  reviewNote: null,
  reviewedAt: null,
  phoneReviewedExternally: false,
  appeals: [],
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
  localStorage.setItem('ssl.refresh', 'admin-refresh');
});
afterEach(() => vi.unstubAllGlobals());

describe('Admin Manager access review area', () => {
  it('shows the full application and requires a team and external phone review to approve', async () => {
    const { calls } = mockApi({
      'POST /v1/auth/refresh': () => ({
        data: {
          user: admin,
          idToken: 'admin-token',
          refreshToken: 'admin-refresh-2',
          expiresIn: 3600,
        },
      }),
      'GET /v1/me': () => ({ data: admin }),
      'GET /v1/admin/users': () => ({ data: [] }),
      'GET /v1/admin/teams': () => ({
        data: [{ id: 'team-1', name: 'تیم تهران', managerId: null }],
      }),
      'GET /v1/admin/manager-access-requests': () => ({ data: [application] }),
      'POST /v1/admin/manager-access-requests/request-1/approve': (body) => ({
        data: {
          status: 'approved',
          userId: 'request-1',
          teamId: (body as { teamId: string }).teamId,
        },
      }),
    });
    renderApp('/admin/users?tab=manager-requests');

    expect(
      await screen.findByText('مریم درخواست‌دهنده', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('۱۲۳۴۵۶۷۸۹۱')).toBeInTheDocument();
    expect(screen.getByText('تهران، تهران')).toBeInTheDocument();
    expect(screen.getByText('با پیامک تأیید نشده')).toBeInTheDocument();
    expect(screen.getByText(/سامانه پیامک یا OTP ندارد/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'بررسی و فعال‌سازی' }));
    const dialog = await screen.findByRole('dialog', { name: 'تأیید و فعال‌سازی حساب مدیر' });
    const confirm = screen.getByRole('button', { name: 'تأیید و فعال‌سازی' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('تیم تحت مدیریت'), { target: { value: 'team-1' } });
    expect(confirm).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /شماره تماس را خارج از سامانه بررسی کرده‌ام/,
      }),
    );
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(
        calls.find(
          (call) => call.key === 'POST /v1/admin/manager-access-requests/request-1/approve',
        )?.body,
      ).toMatchObject({
        teamId: 'team-1',
        phoneReviewedExternally: true,
      });
    });
    expect(dialog).not.toBeVisible();
    expect(
      await screen.findByText('حساب مدیر فعال و به تیم انتخاب‌شده متصل شد.'),
    ).toBeInTheDocument();
  });

  it('requires a review reason and sends it to the rejected applicant', async () => {
    const { calls } = mockApi({
      'POST /v1/auth/refresh': () => ({
        data: {
          user: admin,
          idToken: 'admin-token',
          refreshToken: 'admin-refresh-2',
          expiresIn: 3600,
        },
      }),
      'GET /v1/me': () => ({ data: admin }),
      'GET /v1/admin/users': () => ({ data: [] }),
      'GET /v1/admin/teams': () => ({ data: [] }),
      'GET /v1/admin/manager-access-requests': () => ({ data: [application] }),
      'POST /v1/admin/manager-access-requests/request-1/reject': () => ({
        data: { status: 'rejected', userId: 'request-1' },
      }),
    });
    renderApp('/admin/users?tab=manager-requests');

    expect(
      await screen.findByText('مریم درخواست‌دهنده', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'رد درخواست' }));
    expect(
      await screen.findByRole('dialog', { name: 'رد درخواست دسترسی مدیر' }),
    ).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'ثبت نتیجه' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('توضیح برای متقاضی'), {
      target: { value: 'اطلاعات محدوده مدیریت نیاز به بررسی بیشتر دارد.' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(
        calls.find((call) => call.key === 'POST /v1/admin/manager-access-requests/request-1/reject')
          ?.body,
      ).toMatchObject({ reason: 'اطلاعات محدوده مدیریت نیاز به بررسی بیشتر دارد.' });
    });
    expect(await screen.findByText('نتیجه برای متقاضی ثبت شد.')).toBeInTheDocument();
  });
});
