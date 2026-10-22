import { beforeEach, describe, expect, it } from 'vitest';
import type { Team, User } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

const NATIONAL_CODE = '1234567891';
const NEXT_PASSWORD = 'manager-secure-987';

let ctx: TestCtx;
let admin: { id: string; token: string };

beforeEach(async () => {
  ctx = await createCtx();
  admin = await ctx.user('admin');
  await ctx.deps.store.set('teams/team-tehran', {
    name: 'تیم تهران',
    managerId: null,
    province: 'تهران',
    city: 'تهران',
    archived: false,
    createdAt: ctx.deps.clock().toISOString(),
    updatedAt: ctx.deps.clock().toISOString(),
  } satisfies Team);
  await ctx.deps.store.set('teams/team-isfahan', {
    name: 'تیم اصفهان',
    managerId: null,
    province: 'اصفهان',
    city: 'اصفهان',
    archived: false,
    createdAt: ctx.deps.clock().toISOString(),
    updatedAt: ctx.deps.clock().toISOString(),
  } satisfies Team);
});

describe('Admin-created accounts and Manager first-login setup', () => {
  it('creates an immediately active Manager with a one-time password and gates the panel until setup', async () => {
    const created = await ctx.api(admin.token).post('/v1/admin/users', {
      firstName: 'مریم',
      lastName: 'رضایی',
      phone: '۰۹۱۲۵۵۵۰۱۲۳',
      role: 'manager',
      teamId: 'team-tehran',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.user).toMatchObject({
      name: 'مریم رضایی',
      phone: '09125550123',
      role: 'manager',
      teamId: 'team-tehran',
      status: 'active',
      province: 'تهران',
      city: 'تهران',
      managerProfileRequired: true,
    });
    const managerId = created.body.data.user.id as string;
    const temporaryPassword = created.body.data.temporaryPassword as string;
    expect(temporaryPassword).toMatch(/[a-z]/);
    expect(temporaryPassword).toMatch(/\d/);
    expect(await ctx.deps.store.get(`manager_access_requests/${managerId}`)).toBeNull();

    const lookup = await ctx.api().post('/v1/auth/manager-access/lookup', {
      phone: '09125550123',
    });
    expect(lookup.body.data).toMatchObject({ flow: 'sign_in', phone: '09125550123' });
    const signedIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: '09125550123',
      password: temporaryPassword,
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data).toMatchObject({
      state: 'active',
      user: { id: managerId, managerProfileRequired: true },
    });
    const token = signedIn.body.data.idToken as string;
    expect((await ctx.api(token).get('/v1/manager/profile')).status).toBe(403);
    expect((await ctx.api(token).get('/v1/manager/dashboard')).status).toBe(403);

    const completed = await ctx.api(token).post('/v1/manager/complete-profile', {
      name: 'مریم رضایی',
      nationalCode: NATIONAL_CODE,
      province: 'تهران',
      city: 'تهران',
      newPassword: NEXT_PASSWORD,
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({
      id: managerId,
      role: 'manager',
      teamId: 'team-tehran',
      hasNationalCode: true,
      managerProfileRequired: false,
    });
    expect(JSON.stringify(completed.body.data)).not.toContain(NATIONAL_CODE);
    const stored = await ctx.deps.store.get<User>(`users/${managerId}`);
    expect(stored?.nationalCodeHash).toBeTruthy();
    expect(stored).toMatchObject({
      managerProfileRequired: false,
      managerProfileCompletedAt: ctx.deps.clock().toISOString(),
    });
    expect((await ctx.api(token).get('/v1/manager/profile')).status).toBe(200);

    expect(
      (
        await ctx.api().post('/v1/auth/manager-access/sign-in', {
          phone: '09125550123',
          password: temporaryPassword,
        })
      ).status,
    ).toBe(401);
    const reauthenticated = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: '09125550123',
      password: NEXT_PASSWORD,
    });
    expect(reauthenticated.body.data).toMatchObject({
      state: 'active',
      user: { managerProfileRequired: false },
    });

    const marketer = await ctx.user('marketer', { teamId: 'team-isfahan' });
    expect(
      (
        await ctx
          .api(reauthenticated.body.data.idToken as string)
          .get(`/v1/manager/users/${marketer.id}/progress`)
      ).status,
    ).toBe(403);
  });

  it('lets Admin block and restore a Manager without removing the team assignment', async () => {
    const created = await ctx.api(admin.token).post('/v1/admin/users', {
      firstName: 'رضا',
      lastName: 'مدیر',
      phone: '09125550124',
      role: 'manager',
      teamId: 'team-tehran',
    });
    const managerId = created.body.data.user.id as string;
    const temporaryPassword = created.body.data.temporaryPassword as string;

    const blocked = await ctx.api(admin.token).patch(`/v1/admin/users/${managerId}`, {
      status: 'inactive',
    });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.user).toMatchObject({ status: 'inactive', teamId: 'team-tehran' });
    const blockedLogin = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: '09125550124',
      password: temporaryPassword,
    });
    expect(blockedLogin.status).toBe(401);
    const teamWhenBlocked = (await ctx.api(admin.token).get('/v1/admin/teams')).body.data.find(
      (team: { id: string }) => team.id === 'team-tehran',
    );
    expect(teamWhenBlocked).toMatchObject({ managerIds: [managerId], activeManagerCount: 0 });

    const unblocked = await ctx.api(admin.token).patch(`/v1/admin/users/${managerId}`, {
      status: 'active',
    });
    expect(unblocked.body.data.user).toMatchObject({ status: 'active', teamId: 'team-tehran' });
    const afterUnblock = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: '09125550124',
      password: temporaryPassword,
    });
    expect(afterUnblock.body.data).toMatchObject({ state: 'active' });
  });

  it('requires the first-login profile when Admin promotes an existing account to Manager', async () => {
    const marketer = await ctx.user('marketer', { teamId: 'team-tehran' });
    const promoted = await ctx.api(admin.token).patch(`/v1/admin/users/${marketer.id}`, {
      role: 'manager',
      teamId: 'team-tehran',
    });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.user).toMatchObject({
      role: 'manager',
      teamId: 'team-tehran',
      managerProfileRequired: true,
      managerProfileCompletedAt: null,
    });

    const signedIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: marketer.phone,
      password: 'pass1234',
    });
    expect(signedIn.body.data.user).toMatchObject({ managerProfileRequired: true });
    expect((await ctx.api(signedIn.body.data.idToken).get('/v1/manager/dashboard')).status).toBe(
      403,
    );
  });

  it('requires a team for new Managers, rejects a non-admin creator, and rejects duplicate phone numbers', async () => {
    const missingTeam = await ctx.api(admin.token).post('/v1/admin/users', {
      firstName: 'نام',
      lastName: 'مدیر',
      phone: '09125550125',
      role: 'manager',
    });
    expect(missingTeam.status).toBe(400);
    expect(JSON.stringify(missingTeam.body.error)).toContain('teamId');

    const marketer = await ctx.user('marketer');
    const forbidden = await ctx.api(marketer.token).post('/v1/admin/users', {
      firstName: 'نام',
      lastName: 'مدیر',
      phone: '09125550126',
      role: 'manager',
      teamId: 'team-tehran',
    });
    expect(forbidden.status).toBe(403);

    const body = {
      firstName: 'نام',
      lastName: 'اول',
      phone: '09125550127',
      role: 'manager',
      teamId: 'team-tehran',
    };
    expect((await ctx.api(admin.token).post('/v1/admin/users', body)).status).toBe(201);
    const duplicate = await ctx.api(admin.token).post('/v1/admin/users', body);
    expect(duplicate.status).toBe(409);
  });
});
