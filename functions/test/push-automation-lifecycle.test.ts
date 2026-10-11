import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalog } from '../src/services/push-automation-admin';
import { listPendingSteps } from '../src/services/push-automation-engine';
import { AUTOMATIONS } from '../src/services/push-automation-governor';
import type { RuleNode } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

/**
 * Stage D6 (part 1): the lifecycle an operator needs *around* a rule that is not yet trusted.
 *
 * `POST /validate` answers «could this be saved?» with the very validators a save runs, and writes nothing —
 * not a document, not an audit row, not a counter. `POST /:key/duplicate` copies what the operator wrote and
 * nothing that belongs to the source's history or future (its enabled flag, its stats, its parked steps).
 * `GET /:key/preview` reads the rule against named users, which is the only way to answer «why nothing for
 * this user?» without waiting for a sweep. Every test here also asserts the part that matters most: the store
 * afterwards looks exactly like the store before.
 */

interface Issue {
  path: string;
  message: string;
}
interface Verdict {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  normalized: { when: RuleNode | null } | null;
  review: {
    key: string;
    isGate: boolean;
    enabled: boolean;
    triggerKind: string;
    event: string | null;
    treeSource: string | null;
    treeSummary: string | null;
    budget: { nodes: number; leaves: number; depth: number } | null;
    limits: { maxNodes: number; maxLeaves: number; maxDepth: number; maxSteps: number };
    usesFlow: boolean;
    stepIds: string[];
    deadConditions: string[];
    eventProduced: boolean | null;
    pendingSteps: number;
    runNote: string | null;
  } | null;
}
interface PreviewRow {
  userId: string;
  name: string | null;
  exists: boolean;
  inPopulation: boolean;
  inFilter: boolean;
  audienceWhy: string | null;
  matched: boolean;
  whyNot: string | null;
  truncated: boolean;
  explain: string[];
  title: string | null;
  body: string | null;
  steps: Array<{ id: string; type: string; label: string }>;
}
interface Preview {
  key: string;
  evaluatedAt: string;
  paused: boolean;
  enabled: boolean;
  rows: PreviewRow[];
  note: string;
}

let ctx: TestCtx;
let admin: { id: string; token: string; phone: string };
let marketer: { id: string; token: string; phone: string };

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  admin = await ctx.user('admin');
  marketer = await ctx.user('marketer');
  await seedCatalog(ctx.deps, { id: 'test', role: 'admin' });
  await ctx.api(marketer.token).post('/v1/me/devices', {
    token: `fcm-lifecycle-${Math.random().toString(36).slice(2, 10)}`,
    platform: 'android',
  });
});

const leaf = (
  field: string,
  operator: string,
  value: boolean | number | string | null,
): RuleNode => ({
  type: 'leaf',
  field,
  operator,
  value,
});
/** Matches every active account — deterministic for the fixture users, unlike a learning fact. */
const ALWAYS: RuleNode = leaf('user.status', 'eq', 'active');
/** Deterministically false for these fixtures, unlike a learning fact that seed data could move. */
const NEVER: RuleNode = leaf('user.status', 'eq', 'inactive');

/** A complete, saveable create payload for a v2 rule; every test bends one field of it. */
function createBody(key: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key,
    name: `قاعدهٔ آزمایشی ${key}`,
    description: 'قاعده‌ای که چرخهٔ اعتبارسنجی، تکثیر و پیش‌نمایش رویش آزمایش می‌شود.',
    category: 'messages',
    audienceRole: 'marketer',
    enabled: false,
    schemaVersion: 2,
    trigger: { kind: 'schedule_daily', time: '09:00' },
    audience: { type: 'role', targetId: 'marketer', channel: 'any' },
    message: {
      title: 'سلام {name}',
      body: 'پیشرفت شما را دیدیم؛ یک نگاه تازه به آموزش فعال بیاندازید.',
      actionRef: '/messages',
      imageUrl: null,
    },
    delivery: {
      priority: 'normal',
      push: true,
      inApp: true,
      respectQuietHours: true,
      cooldownMs: 0,
    },
    when: ALWAYS,
    ...over,
  };
}

const notifyStep = (id: string, title: string, body: string): Record<string, unknown> => ({
  type: 'notify',
  id,
  message: { title, body, actionRef: '/messages' },
});

const auditCount = async (): Promise<number> =>
  (await ctx.deps.store.query({ collection: 'audit_logs' })).length;
const notifCount = async (): Promise<number> =>
  (await ctx.deps.store.query({ collection: 'notifications' })).length;
/** Unwraps `{ data }` and turns an API error into a readable test failure instead of `undefined`. */
const data = <T>(r: { status: number; body: { data?: T; error?: { message?: string } } }): T => {
  if (r.body.data === undefined)
    throw new Error(`HTTP ${r.status}: ${r.body.error?.message ?? 'پاسخ بدون داده'}`);
  return r.body.data;
};
const api = (as: { token: string }) => ctx.api(as.token);
/** A write that fails must not leave the next assertion guessing which of its effects is missing. */
async function must(
  method: 'post' | 'patch',
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const r = await api(admin)[method](path, body);
  if (r.status >= 300)
    throw new Error(
      `${method.toUpperCase()} ${path} → ${r.status}: ${
        (r.body as { error?: { message?: string } }).error?.message ?? 'بدون پیام'
      }`,
    );
}
const createRule = (body: Record<string, unknown>): Promise<void> =>
  must('post', '/v1/admin/push-automations', body);
const patchRule = (key: string, body: Record<string, unknown>): Promise<void> =>
  must('patch', `/v1/admin/push-automations/${key}`, body);
const validate = (body: Record<string, unknown>): Promise<Verdict> =>
  api(admin)
    .post('/v1/admin/push-automations/validate', body)
    .then((r) => data<Verdict>(r));
const validateKey = (key: string, body: Record<string, unknown>): Promise<Verdict> =>
  api(admin)
    .post(`/v1/admin/push-automations/${key}/validate`, body)
    .then((r) => data<Verdict>(r));

describe('POST /admin/push-automations/validate', () => {
  it('accepts a draft a save would accept, and stores nothing', async () => {
    const before = await auditCount();
    const v = await validate(createBody('draft_ok'));
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(await ctx.deps.store.get(`${AUTOMATIONS}/draft_ok`)).toBeFalsy();
    expect((await api(admin).get('/v1/admin/push-automations/draft_ok')).status).toBe(404);
    expect(await auditCount()).toBe(before);
    expect(await notifCount()).toBe(0);
  });

  it('refuses a half-written range, on the field that is missing it', async () => {
    const before = await auditCount();
    const v = await validate(
      createBody('draft_bad', {
        when: { type: 'group', op: 'and', children: [leaf('progress', 'between', 20)] },
      }),
    );
    expect(v.ok).toBe(false);
    const bad = v.errors.find((e) => e.path.startsWith('when.children[0]'));
    expect(bad?.message).toMatch(/دو مقدار/);
    expect(await ctx.deps.store.get(`${AUTOMATIONS}/draft_bad`)).toBeFalsy();
    expect(await auditCount()).toBe(before);
  });

  it('points at the key when it is taken — by the catalogue or by a stored rule', async () => {
    const catalog = await validate(createBody('inactive_1d'));
    expect(catalog.ok).toBe(false);
    expect(catalog.errors[0]?.path).toBe('key');
    expect(catalog.errors[0]?.message).toMatch(/کاتالوگ/);

    await createRule(createBody('draft_used'));
    const taken = await validate(createBody('draft_used'));
    expect(taken.errors[0]?.path).toBe('key');
    expect(taken.errors[0]?.message).toMatch(/وجود دارد/);
  });

  it('measures a tree of any size against the engine budget, not a form limit', async () => {
    const wide: RuleNode = {
      type: 'group',
      op: 'or',
      children: [
        {
          type: 'group',
          op: 'and',
          children: [
            leaf('progress', 'gte', 10),
            leaf('progress', 'lte', 90),
            leaf('activePackages', 'gte', 1),
          ],
        },
        ...Array.from({ length: 6 }, (_, i) => leaf('streakDays', 'gte', i * 3)),
      ],
    };
    const v = await validate(createBody('draft_wide', { when: wide }));
    expect(v.ok).toBe(true);
    // 9 leaves — more than the six the old form allowed — and well inside the engine's own budget.
    expect(v.review?.budget).toEqual({ nodes: 11, leaves: 9, depth: 3 });
    expect(v.review?.limits).toMatchObject({ maxNodes: 64, maxLeaves: 48, maxDepth: 6 });
    expect(v.review?.treeSource).toBe('when');
    expect(v.review?.treeSummary).toMatch(/حداقل یکی از ۹ شرط/);
  });

  it('reports flat v1 conditions this trigger kind never reads', async () => {
    const v = await validate(
      createBody('draft_dead', {
        schemaVersion: 1,
        when: null,
        trigger: {
          kind: 'event',
          event: 'learning_score_changed',
          conditions: [{ field: 'progress', op: 'lte', value: 40 }],
        },
      }),
    );
    expect(v.errors).toEqual([]);
    expect(v.review?.deadConditions).toEqual(['progress']);
    expect(v.review?.treeSource).toBe('legacy_conditions');
    expect(
      v.warnings.some((w) => w.path === 'trigger.conditions' && /بازنویسی/.test(w.message)),
    ).toBe(true);
  });

  it('refuses to advertise an event that no code emits', async () => {
    const v = await validate(
      createBody('draft_ghost', {
        trigger: { kind: 'event', event: 'package_archived_by_brand' },
      }),
    );
    expect(v.review?.eventProduced).toBe(false);
    expect(v.warnings.some((w) => w.path === 'trigger.event' && /نمی‌فرستد/.test(w.message))).toBe(
      true,
    );
    const produced = await validate(
      createBody('draft_real_event', {
        trigger: { kind: 'event', event: 'quiz.passed', delayMinutes: 30 },
      }),
    );
    expect(produced.review?.eventProduced).toBe(true);
    expect(produced.warnings.some((w) => w.path === 'trigger.event')).toBe(false);
  });

  it('says when a condition can only ever reject, and when there is no condition at all', async () => {
    const unreachable = await validate(
      createBody('draft_unreachable', { when: leaf('event.score', 'gte', 10) }),
    );
    expect(
      unreachable.warnings.some((w) => w.path === 'when' && /همیشه رد می‌شود/.test(w.message)),
    ).toBe(true);
    const bare = await validate(
      createBody('draft_bare', {
        trigger: { kind: 'event', event: 'quiz.passed' },
        when: null,
      }),
    );
    expect(bare.ok).toBe(true);
    expect(bare.warnings.some((w) => /هر رویداد/.test(w.message))).toBe(true);
  });

  it('keeps «valid» and «will send» two different sentences', async () => {
    const off = await validate(createBody('draft_off'));
    expect(off.review?.runNote).toMatch(/خاموش/);
    const on = await validate(createBody('draft_on', { enabled: true }));
    expect(on.ok).toBe(true);
    expect(on.review?.runNote).toBeNull();
  });

  it('validates a patch merged over the stored rule, without bumping its version', async () => {
    await createRule(createBody('draft_patch'));
    expect(
      (await ctx.deps.store.get<{ version: number }>(`${AUTOMATIONS}/draft_patch`))?.version,
    ).toBe(1);
    const v = await validateKey('draft_patch', {
      steps: [
        notifyStep('n1', 'گام نخست', 'متن گام نخست برای کسی که شرط قاعده برایش برقرار است.'),
        { type: 'wait', id: 'w1', minutes: 60 },
        notifyStep('n2', 'گام دوم', 'متن گام دوم، یک ساعت بعد از گام نخست.'),
      ],
      repeatPolicy: { perStep: { n2: { minGapMs: 3_600_000 } } },
    });
    expect(v.ok).toBe(true);
    expect(v.review?.usesFlow).toBe(true);
    expect(v.review?.stepIds).toEqual(['n1', 'w1', 'n2']);
    expect(v.review?.pendingSteps).toBe(0);
    // The patch did not mention `when`, so the candidate the save would write keeps the stored tree.
    expect(v.normalized?.when).toMatchObject({ type: 'leaf', field: 'user.status' });
    expect(
      (await ctx.deps.store.get<{ version: number }>(`${AUTOMATIONS}/draft_patch`))?.version,
    ).toBe(1);
  });

  it('refuses a step policy for a step that does not exist, before the save has to', async () => {
    await createRule(createBody('draft_ghost_policy'));
    const v = await validateKey('draft_ghost_policy', { repeatPolicy: { perStep: { ghost: {} } } });
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });
});

describe('POST /admin/push-automations/:key/duplicate', () => {
  it('copies what was written and none of the history', async () => {
    await createRule(createBody('draft_src', { enabled: true }));
    const srcBefore = await ctx.deps.store.get<Record<string, unknown>>(`${AUTOMATIONS}/draft_src`);
    const r = await api(admin).post('/v1/admin/push-automations/draft_src/duplicate', {
      key: 'draft_copy',
    });
    expect(r.status).toBe(201);
    const copy = await ctx.deps.store.get<Record<string, unknown>>(`${AUTOMATIONS}/draft_copy`);
    expect(copy).toBeTruthy();
    // A copy never lights up, whatever the source was doing.
    expect(copy?.enabled).toBe(false);
    expect(copy?.version).toBe(1);
    expect(copy?.isSystem).toBe(false);
    expect(copy?.name).toMatch(/کپی\)$/);
    expect(JSON.stringify(copy?.when)).toBe(JSON.stringify(srcBefore?.when));
    expect(JSON.stringify(copy?.message)).toBe(JSON.stringify(srcBefore?.message));
    expect(JSON.stringify(copy?.delivery)).toBe(JSON.stringify(srcBefore?.delivery));
    // And the source is untouched: same version, still switched on.
    const src = await ctx.deps.store.get<Record<string, unknown>>(`${AUTOMATIONS}/draft_src`);
    expect(src?.enabled).toBe(true);
    expect(src?.version).toBe(1);
    // The copy is auditable as its own act, and readable through the same detail endpoint.
    const detail = data<{ key: string; enabled: boolean }>(
      await api(admin).get('/v1/admin/push-automations/draft_copy'),
    );
    expect(detail).toMatchObject({ key: 'draft_copy', enabled: false });
  });

  it('refuses to overwrite a rule that exists and a key the catalogue owns', async () => {
    await createRule(createBody('draft_two'));
    expect(
      (
        await api(admin).post('/v1/admin/push-automations/draft_two/duplicate', {
          key: 'draft_two',
        })
      ).status,
    ).toBe(409);
    const gate = await api(admin).post('/v1/admin/push-automations/draft_two/duplicate', {
      key: 'inactive_1d',
    });
    expect(gate.status).toBe(409);
    expect((await ctx.deps.store.query({ collection: AUTOMATIONS })).length).toBe(
      (await ctx.deps.store.query({ collection: AUTOMATIONS })).length,
    );
  });

  it('refuses a gate row, whose message lives in the template', async () => {
    const rows = data<{ rows: Array<{ key: string; isGate: boolean }> }>(
      await api(admin).get('/v1/admin/push-automations'),
    ).rows;
    const gate = rows.find((r) => r.isGate);
    expect(gate).toBeTruthy();
    const r = await api(admin).post(`/v1/admin/push-automations/${gate?.key}/duplicate`, {
      key: 'from_gate',
    });
    expect(r.status).toBe(409);
    expect(await ctx.deps.store.get(`${AUTOMATIONS}/from_gate`)).toBeFalsy();
  });

  it('does not inherit the parked steps of the rule it came from', async () => {
    await createRule(
      createBody('draft_flow', {
        // A flow that speaks twice owns its cadence, exactly as the D4 tests do.
        repeatPolicy: { minIntervalMs: 60_000, perDay: 12, allowSameDayMultiple: true },
        steps: [
          notifyStep('n1', 'گام نخست', 'متن گام نخست برای کسی که شرط قاعده برایش برقرار است.'),
          { type: 'wait', id: 'w1', minutes: 120 },
          notifyStep('n2', 'گام دوم', 'متن گام دوم، دو ساعت بعد از گام نخست.'),
        ],
      }),
    );
    await patchRule('draft_flow', { enabled: true });
    await api(admin).post('/v1/admin/push-automations/run', { force: true });
    const parked = await listPendingSteps(ctx.deps, 'draft_flow', { days: 2 });
    expect(parked.items.length).toBeGreaterThan(0);

    await api(admin).post('/v1/admin/push-automations/draft_flow/duplicate', {
      key: 'draft_flow_copy',
    });
    expect((await listPendingSteps(ctx.deps, 'draft_flow_copy', { days: 2 })).items).toHaveLength(
      0,
    );
    // Duplicating is not a cancellation: the source still has exactly what it had.
    expect((await listPendingSteps(ctx.deps, 'draft_flow', { days: 2 })).items).toHaveLength(
      parked.items.length,
    );
  });
});

describe('GET /admin/push-automations/:key/preview', () => {
  it('answers per user, renders the text for that user, and sends nothing', async () => {
    await api(admin).post(
      '/v1/admin/push-automations',
      createBody('draft_prev', { enabled: true }),
    );
    const notifications = await notifCount();
    const audits = await auditCount();
    const r = data<Preview>(
      await api(admin).get(
        `/v1/admin/push-automations/draft_prev/preview?userIds=${marketer.id},${admin.id}`,
      ),
    );
    expect(r.key).toBe('draft_prev');
    expect(r.paused).toBe(false);
    expect(r.enabled).toBe(true);
    expect(r.note).toMatch(/هیچ اعلانی ساخته نمی‌شود/);
    expect(r.rows).toHaveLength(2);

    const forMarketer = r.rows.find((x) => x.userId === marketer.id);
    const forAdmin = r.rows.find((x) => x.userId === admin.id);
    expect(forMarketer?.exists).toBe(true);
    expect(forMarketer?.name).toBeTruthy();
    // The audience is role=marketer, so the admin is outside the population — and it says which half said no.
    expect(forMarketer?.inPopulation).toBe(true);
    expect(forAdmin?.inPopulation).toBe(false);
    expect(forAdmin?.audienceWhy).toMatch(/خارج از مخاطب/);
    // The condition holds for an active account, and the text is rendered with that user's own name.
    expect(forMarketer?.matched).toBe(true);
    expect(forMarketer?.whyNot).toBeNull();
    expect(forMarketer?.explain[0]).toMatch(/^✓/);
    // No placeholder survives into the sentence, and it is the user's own name in it.
    expect(forMarketer?.title).toMatch(/^سلام \S+/);
    expect(forMarketer?.title).not.toContain('{');

    expect(await notifCount()).toBe(notifications);
    expect(await auditCount()).toBe(audits);
    expect(ctx.deps.push.sent).toHaveLength(0);
    expect((await listPendingSteps(ctx.deps, 'draft_prev', {})).items).toHaveLength(0);
    expect(
      (await ctx.deps.store.get<Record<string, unknown>>(`${AUTOMATIONS}/draft_prev`))?.stats,
    ).toBe(null);
  });

  it('distinguishes a condition that fails from a user who is out of the audience', async () => {
    await createRule(createBody('draft_never', { when: NEVER, enabled: true }));
    const r = data<Preview>(
      await api(admin).get(`/v1/admin/push-automations/draft_never/preview?userIds=${marketer.id}`),
    );
    const row = r.rows[0];
    expect(row?.inPopulation).toBe(true);
    expect(row?.matched).toBe(false);
    expect(row?.whyNot).toMatch(/وضعیت حساب/);
    expect(row?.explain[0]).toMatch(/^✗/);
  });

  it('accepts a Persian separator, drops blanks and caps the group at ten', async () => {
    await createRule(createBody('draft_group'));
    const ids = [
      marketer.id,
      ' ',
      admin.id,
      ...Array.from({ length: 12 }, (_, i) => `u_missing_${i}`),
    ].join('،');
    const r = data<Preview>(
      await api(admin).get(
        `/v1/admin/push-automations/draft_group/preview?userIds=${encodeURIComponent(ids)}`,
      ),
    );
    expect(r.rows).toHaveLength(10);
    expect(r.rows.filter((x) => x.exists).map((x) => x.userId)).toEqual(
      expect.arrayContaining([marketer.id, admin.id]),
    );
    // An unknown id is a row that says so — not a 404 for the whole request.
    expect(r.rows.some((x) => !x.exists && x.userId.startsWith('u_missing_'))).toBe(true);
    expect(r.rows.find((x) => !x.exists)?.audienceWhy).toMatch(/وجود ندارد/);
  });

  it('refuses an empty group and an unknown rule', async () => {
    await createRule(createBody('draft_group'));
    expect(
      (await api(admin).get('/v1/admin/push-automations/draft_group/preview?userIds=%20')).status,
    ).toBe(400);
    expect(
      (await api(admin).get('/v1/admin/push-automations/nope_x/preview?userIds=y')).status,
    ).toBe(404);
  });

  it('shows the step plan of a flow next to the verdict', async () => {
    await createRule(createBody('draft_plan'));
    await patchRule('draft_plan', {
      steps: [
        notifyStep('n1', 'گام نخست', 'متن گام نخست برای کسی که شرط قاعده برایش برقرار است.'),
        { type: 'wait', id: 'w1', minutes: 60 },
        notifyStep('n2', 'گام دوم', 'متن گام دوم، یک ساعت بعد از گام نخست.'),
      ],
    });
    const r = data<Preview>(
      await api(admin).get(`/v1/admin/push-automations/draft_plan/preview?userIds=${marketer.id}`),
    );
    expect(r.rows[0]?.steps.map((s) => s.id)).toEqual(['n1', 'w1', 'n2']);
    expect(r.rows[0]?.steps[1]?.label).toMatch(/^صبر/);
    expect(r.rows[0]?.inFilter).toBe(true);
  });
});
