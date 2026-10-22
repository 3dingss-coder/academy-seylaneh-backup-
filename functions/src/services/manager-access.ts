import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import { decryptPrivateText, encryptPrivateText } from '../lib/crypto';
import {
  ids,
  nationalCodeDigest,
  normalizeNationalCode,
  normalizePhone,
  phoneToAuthEmail,
} from '../lib/ids';
import { EXT, MEDIA_RULES, sniff } from '../lib/media';
import { canonicalCity, canonicalProvince, isValidResidence } from '../domain/iranLocations';
import type {
  ManagerAccessRequest,
  ManagerAccessStatus,
  ManagerAccessUpload,
  Team,
  User,
} from '../domain/types';
import { StoreConflictError, type Doc } from '../store/types';
import { audit, nowIso, track, type Actor, type Deps } from './context';
import * as users from './users';

type ManagerLoginResult =
  | {
      state: 'active';
      user: ReturnType<typeof users.publicUser>;
      idToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { state: 'pending' | 'review_requested' | 'inactive'; message: string }
  | { state: 'rejected'; message: string; reviewNote: string | null; appealCount: number };

const phoneSchema = z.string().trim().min(1, 'شماره موبایل را وارد کنید.').max(30);
const nationalCodeSchema = z
  .string({ required_error: 'کد ملی را وارد کنید.' })
  .trim()
  .min(1, 'کد ملی را وارد کنید.')
  .max(20)
  .refine((value) => normalizeNationalCode(value) !== null, 'کد ملی معتبر ۱۰ رقمی وارد کنید.');
const provinceSchema = text(2, 40, 'استان').refine(
  (value) => canonicalProvince(value) !== null,
  'استان انتخاب‌شده معتبر نیست.',
);
const citySchema = text(2, 60, 'شهر');

export const managerAccessLookupSchema = z.object({ phone: phoneSchema });
export const managerAccessLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128),
});
export const managerAccessAvatarSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  sizeBytes: z.number().int().positive(),
});

export const managerAccessRequestSchema = z
  .object({
    phone: phoneSchema,
    fullName: text(2, 60, 'نام و نام خانوادگی'),
    nationalCode: nationalCodeSchema,
    managementProvince: provinceSchema,
    managementCity: citySchema,
    password: users.passwordSchema,
    avatarUploadId: z.string().trim().min(8).max(100),
  })
  .superRefine((value, ctx) => {
    const province = canonicalProvince(value.managementProvince);
    if (province && !isValidResidence(province, value.managementCity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['managementCity'],
        message: `«${value.managementCity}» در استان ${province} نیست.`,
      });
    }
  });

export const managerAccessAppealSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128),
  message: text(10, 800, 'پیام درخواست بازبینی'),
});

export const managerAccessListSchema = z.object({
  status: z.enum(['pending', 'review_requested', 'approved', 'rejected']).optional(),
});

export const approveManagerAccessSchema = z.object({
  teamId: z.string().trim().min(1, 'تیم را انتخاب کنید.').max(100),
  phoneReviewedExternally: z
    .boolean()
    .refine((value) => value, 'پیش از فعال‌سازی، بررسی بیرونی شماره تماس را تأیید کنید.'),
});

export const rejectManagerAccessSchema = z.object({
  reason: text(5, 600, 'توضیح رد درخواست'),
});

const unavailableCredential = () => new ApiError('UNAUTHENTICATED', 'شماره یا رمز عبور درست نیست.');

async function userByPhone(d: Deps, phone: string): Promise<Doc<User> | null> {
  const [user] = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
    limit: 1,
  });
  return user ?? null;
}

function normalizedPhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new ApiError('VALIDATION', 'شماره موبایل معتبر وارد کنید.');
  return phone;
}

/** Reveals only the next step; never returns account names, request data, or national-code details. */
export async function lookupManagerAccess(d: Deps, rawPhone: string) {
  const phone = normalizedPhone(rawPhone);
  const user = await userByPhone(d, phone);
  if (!user) return { flow: 'apply' as const, phone };
  if (user.status === 'blacklisted' || user.role !== 'manager')
    return { flow: 'unavailable' as const, phone };
  return { flow: 'sign_in' as const, phone };
}

/** Create a short-lived, one-use image upload ticket for a public Manager application photo. */
export async function createManagerAvatarUpload(
  d: Deps,
  input: z.infer<typeof managerAccessAvatarSchema>,
) {
  const rule = MEDIA_RULES.image;
  const mime = input.mime.toLowerCase();
  if (!rule.mimes.includes(mime))
    throw new ApiError('VALIDATION', 'فقط تصویر PNG، JPEG یا WebP مجاز است.');
  if (input.sizeBytes > rule.maxBytes)
    throw new ApiError(
      'VALIDATION',
      `حجم عکس پروفایل حداکثر ${Math.round(rule.maxBytes / 1024 / 1024)} مگابایت است.`,
    );

  const uploadId = d.store.newId();
  const path = `avatars/manager-access/${uploadId}/profile.${EXT[mime] ?? 'bin'}`;
  const upload = await d.blob.createUploadUrl(path, mime, rule.maxBytes);
  const now = d.clock();
  await d.store.create(`manager_access_uploads/${uploadId}`, {
    path,
    mime,
    consumedAt: null,
    createdAt: now.toISOString(),
    expireAt: new Date(now.getTime() + 2 * 60 * 60_000),
  } satisfies ManagerAccessUpload);
  return { uploadId, upload };
}

async function validateApplicantAvatar(d: Deps, uploadId: string) {
  const upload = await d.store.get<ManagerAccessUpload>(`manager_access_uploads/${uploadId}`);
  if (!upload || upload.consumedAt || upload.expireAt.getTime() <= d.clock().getTime())
    throw new ApiError('CONFLICT', 'عکس پروفایل منقضی شده است؛ دوباره انتخاب کنید.');
  const stat = await d.blob.stat(upload.path);
  if (!stat || stat.size <= 0 || stat.size > MEDIA_RULES.image.maxBytes)
    throw new ApiError('CONFLICT', 'آپلود عکس کامل نشده است؛ دوباره تلاش کنید.');
  const head = await d.blob.readRange(upload.path, 0, Math.min(stat.size, 63));
  const detected = sniff(head);
  if (!detected || !detected.kinds.includes('image') || detected.mime !== upload.mime) {
    await d.blob.delete(upload.path).catch(() => {});
    throw new ApiError('VALIDATION', 'محتوای فایل تصویر معتبر نیست.');
  }
  return { upload, avatarUrl: await d.blob.publicUrl(upload.path) };
}

function conflictMessage(kind: 'phone' | 'nationalCode') {
  return kind === 'phone'
    ? 'این شماره از قبل به یک حساب متصل است. برای ادامه وارد شوید یا با ادمین تماس بگیرید.'
    : 'این کد ملی پیش‌تر در سامانه ثبت شده است. با ادمین تماس بگیرید.';
}

/**
 * Creates a Manager-role account in an inactive state, so no panel/API access is available before
 * review. Phone ownership is not asserted here: the admin UI explicitly requires an external check
 * because the app currently has no SMS/OTP provider.
 */
export async function submitManagerAccessRequest(
  d: Deps,
  input: z.infer<typeof managerAccessRequestSchema>,
) {
  const phone = normalizedPhone(input.phone);
  const fullName = input.fullName.trim();
  const nationalCode = normalizeNationalCode(input.nationalCode);
  const province = canonicalProvince(input.managementProvince);
  const city = province ? canonicalCity(province, input.managementCity) : null;
  if (!nationalCode || !province || !city)
    throw new ApiError('VALIDATION', 'اطلاعات هویتی و محدوده مدیریت را بررسی کنید.');

  const existing = await userByPhone(d, phone);
  if (existing) throw new ApiError('CONFLICT', conflictMessage('phone'));
  const nationalCodeHash = nationalCodeDigest(nationalCode, d.config.localSecret);
  const phoneKeyPath = `unique_keys/${ids.uniqueKey('phone', phone)}`;
  const nationalKeyPath = `unique_keys/${ids.uniqueKey('nationalCode', nationalCodeHash)}`;
  const { upload, avatarUrl } = await validateApplicantAvatar(d, input.avatarUploadId);
  const now = nowIso(d);

  // Reserve both identifiers atomically; if either is already claimed the other is not held.
  try {
    await d.store.runTransaction(async (tx) => {
      const [phoneKey, nationalKey] = await Promise.all([
        tx.get(phoneKeyPath),
        tx.get(nationalKeyPath),
      ]);
      if (phoneKey) throw new ApiError('CONFLICT', conflictMessage('phone'));
      if (nationalKey) throw new ApiError('CONFLICT', conflictMessage('nationalCode'));
      tx.create(phoneKeyPath, { kind: 'phone', createdAt: now, uid: null });
      tx.create(nationalKeyPath, { kind: 'nationalCode', createdAt: now, uid: null });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'شماره یا کد ملی هم‌زمان در حساب دیگری ثبت شد.');
    throw error;
  }

  let userId: string | null = null;
  try {
    userId = await d.auth.createUser({
      email: phoneToAuthEmail(phone),
      password: input.password,
      displayName: fullName,
    });
    await d.auth.setClaims(userId, { role: 'manager' });

    const user: User = {
      name: fullName,
      phone,
      email: null,
      avatarUrl,
      avatarPath: upload.path,
      workplace: null,
      nationalCodeHash,
      province,
      city,
      firebaseUid: userId,
      role: 'manager',
      teamId: null,
      brandIds: [],
      status: 'inactive',
      pointsBalance: 0,
      onboardedAt: null,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const request: ManagerAccessRequest = {
      userId,
      fullName,
      phone,
      nationalCodeCiphertext: await encryptPrivateText(nationalCode, d.config.localSecret),
      nationalCodeHash,
      managementProvince: province,
      managementCity: city,
      avatarUrl,
      avatarPath: upload.path,
      status: 'pending',
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      phoneReviewedExternallyBy: null,
      phoneReviewedExternallyAt: null,
      appeals: [],
      createdAt: now,
      updatedAt: now,
    };

    await d.store.runTransaction(async (tx) => {
      const [phoneKey, nationalKey, avatarTicket, existingUser, existingRequest] =
        await Promise.all([
          tx.get<{ uid: string | null }>(phoneKeyPath),
          tx.get<{ uid: string | null }>(nationalKeyPath),
          tx.get<ManagerAccessUpload>(`manager_access_uploads/${input.avatarUploadId}`),
          tx.get<User>(`users/${userId}`),
          tx.get<ManagerAccessRequest>(`manager_access_requests/${userId}`),
        ]);
      if (!phoneKey || phoneKey.uid || !nationalKey || nationalKey.uid)
        throw new ApiError('CONFLICT', 'اطلاعات هویتی هم‌زمان در حساب دیگری ثبت شد.');
      if (
        !avatarTicket ||
        avatarTicket.consumedAt ||
        avatarTicket.expireAt.getTime() <= d.clock().getTime()
      )
        throw new ApiError('CONFLICT', 'عکس پروفایل قبلاً استفاده شده یا منقضی شده است.');
      if (existingUser || existingRequest) throw new ApiError('CONFLICT', 'درخواست قبلی پیدا شد.');

      tx.create(`users/${userId}`, user);
      tx.create(`manager_access_requests/${userId}`, request);
      tx.update(phoneKeyPath, { uid: userId });
      tx.update(nationalKeyPath, { uid: userId });
      tx.update(`manager_access_uploads/${input.avatarUploadId}`, { consumedAt: now });
    });
  } catch (error) {
    if (userId) await d.auth.deleteUser(userId).catch(() => {});
    await Promise.all([d.store.delete(phoneKeyPath), d.store.delete(nationalKeyPath)]).catch(
      () => {},
    );
    if (error instanceof ApiError) throw error;
    if (error instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'درخواست یا شناسه‌ای تکراری است. دوباره بررسی کنید.');
    throw error;
  }

  await track(d, 'manager_access_requested', userId).catch(() => {});
  await notifyAdmins(d, {
    title: 'درخواست جدید دسترسی مدیر',
    body: `درخواست مدیریت از ${fullName} برای بررسی ثبت شد.`,
  });
  return {
    status: 'pending' as const,
    message: 'درخواست شما برای بررسی ادمین ارسال شد.',
  };
}

async function notifyAdmins(d: Deps, content: { title: string; body: string }) {
  try {
    const admins = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', 'in', ['admin', 'superadmin']],
        ['status', '==', 'active'],
      ],
    });
    if (!admins.length) return;
    const { notifyUsers } = await import('./notify');
    await notifyUsers(
      d,
      admins.map((admin) => admin.id),
      'manual',
      content,
      { actionRef: '/admin/users?tab=manager-requests', push: false },
    );
  } catch {
    // The application is already saved. A notification outage must not make the applicant retry it.
    console.warn('[manager-access] Admin notification could not be created.');
  }
}

async function credentialsForManager(
  d: Deps,
  phone: string,
  password: string,
): Promise<{
  user: Doc<User>;
  tokens: { idToken: string; refreshToken: string; expiresIn: number };
}> {
  const user = await userByPhone(d, phone);
  if (!user || user.role !== 'manager' || user.status === 'blacklisted')
    throw unavailableCredential();

  const authEmail = phoneToAuthEmail(phone);
  const guardKey = ids.hash(authEmail);
  const guard = await d.store.get<{ fails: number; lockedUntil: string | null }>(
    `login_guards/${guardKey}`,
  );
  if (guard?.lockedUntil && guard.lockedUntil > nowIso(d))
    throw new ApiError(
      'RATE_LIMIT',
      'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
    );

  const result = await d.auth.signIn(authEmail, password);
  if (!result.ok) {
    if (result.reason === 'locked')
      throw new ApiError(
        'RATE_LIMIT',
        'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
      );
    if (result.reason === 'disabled') throw unavailableCredential();
    const failures = (guard?.fails ?? 0) + 1;
    const locked = failures >= 5;
    await d.store.set(`login_guards/${guardKey}`, {
      fails: locked ? 0 : failures,
      lockedUntil: locked ? new Date(d.clock().getTime() + 15 * 60_000).toISOString() : null,
    });
    await track(d, 'login_failed', null, { reason: 'manager_access_credentials' }).catch(() => {});
    if (locked)
      throw new ApiError(
        'RATE_LIMIT',
        'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
      );
    throw unavailableCredential();
  }
  if (result.uid !== user.id) {
    await d.auth.revoke(result.uid).catch(() => {});
    throw unavailableCredential();
  }
  if (guard) await d.store.delete(`login_guards/${guardKey}`);
  return { user, tokens: result.tokens };
}

/** Password sign-in also reveals the request state to its own applicant, without issuing a session. */
export async function managerAccessSignIn(
  d: Deps,
  input: z.infer<typeof managerAccessLoginSchema>,
): Promise<ManagerLoginResult> {
  const phone = normalizedPhone(input.phone);
  const { user, tokens } = await credentialsForManager(d, phone, input.password);
  if (user.status === 'active') {
    const lastActiveAt = nowIso(d);
    await d.store.update(`users/${user.id}`, { lastActiveAt });
    await track(d, 'login_success', user.id, { panel: 'manager' }).catch(() => {});
    return { state: 'active', user: users.publicUser({ ...user, lastActiveAt }), ...tokens };
  }

  // No credential is returned for inactive accounts. Revoke the unreturned sign-in token as well.
  await d.auth.revoke(user.id).catch(() => {});
  const request = await d.store.get<ManagerAccessRequest>(`manager_access_requests/${user.id}`);
  if (request?.status === 'pending')
    return {
      state: 'pending',
      message: 'درخواست دسترسی شما در انتظار بررسی ادمین است. پس از تصمیم‌گیری دوباره وارد شوید.',
    };
  if (request?.status === 'review_requested')
    return {
      state: 'review_requested',
      message: 'درخواست بازبینی شما ثبت شده و دوباره در صف بررسی ادمین قرار دارد.',
    };
  if (request?.status === 'rejected')
    return {
      state: 'rejected',
      message: 'فعلاً امکان دسترسی به پنل مدیر برای شما فراهم نیست.',
      reviewNote: request.reviewNote,
      appealCount: request.appeals.length,
    };
  return {
    state: 'inactive',
    message: 'حساب مدیر شما غیرفعال است. برای پیگیری با ادمین تماس بگیرید.',
  };
}

/** Rejected applicants can send a password-protected appeal message for Admin review. */
export async function submitManagerAccessAppeal(
  d: Deps,
  input: z.infer<typeof managerAccessAppealSchema>,
) {
  const phone = normalizedPhone(input.phone);
  const { user } = await credentialsForManager(d, phone, input.password);
  await d.auth.revoke(user.id).catch(() => {});
  const path = `manager_access_requests/${user.id}`;
  const now = nowIso(d);
  const message = input.message.trim();

  await d.store.runTransaction(async (tx) => {
    const request = await tx.get<ManagerAccessRequest>(path);
    if (!request || request.userId !== user.id || request.status !== 'rejected')
      throw new ApiError('CONFLICT', 'این درخواست دیگر برای بازبینی در دسترس نیست.');
    if (request.appeals.length >= 5)
      throw new ApiError('CONFLICT', 'برای این درخواست بیش از پنج پیام بازبینی ثبت نمی‌شود.');
    tx.update(path, {
      status: 'review_requested' satisfies ManagerAccessStatus,
      appeals: [...request.appeals, { message, submittedAt: now }],
      updatedAt: now,
    });
  });

  await track(d, 'manager_access_appeal_submitted', user.id).catch(() => {});
  await notifyAdmins(d, {
    title: 'درخواست بازبینی مدیر',
    body: `برای درخواست دسترسی ${user.name} پیام بازبینی ثبت شده است.`,
  });
  return {
    status: 'review_requested' as const,
    message: 'پیام شما ثبت شد و برای بررسی دوباره به ادمین ارسال شد.',
  };
}

export async function listManagerAccessRequests(
  d: Deps,
  filter: z.infer<typeof managerAccessListSchema>,
) {
  const requests = await d.store.query<ManagerAccessRequest>({
    collection: 'manager_access_requests',
    where: filter.status ? [['status', '==', filter.status]] : undefined,
    orderBy: [['createdAt', 'desc']],
    limit: 200,
  });
  return Promise.all(
    requests.map(async (request) => {
      let nationalCode: string | null = null;
      try {
        nationalCode = await decryptPrivateText(
          request.nationalCodeCiphertext,
          d.config.localSecret,
        );
      } catch {
        console.warn('[manager-access] Could not decrypt an application national code.');
      }
      return {
        id: request.userId,
        userId: request.userId,
        fullName: request.fullName,
        phone: request.phone,
        nationalCode,
        managementProvince: request.managementProvince,
        managementCity: request.managementCity,
        avatarUrl: request.avatarUrl,
        status: request.status,
        reviewNote: request.reviewNote,
        reviewedAt: request.reviewedAt,
        phoneReviewedExternally: Boolean(request.phoneReviewedExternallyAt),
        appeals: request.appeals,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      };
    }),
  );
}

export async function approveManagerAccess(
  d: Deps,
  actor: Actor,
  requestId: string,
  input: z.infer<typeof approveManagerAccessSchema>,
) {
  const path = `manager_access_requests/${requestId}`;
  const userPath = `users/${requestId}`;
  const teamPath = `teams/${input.teamId}`;
  const now = nowIso(d);
  let approvedName = '';

  await d.store.runTransaction(async (tx) => {
    const [request, applicant, team] = await Promise.all([
      tx.get<ManagerAccessRequest>(path),
      tx.get<User>(userPath),
      tx.get<Team>(teamPath),
    ]);
    if (!request || !applicant) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
    if (request.status !== 'pending' && request.status !== 'review_requested')
      throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
    if (applicant.role !== 'manager' || applicant.status !== 'inactive')
      throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
    if (!team || team.archived) throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');
    if (team.managerId && team.managerId !== requestId)
      throw new ApiError('CONFLICT', 'این تیم از قبل مدیر دارد؛ ابتدا تیم دیگری انتخاب کنید.');

    approvedName = applicant.name;
    tx.update(userPath, {
      role: 'manager',
      status: 'active',
      teamId: input.teamId,
      province: request.managementProvince,
      city: request.managementCity,
      updatedAt: now,
    });
    tx.update(teamPath, { managerId: requestId, updatedAt: now });
    tx.update(path, {
      status: 'approved' satisfies ManagerAccessStatus,
      reviewNote: null,
      reviewedBy: actor.id,
      reviewedAt: now,
      phoneReviewedExternallyBy: actor.id,
      phoneReviewedExternallyAt: now,
      updatedAt: now,
    });
  });

  await d.auth.setDisabled(requestId, false);
  await d.auth.setClaims(requestId, { role: 'manager' });
  await d.auth.revoke(requestId);
  await audit(
    d,
    actor,
    'manager_access.approved',
    'manager_access_requests',
    requestId,
    {
      status: 'pending_or_review_requested',
    },
    { status: 'approved', teamId: input.teamId, phoneReviewedExternally: true },
  );
  await track(d, 'manager_access_approved', actor.id, { teamId: input.teamId });
  await notifyApplicant(d, requestId, {
    title: 'دسترسی پنل مدیر تأیید شد',
    body: 'حساب شما فعال شد. با شماره موبایل و رمز ثبت‌شده وارد پنل مدیر شوید.',
  });
  return {
    status: 'approved' as const,
    userId: requestId,
    name: approvedName,
    teamId: input.teamId,
  };
}

export async function rejectManagerAccess(
  d: Deps,
  actor: Actor,
  requestId: string,
  input: z.infer<typeof rejectManagerAccessSchema>,
) {
  const path = `manager_access_requests/${requestId}`;
  const now = nowIso(d);
  let applicantName = '';
  await d.store.runTransaction(async (tx) => {
    const [request, applicant] = await Promise.all([
      tx.get<ManagerAccessRequest>(path),
      tx.get<User>(`users/${requestId}`),
    ]);
    if (!request || !applicant) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
    if (request.status !== 'pending' && request.status !== 'review_requested')
      throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
    if (applicant.role !== 'manager' || applicant.status !== 'inactive')
      throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
    applicantName = applicant.name;
    tx.update(path, {
      status: 'rejected' satisfies ManagerAccessStatus,
      reviewNote: input.reason.trim(),
      reviewedBy: actor.id,
      reviewedAt: now,
      updatedAt: now,
    });
  });

  await audit(
    d,
    actor,
    'manager_access.rejected',
    'manager_access_requests',
    requestId,
    {
      status: 'pending_or_review_requested',
    },
    { status: 'rejected' },
  );
  await track(d, 'manager_access_rejected', actor.id);
  await notifyApplicant(d, requestId, {
    title: 'نتیجه درخواست دسترسی مدیر',
    body: 'فعلاً امکان دسترسی به پنل مدیر برای شما فراهم نیست. برای درخواست بازبینی وارد شوید.',
  });
  return { status: 'rejected' as const, userId: requestId, name: applicantName };
}

async function notifyApplicant(d: Deps, userId: string, content: { title: string; body: string }) {
  try {
    const { notifyUsers } = await import('./notify');
    await notifyUsers(d, [userId], 'manual', content, {
      actionRef: '/manager',
      push: false,
    });
  } catch {
    // The status in the password-protected Manager entry flow remains the source of truth.
    console.warn('[manager-access] Applicant notification could not be created.');
  }
}
