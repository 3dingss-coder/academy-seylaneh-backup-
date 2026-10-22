import { beforeEach, describe, expect, it } from 'vitest';
import { runPushCampaigns } from '../src/services/push-campaigns';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let admin: { id: string; token: string };
let managerA: { id: string; token: string };
let managerB: { id: string; token: string };
let marketerA: { id: string; token: string };
let marketerB: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  await Promise.all(
    ['team-a', 'team-b'].map((id) =>
      ctx.deps.store.set(`teams/${id}`, {
        name: id === 'team-a' ? 'تیم الف' : 'تیم ب',
        managerId: null,
        archived: false,
        createdAt: '',
        updatedAt: '',
      }),
    ),
  );
  admin = await ctx.user('admin');
  managerA = await ctx.user('manager', { teamId: 'team-a' });
  managerB = await ctx.user('manager', { teamId: 'team-b' });
  marketerA = await ctx.user('marketer', { teamId: 'team-a', name: 'بازاریاب الف' });
  marketerB = await ctx.user('marketer', { teamId: 'team-b', name: 'بازاریاب ب' });
});

const campaign = (teamId: string, over: Record<string, unknown> = {}) => ({
  name: 'معرفی محصول جدید',
  title: 'یک آموزش کوتاه برای محصول تازه',
  body: 'برای آشنایی با ویژگی‌های محصول، آموزش جدید را ببینید.',
  imageUrl: null,
  actionRef: '/learn',
  audience: { type: 'team', targetId: teamId, channel: 'any' },
  scheduledAt: null,
  ...over,
});

async function addDevice(token: string, device: string) {
  const response = await ctx
    .api(token)
    .post('/v1/me/devices', { token: device, platform: 'android' });
  expect(response.status).toBe(200);
}

describe('manager campaign studio — hard team boundaries', () => {
  it('creates team-only campaigns and never exposes another team’s campaign', async () => {
    const created = await ctx.api(managerA.token).post('/v1/manager/campaigns', campaign('team-a'));
    expect(created.status).toBe(201);
    expect(created.body.data.campaign.audience).toEqual({
      type: 'team',
      targetId: 'team-a',
      channel: 'any',
    });
    expect(created.body.data.campaign.createdBy).toBe(managerA.id);

    const ownList = await ctx.api(managerA.token).get('/v1/manager/campaigns');
    expect(ownList.body.data.items.map((item: { id: string }) => item.id)).toContain(
      created.body.data.campaign.id,
    );
    const otherList = await ctx.api(managerB.token).get('/v1/manager/campaigns');
    expect(otherList.body.data.items).toHaveLength(0);
    expect(
      (await ctx.api(managerB.token).get(`/v1/manager/campaigns/${created.body.data.campaign.id}`))
        .status,
    ).toBe(404);
  });

  it('rejects global, role, other-team and unassigned-team campaign audiences', async () => {
    for (const audience of [
      { type: 'all', targetId: null, channel: 'any' },
      { type: 'role', targetId: 'marketer', channel: 'any' },
      { type: 'team', targetId: 'team-b', channel: 'any' },
    ]) {
      const response = await ctx
        .api(managerA.token)
        .post('/v1/manager/campaigns', campaign('team-a', { audience }));
      expect(response.status).toBe(403);
    }
    const noTeam = await ctx.user('manager');
    expect((await ctx.api(noTeam.token).get('/v1/manager/campaigns')).status).toBe(403);
  });

  it('previews only its own team and does not grant marketers manager campaign access', async () => {
    await addDevice(marketerA.token, 'team-a-device-token-0001');
    await addDevice(marketerB.token, 'team-b-device-token-0002');
    const preview = await ctx
      .api(managerA.token)
      .post('/v1/manager/campaigns/audience-preview', { channel: 'android' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.users).toBe(1);
    expect(preview.body.data.withPushDevice).toBe(1);

    expect((await ctx.api(marketerA.token).get('/v1/manager/campaigns')).status).toBe(403);
    expect((await ctx.api(managerA.token).get('/v1/admin/push-campaigns')).status).toBe(403);
  });

  it('includes marketers from the assigned city territory, but not other cities, in campaigns', async () => {
    await ctx.deps.store.update('teams/team-a', { province: 'تهران', city: 'تهران' });
    await ctx.deps.store.update(`users/${marketerB.id}`, { province: 'تهران', city: 'تهران' });
    await addDevice(marketerA.token, 'tehran-team-device-0001');
    await addDevice(marketerB.token, 'tehran-other-team-device-0002');

    const cityPreview = await ctx
      .api(managerA.token)
      .post('/v1/manager/campaigns/audience-preview', { channel: 'android' });
    expect(cityPreview.status).toBe(200);
    expect(cityPreview.body.data).toMatchObject({ users: 2, withPushDevice: 2 });

    await ctx.deps.store.update(`users/${marketerB.id}`, { province: 'اصفهان', city: 'اصفهان' });
    const outsidePreview = await ctx
      .api(managerA.token)
      .post('/v1/manager/campaigns/audience-preview', { channel: 'android' });
    expect(outsidePreview.body.data).toMatchObject({ users: 1, withPushDevice: 1 });
  });

  it('lets a manager send an owned campaign to the team, but not edit an admin campaign', async () => {
    await addDevice(marketerA.token, 'team-a-send-token-0001');
    await addDevice(marketerB.token, 'team-b-send-token-0002');
    const own = await ctx.api(managerA.token).post('/v1/manager/campaigns', campaign('team-a'));
    const ownId = own.body.data.campaign.id as string;
    const started = await ctx
      .api(managerA.token)
      .post(`/v1/manager/campaigns/${ownId}/send`)
      .set('Idempotency-Key', 'manager-send-key-01');
    expect(started.status).toBe(200);
    await runPushCampaigns(ctx.deps);
    const detail = await ctx.api(managerA.token).get(`/v1/manager/campaigns/${ownId}`);
    // Manager accounts are also members of their team; without a device on the manager account,
    // the service correctly reports a partial send while still keeping team B out of the batch.
    expect(detail.body.data.campaign.status).toBe('sent_with_errors');
    expect(detail.body.data.campaign.summary.accepted).toBe(1);
    expect(ctx.deps.push.sent.flatMap((call) => call.tokens)).toEqual(['team-a-send-token-0001']);

    const createdByAdmin = await ctx
      .api(admin.token)
      .post('/v1/admin/push-campaigns', campaign('team-a'));
    expect(createdByAdmin.status).toBe(201);
    const adminId = createdByAdmin.body.data.campaign.id as string;
    const adminCampaign = await ctx.api(managerA.token).get(`/v1/manager/campaigns/${adminId}`);
    expect(adminCampaign.status).toBe(200);
    expect(
      (
        await ctx.api(managerA.token).patch(`/v1/manager/campaigns/${adminId}`, {
          ...campaign('team-a'),
          version: 1,
        })
      ).status,
    ).toBe(403);
  });
});
