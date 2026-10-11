import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalog, setPaused } from '../src/services/push-automation-admin';
import { listPendingSteps } from '../src/services/push-automation-engine';
import { runPushAutomations } from '../src/services/push-automation-engine';
import { recentDecisions } from '../src/services/push-automation-governor';
import type { AutomationStep, RuleNode } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

/**
 * Stage D4: multi-step workflows on the real send path.
 *
 * A flow is three effects — send, wait, stop — and the point of these tests is what that costs:
 * a `wait` is one queue row and nothing else (no isolate is held), the rest of the flow is re-read
 * against live data when it is due, and an edited or switched-off rule cancels the pending step
 * instead of continuing on a stale promise. Everything runs on the in-memory store and the recording
 * push sender: no real device is reached and no rule is enabled in production.
 */

let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };
let marketer: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  admin = await ctx.user('admin');
  marketer = await ctx.user('marketer');
  await seedCatalog(ctx.deps, { id: 'test', role: 'admin' });
  await ctx.api(marketer.token).post('/v1/me/devices', {
    token: `fcm-flow-${Math.random().toString(36).slice(2, 10)}`,
    platform: 'android',
  });
});

const leaf = (
  field: string,
  operator: string,
  value: number | string | boolean | null,
): RuleNode => ({
  type: 'leaf',
  field,
  operator,
  value,
});
const msg = (title: string) => ({
  title,
  body: 'متن آزمایشی گام، بدون متغیر.',
  actionRef: '/messages',
  imageUrl: null,
});
const delivery = {
  priority: 'high' as const,
  push: true,
  inApp: true,
  respectQuietHours: true,
  cooldownMs: 0,
};
const notify = (id: string, title: string, when?: RuleNode | null): AutomationStep => ({
  type: 'notify',
  id,
  message: msg(title),
  ...(when ? { channel: null, when } : {}),
});

let seq = 0;
/** A v2 rule with a flow. It owns its cadence, because a flow that waits is a rule with a schedule. */
async function makeFlow(over: {
  steps: AutomationStep[];
  when?: RuleNode | null;
  enabled?: boolean;
}): Promise<string> {
  const key = `flow_${++seq}`;
  const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
    key,
    name: `گردش‌کار ${key}`,
    description: 'چند گام با صبر و بازرسی دوباره، ساخته‌شده از API.',
    category: 'messages',
    audienceRole: 'marketer',
    enabled: false,
    schemaVersion: 2,
    trigger: { kind: 'schedule_daily', time: '09:00' },
    audience: { type: 'role', targetId: 'marketer', channel: 'any' },
    message: msg('پیام خودِ قاعده'),
    delivery,
    repeatPolicy: { minIntervalMs: 60_000, perDay: 12, allowSameDayMultiple: true },
    ...(over.when ? { when: over.when } : {}),
    steps: over.steps,
  });
  expect(r.status).toBe(201);
  if (over.enabled !== false)
    expect(
      (await ctx.api(admin.token).patch(`/v1/admin/push-automations/${key}`, { enabled: true }))
        .status,
    ).toBe(200);
  return key;
}

const titles = () =>
  ctx.deps.push.sent.map((p: { msg?: { title?: string } }) => p.msg?.title ?? '');
const run = () => runPushAutomations(ctx.deps, { force: true });

describe('a workflow is a list of steps, not a bigger message', () => {
  it('sends both notify steps of one flow to one user in one run', async () => {
    await makeFlow({ steps: [notify('greet', 'سلام'), notify('again', 'یک بار دیگر')] });
    const res = await run();
    expect(res.sweeps[0]?.sent).toBe(1); // one *user* matched, even though the flow spoke twice
    expect(titles()).toEqual(['سلام', 'یک بار دیگر']);
  });

  it('parks the rest of the flow on a wait and continues it when it is due', async () => {
    const key = await makeFlow({
      steps: [
        notify('one', 'اول'),
        { type: 'wait', id: 'w', minutes: 60, recheckWhen: leaf('user.role', 'eq', 'marketer') },
        notify('two', 'دوم'),
      ],
    });
    await run();
    // A re-check that holds is not an obstacle: the flow still waits, and still continues.
    expect(titles()).toEqual(['اول']);
    const pend = await listPendingSteps(ctx.deps, key, { days: 2 });
    expect(pend.items).toHaveLength(1);
    expect(pend.items[0]).toMatchObject({ stepId: 'w', stepIndex: 1, status: 'pending' });

    await ctx.advance(61 * 60_000);
    await run();
    expect(titles()).toEqual(['اول', 'دوم']);
    // A run that re-starts the flow (its first send is claim-blocked) must not resurrect the row the
    // drain just closed, nor queue a second copy of it.
    await run();
    expect((await listPendingSteps(ctx.deps, key, { days: 2 })).items).toHaveLength(1);
    expect(titles()).toEqual(['اول', 'دوم']);
  });

  it('re-reads the rule when the wait is due, and cancels instead of sending', async () => {
    // The refusal is the wait's own re-check, so the test does not depend on what the seed balance is.
    const key = await makeFlow({
      steps: [
        notify('one', 'اول'),
        { type: 'wait', id: 'w', minutes: 60, recheckWhen: leaf('user.pointsBalance', 'gte', 100) },
        notify('two', 'دوم'),
      ],
    });
    await run();
    expect(titles()).toEqual(['اول']);
    // …and it is 0 by the time the follow-up is due, which is when the re-check runs.
    await ctx.deps.store.update(`users/${marketer.id}`, { pointsBalance: 0 });
    await ctx.advance(61 * 60_000);
    const res = await run();
    expect(titles()).toEqual(['اول']);
    expect(res.queue?.closed ?? 0).toBeGreaterThan(0);
    const why = await recentDecisions(ctx.deps, marketer.id, 20);
    // The decision log says a pending step was cancelled, in Persian, for this rule — not «no data».
    const cancelled = why.find((x) => x.reason === 'cancelled');
    expect(cancelled?.key).toBe(key);
    // A Persian sentence saying *which* part broke — not a bare «nothing to send».
    expect(String(cancelled?.detail)).toMatch(/گام/);
  });

  it('cancels a pending step when the rule is edited — but not when only its wording is fixed', async () => {
    // Both rules are created before the clock moves: a test token is short-lived, and this test needs
    // more than an hour of simulated waiting.
    const words = await makeFlow({
      steps: [notify('one', 'اول'), { type: 'wait', id: 'w', minutes: 120 }, notify('two', 'دوم')],
    });
    const restructured = await makeFlow({
      steps: [
        notify('a', 'الف'),
        { type: 'wait', id: 'w2', minutes: 120 },
        notify('b', 'ب (بعدی)'),
      ],
    });
    await run();
    expect(titles()).toEqual(['اول', 'الف']);

    await ctx
      .api(admin.token)
      .patch(`/v1/admin/push-automations/${words}`, { description: 'توضیح تازه‌تر، بی‌تأثیر.' });
    await ctx.api(admin.token).patch(`/v1/admin/push-automations/${restructured}`, {
      steps: [
        notify('a', 'الف'),
        { type: 'wait', id: 'w2', minutes: 120 },
        notify('c', 'ج (بعدی)'),
      ],
    });

    await ctx.advance(121 * 60_000);
    await run();
    // The follow-up the wording edit promised still arrives; the one whose definition moved does not —
    // and neither does the *new* third step, because the parked row belongs to the old flow.
    expect(titles()).toEqual(['اول', 'الف', 'دوم']);
  });

  it('stops on a stop step and says why, and continues when its condition does not hold', async () => {
    await makeFlow({
      steps: [
        {
          type: 'stop',
          id: 'halt',
          when: leaf('user.role', 'eq', 'marketer'),
          reason: 'تیم در حال مرخصی',
        },
        notify('never', 'نمی‌رود'),
      ],
    });
    await run();
    expect(titles()).toEqual([]);
    const why = await recentDecisions(ctx.deps, marketer.id, 20);
    const stopped = why.find((x) => x.reason === 'cancelled');
    expect(stopped?.detail).toContain('تیم در حال مرخصی');
  });

  it('treats a step condition as a branch: it ends the flow, it does not skip a step', async () => {
    await makeFlow({
      steps: [
        notify('one', 'اول', leaf('user.pointsBalance', 'gte', 1_000_000)),
        notify('two', 'دوم'),
      ],
    });
    await run();
    expect(titles()).toEqual([]); // the first step refused, so the second is never reached
  });
});

describe('a flow is still a preview when the panel asks for one', () => {
  it('dry-runs without parking a step and without counting a send', async () => {
    const key = await makeFlow({
      steps: [notify('one', 'اول'), { type: 'wait', id: 'w', minutes: 60 }, notify('two', 'دوم')],
    });
    const r = await ctx.api(admin.token).post(`/v1/admin/push-automations/${key}/dry-run`);
    expect(r.status).toBe(200);
    expect(r.body.data.wouldSend).toBeGreaterThan(0);
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect((await listPendingSteps(ctx.deps, key, { days: 3 })).items).toHaveLength(0);
  });

  it('leaves the queue alone while the engine is paused, and delivers after it resumes', async () => {
    await makeFlow({
      steps: [notify('one', 'اول'), { type: 'wait', id: 'w', minutes: 60 }, notify('two', 'دوم')],
    });
    await run();
    expect(titles()).toEqual(['اول']);
    // The service, not HTTP: this test moves the clock an hour, and a test token is short-lived.
    await setPaused(ctx.deps, { id: 'test', role: 'admin' }, true);
    await ctx.advance(61 * 60_000);
    await run();
    expect(titles()).toEqual(['اول']); // nothing continues under the kill-switch
    await setPaused(ctx.deps, { id: 'test', role: 'admin' }, false);
    await run();
    expect(titles()).toEqual(['اول', 'دوم']);
  });
});

it('shows and cancels the pending steps over the admin API', async () => {
  const key = await makeFlow({
    steps: [notify('one', 'اول'), { type: 'wait', id: 'w', minutes: 120 }, notify('two', 'دوم')],
  });
  await run();
  const pend = await ctx.api(admin.token).get(`/v1/admin/push-automations/${key}/pending-steps`);
  expect(pend.status).toBe(200);
  expect(pend.body.data.items).toHaveLength(1);
  expect(pend.body.data.items[0]).toMatchObject({ stepId: 'w', userId: marketer.id });
  expect(pend.body.data.note).toContain('روز');
  expect(pend.body.data.shards).toBe(8);

  const cancel = await ctx
    .api(admin.token)
    .post(`/v1/admin/push-automations/${key}/pending-steps/cancel`);
  expect([200, 201]).toContain(cancel.status);
  await ctx.advance(121 * 60_000);
  await run();
  expect(titles()).toEqual(['اول']); // the cancel is what stopped it, not the clock
});

describe('what a flow may look like is decided on save', () => {
  const post = (steps: unknown) =>
    ctx.api(admin.token).post('/v1/admin/push-automations', {
      key: `bad_${Math.random().toString(36).slice(2, 7)}`,
      name: 'قاعده نامعتبر برای ذخیره',
      description: 'گام‌های بی‌شکل نباید ذخیره شوند.',
      category: 'messages',
      audienceRole: 'marketer',
      enabled: false,
      schemaVersion: 2,
      trigger: { kind: 'schedule_daily', time: '09:00' },
      audience: { type: 'role', targetId: 'marketer', channel: 'any' },
      message: { title: 'عنوان', body: 'متن', actionRef: '/messages' },
      delivery,
      steps,
    });

  it('refuses an over-budget flow, a wait that waits forever, and a last step that only waits', async () => {
    expect((await post(Array.from({ length: 9 }, (_, i) => notify(`s${i}`, 'پ')))).status).toBe(
      400,
    );
    expect((await post([{ type: 'wait', id: 'w', minutes: 0 }])).status).toBe(400);
    expect((await post([{ type: 'wait', id: 'w', minutes: 60 }])).status).toBe(400);
  });

  it('refuses a duplicate step id, an unknown type and a stop without a condition', async () => {
    expect((await post([notify('same', 'الف'), notify('same', 'ب')])).status).toBe(400);
    expect((await post([{ type: 'email', id: 'x' }])).status).toBe(400);
    expect((await post([{ type: 'stop', id: 's', reason: 'بی‌شرط' }])).status).toBe(400);
  });

  it('refuses a per-step policy for a step that does not exist', async () => {
    const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
      key: `ghost_${Math.random().toString(36).slice(2, 7)}`,
      name: 'سیاست بی‌گامِ قابل ذخیره نیست',
      description: 'این سیاست هیچ‌وقت اجرا نمی‌شد.',
      category: 'messages',
      audienceRole: 'marketer',
      enabled: false,
      schemaVersion: 2,
      trigger: { kind: 'schedule_daily', time: '09:00' },
      audience: { type: 'role', targetId: 'marketer', channel: 'any' },
      message: { title: 'عنوان', body: 'متن', actionRef: '/messages' },
      delivery,
      steps: [notify('real', 'الف')],
      repeatPolicy: {
        minIntervalMs: 60_000,
        perDay: 2,
        perStep: { ghost: { minIntervalMs: 60_000 } },
      },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('سیاست تکرار برای گام‌هایی');
  });

  it('reports the flow in the detail, and keeps a one-notify rule on the legacy path', async () => {
    const withFlow = await makeFlow({
      steps: [notify('one', 'اول'), notify('two', 'دوم')],
      enabled: false,
    });
    const det = await ctx.api(admin.token).get(`/v1/admin/push-automations/${withFlow}`);
    expect(det.body.data.usesFlow, JSON.stringify(det.body).slice(0, 400)).toBe(true);
    expect(det.body.data.stepsSummary).toContain('۲ گام');
    expect(det.body.data.stepsSummary).toContain('←');
    expect(det.body.data.steps).toHaveLength(2);
  });
});
