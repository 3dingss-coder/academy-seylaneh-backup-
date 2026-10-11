import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY } from '../src/lib/time';
import { touchUserActive, TOUCH_GIVEUP_MS, TOUCH_THROTTLE_MS } from '../src/services/users';
import { factsFor, matchConditions } from '../src/services/push-automation-engine';
import { catalogSeed } from '../src/services/push-automation-catalog';
import { createCtx, type TestCtx } from './support/ctx';
import type { PackageView } from '../src/services/learning-state';
import type { Doc } from '../src/store/types';
import type { User } from '../src/domain/types';

/**
 * `users.lastActiveAt` is the presence stamp: the inactivity ladder counts days from it and the panel
 * shows it as «آخرین فعالیت». Before this layer only a password login or a saved lesson moved it, so
 * «has not opened the site for a day» was measured as «has not studied for a day» — and a learner who
 * opens the app every day but stops studying looked perfectly active to the ladder's neighbour rules…
 * no: it looked *inactive* to nothing, and the other way round, an app open silenced «زنجیره در خطر».
 *
 * These tests pin the three things that make the stamp trustworthy: the 10-minute throttle that keeps it
 * affordable, the two request paths that set it, and the boundary the whole design leans on — presence
 * resets *inactivity*, it never claims that a lesson happened.
 */

let ctx: TestCtx;
let u: { id: string; token: string; phone: string };
const store = () => ctx.deps.store;
const doc = async () => (await store().get<User>(`users/${u.id}`)) as Doc<User>;
const iso = (msAgo: number) => new Date(ctx.deps.clock().getTime() - msAgo).toISOString();
/** Backdate the stamp so the next touch is allowed to write. */
const stale = (ms = 60 * 60_000) => store().update(`users/${u.id}`, { lastActiveAt: iso(ms) });

beforeEach(async () => {
  ctx = await createCtx({ start: '2026-10-03T06:30:00.000Z' }); // 10:00 Tehran, Saturday
  u = await ctx.user('marketer');
});

describe('touchUserActive', () => {
  it('writes once every ten minutes, not once per request', async () => {
    await stale();
    expect(await touchUserActive(ctx.deps, await doc())).toBe(ctx.deps.clock().toISOString());

    const spy = vi.spyOn(ctx.deps.store, 'update');
    ctx.advance(TOUCH_THROTTLE_MS - 1_000);
    expect(await touchUserActive(ctx.deps, await doc())).toBeNull();
    expect(
      spy,
      'a stamp younger than the throttle must not reach the store at all',
    ).not.toHaveBeenCalled();

    ctx.advance(2_000);
    expect(await touchUserActive(ctx.deps, await doc())).toBe(ctx.deps.clock().toISOString());
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await doc()).lastActiveAt).toBe(ctx.deps.clock().toISOString());
    spy.mockRestore();
  });

  it('a stamp from the future is fresh; a missing one always writes', async () => {
    // Clock skew is the reason the comparison is `< throttle` and not a distance: a future stamp must not
    // cause a write on every single request.
    await stale(-60_000);
    expect(await touchUserActive(ctx.deps, await doc())).toBeNull();
    await store().update(`users/${u.id}`, { lastActiveAt: null });
    expect(await touchUserActive(ctx.deps, await doc())).toBe(ctx.deps.clock().toISOString());
  });

  it('a failing store is swallowed, and the log line carries no identifier', async () => {
    await stale();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const orig = ctx.deps.store.update;
    ctx.deps.store.update = (async () => {
      throw new Error('d1 refused: users/u-secret-1');
    }) as typeof orig;
    expect(await touchUserActive(ctx.deps, await doc())).toBeNull();
    const lines = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('user_active_touch_incomplete');
    expect(lines).not.toContain(u.id);
    expect(lines).not.toContain('d1 refused');
    ctx.deps.store.update = orig;
    warn.mockRestore();
  });

  it('gives up on a stalled store instead of holding the request open', async () => {
    await stale();
    const orig = ctx.deps.store.update;
    // The production failure this guards: a D1 wait that never settles (test/d1-hang reproduces the
    // mechanism at the store level). Presence may not put a user's login behind it.
    ctx.deps.store.update = () => new Promise<void>(() => {}) as ReturnType<typeof orig>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const started = Date.now();
    expect(await touchUserActive(ctx.deps, await doc())).toBeNull();
    expect(Date.now() - started).toBeLessThan(TOUCH_GIVEUP_MS + 2_000);
    ctx.deps.store.update = orig;
    warn.mockRestore();
  });
});

describe('دو مسیر حضور: /me/events و auth/refresh', () => {
  it('POST /me/events moves the stamp for app_opened and for nothing else', async () => {
    await stale();
    await ctx.api(u.token).post('/v1/me/events', { name: 'mentor_chat_opened' }).expect(204);
    expect((await doc()).lastActiveAt).not.toBe(ctx.deps.clock().toISOString());

    await ctx
      .api(u.token)
      .post('/v1/me/events', { name: 'app_opened', props: { native: false } })
      .expect(204);
    expect((await doc()).lastActiveAt).toBe(ctx.deps.clock().toISOString());

    // The second open of the same window is free — no write, so no D1 round-trip.
    const spy = vi.spyOn(ctx.deps.store, 'update');
    await ctx.api(u.token).post('/v1/me/events', { name: 'app_opened' }).expect(204);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a broken presence write still answers 204', async () => {
    await stale();
    const orig = ctx.deps.store.update;
    ctx.deps.store.update = (async () => {
      throw new Error('nope');
    }) as typeof orig;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ctx.api(u.token).post('/v1/me/events', { name: 'app_opened' }).expect(204);
    ctx.deps.store.update = orig;
    warn.mockRestore();
  });

  it('a token refresh is presence — and a disabled account is refused before anything is written', async () => {
    const login = await ctx
      .api()
      .post('/v1/auth/login', { identifier: u.phone, password: 'pass1234' });
    const rt = login.body.data.refreshToken as string;
    // The login itself stamped the user; make it old again.
    await stale();
    const r = await ctx.api().post('/v1/auth/refresh', { refreshToken: rt }).expect(200);
    // The response is not allowed to quote the pre-write document it read.
    expect(r.body.data.user.lastActiveAt).toBe(ctx.deps.clock().toISOString());
    expect((await doc()).lastActiveAt).toBe(ctx.deps.clock().toISOString());

    await store().update(`users/${u.id}`, { status: 'disabled' });
    await stale();
    const before = (await doc()).lastActiveAt;
    const spy = vi.spyOn(ctx.deps.store, 'update');
    await ctx.api().post('/v1/auth/refresh', { refreshToken: rt }).expect(401);
    expect(spy, 'a refused session must not touch the account record').not.toHaveBeenCalled();
    expect((await doc()).lastActiveAt).toBe(before);
    spy.mockRestore();
  });
});

describe('مرز میان «حضور» و «آموزش»', () => {
  const view = (over: Partial<PackageView> = {}): PackageView =>
    ({
      id: 'pkg-1',
      title: 'آموزش فروش',
      description: '',
      brand: null,
      product: null,
      deadlineAt: null,
      estimatedMinutes: 30,
      status: 'in_progress',
      packageStatus: 'published',
      percent: 40,
      overdue: false,
      completedAt: null,
      onTime: null,
      lastActivityAt: null,
      pathOrder: 1,
      sections: [],
      ...over,
    }) as PackageView;

  /** Three consecutive days of learning stamps: the streak the catalogue rule needs. */
  const streaked = () => [
    view({ lastActivityAt: iso(DAY) }),
    view({ id: 'p2', lastActivityAt: iso(2 * DAY) }),
    view({ id: 'p3', lastActivityAt: iso(3 * DAY) }),
  ];
  // The catalogue's own conditions, read through the same helper the seed uses — so if the rule's
  // definition moves, this test fails loudly instead of silently evaluating an empty tree.
  const streakRiskConditions = catalogSeed('streak_at_risk').trigger.conditions;

  const userDoc = (lastActiveAt: string | null): Doc<User> =>
    ({
      id: u.id,
      createdAt: iso(40 * DAY),
      lastActiveAt,
      status: 'active',
    }) as unknown as Doc<User>;

  it('opening the app resets inactivity without pretending a lesson happened', () => {
    const now = ctx.deps.clock();
    const absent = factsFor(userDoc(iso(2 * DAY)), streaked(), now);
    const opened = factsFor(userDoc(now.toISOString()), streaked(), now);
    // The ladder's own number: the reason this whole layer exists.
    expect(absent.inactiveDays).toBe(2);
    expect(opened.inactiveDays).toBe(0);
    // The learning signal: unchanged by a bare open, so «زنجیره در خطر» survives it…
    expect(absent.todayActive).toBe(false);
    expect(opened.todayActive).toBe(false);
    expect(opened.streakDays).toBe(absent.streakDays);
    expect(matchConditions(opened, streakRiskConditions)).toBe(
      matchConditions(absent, streakRiskConditions),
    );
  });

  it('a lesson today is what turns todayActive on — with or without a recent open', () => {
    const now = ctx.deps.clock();
    const studied = [view({ lastActivityAt: now.toISOString() }), ...streaked()];
    expect(factsFor(userDoc(iso(2 * DAY)), studied, now).todayActive).toBe(true);
    expect(factsFor(userDoc(now.toISOString()), studied, now).todayActive).toBe(true);
    // …and once it is on, the at-risk rule stands down for the rest of the day.
    expect(
      matchConditions(factsFor(userDoc(now.toISOString()), studied, now), streakRiskConditions),
    ).toBe(false);
  });

  it('an account with no stamp at all is «beyond every ladder step», not «active today»', () => {
    const now = ctx.deps.clock();
    const f = factsFor(userDoc(null), [view()], now);
    expect(f.inactiveDays).toBe(9999);
    expect(f.todayActive).toBe(false);
    expect(matchConditions(f, streakRiskConditions)).toBe(false);
  });
});
