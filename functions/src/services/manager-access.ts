import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import { decryptPrivateText, encryptPrivateText, timingSafeEqualStr } from '../lib/crypto';
import {
  identityUniqueKey,
  ids,
  managerPhoneToAuthEmail,
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
import { canonicalManagerProvinces, effectiveManagerProvinces } from './team-scope';

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
  /** Optional manual team; the Manager's scope normally comes from `managerProvinces`. */
  teamId: z.string().trim().max(100).nullable().optional(),
  /** «استان‌های تحت مدیریت»; omitted/empty defaults to the applicant's requested province. */
  managerProvinces: users.managerProvincesSchema.optional(),
  phoneReviewedExternally: z
    .boolean()
    .refine((value) => value, 'پیش از فعال‌سازی، بررسی بیرونی شماره تماس را تأیید کنید.'),
});

export const rejectManagerAccessSchema = z.object({
  reason: text(5, 600, 'توضیح رد درخواست'),
});

const unavailableCredential = () => new ApiError('UNAUTHENTICATED', 'شماره یا رمز عبور درست نیست.');

/** Every account on one phone: a marketer account and a Manager account may coexist. */
async function usersByPhone(d: Deps, phone: string): Promise<Array<Doc<User>>> {
  return d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
  });
}

function normalizedPhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new ApiError('VALIDATION', 'شماره موبایل معتبر وارد کنید.');
  return phone;
}

/** Reveals only the next step; never returns account names, request data, or national-code details. */
export async function lookupManagerAccess(d: Deps, rawPhone: string) {
  const phone = normalizedPhone(rawPhone);
  const accounts = await usersByPhone(d, phone);
  if (!accounts.length) return { flow: 'apply' as const, phone };
  // A Manager account on this phone (possibly next to a marketer account) signs in directly.
  const manager = accounts.find((user) => user.role === 'manager');
  if (manager && manager.status !== 'blacklisted') return { flow: 'sign_in' as const, phone };
  const marketer = accounts.find((user) => user.role === 'marketer');
  if (!marketer || marketer.status !== 'active') return { flow: 'unavailable' as const, phone };

  const application = await d.store.get<ManagerAccessRequest>(
    `manager_access_requests/${marketer.id}`,
  );
  if (
    application?.existingAccount &&
    (application.status === 'pending' ||
      application.status === 'review_requested' ||
      application.status === 'rejected')
  )
    return { flow: 'sign_in' as const, phone };
  return { flow: 'apply' as const, phone };
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

async function submitExistingMarketerRequest(
  d: Deps,
  input: z.infer<typeof managerAccessRequestSchema>,
  user: Doc<User>,
  details: {
    phone: string;
    fullName: string;
    nationalCode: string;
    nationalCodeHash: string;
    province: string;
    city: string;
  },
) {
  const { phone, fullName, nationalCode, nationalCodeHash, province, city } = details;
  if (user.status !== 'active' || user.role !== 'marketer')
    throw new ApiError('CONFLICT', 'این حساب برای درخواست دسترسی مدیر در دسترس نیست.');
  if (user.nationalCodeHash && user.nationalCodeHash !== nationalCodeHash)
    throw new ApiError('CONFLICT', 'کد ملی واردشده با اطلاعات حساب فعلی مطابقت ندارد.');

  const phoneKeyPath = `unique_keys/${ids.uniqueKey('phone', phone)}`;
  const nationalKeyPath = `unique_keys/${ids.uniqueKey('nationalCode', nationalCodeHash)}`;
  // Approval will create a Manager account in the Manager identity namespace; make sure this
  // national code is not already claimed there by a *different* Manager account.
  const managerNationalKeyPath = `unique_keys/${identityUniqueKey('nationalCode', nationalCodeHash, 'manager')}`;
  const { upload, avatarUrl } = await validateApplicantAvatar(d, input.avatarUploadId);
  const now = nowIso(d);
  const request: ManagerAccessRequest = {
    userId: user.id,
    existingAccount: true,
    managerPasswordCiphertext: await encryptPrivateText(input.password, d.config.localSecret),
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

  try {
    await d.store.runTransaction(async (tx) => {
      const [phoneKey, nationalKey, managerNationalKey, avatarTicket, currentUser, oldRequest] =
        await Promise.all([
          tx.get<{ uid: string | null }>(phoneKeyPath),
          tx.get<{ uid: string | null }>(nationalKeyPath),
          tx.get<{ uid: string | null }>(managerNationalKeyPath),
          tx.get<ManagerAccessUpload>(`manager_access_uploads/${input.avatarUploadId}`),
          tx.get<User>(`users/${user.id}`),
          tx.get<ManagerAccessRequest>(`manager_access_requests/${user.id}`),
        ]);
      if (
        !currentUser ||
        currentUser.role !== 'marketer' ||
        currentUser.status !== 'active' ||
        currentUser.phone !== phone
      )
        throw new ApiError('CONFLICT', 'وضعیت حساب تغییر کرده است؛ شماره را دوباره بررسی کنید.');
      if (oldRequest)
        throw new ApiError(
          'CONFLICT',
          'برای این حساب درخواست مدیر قبلی وجود دارد؛ وارد همان درخواست شوید.',
        );
      if (phoneKey?.uid && phoneKey.uid !== user.id)
        throw new ApiError('CONFLICT', conflictMessage('phone'));
      if (nationalKey?.uid && nationalKey.uid !== user.id)
        throw new ApiError('CONFLICT', conflictMessage('nationalCode'));
      if (managerNationalKey?.uid && managerNationalKey.uid !== user.id)
        throw new ApiError('CONFLICT', conflictMessage('nationalCode'));
      if (currentUser.nationalCodeHash && currentUser.nationalCodeHash !== nationalCodeHash)
        throw new ApiError('CONFLICT', 'کد ملی واردشده با اطلاعات حساب فعلی مطابقت ندارد.');
      if (
        !avatarTicket ||
        avatarTicket.consumedAt ||
        avatarTicket.expireAt.getTime() <= d.clock().getTime()
      )
        throw new ApiError('CONFLICT', 'عکس پروفایل قبلاً استفاده شده یا منقضی شده است.');

      if (!phoneKey) tx.create(phoneKeyPath, { kind: 'phone', createdAt: now, uid: user.id });
      else if (!phoneKey.uid) tx.update(phoneKeyPath, { uid: user.id });
      if (!nationalKey)
        tx.create(nationalKeyPath, { kind: 'nationalCode', createdAt: now, uid: user.id });
      else if (!nationalKey.uid) tx.update(nationalKeyPath, { uid: user.id });
      tx.create(`manager_access_requests/${user.id}`, request);
      tx.update(`manager_access_uploads/${input.avatarUploadId}`, { consumedAt: now });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'درخواست یا شناسه‌ای تکراری است. دوباره بررسی کنید.');
    throw error;
  }

  await track(d, 'manager_access_requested', user.id, { existingAccount: true }).catch(() => {});
  await notifyAdmins(d, {
    title: 'درخواست جدید دسترسی مدیر',
    body: `درخواست دسترسی مدیر از بازاریاب ${fullName} برای بررسی ثبت شد.`,
  });
  return {
    status: 'pending' as const,
    message: 'درخواست شما برای بررسی ادمین ارسال شد.',
  };
}

/**
 * Creates a Manager-role account in an inactive state, so no panel/API access is available before
 * review. Existing active marketer accounts keep their current access until Admin approval.
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

  const accounts = await usersByPhone(d, phone);
  // A Manager account already exists for this phone (pending or approved): no second application.
  if (accounts.some((user) => user.role === 'manager' && user.status !== 'blacklisted'))
    throw new ApiError('CONFLICT', conflictMessage('phone'));
  const existing = accounts.find((user) => user.role === 'marketer') ?? accounts[0] ?? null;
  const nationalCodeHash = nationalCodeDigest(nationalCode, d.config.localSecret);
  if (existing) {
    if (existing.role === 'marketer' && existing.status === 'active')
      return submitExistingMarketerRequest(d, input, existing, {
        phone,
        fullName,
        nationalCode,
        nationalCodeHash,
        province,
        city,
      });
    throw new ApiError('CONFLICT', conflictMessage('phone'));
  }
  // The application lives in the Manager identity namespace (manager-scoped unique keys +
  // manager-domain auth email), so the same phone stays free for a marketer account.
  const phoneKeyPath = `unique_keys/${identityUniqueKey('phone', phone, 'manager')}`;
  const nationalKeyPath = `unique_keys/${identityUniqueKey('nationalCode', nationalCodeHash, 'manager')}`;
  const legacyNationalKeyPath = `unique_keys/${ids.uniqueKey('nationalCode', nationalCodeHash)}`;
  const { upload, avatarUrl } = await validateApplicantAvatar(d, input.avatarUploadId);
  const now = nowIso(d);

  // Reserve both identifiers atomically; if either is already claimed the other is not held.
  // The legacy national-code key is only checked (a marketer of a national-code province may
  // already own this code with another phone) — it is never taken over by the application.
  try {
    await d.store.runTransaction(async (tx) => {
      const [phoneKey, nationalKey, legacyNationalKey] = await Promise.all([
        tx.get(phoneKeyPath),
        tx.get(nationalKeyPath),
        tx.get(legacyNationalKeyPath),
      ]);
      if (phoneKey) throw new ApiError('CONFLICT', conflictMessage('phone'));
      if (nationalKey || legacyNationalKey)
        throw new ApiError('CONFLICT', conflictMessage('nationalCode'));
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
      email: managerPhoneToAuthEmail(phone),
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
      managerProvinces: [],
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
      existingAccount: false,
      managerPasswordCiphertext: null,
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

type ManagerCredentials =
  | {
      kind: 'manager';
      user: Doc<User>;
      request: Doc<ManagerAccessRequest> | null;
      tokens: { idToken: string; refreshToken: string; expiresIn: number };
    }
  | {
      kind: 'applicant';
      user: Doc<User>;
      request: Doc<ManagerAccessRequest>;
      tokens: null;
    };

async function managerLoginFailure(
  d: Deps,
  guardKey: string,
  guard: { fails: number; lockedUntil: string | null } | null,
): Promise<never> {
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

/**
 * Verifies the Manager password for one phone. The phone may hold a Manager account and —
 * separately — a marketer account with an in-flight application; a password that matches the
 * Manager account wins, and only then is the application's own chosen password tried. Neither
 * path ever authenticates the marketer account itself (its sign-in stays passwordless).
 */
async function credentialsForManager(
  d: Deps,
  phone: string,
  password: string,
): Promise<ManagerCredentials> {
  const accounts = await usersByPhone(d, phone);
  const manager = accounts.find((user) => user.role === 'manager') ?? null;
  const marketer = accounts.find((user) => user.role === 'marketer') ?? null;
  if (
    (!manager || manager.status === 'blacklisted') &&
    (!marketer || marketer.status === 'blacklisted')
  )
    throw unavailableCredential();

  const [managerRequest, marketerRequest] = await Promise.all([
    manager
      ? d.store.get<ManagerAccessRequest>(`manager_access_requests/${manager.id}`)
      : Promise.resolve(null),
    marketer
      ? d.store.get<ManagerAccessRequest>(`manager_access_requests/${marketer.id}`)
      : Promise.resolve(null),
  ]);
  const applicantRequest =
    marketer &&
    marketerRequest?.existingAccount &&
    Boolean(marketerRequest.managerPasswordCiphertext) &&
    (marketerRequest.status === 'pending' ||
      marketerRequest.status === 'review_requested' ||
      marketerRequest.status === 'rejected')
      ? marketerRequest
      : null;
  if (!manager && !applicantRequest) throw unavailableCredential();

  const guardKey = ids.hash(phoneToAuthEmail(phone));
  const guard = await d.store.get<{ fails: number; lockedUntil: string | null }>(
    `login_guards/${guardKey}`,
  );
  if (guard?.lockedUntil && guard.lockedUntil > nowIso(d))
    throw new ApiError(
      'RATE_LIMIT',
      'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
    );
  const clearGuard = async () => {
    if (guard) await d.store.delete(`login_guards/${guardKey}`);
  };

  if (manager && manager.status !== 'blacklisted') {
    // New Manager accounts use the manager auth-email domain; older ones the phone domain.
    for (const authEmail of [managerPhoneToAuthEmail(phone), phoneToAuthEmail(phone)]) {
      const result = await d.auth.signIn(authEmail, password);
      if (result.ok) {
        if (result.uid !== manager.id) {
          await d.auth.revoke(result.uid).catch(() => {});
          throw unavailableCredential();
        }
        await clearGuard();
        return { kind: 'manager', user: manager, request: managerRequest, tokens: result.tokens };
      }
      if (result.reason === 'locked')
        throw new ApiError(
          'RATE_LIMIT',
          'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
        );
      if (result.reason === 'disabled') throw unavailableCredential();
    }
  }

  if (applicantRequest?.managerPasswordCiphertext && marketer) {
    let expectedPassword: string;
    try {
      expectedPassword = await decryptPrivateText(
        applicantRequest.managerPasswordCiphertext,
        d.config.localSecret,
      );
    } catch {
      throw unavailableCredential();
    }
    if (timingSafeEqualStr(password, expectedPassword)) {
      await clearGuard();
      return { kind: 'applicant', user: marketer, request: applicantRequest, tokens: null };
    }
  }

  return managerLoginFailure(d, guardKey, guard);
}

/** Password sign-in also reveals the request state to its own applicant, without issuing a session. */
export async function managerAccessSignIn(
  d: Deps,
  input: z.infer<typeof managerAccessLoginSchema>,
): Promise<ManagerLoginResult> {
  const phone = normalizedPhone(input.phone);
  const credentials = await credentialsForManager(d, phone, input.password);
  const { user, request } = credentials;
  if (credentials.kind === 'manager' && user.status === 'active') {
    const lastActiveAt = nowIso(d);
    await d.store.update(`users/${user.id}`, { lastActiveAt });
    await track(d, 'login_success', user.id, { panel: 'manager' }).catch(() => {});
    return {
      state: 'active',
      user: users.publicUser({ ...user, lastActiveAt }),
      ...credentials.tokens,
    };
  }

  // No credential is returned for inactive accounts. Revoke the unreturned sign-in token as well.
  if (credentials.kind === 'manager') await d.auth.revoke(user.id).catch(() => {});
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
  const credentials = await credentialsForManager(d, phone, input.password);
  const { user, request: verifiedRequest } = credentials;
  if (credentials.kind === 'manager') await d.auth.revoke(user.id).catch(() => {});
  if (!verifiedRequest)
    throw new ApiError('CONFLICT', 'این درخواست دیگر برای بازبینی در دسترس نیست.');
  const path = `manager_access_requests/${verifiedRequest.id}`;
  const now = nowIso(d);
  const message = input.message.trim();

  await d.store.runTransaction(async (tx) => {
    const request = await tx.get<ManagerAccessRequest>(path);
    if (!request || request.userId !== verifiedRequest.userId || request.status !== 'rejected')
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
  const managerIds = requests.map(
    (request) => request.managerUserId ?? (request.existingAccount ? null : request.userId),
  );
  const managerDocs = await d.store.getMany<User>(
    managerIds.map((id) => (id ? `users/${id}` : 'users/_none')),
  );
  return Promise.all(
    requests.map(async (request, index) => {
      const managerUserId = managerIds[index] ?? null;
      const managerDoc = managerUserId ? (managerDocs[index] ?? null) : null;
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
        managerUserId,
        grantedProvinces:
          request.status === 'approved' && managerDoc ? effectiveManagerProvinces(managerDoc) : [],
        grantedTeamId: request.status === 'approved' ? (managerDoc?.teamId ?? null) : null,
        existingAccount: Boolean(request.existingAccount),
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
  const teamId = input.teamId?.trim() || null;
  const teamPath = teamId ? `teams/${teamId}` : null;
  const now = nowIso(d);
  const requestBefore = await d.store.get<ManagerAccessRequest>(path);
  if (!requestBefore) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
  // Granted scope: the Admin's chosen provinces, defaulting to the applicant's requested one.
  const provinces = canonicalManagerProvinces(
    input.managerProvinces?.length ? input.managerProvinces : [requestBefore.managementProvince],
  );
  if (!provinces.length && !teamId)
    throw new ApiError('VALIDATION', 'دست‌کم یک استان تحت مدیریت انتخاب کنید.');

  if (requestBefore.existingAccount)
    return approveExistingAccountRequest(d, actor, requestId, requestBefore, {
      teamId,
      teamPath,
      provinces,
      now,
    });

  let approvedName = '';
  await d.store.runTransaction(async (tx) => {
    const [request, applicant, team] = await Promise.all([
      tx.get<ManagerAccessRequest>(path),
      tx.get<User>(userPath),
      teamPath ? tx.get<Team>(teamPath) : Promise.resolve<Doc<Team> | null>(null),
    ]);
    if (!request || !applicant) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
    if (request.status !== 'pending' && request.status !== 'review_requested')
      throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
    if (applicant.role !== 'manager' || applicant.status !== 'inactive')
      throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
    if (teamId && (!team || team.archived))
      throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');

    approvedName = request.fullName;
    tx.update(userPath, {
      name: request.fullName,
      avatarUrl: request.avatarUrl,
      avatarPath: request.avatarPath,
      nationalCodeHash: request.nationalCodeHash,
      role: 'manager',
      status: 'active',
      teamId,
      managerProvinces: provinces,
      province: request.managementProvince,
      city: request.managementCity,
      managerProfileRequired: false,
      managerProfileCompletedAt: now,
      updatedAt: now,
    });
    if (teamPath && team)
      tx.update(teamPath, { managerId: team.managerId ?? requestId, updatedAt: now });
    tx.update(path, {
      status: 'approved' satisfies ManagerAccessStatus,
      managerUserId: requestId,
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
    { status: 'pending_or_review_requested' },
    { status: 'approved', teamId, managerProvinces: provinces, phoneReviewedExternally: true },
  );
  await track(d, 'manager_access_approved', actor.id, { teamId: teamId ?? undefined });
  await notifyApplicant(d, requestId, {
    title: 'دسترسی پنل مدیر تأیید شد',
    body: 'حساب شما فعال شد. با شماره موبایل و رمز ثبت‌شده وارد پنل مدیر شوید.',
  });
  return {
    status: 'approved' as const,
    userId: requestId,
    managerUserId: requestId,
    name: approvedName,
    teamId,
    managerProvinces: provinces,
  };
}

/**
 * Approving a marketer's application creates a *separate* Manager account for the same phone
 * (own auth identity + the applicant's chosen password). The marketer account — its sign-in,
 * learning history and points — is never touched, so the person keeps both entries.
 */
async function approveExistingAccountRequest(
  d: Deps,
  actor: Actor,
  requestId: string,
  requestBefore: Doc<ManagerAccessRequest>,
  grant: { teamId: string | null; teamPath: string | null; provinces: string[]; now: string },
) {
  const { teamId, teamPath, provinces, now } = grant;
  const path = `manager_access_requests/${requestId}`;
  const userPath = `users/${requestId}`;
  if (!requestBefore.managerPasswordCiphertext)
    throw new ApiError('CONFLICT', 'رمز ورود انتخاب‌شده برای این درخواست در دسترس نیست.');
  let managerPassword: string;
  try {
    managerPassword = await decryptPrivateText(
      requestBefore.managerPasswordCiphertext,
      d.config.localSecret,
    );
  } catch {
    throw new ApiError(
      'CONFLICT',
      'رمز ورود این درخواست قابل بازیابی نیست؛ با متقاضی تماس بگیرید.',
    );
  }
  // Pre-flight the same checks the transaction will repeat, so an unapprovable request never
  // leaves a half-created Manager account behind.
  const [applicantBefore, teamBefore] = await Promise.all([
    d.store.get<User>(userPath),
    teamPath ? d.store.get<Team>(teamPath) : Promise.resolve<Doc<Team> | null>(null),
  ]);
  if (!applicantBefore) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
  if (requestBefore.status !== 'pending' && requestBefore.status !== 'review_requested')
    throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
  if (applicantBefore.role !== 'marketer' || applicantBefore.status !== 'active')
    throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
  if (teamId && (!teamBefore || teamBefore.archived))
    throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');

  const manager = await users.register(
    d,
    {
      name: requestBefore.fullName,
      identifier: requestBefore.phone,
      password: managerPassword,
    },
    'manager',
    {
      teamId,
      managerProvinces: provinces,
      province: requestBefore.managementProvince,
      city: requestBefore.managementCity,
      avatarUrl: requestBefore.avatarUrl,
      avatarPath: requestBefore.avatarPath,
      nationalCodeHash: requestBefore.nationalCodeHash,
      managerProfileRequired: false,
      managerProfileCompletedAt: now,
    },
  );

  try {
    await d.store.runTransaction(async (tx) => {
      const [request, applicant, team] = await Promise.all([
        tx.get<ManagerAccessRequest>(path),
        tx.get<User>(userPath),
        teamPath ? tx.get<Team>(teamPath) : Promise.resolve<Doc<Team> | null>(null),
      ]);
      if (!request || !applicant) throw new ApiError('NOT_FOUND', 'درخواست پیدا نشد.');
      if (request.status !== 'pending' && request.status !== 'review_requested')
        throw new ApiError('CONFLICT', 'این درخواست قبلاً بررسی شده است.');
      if (applicant.role !== 'marketer' || applicant.status !== 'active')
        throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
      if (
        !request.existingAccount ||
        request.managerPasswordCiphertext !== requestBefore.managerPasswordCiphertext
      )
        throw new ApiError(
          'CONFLICT',
          'اطلاعات درخواست تغییر کرده است؛ درخواست را تازه‌سازی کنید.',
        );
      if (teamId && (!team || team.archived))
        throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');
      if (teamPath && team)
        tx.update(teamPath, { managerId: team.managerId ?? manager.id, updatedAt: now });
      tx.update(path, {
        status: 'approved' satisfies ManagerAccessStatus,
        managerUserId: manager.id,
        reviewNote: null,
        reviewedBy: actor.id,
        reviewedAt: now,
        phoneReviewedExternallyBy: actor.id,
        phoneReviewedExternallyAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    // Roll the just-created Manager account back: auth user, profile doc and phone reservation.
    await d.auth.deleteUser(manager.id).catch(() => {});
    await d.store.delete(`users/${manager.id}`).catch(() => {});
    await d.store
      .delete(`unique_keys/${identityUniqueKey('phone', requestBefore.phone, 'manager')}`)
      .catch(() => {});
    throw error;
  }

  try {
    await d.store.update(path, { managerPasswordCiphertext: null, updatedAt: nowIso(d) });
  } catch {
    console.warn('[manager-access] Could not clear the encrypted Manager password after approval.');
  }
  // Reserve the national code in the Manager identity namespace too (best-effort bookkeeping;
  // the legacy key stays with the marketer account it belongs to).
  await d.store
    .create(
      `unique_keys/${identityUniqueKey('nationalCode', requestBefore.nationalCodeHash, 'manager')}`,
      { kind: 'nationalCode', createdAt: now, uid: manager.id },
    )
    .catch(() => {});
  if (teamId) await users.syncTeamManagerPointer(d, teamId);
  await d.auth.setDisabled(manager.id, false);
  await d.auth.setClaims(manager.id, { role: 'manager' });
  await audit(
    d,
    actor,
    'manager_access.approved',
    'manager_access_requests',
    requestId,
    { status: 'pending_or_review_requested' },
    {
      status: 'approved',
      teamId,
      managerProvinces: provinces,
      managerUserId: manager.id,
      phoneReviewedExternally: true,
    },
  );
  await track(d, 'manager_access_approved', actor.id, { teamId: teamId ?? undefined });
  await notifyApplicant(d, requestId, {
    title: 'دسترسی پنل مدیر تأیید شد',
    body: 'حساب مدیر شما فعال شد؛ حساب بازاریاب‌تان هم مثل قبل برقرار است. با شماره موبایل و رمز ثبت‌شده وارد پنل مدیر شوید.',
  });
  return {
    status: 'approved' as const,
    userId: requestId,
    managerUserId: manager.id,
    name: requestBefore.fullName,
    teamId,
    managerProvinces: provinces,
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
    const applicantMatches = request.existingAccount
      ? applicant.role === 'marketer' && applicant.status === 'active'
      : applicant.role === 'manager' && applicant.status === 'inactive';
    if (!applicantMatches)
      throw new ApiError('CONFLICT', 'وضعیت حساب با درخواست دسترسی هم‌خوان نیست.');
    applicantName = request.fullName;
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
