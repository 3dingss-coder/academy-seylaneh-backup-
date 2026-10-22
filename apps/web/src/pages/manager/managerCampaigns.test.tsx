import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';
import type { CampaignDetail, PushCampaign } from '@/pages/admin/pushCampaignModel';

const MANAGER: Me = {
  id: 'manager-a', name: 'مدیر تیم الف', avatarUrl: null, workplace: null, hasNationalCode: false,
  phone: '09120000002', email: null, province: 'تهران', city: 'تهران', role: 'manager', teamId: 'team-a',
  brandIds: [], status: 'active', pointsBalance: 0, onboardedAt: null, lastActiveAt: null, createdAt: '2026-10-01T00:00:00.000Z',
};
const summary = { batchesTotal: 0, batchesDone: 0, users: 0, attempted: 0, accepted: 0, failed: 0, invalid: 0, noDevice: 0, interrupted: 0 };
const CAMPAIGN: PushCampaign = {
  id: 'campaign-a', name: 'آموزش محصول تازه', title: 'آموزش محصول جدید', body: 'آموزش محصول جدید را ببینید.',
  imageUrl: null, actionRef: '/learn', audience: { type: 'team', targetId: 'team-a', channel: 'any' }, status: 'draft',
  scheduledAt: null, targetCount: null, pushReachable: null, version: 1, createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z', createdBy: MANAGER.id, startedAt: null, finishedAt: null, summary, lastError: null, archivedAt: null,
};
const DETAIL: CampaignDetail = { campaign: CAMPAIGN, batches: [], batchesTruncated: false };

function authRoutes(extra: Record<string, (body: unknown, init: RequestInit) => { status?: number; data?: unknown }> = {}) {
  localStorage.setItem('ssl.refresh', 'refresh-token');
  return {
    'POST /v1/auth/refresh': () => ({ data: { user: MANAGER, idToken: 'access-token', refreshToken: 'refresh-token-2', expiresIn: 3600 } }),
    'GET /v1/me': () => ({ data: MANAGER }),
    ...extra,
  };
}

beforeEach(() => { localStorage.clear(); session.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('ManagerCampaigns — manager-specific team studio', () => {
  it('creates a campaign through the manager API with a fixed team-only audience', async () => {
    const { calls } = mockApi(authRoutes({
      'POST /v1/manager/campaigns/audience-preview': () => ({ data: { users: 4, withPushDevice: 3, webDevices: 2, androidDevices: 1, note: 'برآورد تقریبی' } }),
      'POST /v1/manager/campaigns': () => ({ status: 201, data: DETAIL }),
      'GET /v1/manager/campaigns/campaign-a': () => ({ data: DETAIL }),
    }));
    renderApp('/manager/campaigns/new');
    fireEvent.change(await screen.findByLabelText('نام داخلی کمپین'), { target: { value: 'آموزش محصول تازه' } });
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), { target: { value: 'آموزش محصول جدید' } });
    fireEvent.change(screen.getByLabelText('متن پیام'), { target: { value: 'آموزش محصول جدید را ببینید.' } });
    expect(screen.getByLabelText('مخاطبان')).toHaveValue('team');
    expect(screen.getByText('دارای دستگاه پوش')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'اندروید' }));
    expect(screen.getByLabelText('کانال دستگاه')).toHaveValue('any');

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));
    await screen.findByText('پیش‌نویس ذخیره شد؛ هنوز اعلانی ارسال نشده است.');
    await waitFor(() => expect(calls.some((call) => call.key === 'POST /v1/manager/campaigns')).toBe(true));
    const payload = calls.find((call) => call.key === 'POST /v1/manager/campaigns')?.body as { audience: { type: string; targetId: string } };
    expect(payload.audience).toEqual({ type: 'team', targetId: 'team-a', channel: 'any' });
    expect(calls.some((call) => call.key.startsWith('POST /v1/admin/push-campaigns'))).toBe(false);
  }, 15000);

  it('shows the team campaign dashboard and clearly labels provider acceptance rather than delivery', async () => {
    mockApi(authRoutes({
      'GET /v1/manager/campaigns/dashboard': () => ({ data: {
        counts: { total: 1, draft: 1, scheduled: 0, inProgress: 0, sent: 0, failed: 0, cancelled: 0 },
        providerRequests: { attempted: 0, accepted: 0, failed: 0, noDevice: 0 }, recent: [CAMPAIGN],
      } }),
      'GET /v1/manager/campaigns': () => ({ data: { items: [CAMPAIGN], nextCursor: null, total: 1 } }),
    }));
    renderApp('/manager/campaigns');
    expect(await screen.findByText('تاریخچهٔ کمپین‌ها')).toBeInTheDocument();
    expect(await screen.findByText('بدون دادهٔ تحویل، بازشدن یا تبدیل')).toBeInTheDocument();
    expect(screen.getAllByText('آموزش محصول تازه').length).toBeGreaterThan(0);
  }, 15000);
});
