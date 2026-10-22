import { beforeEach, describe, expect, it } from 'vitest';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;
let admin: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  admin = await ctx.user('admin', { name: 'مدیر سیستم' });
});

describe('admin dashboard insights', () => {
  it('summarizes real user, activity, content and campaign data', async () => {
    const marketer = await ctx.user('marketer', { name: 'سارا احمدی' });
    const day = '2026-10-02';
    const time = `${day}T09:00:00.000Z`;
    const events = [
      { name: 'section_played', userId: marketer.id, props: {}, ts: time },
      { name: 'signup_completed', userId: marketer.id, props: {}, ts: time },
      { name: 'package_completed', userId: marketer.id, props: { packageId: 'p1' }, ts: time },
      { name: 'quiz_passed', userId: marketer.id, props: { quizId: 'q1' }, ts: time },
      { name: 'quiz_failed', userId: marketer.id, props: { quizId: 'q2' }, ts: time },
    ];
    for (const [index, event] of events.entries()) {
      await ctx.deps.store.set(`analytics_events/event-${index}`, event);
    }
    await ctx.deps.store.set('packages/p1', {
      title: 'آموزش معرفی محصول',
      status: 'published',
      createdAt: time,
      updatedAt: time,
      brandId: 'b1',
    });
    await ctx.deps.store.set('push_campaigns/c1', {
      name: 'کمپین زمان‌بندی‌شده',
      status: 'scheduled',
      createdAt: time,
      archivedAt: null,
    });
    await ctx.deps.store.set('push_campaigns/c2', {
      name: 'کمپین ارسال‌شده',
      status: 'sent',
      createdAt: time,
      archivedAt: null,
    });
    await ctx.deps.store.set('audit_logs/a1', {
      action: 'package.updated',
      entity: 'package',
      entityId: 'p1',
      actorId: admin.id,
      createdAt: time,
    });

    const response = await ctx.api(admin.token).get('/v1/admin/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.data.insights).toMatchObject({
      users: {
        total: 2,
        active: 2,
        byRole: { admin: 1, marketer: 1 },
        recent: expect.arrayContaining([
          expect.objectContaining({ id: marketer.id, name: 'سارا احمدی' }),
        ]),
      },
      recentPackages: [
        expect.objectContaining({ id: 'p1', title: 'آموزش معرفی محصول', status: 'published' }),
      ],
      campaigns: { total: 2, scheduled: 1, sent: 1 },
      recentActivity: expect.arrayContaining([
        expect.objectContaining({
          source: 'admin',
          name: 'package.updated',
          actorName: 'مدیر سیستم',
        }),
        expect.objectContaining({
          source: 'app',
          name: 'package_completed',
          actorName: 'سارا احمدی',
        }),
      ]),
    });
    expect(response.body.data.insights.activityTrend).toContainEqual({
      date: day,
      activeUsers: 1,
      signups: 1,
      completions: 1,
      quizAttempts: 2,
    });
  });
});
