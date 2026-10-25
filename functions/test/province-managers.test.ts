import { beforeEach, describe, expect, it } from 'vitest';
import type { Team, User } from '../src/domain/types';
import { ids, phoneToAuthEmail } from '../src/lib/ids';
import { createCtx, type TestCtx } from './support/ctx';

let ctx: TestCtx;

beforeEach(async () => {
  ctx = await createCtx();
  await ctx.deps.store.set('teams/team-seylane', {
    name: 'تیم سیلانه',
    managerId: null,
    province: null,
    city: null,
    archived: false,
    createdAt: ctx.deps.clock().toISOString(),
    updatedAt: ctx.deps.clock().toISOString(),
  } satisfies Team);
});

async function marketerIn(province: string, city: string, teamId: string | null = 'team-seylane') {
  const user = await ctx.user('marketer', { teamId });
  await ctx.deps.store.update(`users/${user.id}`, { province, city });
  return user;
}

describe('Province-based Manager scope', () => {
  it('shows every marketer of all supervised provinces without any team', async () => {
    const tehranA = await marketerIn('تهران', 'تهران');
    const tehranB = await marketerIn('تهران', 'ری');
    const mazandaran = await marketerIn('مازندران', 'ساری');
    const shiraz = await marketerIn('فارس', 'شیراز');

    const admin = await ctx.user('admin');
    const created = await ctx.api(admin.token).post('/v1/admin/users', {
      firstName: 'احمد',
      lastName: 'رضایی',
      phone: '09125550999',
      role: 'manager',
      managerProvinces: ['تهران', 'مازندران'],
    });
    expect(created.status).toBe(201);
    const managerId = created.body.data.user.id as string;
    const temporaryPassword = created.body.data.temporaryPassword as string;

    const signedIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: '09125550999',
      password: temporaryPassword,
    });
    const token = signedIn.body.data.idToken as string;
    await ctx.deps.store.update(`users/${managerId}`, { managerProfileRequired: false });

    const members = await ctx.api(token).get('/v1/manager/members');
    expect(members.status).toBe(200);
    const ids = (members.body.data.members as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(tehranA.id);
    expect(ids).toContain(tehranB.id);
    expect(ids).toContain(mazandaran.id);
    expect(ids).not.toContain(shiraz.id);
    expect(members.body.data.provinces).toEqual(['تهران', 'مازندران']);
    expect(members.body.data.totals.members).toBe(3);
    expect(members.body.data.byProvince).toEqual(
      expect.arrayContaining([
        { province: 'تهران', members: 2 },
        { province: 'مازندران', members: 1 },
      ]),
    );

    const dashboard = await ctx.api(token).get('/v1/manager/dashboard');
    expect(dashboard.body.data.team).toBeNull();
    expect(dashboard.body.data.provinces).toEqual(['تهران', 'مازندران']);
    expect(dashboard.body.data.kpis.members).toBe(3);

    const profile = await ctx.api(token).get('/v1/manager/profile');
    expect(profile.body.data).toMatchObject({
      team: null,
      managerProvinces: ['تهران', 'مازندران'],
    });

    // In-scope member detail works; out-of-scope is refused.
    expect((await ctx.api(token).get(`/v1/manager/users/${tehranA.id}/progress`)).status).toBe(200);
    expect((await ctx.api(token).get(`/v1/manager/users/${shiraz.id}/progress`)).status).toBe(403);
    expect(shiraz).toBeTruthy();
  });

  it('merges manual team members with province marketers without duplicates', async () => {
    await ctx.deps.store.set('teams/team-x', {
      name: 'تیم ویژه',
      managerId: null,
      province: null,
      city: null,
      archived: false,
      createdAt: ctx.deps.clock().toISOString(),
      updatedAt: ctx.deps.clock().toISOString(),
    } satisfies Team);
    const teamOutsider = await marketerIn('فارس', 'شیراز', 'team-x');
    const tehran = await marketerIn('تهران', 'تهران', 'team-x');
    const manager = await ctx.user('manager', {
      teamId: 'team-x',
      managerProvinces: ['تهران'],
    });

    const members = await ctx.api(manager.token).get('/v1/manager/members');
    const ids = (members.body.data.members as Array<{ id: string }>).map((m) => m.id);
    expect(ids.sort()).toEqual([teamOutsider.id, tehran.id].sort());
  });

  it('legacy Manager without managerProvinces falls back to their recorded province', async () => {
    const tehran = await marketerIn('تهران', 'تهران');
    await marketerIn('فارس', 'شیراز');
    const manager = await ctx.user('manager', { teamId: null });
    // Simulate a pre-existing Manager document: no team, no managerProvinces field.
    await ctx.deps.store.update(`users/${manager.id}`, { province: 'تهران', city: 'تهران' });
    const stored = await ctx.deps.store.get<User>(`users/${manager.id}`);
    expect(stored?.managerProvinces).toBeUndefined();

    const members = await ctx.api(manager.token).get('/v1/manager/members');
    const ids = (members.body.data.members as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toEqual([tehran.id]);
    expect(members.body.data.provinces).toEqual(['تهران']);
  });

  it('groups marketers into automatic province teams for Admin', async () => {
    const tehranA = await marketerIn('تهران', 'تهران');
    const tehranB = await marketerIn('تهران', 'ری');
    const mazandaran = await marketerIn('مازندران', 'ساری');
    const homeless = await ctx.user('marketer');
    const manager = await ctx.user('manager', { managerProvinces: ['تهران', 'مازندران'] });
    const admin = await ctx.user('admin');

    const res = await ctx.api(admin.token).get('/v1/admin/province-teams');
    expect(res.status).toBe(200);
    const groups = res.body.data.provinces as Array<{
      province: string;
      memberCount: number;
      managers: Array<{ id: string }>;
      members: Array<{ id: string; city: string | null }>;
    }>;
    const tehranGroup = groups.find((g) => g.province === 'تهران');
    expect(tehranGroup?.memberCount).toBe(2);
    expect(tehranGroup?.members.map((m) => m.id).sort()).toEqual([tehranA.id, tehranB.id].sort());
    expect(tehranGroup?.managers.map((m) => m.id)).toEqual([manager.id]);
    const mazandaranGroup = groups.find((g) => g.province === 'مازندران');
    expect(mazandaranGroup?.members.map((m) => m.id)).toEqual([mazandaran.id]);
    expect(mazandaranGroup?.managers.map((m) => m.id)).toEqual([manager.id]);
    expect(res.body.data.unassigned.members.map((m: { id: string }) => m.id)).toContain(
      homeless.id,
    );

    // Marketers cannot read the admin grouping.
    expect((await ctx.api(homeless.token).get('/v1/admin/province-teams')).status).toBe(403);
  });

  it('lets a province-only Manager run a campaign for their scope', async () => {
    await marketerIn('تهران', 'تهران');
    const manager = await ctx.user('manager', { managerProvinces: ['تهران'] });

    const preview = await ctx.api(manager.token).post('/v1/manager/campaigns/audience-preview', {
      channel: 'any',
    });
    expect(preview.status).toBe(200);

    const created = await ctx.api(manager.token).post('/v1/manager/campaigns', {
      name: 'پیام مدیر تهران',
      title: 'پیام مدیر تهران',
      body: 'سلام به بازاریاب‌های تهران',
      imageUrl: null,
      actionRef: '/learn',
      audience: { type: 'team', targetId: `manager-scope:${manager.id}`, channel: 'any' },
      scheduledAt: null,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.campaign.audience.targetId).toBe(`manager-scope:${manager.id}`);

    const list = await ctx.api(manager.token).get('/v1/manager/campaigns');
    expect(list.status).toBe(200);
    expect((list.body.data.items as Array<{ id: string }>).map((c) => c.id)).toContain(
      created.body.data.campaign.id,
    );
  });

  it('registers a marketer on a phone that already has a Manager account', async () => {
    await ctx.user('manager', { managerProvinces: ['تهران'] });
    const managerPhone = '09125550888';
    const admin = await ctx.user('admin');
    const managerCreated = await ctx.api(admin.token).post('/v1/admin/users', {
      firstName: 'مدیر',
      lastName: 'دو حساب',
      phone: managerPhone,
      role: 'manager',
      managerProvinces: ['تهران'],
    });
    expect(managerCreated.status).toBe(201);

    // Self sign-up as a marketer with the very same phone succeeds and yields a marketer session.
    const registered = await ctx.api().post('/v1/auth/register', {
      name: 'بازاریاب همان شماره',
      identifier: managerPhone,
      password: 'marketer-pass-123',
      province: 'تهران',
      city: 'تهران',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe('marketer');
    expect(registered.body.data.user.id).not.toBe(managerCreated.body.data.user.id);

    const managerLogin = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: managerPhone,
      password: managerCreated.body.data.temporaryPassword as string,
    });
    expect(managerLogin.body.data).toMatchObject({
      state: 'active',
      user: { id: managerCreated.body.data.user.id, role: 'manager' },
    });
  });

  it('migrates a pre-split Manager phone so the same number can register as a marketer again', async () => {
    // Simulate production data from before the split: one Manager account on the legacy
    // phone-domain auth email holding the legacy phone reservation.
    const phone = '09125550777';
    const legacyUid = await ctx.deps.auth.createUser({
      email: phoneToAuthEmail(phone),
      password: 'legacy-manager-123',
      displayName: 'مدیر قدیمی',
    });
    const now = ctx.deps.clock().toISOString();
    await ctx.deps.store.set(`users/${legacyUid}`, {
      name: 'مدیر قدیمی',
      phone,
      email: null,
      avatarUrl: null,
      avatarPath: null,
      workplace: null,
      nationalCodeHash: null,
      province: 'تهران',
      city: 'تهران',
      firebaseUid: legacyUid,
      role: 'manager',
      teamId: null,
      brandIds: [],
      status: 'active',
      pointsBalance: 0,
      onboardedAt: null,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies User);
    await ctx.deps.store.set(`unique_keys/${ids.uniqueKey('phone', phone)}`, {
      kind: 'phone',
      createdAt: now,
      uid: legacyUid,
    });

    const registered = await ctx.api().post('/v1/auth/register', {
      name: 'بازاریاب تازه',
      identifier: phone,
      password: 'marketer-pass-456',
      province: 'تهران',
      city: 'تهران',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe('marketer');
    expect(registered.body.data.user.id).not.toBe(legacyUid);

    // The legacy Manager still signs in with the same phone + password…
    const managerLogin = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone,
      password: 'legacy-manager-123',
    });
    expect(managerLogin.body.data).toMatchObject({
      state: 'active',
      user: { id: legacyUid, role: 'manager' },
    });
    // …and now sees the new marketer through the province fallback.
    const members = await ctx
      .api(managerLogin.body.data.idToken as string)
      .get('/v1/manager/members');
    expect(members.body.data.totals.members).toBe(1);
  });
});
