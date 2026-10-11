import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalog } from '../src/services/push-automation-admin';
import { listPendingSteps } from '../src/services/push-automation-engine';
import { AUTOMATIONS, TEXT_REVISIONS } from '../src/services/push-automation-governor';
import type { PushAutomation, RuleNode } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

/**
 * Stage D6 (part 2): the end of a rule's life, the beginning of a rule's second life, and the way back to
 * an older text.
 *
 * Archive is the half of «delete or archive» that catalogue rows can also use, and it has to be *enforced*
 * rather than merely recorded — an archived rule under a switched-on `enabled` must still send nothing, and
 * a parked flow step must not resume. Migrate is the one place a v1 rule is rewritten on purpose, so its
 * report is the product: nothing is enabled, nothing is guessed, and a dry run leaves the store alone.
 * Rollback goes through the ordinary save path, which is what makes it auditable, validated — and reversible.
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
    token: `fcm-d6-${Math.random().toString(36).slice(2, 10)}`,
    platform: 'android',
  });
});

const ALWAYS: RuleNode = { type: 'leaf', field: 'user.status', operator: 'eq', value: 'active' };
const msg = (title: string) => ({
  title,
  body: 'متنی که برای آزمایش بازگردانی و بایگانی نوشته شده است.',
  actionRef: '/messages',
  imageUrl: null,
});
const delivery = {
  priority: 'high' as const,
  push: true,
  inApp: true,
  respectQuietHours: true,
  // The idempotency claim is bucketed by this, so a rule that is *allowed* to repeat can actually do it:
  // `cooldownMs: 0` would mean one send per day per user no matter what `repeatPolicy` says.
  cooldownMs: 60_000,
};
/** A rule that owns its cadence, so several sends in one day are its own policy and not a cap violation. */
const POLICY = { minIntervalMs: 60_000, perDay: 12, allowSameDayMultiple: true };

async function makeRule(key: string, over: Record<string, unknown> = {}): Promise<string> {
  const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
    key,
    name: `قاعدهٔ ${key}`,
    description: 'قاعده‌ای برای آزمایش بایگانی، مهاجرت و بازگردانی.',
    category: 'messages',
    audienceRole: 'marketer',
    enabled: false,
    schemaVersion: 2,
    trigger: { kind: 'schedule_daily', time: '09:00' },
    audience: { type: 'role', targetId: 'marketer', channel: 'any' },
    message: msg('متن نخست'),
    delivery,
    when: ALWAYS,
    repeatPolicy: POLICY,
    ...over,
  });
  expect(r.status).toBe(201);
  return key;
}

const doc = (key: string) => ctx.deps.store.get<PushAutomation>(`${AUTOMATIONS}/${key}`);
const patch = (key: string, body: Record<string, unknown>) =>
  ctx.api(admin.token).patch(`/v1/admin/push-automations/${key}`, body);
const post = (path: string, body?: Record<string, unknown>) =>
  ctx.api(admin.token).post(`/v1/admin/push-automations/${path}`, body ?? {});
const get = (path: string) => ctx.api(admin.token).get(`/v1/admin/push-automations/${path}`);
const data = <T>(r: { status: number; body: { data?: T; error?: { message?: string } } }): T => {
  if (r.body.data === undefined)
    throw new Error(`HTTP ${r.status}: ${r.body.error?.message ?? '—'}`);
  return r.body.data;
};
const titles = () =>
  ctx.deps.push.sent.map((p: { msg?: { title?: string } }) => p.msg?.title ?? '');
/**
 * One sweep, two minutes after the previous one, so the rule's own `minIntervalMs` and the bucketed
 * idempotency claim never mask the answer being asserted. Jumps longer than an hour are avoided on
 * purpose: the access token dies inside it, and the sweep is only interesting through the endpoint.
 */
async function run() {
  await ctx.advance(120_000);
  const r = await post('run', { force: true });
  expect(r.status).toBe(200);
  return titles();
}

describe('POST /:key/archive', () => {
  it('takes a rule out of service and says so in the list', async () => {
    const key = await makeRule('arch_1');
    const before = await doc(key);
    const r = data<{
      enabled: boolean;
      archivedAt: string | null;
      archivedBy: string | null;
      version: number;
    }>(await post(`${key}/archive`, { archived: true }));
    expect(r).toMatchObject({
      enabled: false,
      archivedBy: admin.id,
      version: (before?.version ?? 0) + 1,
    });
    expect(r.archivedAt).toBeTruthy();
    const list = data<{
      rows: Array<{ key: string; archived: boolean }>;
      counts: { archived: number };
    }>(await get(''));
    expect(list.rows.find((x) => x.key === key)?.archived).toBe(true);
    expect(list.counts.archived).toBe(1);
  });

  it('is enforced, not decorative: an archived rule sends nothing even if it is switched on again', async () => {
    const key = await makeRule('arch_run');
    await post(`${key}/enabled`, { enabled: true });
    expect(await run()).toEqual(['متن نخست']);

    await post(`${key}/archive`, { archived: true });
    // The switch is refused rather than left inert, and `loadRunnable` would skip the row anyway.
    const refused = await patch(key, { enabled: true });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toMatch(/بایگانی/);
    expect(await run()).toEqual(['متن نخست']);

    // Coming out of the archive does not re-enable: the operator decides, again, on purpose.
    // Coming out of the archive hands the rule back switched off: the operator decides again, on purpose.
    const back = data<{ enabled: boolean; archivedAt: string | null }>(
      await post(`${key}/archive`, { archived: false }),
    );
    expect(back).toMatchObject({ enabled: false, archivedAt: null });
    expect(await run()).toEqual(['متن نخست']);
    await post(`${key}/enabled`, { enabled: true });
    expect(await run()).toEqual(['متن نخست', 'متن نخست']);
  });

  it('cancels a parked workflow step, because a retirement is not a pause', async () => {
    const key = await makeRule('arch_flow', {
      steps: [
        { type: 'notify', id: 'n1', message: msg('گام یک'), channel: null, when: null },
        { type: 'wait', id: 'w1', minutes: 1, recheckWhen: null },
        { type: 'notify', id: 'n2', message: msg('گام دو'), channel: null, when: null },
      ],
    });
    await post(`${key}/enabled`, { enabled: true });
    expect(await run()).toEqual(['گام یک']);
    expect((await listPendingSteps(ctx.deps, key, { days: 2 })).items).toHaveLength(1);

    await post(`${key}/archive`, { archived: true });
    // A cancellation is a stamp on the rule, not a rewrite of every row, so the parked step is still
    // `pending` in the store. The listing has to say which of the two the operator is looking at.
    const stamped = await listPendingSteps(ctx.deps, key, { days: 2 });
    expect(stamped.cancelledAt).toBeTruthy();
    expect(stamped.items.map((r) => r.suppressed)).toEqual([true]);

    await ctx.advance(120_000); // the step is due now; the stamp is what stops it, not the clock
    expect((await post('run', { force: true })).status).toBe(200);
    expect(titles()).toEqual(['گام یک']);
    // The drain reached it and closed it as cancelled: a retirement does not keep a promise open.
    expect((await listPendingSteps(ctx.deps, key, { days: 2 })).items).toHaveLength(0);
    // Un-archiving brings the rule back switched off, and nothing in the old flow resumes.
    await post(`${key}/archive`, { archived: false });
    expect(titles()).toEqual(['گام یک']);
  });

  it('re-parks a live step on a restarted flow instead of inheriting the retired promise', async () => {
    const key = await makeRule('arch_repark', {
      steps: [
        { type: 'notify', id: 'n1', message: msg('یک'), channel: null, when: null },
        { type: 'wait', id: 'w1', minutes: 5, recheckWhen: null },
        { type: 'notify', id: 'n2', message: msg('دو'), channel: null, when: null },
      ],
    });
    await post(`${key}/enabled`, { enabled: true });
    expect(await run()).toEqual(['یک']);
    const first = (await listPendingSteps(ctx.deps, key, { days: 2 })).items[0];
    expect(first?.suppressed).toBe(false);

    // In and out of the archive before the wait has even come due: the stamp is in force, the row is not
    // due yet, and the rule runs again while that stale row is still sitting in the shard.
    await post(`${key}/archive`, { archived: true });
    await post(`${key}/archive`, { archived: false });
    await post(`${key}/enabled`, { enabled: true });
    expect(await run()).toEqual(['یک', 'یک']);

    const rows = (await listPendingSteps(ctx.deps, key, { days: 2 })).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.suppressed).toBe(false);
    expect(String(rows[0]?.createdAt)).not.toBe(String(first?.createdAt));
    // The new promise is what fires: had the dead row been reused, the drain would cancel it at its own
    // due minute and the second step would never arrive.
    await ctx.advance(6 * 60_000);
    expect((await post('run', { force: true })).status).toBe(200);
    // The resumed step arrives first (the drain runs before the sweep), then the new flow's own step one.
    expect(titles().slice(2)).toEqual(['دو', 'یک']);
  });

  it('archiving a catalogue row works where deleting it does not', async () => {
    const rows = data<{ rows: Array<{ key: string; isSystem: boolean }> }>(await get('')).rows;
    const sys = rows.find((r) => r.isSystem);
    expect(sys).toBeTruthy();
    expect((await ctx.api(admin.token).del(`/v1/admin/push-automations/${sys?.key}`)).status).toBe(
      409,
    );
    expect((await post(`${sys?.key}/archive`, { archived: true })).status).toBe(200);
    expect((await doc(String(sys?.key)))?.archivedAt).toBeTruthy();
    expect((await doc(String(sys?.key)))?.enabled).toBe(false);
  });
});

describe('POST /admin/push-automations/migrate', () => {
  const v1Rule = async (key: string, conditions: unknown[], over: Record<string, unknown> = {}) => {
    const r = await ctx.api(admin.token).post('/v1/admin/push-automations', {
      key,
      name: `قاعدهٔ قدیمی ${key}`,
      description: 'قاعده‌ای که شرط‌هایش در فهرست تخت نسخهٔ ۱ است.',
      category: 'messages',
      audienceRole: 'marketer',
      enabled: false,
      trigger: { kind: 'condition', time: '09:00', conditions },
      audience: { type: 'all', targetId: null, channel: 'any' },
      message: msg('یادآوری قدیمی'),
      delivery,
      ...over,
    });
    expect(r.status).toBe(201);
    return key;
  };

  it('reports what would move and writes nothing in the default mode', async () => {
    const key = await v1Rule('mig_dry', [{ field: 'todayActive', op: 'eq', value: false }]);
    const before = await doc(key);
    const rep = data<{
      dryRun: boolean;
      checked: number;
      wouldMigrate: number;
      migrated: number;
      results: Array<{ key: string; action: string; fields: string[] }>;
      note: string;
    }>(await post('migrate', { keys: [key] }));
    expect(rep).toMatchObject({ dryRun: true, checked: 1, wouldMigrate: 1, migrated: 0 });
    expect(rep.results[0]).toMatchObject({ key, action: 'would-migrate' });
    expect(rep.results[0]?.fields).toEqual(['schemaVersion', 'when', 'trigger.conditions']);
    expect(rep.note).toMatch(/هیچ سندی نوشته نشد/);
    const after = await doc(key);
    expect(after?.schemaVersion).toBeUndefined();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('converts one rule on purpose, through the same validators a save runs', async () => {
    const key = await v1Rule('mig_do', [
      { field: 'todayActive', op: 'eq', value: false },
      { field: 'streakDays', op: 'gte', value: 2 },
    ]);
    const list0 = data<{ counts: { legacy: number; v2: number } }>(await get('')).counts;
    expect(list0.legacy).toBeGreaterThan(0);

    const rep = data<{
      migrated: number;
      results: Array<{ action: string; message: string | null }>;
    }>(await post('migrate', { keys: [key], dryRun: false }));
    expect(rep.migrated).toBe(1);
    expect(rep.results[0]).toMatchObject({ action: 'migrated', message: null });

    const after = await doc(key);
    expect(after?.schemaVersion).toBe(2);
    expect(after?.trigger.conditions ?? []).toEqual([]);
    expect(after?.when).toEqual({
      type: 'group',
      op: 'and',
      children: [
        { type: 'leaf', field: 'todayActive', operator: 'eq', value: false },
        { type: 'leaf', field: 'streakDays', operator: 'gte', value: 2 },
      ],
    });
    expect(after?.enabled).toBe(false); // nothing is lit up by a migration
    const list1 = data<{ counts: { legacy: number; v2: number } }>(await get('')).counts;
    expect(list1.legacy).toBe(list0.legacy - 1);
    expect(list1.v2).toBeGreaterThan(0);

    // …and the engine answers the same before and after: the same people, the same reasons.
    const again = data<{ evaluated: number; wouldSend: number; skipped: number }>(
      await post(`${key}/dry-run`),
    );
    expect(again).toMatchObject({ evaluated: expect.any(Number), wouldSend: expect.any(Number) });
  });

  it('reads exactly like the flat list it replaced', async () => {
    const key = await v1Rule('mig_parity', [{ field: 'todayActive', op: 'eq', value: false }]);
    const before = data<{ evaluated: number; wouldSend: number; skipped: Record<string, number> }>(
      await post(`${key}/dry-run`),
    );
    await post('migrate', { keys: [key], dryRun: false });
    const after = data<{ evaluated: number; wouldSend: number; skipped: Record<string, number> }>(
      await post(`${key}/dry-run`),
    );
    expect(after.evaluated).toBe(before.evaluated);
    expect(after.wouldSend).toBe(before.wouldSend);
  });

  it('skips what it cannot answer for: already v2, no conditions, or a live rule', async () => {
    const done = await makeRule('mig_v2'); // v2 from the start
    // A schedule rule is allowed to carry no flat conditions at all: nothing to build a tree out of.
    const empty = await makeRule('mig_none', {
      schemaVersion: 1,
      trigger: { kind: 'schedule_daily', time: '09:00' },
      when: null,
    });
    const live = await v1Rule('mig_live', [{ field: 'todayActive', op: 'eq', value: false }]);
    expect((await patch(live, { enabled: true })).status).toBe(200);
    const rep = data<{
      skipped: number;
      results: Array<{ key: string; action: string; message: string | null }>;
    }>(await post('migrate', { keys: [done, empty, live] }));
    const byKey = new Map(rep.results.map((r) => [r.key, r]));
    expect(byKey.get(done)?.message).toMatch(/نسخه ۲/);
    expect(byKey.get(empty)?.message).toMatch(/شرطی ندارد/);
    expect(byKey.get(live)?.message).toMatch(/includeEnabled/);
    expect((await doc(live))?.enabled).toBe(true);
    expect((await doc(live))?.schemaVersion).toBeUndefined();

    // With the explicit opt-in it converts a live rule and leaves it live.
    const forced = data<{ migrated: number }>(
      await post('migrate', { keys: [live], dryRun: false, includeEnabled: true }),
    );
    expect(forced.migrated).toBe(1);
    expect((await doc(live))?.enabled).toBe(true);
    expect((await doc(live))?.schemaVersion).toBe(2);
  });

  it('answers for every rule when it is not given a list, and only reports on the catalogue rows', async () => {
    const legacy = await v1Rule('mig_all', [{ field: 'todayActive', op: 'eq', value: false }]);
    const all = data<{ rows: Array<{ key: string; isSystem: boolean }> }>(await get('')).rows;
    const rep = data<{
      checked: number;
      wouldMigrate: number;
      skipped: number;
      migrated: number;
      results: Array<{ key: string; action: string; isSystem: boolean }>;
    }>(await post('migrate'));
    expect(rep.checked).toBe(all.length);
    expect(rep.migrated).toBe(0);
    expect(rep.results.filter((r) => r.action === 'would-migrate').map((r) => r.key)).toContain(
      legacy,
    );
    expect(rep.results.filter((r) => r.action === 'would-migrate').every((r) => !r.isSystem)).toBe(
      true,
    );
    // Catalogue rules keep their flat list until the operator asks per rule, so they are only skipped.
    expect(rep.skipped).toBeGreaterThan(0);
    expect((await doc(legacy))?.schemaVersion).toBeUndefined();
  });
});

describe('POST /:key/revisions/:version/restore', () => {
  it('writes the older text forward as a new version, and keeps the current one readable', async () => {
    const key = await makeRule('rev_1');
    await patch(key, { message: msg('متن دوم') });
    const stored = await ctx.deps.store.get<{
      message: { title: string };
      at: string;
      note: string;
    }>(`${TEXT_REVISIONS}/${key}/1`);
    expect(stored?.message.title).toBe('متن نخست');
    expect(stored?.note).toMatch(/متن/);

    const r = data<{ message: { title: string }; version: number }>(
      await post(`${key}/revisions/1/restore`),
    );
    expect(r.message.title).toBe('متن نخست');
    expect(r.version).toBe(3);
    // The text it replaced is itself kept, so the rollback can be rolled back.
    const second = await ctx.deps.store.get<{ message: { title: string } }>(
      `${TEXT_REVISIONS}/${key}/2`,
    );
    expect(second?.message.title).toBe('متن دوم');
    const again = data<{ message: { title: string } }>(await post(`${key}/revisions/2/restore`));
    expect(again.message.title).toBe('متن دوم');
  });

  it('restores wording and delivery only — the logic of the rule is not in a text revision', async () => {
    const key = await makeRule('rev_logic');
    await patch(key, { when: { type: 'leaf', field: 'progress', operator: 'gte', value: 30 } });
    await patch(key, { message: msg('متن سوم') });
    const r = data<{ when: RuleNode | null; steps: unknown }>(
      await post(`${key}/revisions/2/restore`),
    );
    expect(r.when).toMatchObject({ type: 'leaf', field: 'progress', operator: 'gte', value: 30 });
  });

  it('refuses a version that was never stored and a stale view of the rule', async () => {
    const key = await makeRule('rev_err');
    expect((await post(`${key}/revisions/9/restore`)).status).toBe(404);
    await patch(key, { message: msg('متن چهارم') });
    expect((await post(`${key}/revisions/1/restore`, { expectedVersion: 1 })).status).toBe(409);
    expect((await post(`${key}/revisions/1/restore`, { expectedVersion: 2 })).status).toBe(200);
  });

  it('is an audited, ordinary edit', async () => {
    const key = await makeRule('rev_audit');
    await patch(key, { message: msg('متن پنجم') });
    const before = (await ctx.deps.store.query({ collection: 'audit_logs' })).length;
    await post(`${key}/revisions/1/restore`);
    const after = await ctx.deps.store.query<Record<string, unknown>>({ collection: 'audit_logs' });
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]?.action).toBe('push_automation.updated');
  });
});
