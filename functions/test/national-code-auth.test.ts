import { beforeEach, describe, expect, it } from 'vitest';
import { ids, nationalCodeDigest } from '../src/lib/ids';
import { NATIONAL_CODE_PROVINCES, provinceUsesNationalCode } from '../src/domain/nationalCode';
import type { User } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

const NATIONAL_CODE = '1234567891';
const NATIONAL_CODE_PERSIAN = '۱۲۳۴۵۶۷۸۹۱';
const listedProvince = { province: 'یزد', city: 'یزد' };

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx();
});

describe('national-code sign-up and sign-in', () => {
  it('matches the configured province list exactly and canonicalizes before applying the rule', () => {
    expect(NATIONAL_CODE_PROVINCES).toEqual([
      'آذربایجان غربی',
      'البرز',
      'ایلام',
      'بوشهر',
      'چهارمحال و بختیاری',
      'خوزستان',
      'زنجان',
      'سمنان',
      'فارس',
      'قزوین',
      'قم',
      'کهگیلویه و بویراحمد',
      'گلستان',
      'گیلان',
      'لرستان',
      'مازندران',
      'مرکزی',
      'هرمزگان',
      'همدان',
      'یزد',
    ]);
    expect(provinceUsesNationalCode('یزد')).toBe(true);
    expect(provinceUsesNationalCode('تهران')).toBe(false);
  });

  it('registers in a listed province, returns a session, and accepts the code at login', async () => {
    const reg = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'نگار محمدی',
      nationalCode: NATIONAL_CODE_PERSIAN,
      ...listedProvince,
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user).toMatchObject({
      name: 'نگار محمدی',
      phone: null,
      email: null,
      province: 'یزد',
      city: 'یزد',
    });
    expect(reg.body.data.user).not.toHaveProperty('nationalCodeHash');
    expect(JSON.stringify(reg.body.data.user)).not.toContain(NATIONAL_CODE);
    expect((await ctx.api(reg.body.data.idToken).get('/v1/me')).status).toBe(200);

    const digest = nationalCodeDigest(NATIONAL_CODE, ctx.deps.config.localSecret);
    const stored = await ctx.deps.store.get<User>(`users/${reg.body.data.user.id}`);
    expect(stored?.nationalCodeHash).toBe(digest);
    expect(JSON.stringify(stored)).not.toContain(NATIONAL_CODE);
    expect(stored).not.toHaveProperty('nationalCode');
    const unique = await ctx.deps.store.get<{ uid: string }>(
      `unique_keys/${ids.uniqueKey('nationalCode', digest)}`,
    );
    expect(unique?.uid).toBe(reg.body.data.user.id);

    const login = await ctx.api().post('/v1/auth/national-code-login', {
      nationalCode: NATIONAL_CODE_PERSIAN,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.id).toBe(reg.body.data.user.id);
    const me = await ctx.api(login.body.data.idToken).get('/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.data).not.toHaveProperty('nationalCodeHash');
    expect(JSON.stringify(me.body.data)).not.toContain(NATIONAL_CODE);
  });

  it('enforces the province-to-identifier rule on the server', async () => {
    const phoneForListedProvince = await ctx.api().post('/v1/auth/phone-register', {
      name: 'کاربر یزد',
      phone: '09120001111',
      ...listedProvince,
    });
    expect(phoneForListedProvince.status).toBe(400);
    expect(phoneForListedProvince.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'phone' })]),
    );

    // The older password registration endpoint must not bypass the rule when it receives a location.
    const legacyPhoneForListedProvince = await ctx.api().post('/v1/auth/register', {
      name: 'کاربر قدیمی یزد',
      identifier: '09120001113',
      password: 'abc12345',
      ...listedProvince,
    });
    expect(legacyPhoneForListedProvince.status).toBe(400);
    expect(legacyPhoneForListedProvince.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'identifier' })]),
    );

    const codeForOtherProvince = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'کاربر تهران',
      nationalCode: NATIONAL_CODE,
      province: 'تهران',
      city: 'تهران',
    });
    expect(codeForOtherProvince.status).toBe(400);
    expect(codeForOtherProvince.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nationalCode' })]),
    );

    ctx.limiter.reset();
    const phoneForOtherProvince = await ctx.api().post('/v1/auth/phone-register', {
      name: 'کاربر تهران',
      phone: '09120001112',
      province: 'تهران',
      city: 'تهران',
    });
    expect(phoneForOtherProvince.status).toBe(201);
  });

  it('rejects malformed/checksum-invalid national codes before registration or login', async () => {
    const invalid = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'کد نامعتبر',
      nationalCode: '1234567890',
      ...listedProvince,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nationalCode' })]),
    );

    const login = await ctx.api().post('/v1/auth/national-code-login', {
      nationalCode: '۱۲۳۴۵۶۷۸۹۰',
    });
    expect(login.status).toBe(400);
    expect(login.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nationalCode' })]),
    );
  });

  it('enforces uniqueness, blocks blacklisted codes, and releases the code after permanent purge', async () => {
    const reg = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'کاربر هدف',
      nationalCode: NATIONAL_CODE,
      ...listedProvince,
    });
    expect(reg.status).toBe(201);
    const oldIdToken = reg.body.data.idToken as string;
    const oldRefreshToken = reg.body.data.refreshToken as string;
    ctx.limiter.reset();
    const duplicate = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'کاربر تکراری',
      nationalCode: NATIONAL_CODE,
      ...listedProvince,
    });
    expect(duplicate.status).toBe(409);

    const admin = await ctx.user('admin');
    const userId = reg.body.data.user.id as string;
    const archived = await ctx.api(admin.token).del(`/v1/admin/users/${userId}`);
    expect(archived.status).toBe(200);
    ctx.limiter.reset();
    const blocked = await ctx.api().post('/v1/auth/national-code-login', {
      nationalCode: NATIONAL_CODE,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toContain('مسدود');

    const purged = await ctx.api(admin.token).del(`/v1/admin/archive/users/${userId}`);
    expect(purged.status).toBe(200);
    const digest = nationalCodeDigest(NATIONAL_CODE, ctx.deps.config.localSecret);
    expect(
      await ctx.deps.store.get(`unique_keys/${ids.uniqueKey('nationalCode', digest)}`),
    ).toBeNull();
    expect((await ctx.api(oldIdToken).get('/v1/me')).status).toBe(401);
    expect(
      (await ctx.api().post('/v1/auth/refresh', { refreshToken: oldRefreshToken })).status,
    ).toBe(401);

    ctx.limiter.reset();
    const reused = await ctx.api().post('/v1/auth/national-code-register', {
      name: 'کاربر تازه',
      nationalCode: NATIONAL_CODE,
      ...listedProvince,
    });
    expect(reused.status).toBe(201);
    expect(reused.body.data.user.id).not.toBe(userId);
    // Reusing an identifier must never revive the deleted account's tokens.
    expect((await ctx.api(oldIdToken).get('/v1/me')).status).toBe(401);
    expect(
      (await ctx.api().post('/v1/auth/refresh', { refreshToken: oldRefreshToken })).status,
    ).toBe(401);
  });
});
