import { beforeEach, describe, expect, it } from 'vitest';
import type { ManagerAccessRequest, Team, User } from '../src/domain/types';
import type { ManagerAccessUpload } from '../src/domain/types';
import { createCtx, type TestCtx } from './support/ctx';

const NATIONAL_CODE = '1234567891';
const PASSWORD = 'manager-pass-123';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createCtx();
  for (const id of ['team-a', 'team-b']) {
    await ctx.deps.store.set(`teams/${id}`, {
      name: id === 'team-a' ? 'تیم تهران' : 'تیم اصفهان',
      managerId: null,
      archived: false,
      createdAt: ctx.deps.clock().toISOString(),
      updatedAt: ctx.deps.clock().toISOString(),
    } satisfies Team);
  }
});

async function uploadAvatar() {
  const response = await ctx.api().post('/v1/auth/manager-access/avatar-upload-url', {
    fileName: 'profile.png',
    mime: 'image/png',
    sizeBytes: PNG.length,
  });
  expect(response.status).toBe(201);
  const { uploadId } = response.body.data as { uploadId: string };
  const upload = await ctx.deps.store.get<ManagerAccessUpload>(
    `manager_access_uploads/${uploadId}`,
  );
  if (!upload) throw new Error('upload ticket was not saved');
  await ctx.deps.blob.put(upload.path, PNG, 'image/png');
  return uploadId;
}

async function submitApplication(phone = '09125550123') {
  const avatarUploadId = await uploadAvatar();
  const response = await ctx.api().post('/v1/auth/manager-access/requests', {
    phone,
    fullName: 'مریم مدیرخواه',
    nationalCode: NATIONAL_CODE,
    managementProvince: 'تهران',
    managementCity: 'تهران',
    password: PASSWORD,
    avatarUploadId,
  });
  return response;
}

async function applicantByPhone(phone = '09125550123') {
  const [user] = await ctx.deps.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
    limit: 1,
  });
  if (!user) throw new Error('Manager applicant was not created');
  return user;
}

async function adminRequest(
  adminToken: string,
  userId: string,
  action: 'approve' | 'reject',
  body: object,
) {
  return ctx.api(adminToken).post(`/v1/admin/manager-access-requests/${userId}/${action}`, body);
}

describe('Manager access request and review', () => {
  it('sends unknown and existing marketer numbers into the application flow without revealing names', async () => {
    const marketerName = 'بازاریاب محرمانه';
    const marketer = await ctx.user('marketer', { name: marketerName });
    const unknown = await ctx
      .api()
      .post('/v1/auth/manager-access/lookup', { phone: '۰۹۱۲۵۵۵۰۱۰۰' });
    const existing = await ctx
      .api()
      .post('/v1/auth/manager-access/lookup', { phone: marketer.phone });

    expect(unknown.status).toBe(200);
    expect(unknown.body.data).toMatchObject({ flow: 'apply', phone: '09125550100' });
    expect(existing.status).toBe(200);
    expect(existing.body.data).toMatchObject({ flow: 'apply', phone: marketer.phone });
    expect(existing.body.data).not.toHaveProperty('existingAccount');
    expect(JSON.stringify(existing.body)).not.toContain(marketerName);
  });

  it('preserves an existing marketer account through review, appeal, and Manager approval', async () => {
    const marketer = await ctx.user('marketer', { name: 'بازاریاب موجود' });
    const response = await submitApplication(marketer.phone);
    expect(response.status).toBe(201);

    let user = await ctx.deps.store.get<User>(`users/${marketer.id}`);
    let request = await ctx.deps.store.get<ManagerAccessRequest>(
      `manager_access_requests/${marketer.id}`,
    );
    expect(user).toMatchObject({ role: 'marketer', status: 'active', name: 'بازاریاب موجود' });
    expect(request).toMatchObject({
      userId: marketer.id,
      existingAccount: true,
      status: 'pending',
    });
    expect(request?.managerPasswordCiphertext).toMatch(/^v1\./);
    expect(JSON.stringify(request)).not.toContain(PASSWORD);
    expect((await ctx.api(marketer.token).get('/v1/me')).status).toBe(200);
    const followUpLookup = await ctx.api().post('/v1/auth/manager-access/lookup', {
      phone: marketer.phone,
    });
    expect(followUpLookup.body.data).toMatchObject({ flow: 'sign_in' });
    expect(followUpLookup.body.data).not.toHaveProperty('existingAccount');

    const pending = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: marketer.phone,
      password: PASSWORD,
    });
    expect(pending.body.data).toMatchObject({ state: 'pending' });
    expect(pending.body.data.idToken).toBeUndefined();

    const admin = await ctx.user('admin');
    const adminList = await ctx.api(admin.token).get('/v1/admin/manager-access-requests');
    expect(adminList.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: marketer.id, existingAccount: true })]),
    );
    expect(
      (
        await adminRequest(admin.token, marketer.id, 'reject', {
          reason: 'مدارک هویتی نیاز به تطبیق دوباره دارد.',
        })
      ).status,
    ).toBe(200);
    const rejectedLogin = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: marketer.phone,
      password: PASSWORD,
    });
    expect(rejectedLogin.body.data).toMatchObject({ state: 'rejected' });
    expect(rejectedLogin.body.data.idToken).toBeUndefined();

    const appeal = await ctx.api().post('/v1/auth/manager-access/appeals', {
      phone: marketer.phone,
      password: PASSWORD,
      message: 'لطفاً کد ملی و محدوده مدیریت ثبت‌شده را دوباره بررسی کنید.',
    });
    expect(appeal.status).toBe(200);
    expect(appeal.body.data.status).toBe('review_requested');

    const approved = await adminRequest(admin.token, marketer.id, 'approve', {
      teamId: 'team-a',
      phoneReviewedExternally: true,
    });
    expect(approved.status).toBe(200);
    user = await ctx.deps.store.get<User>(`users/${marketer.id}`);
    request = await ctx.deps.store.get<ManagerAccessRequest>(
      `manager_access_requests/${marketer.id}`,
    );
    expect(user).toMatchObject({ role: 'manager', status: 'active', teamId: 'team-a' });
    expect(request).toMatchObject({ status: 'approved', managerPasswordCiphertext: null });

    const signIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: marketer.phone,
      password: PASSWORD,
    });
    expect(signIn.body.data).toMatchObject({ state: 'active', user: { role: 'manager' } });
  });

  it('creates an inactive Manager account, encrypts the national code, and notifies Admin', async () => {
    const admin = await ctx.user('admin');
    const response = await submitApplication();
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'pending' });

    const applicant = await applicantByPhone();
    const request = await ctx.deps.store.get<ManagerAccessRequest>(
      `manager_access_requests/${applicant.id}`,
    );
    expect(applicant).toMatchObject({ role: 'manager', status: 'inactive', teamId: null });
    expect(applicant.nationalCodeHash).toBeTruthy();
    expect(request?.status).toBe('pending');
    expect(request?.nationalCodeCiphertext).toMatch(/^v1\./);
    expect(JSON.stringify(request)).not.toContain(NATIONAL_CODE);

    const inbox = await ctx.deps.store.query<{
      title: string;
      actionRef: string | null;
      body: string;
    }>({
      collection: 'notifications',
      where: [['userId', '==', admin.id]],
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      title: 'درخواست جدید دسترسی مدیر',
      actionRef: '/admin/users?tab=manager-requests',
    });

    const adminList = await ctx.api(admin.token).get('/v1/admin/manager-access-requests');
    expect(adminList.status).toBe(200);
    expect(adminList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: applicant.id,
          fullName: 'مریم مدیرخواه',
          phone: '09125550123',
          nationalCode: NATIONAL_CODE,
          managementProvince: 'تهران',
          managementCity: 'تهران',
          status: 'pending',
        }),
      ]),
    );

    const wrongPassword = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: applicant.phone,
      password: 'incorrect-pass',
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.message).toContain('شماره یا رمز');
    const pendingLogin = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: applicant.phone,
      password: PASSWORD,
    });
    expect(pendingLogin.status).toBe(200);
    expect(pendingLogin.body.data).toMatchObject({ state: 'pending' });
    expect(pendingLogin.body.data).not.toHaveProperty('idToken');
    expect((await ctx.api().get('/v1/manager/profile')).status).toBe(401);
  });

  it('requires external contact review, provisions the chosen team, then signs the Manager in', async () => {
    const admin = await ctx.user('admin');
    await submitApplication();
    const applicant = await applicantByPhone();

    const missingPhoneReview = await adminRequest(admin.token, applicant.id, 'approve', {
      teamId: 'team-a',
      phoneReviewedExternally: false,
    });
    expect(missingPhoneReview.status).toBe(400);

    const approved = await adminRequest(admin.token, applicant.id, 'approve', {
      teamId: 'team-a',
      phoneReviewedExternally: true,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: 'approved', teamId: 'team-a' });

    const storedApplicant = await ctx.deps.store.get<User>(`users/${applicant.id}`);
    const team = await ctx.deps.store.get<Team>('teams/team-a');
    const request = await ctx.deps.store.get<ManagerAccessRequest>(
      `manager_access_requests/${applicant.id}`,
    );
    expect(storedApplicant).toMatchObject({
      role: 'manager',
      status: 'active',
      teamId: 'team-a',
      province: 'تهران',
      city: 'تهران',
    });
    expect(team?.managerId).toBe(applicant.id);
    expect(request).toMatchObject({
      status: 'approved',
      phoneReviewedExternallyBy: admin.id,
    });

    const signedIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: applicant.phone,
      password: PASSWORD,
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data).toMatchObject({
      state: 'active',
      user: { id: applicant.id, role: 'manager', teamId: 'team-a' },
    });

    const teamBMember = await ctx.user('marketer', { teamId: 'team-b' });
    const profile = await ctx
      .api(signedIn.body.data.idToken)
      .get('/v1/manager/profile?teamId=team-b');
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ team: { id: 'team-a', name: 'تیم تهران' } });
    expect(profile.body.data.team.id).not.toBe('team-b');
    expect(
      (
        await ctx
          .api(signedIn.body.data.idToken)
          .get(`/v1/manager/users/${teamBMember.id}/progress`)
      ).status,
    ).toBe(403);
    expect(
      (await ctx.api(signedIn.body.data.idToken).get('/v1/admin/manager-access-requests')).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .api(signedIn.body.data.idToken)
          .patch('/v1/me', { province: 'اصفهان', city: 'اصفهان' })
      ).status,
    ).toBe(403);
    expect((await ctx.api(admin.token).get('/v1/manager/profile')).status).toBe(403);
  });

  it('rejects an application with a notice, then accepts a password-protected review message', async () => {
    const admin = await ctx.user('admin');
    await submitApplication();
    const applicant = await applicantByPhone();
    const rejected = await adminRequest(admin.token, applicant.id, 'reject', {
      reason: 'اطلاعات محدوده مدیریت نیاز به بررسی بیشتر دارد.',
    });
    expect(rejected.status).toBe(200);

    const applicantView = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: applicant.phone,
      password: PASSWORD,
    });
    expect(applicantView.status).toBe(200);
    expect(applicantView.body.data).toMatchObject({
      state: 'rejected',
      message: expect.stringContaining('فعلاً'),
      reviewNote: 'اطلاعات محدوده مدیریت نیاز به بررسی بیشتر دارد.',
    });
    expect(applicantView.body.data).not.toHaveProperty('idToken');

    const appeal = await ctx.api().post('/v1/auth/manager-access/appeals', {
      phone: applicant.phone,
      password: PASSWORD,
      message: 'لطفاً استان و شهر ثبت‌شده را دوباره بررسی کنید.',
    });
    expect(appeal.status).toBe(200);
    expect(appeal.body.data.status).toBe('review_requested');

    const adminView = await ctx.api(admin.token).get('/v1/admin/manager-access-requests');
    const request = (
      adminView.body.data as Array<{
        id: string;
        status: string;
        appeals: Array<{ message: string }>;
      }>
    ).find((item) => item.id === applicant.id);
    expect(request).toMatchObject({
      status: 'review_requested',
      appeals: [{ message: 'لطفاً استان و شهر ثبت‌شده را دوباره بررسی کنید.' }],
    });
    const afterAppealSignIn = await ctx.api().post('/v1/auth/manager-access/sign-in', {
      phone: applicant.phone,
      password: PASSWORD,
    });
    expect(afterAppealSignIn.body.data).toMatchObject({ state: 'review_requested' });
  });

  it('denies Managers and Marketers access to Admin role management and review data', async () => {
    const manager = await ctx.user('manager', { teamId: 'team-a' });
    const marketer = await ctx.user('marketer', { teamId: 'team-a' });
    for (const token of [manager.token, marketer.token]) {
      expect((await ctx.api(token).get('/v1/admin/manager-access-requests')).status).toBe(403);
      expect(
        (
          await ctx.api(token).post('/v1/admin/manager-access-requests/some-user/approve', {
            teamId: 'team-a',
            phoneReviewedExternally: true,
          })
        ).status,
      ).toBe(403);
    }
  });
});
