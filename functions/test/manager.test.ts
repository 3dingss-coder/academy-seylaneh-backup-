import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFixture,
  createCtx,
  passQuiz,
  watchSection,
  type Fixture,
  type TestCtx,
} from './support/ctx';
import type { RetakeRequest } from '../src/domain/types';
import { managersForMarketer } from '../src/services/team-scope';

let ctx: TestCtx;
let fx: Fixture;
let mgrA: { id: string; token: string };
let mgrB: { id: string; token: string };
let userA: { id: string; token: string };
let userB: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  for (const t of ['team-a', 'team-b'])
    await ctx.deps.store.set(`teams/${t}`, {
      name: t === 'team-a' ? 'تیم الف' : 'تیم ب',
      managerId: null,
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
  fx = await buildFixture(ctx, { sections: 2, durationSec: 60, deadlineDays: 2 });
  mgrA = await ctx.user('manager', { teamId: 'team-a' });
  mgrB = await ctx.user('manager', { teamId: 'team-b' });
  userA = await ctx.user('marketer', { teamId: 'team-a', name: 'بازاریاب الف' });
  userB = await ctx.user('marketer', { teamId: 'team-b', name: 'بازاریاب ب' });
});

describe('manager scope (28.2 #5)', () => {
  it('manager of team A gets 403 for a user of team B', async () => {
    expect((await ctx.api(mgrA.token).get(`/v1/manager/users/${userB.id}/progress`)).status).toBe(
      403,
    );
    expect(
      (await ctx.api(mgrA.token).post(`/v1/manager/users/${userB.id}/messages`, { body: 'سلام' }))
        .status,
    ).toBe(403);
    expect(
      (
        await ctx
          .api(mgrA.token)
          .post(`/v1/manager/users/${userB.id}/notes`, { body: 'یادداشت', packageId: fx.packageId })
      ).status,
    ).toBe(403);
    expect((await ctx.api(mgrA.token).get(`/v1/manager/users/${userA.id}/progress`)).status).toBe(
      200,
    );
  });

  it('marketers cannot use manager or admin APIs', async () => {
    expect((await ctx.api(userA.token).get('/v1/manager/dashboard')).status).toBe(403);
    expect((await ctx.api(userA.token).get('/v1/admin/users')).status).toBe(403);
    expect((await ctx.api(mgrA.token).get('/v1/admin/users')).status).toBe(403);
  });

  it('dashboard lists only own team, with progress and lagging flags', async () => {
    await watchSection(ctx, userA.token, fx.sections[0]?.id ?? '', 20);
    const res = await ctx.api(mgrA.token).get('/v1/manager/dashboard');
    expect(res.status).toBe(200);
    const names = JSON.stringify(res.body.data);
    expect(names).toContain('بازاریاب الف');
    expect(names).not.toContain('بازاریاب ب');
  });

  it('team directory returns real learning health without exposing another team', async () => {
    await watchSection(ctx, userA.token, fx.sections[0]?.id ?? '', 20);
    const res = await ctx.api(mgrA.token).get('/v1/manager/members');
    expect(res.status).toBe(200);
    expect(res.body.data.team.name).toBe('تیم الف');
    expect(res.body.data.totals.members).toBe(1);
    expect(res.body.data.members[0]).toMatchObject({
      id: userA.id,
      name: 'بازاریاب الف',
      stats: { assigned: 1, lagging: 1 },
    });
    expect(res.body.data.members[0].packages[0].percent).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.data)).not.toContain('بازاریاب ب');
    expect((await ctx.api(userA.token).get('/v1/manager/members')).status).toBe(403);
  });

  it('retake requests of another team cannot be approved', async () => {
    const s1 = fx.sections[0];
    await watchSection(ctx, userB.token, s1?.id ?? '', 60);
    const wrong = Object.fromEntries(Object.keys(s1?.answers ?? {}).map((k) => [k, 'a']));
    for (let i = 0; i < 3; i++) {
      ctx.limiter.reset();
      if (i > 0) await watchSection(ctx, userB.token, s1?.id ?? '', 60);
      await passQuiz(ctx, userB.token, s1?.quizId ?? '', wrong);
    }
    const req = await ctx.api(userB.token).post(`/v1/me/quizzes/${s1?.quizId}/retake-requests`);
    expect(
      (
        await ctx
          .api(mgrA.token)
          .post(`/v1/manager/retake-requests/${req.body.data.id}/approve`, {})
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .api(mgrB.token)
          .post(`/v1/manager/retake-requests/${req.body.data.id}/approve`, {})
      ).status,
    ).toBe(200);
  });
});

describe('city-scoped team reports and multiple Managers', () => {
  it('includes every marketer in the team territory for each Manager, but denies other cities', async () => {
    await ctx.deps.store.set('teams/team-tehran', {
      name: 'تیم تهران',
      managerId: null,
      province: 'تهران',
      city: 'تهران',
      archived: false,
      createdAt: '',
      updatedAt: '',
    });
    const managerOne = await ctx.user('manager', { teamId: 'team-tehran' });
    const managerTwo = await ctx.user('manager', { teamId: 'team-tehran' });
    const tehranMarketer = await ctx.user('marketer', {
      teamId: 'legacy-default',
      name: 'بازاریاب تهران',
    });
    const otherCityMarketer = await ctx.user('marketer', {
      teamId: 'legacy-default',
      name: 'بازاریاب اصفهان',
    });
    await ctx.deps.store.update(`users/${tehranMarketer.id}`, { province: 'تهران', city: 'تهران' });
    await ctx.deps.store.update(`users/${otherCityMarketer.id}`, {
      province: 'اصفهان',
      city: 'اصفهان',
    });

    for (const manager of [managerOne, managerTwo]) {
      const directory = await ctx.api(manager.token).get('/v1/manager/members');
      expect(directory.status).toBe(200);
      expect(directory.body.data.members.map((member: { id: string }) => member.id)).toContain(
        tehranMarketer.id,
      );
      expect(directory.body.data.members.map((member: { id: string }) => member.id)).not.toContain(
        otherCityMarketer.id,
      );

      const report = await ctx.api(manager.token).get('/v1/manager/reports/completion');
      expect(report.status).toBe(200);
      expect(report.body.data.members.map((member: { id: string }) => member.id)).toContain(
        tehranMarketer.id,
      );
      expect(
        (await ctx.api(manager.token).get(`/v1/manager/users/${tehranMarketer.id}/progress`))
          .status,
      ).toBe(200);
      expect(
        (await ctx.api(manager.token).get(`/v1/manager/users/${otherCityMarketer.id}/progress`))
          .status,
      ).toBe(403);
    }

    const regionalManagers = await managersForMarketer(ctx.deps, {
      teamId: 'legacy-default',
      province: 'تهران',
      city: 'تهران',
    });
    expect(regionalManagers.map((manager) => manager.id)).toEqual(
      expect.arrayContaining([managerOne.id, managerTwo.id]),
    );

    const tehranSection = fx.sections[0];
    if (!tehranSection) throw new Error('fixture has no quiz section');
    const request = (userId: string): RetakeRequest => ({
      userId,
      teamId: 'legacy-default',
      quizId: tehranSection.quizId,
      sectionId: tehranSection.id,
      packageId: fx.packageId,
      lastAttemptId: 'attempt-placeholder',
      status: 'pending',
      grantedAttempts: 0,
      reviewedBy: null,
      reviewNote: null,
      escalated: false,
      createdAt: ctx.deps.clock().toISOString(),
      reviewedAt: null,
    });
    await ctx.deps.store.set('retake_requests/tehran-request', request(tehranMarketer.id));
    await ctx.deps.store.set('retake_requests/esfahan-request', request(otherCityMarketer.id));
    const regionalQueue = await ctx.api(managerOne.token).get('/v1/manager/retake-requests');
    expect(regionalQueue.body.data.map((item: { id: string }) => item.id)).toContain(
      'tehran-request',
    );
    expect(regionalQueue.body.data.map((item: { id: string }) => item.id)).not.toContain(
      'esfahan-request',
    );
    expect(
      (
        await ctx
          .api(managerOne.token)
          .post('/v1/manager/retake-requests/tehran-request/approve', {})
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx
          .api(managerOne.token)
          .post('/v1/manager/retake-requests/esfahan-request/approve', {})
      ).status,
    ).toBe(403);

    await ctx.deps.store.update('teams/team-tehran', { archived: true });
    const archivedTeam = await ctx.api(managerOne.token).get('/v1/manager/members');
    expect(archivedTeam.status).toBe(200);
    expect(archivedTeam.body.data.members).toHaveLength(0);
    expect(
      (await ctx.api(managerOne.token).get(`/v1/manager/users/${tehranMarketer.id}/progress`))
        .status,
    ).toBe(403);
  });
});

describe('manager messages & notes (F12)', () => {
  it('message reaches the marketer inbox + notification', async () => {
    const r = await ctx.api(mgrA.token).post(`/v1/manager/users/${userA.id}/messages`, {
      body: 'لطفاً آموزش را تا فردا تمام کن.',
      packageId: fx.packageId,
    });
    expect(r.status).toBe(201);
    const inbox = await ctx.api(userA.token).get('/v1/me/messages');
    expect(inbox.body.data[0].body).toBe('لطفاً آموزش را تا فردا تمام کن.');
    const notifs = await ctx.api(userA.token).get('/v1/me/notifications');
    expect(JSON.stringify(notifs.body.data)).toContain('manager_message');
    const audit = await ctx.deps.store.query({
      collection: 'audit_logs',
      where: [['action', '==', 'manager.message_sent']],
    });
    expect(audit).toHaveLength(1);
  });
});
