import { randomBytesBase64Url, randomInt } from '../lib/crypto';
import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import {
  ids,
  nationalCodeDigest,
  nationalCodeToAuthEmailFromDigest,
  normalizeNationalCode,
  normalizePhone,
  phoneToAuthEmail,
} from '../lib/ids';
import { EXT, MEDIA_RULES, sniff } from '../lib/media';
import { provinceUsesNationalCode } from '../domain/nationalCode';
import { StoreConflictError, type Doc } from '../store/types';
import {
  canonicalCity,
  canonicalProvince,
  isValidResidence,
  normalizeLocation,
} from '../domain/iranLocations';
import type { Role, Team, User } from '../domain/types';
import { audit, nowIso, SYSTEM, track, type Actor, type Deps } from './context';
import { isTeamMarketer } from './team-scope';

// ─── Validation (PROMPT 002) ────────────────────────────────────────────────
export const passwordSchema = z
  .string({ required_error: 'رمز عبور را وارد کنید.' })
  .min(8, 'رمز عبور باید حداقل ۸ نویسه باشد.')
  .max(128, 'رمز عبور خیلی طولانی است.')
  .refine(
    (p) => /[A-Za-z\u0600-\u06FF]/.test(p) && /\d|[۰-۹]/.test(p),
    'رمز عبور باید حداقل یک حرف و یک عدد داشته باشد.',
  );

const identifierSchema = z
  .string({ required_error: 'شماره موبایل یا ایمیل را وارد کنید.' })
  .trim()
  .min(3, 'شماره موبایل یا ایمیل را وارد کنید.')
  .max(120);

// ─── Residence («محل سکونت») ────────────────────────────────────────────────
/** The province/city pair is validated against the generated directory (domain/iranLocations). */
const provinceSchema = text(2, 40, 'استان').refine(
  (s) => canonicalProvince(s) !== null,
  'این استان در فهرست استان‌های ایران نیست.',
);
const citySchema = text(2, 60, 'شهر');

const residenceShape = {
  province: provinceSchema.optional(),
  city: citySchema.optional(),
};

/**
 * Both parts travel together and the city must belong to the province (sign-up + admin edit).
 * `null` clears the pair (only sent by the admin patch); absent fields are left untouched.
 */
function checkResidence(
  v: { province?: string | null | undefined; city?: string | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (v.province === undefined && v.city === undefined) return;
  const province = v.province ?? '';
  const city = v.city ?? '';
  if (!province) {
    if (city)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['province'],
        message: 'استان را انتخاب کنید.',
      });
    return;
  }
  if (!city) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'شهر را انتخاب کنید.' });
    return;
  }
  if (!isValidResidence(province, city)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['city'],
      message: `«${city}» در استان ${canonicalProvince(province) ?? province} نیست.`,
    });
  }
}

/** Residence as stored: canonical names, or nulls when the caller sent neither part. */
function residence(input: {
  province?: string | null | undefined;
  city?: string | null | undefined;
}) {
  return {
    province: input.province ? canonicalProvince(input.province) : null,
    city: input.province && input.city ? canonicalCity(input.province, input.city) : null,
  };
}

export const registerSchema = z
  .object({
    name: text(2, 60, 'نام'),
    identifier: identifierSchema,
    password: passwordSchema,
    ...residenceShape,
  })
  .superRefine((value, ctx) => {
    checkResidence(value, ctx);
    if (
      value.province &&
      normalizePhone(value.identifier) &&
      provinceUsesNationalCode(value.province)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identifier'],
        message: 'برای این استان، به‌جای شماره موبایل کد ملی را وارد کنید.',
      });
  });
export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128),
});

const nationalCodeSchema = z
  .string({ required_error: 'کد ملی را وارد کنید.', invalid_type_error: 'کد ملی معتبر نیست.' })
  .trim()
  .min(1, 'کد ملی را وارد کنید.')
  .max(20, 'کد ملی معتبر ۱۰ رقمی وارد کنید.')
  .refine((value) => normalizeNationalCode(value) !== null, 'کد ملی معتبر ۱۰ رقمی وارد کنید.');

/** Self sign-up outside the listed provinces: phone-only sign-in, with no password. */
export const phoneRegisterSchema = z
  .object({
    name: text(2, 60, 'نام'),
    phone: z.string().min(1, 'شماره موبایل را وارد کنید.').max(20),
    // Required here: every self sign-up tells us where the marketer sells (admin/manager panels).
    province: provinceSchema,
    city: citySchema,
  })
  .superRefine((value, ctx) => {
    checkResidence(value, ctx);
    if (provinceUsesNationalCode(value.province))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'برای این استان، به‌جای شماره موبایل کد ملی را وارد کنید.',
      });
  });

/** Self sign-up in the listed provinces: national-code-only sign-in, with no password. */
export const nationalCodeRegisterSchema = z
  .object({
    name: text(2, 60, 'نام'),
    nationalCode: nationalCodeSchema,
    province: provinceSchema,
    city: citySchema,
  })
  .superRefine((value, ctx) => {
    checkResidence(value, ctx);
    if (canonicalProvince(value.province) && !provinceUsesNationalCode(value.province))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nationalCode'],
        message: 'برای این استان، شماره موبایل را وارد کنید.',
      });
  });

export const nationalCodeLoginSchema = z.object({ nationalCode: nationalCodeSchema });
export const staffLoginSchema = z.object({
  username: z.string().trim().min(2).max(60),
  password: z.string().min(1).max(128),
  panel: z.enum(['admin', 'manager']),
});

/** Staff (admin/manager) usernames map to an internal, non-routable auth email. */
export function staffAuthEmail(username: string): string {
  const phone = normalizePhone(username);
  if (phone) return phoneToAuthEmail(phone);

  const slug = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
  return `${slug || 'staff'}@staff.seylane.local`;
}

/** Shown when a deleted (blacklisted) phone number tries to sign in or sign up again. */
export const BLACKLISTED_MESSAGE =
  'این شماره مسدود شده است و امکان ورود ندارد. برای رفع مسدودی با ادمین تماس بگیرید.';
export const BLACKLISTED_NATIONAL_CODE_MESSAGE =
  'این کد ملی مسدود شده است و امکان ورود ندارد. برای رفع مسدودی با ادمین تماس بگیرید.';

export type Identifier =
  | { kind: 'phone'; value: string; phone: string; authEmail: string }
  | { kind: 'email'; value: string; email: string; authEmail: string }
  | { kind: 'nationalCode'; value: string; nationalCodeHash: string; authEmail: string };
export type PasswordIdentifier = Exclude<Identifier, { kind: 'nationalCode' }>;
export type NationalCodeIdentifier = Extract<Identifier, { kind: 'nationalCode' }>;

/** Accepts mobile (Persian/Latin digits, +98) or email. */
export function parseIdentifier(raw: string): PasswordIdentifier {
  const s = raw.trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    if (!z.string().email().safeParse(email).success)
      throw new ApiError('VALIDATION', 'ایمیل واردشده درست نیست.');
    return { kind: 'email', value: email, email, authEmail: email };
  }
  const phone = normalizePhone(s);
  if (!phone) throw new ApiError('VALIDATION', 'شماره موبایل درست نیست. مثال: ۰۹۱۲۱۲۳۴۵۶۷');
  return { kind: 'phone', value: phone, phone, authEmail: phoneToAuthEmail(phone) };
}

/** Build the opaque identity used by account creation and national-code sign-in. */
export function nationalCodeIdentifier(raw: string, secret: string): NationalCodeIdentifier {
  const nationalCode = normalizeNationalCode(raw);
  if (!nationalCode) throw new ApiError('VALIDATION', 'کد ملی معتبر ۱۰ رقمی وارد کنید.');
  const nationalCodeHash = nationalCodeDigest(nationalCode, secret);
  return {
    kind: 'nationalCode',
    value: nationalCodeHash,
    nationalCodeHash,
    authEmail: nationalCodeToAuthEmailFromDigest(nationalCodeHash),
  };
}

export function publicUser(u: Doc<User>) {
  return {
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    workplace: u.workplace ?? null,
    hasNationalCode: Boolean(u.nationalCodeHash),
    phone: u.phone,
    email: u.email,
    province: u.province ?? null,
    city: u.city ?? null,
    role: u.role,
    teamId: u.teamId,
    brandIds: u.brandIds,
    status: u.status,
    pointsBalance: u.pointsBalance,
    onboardedAt: u.onboardedAt,
    ...(u.role === 'manager'
      ? {
          managerProfileRequired: Boolean(u.managerProfileRequired),
          managerProfileCompletedAt: u.managerProfileCompletedAt ?? null,
        }
      : {}),
    lastActiveAt: u.lastActiveAt,
    createdAt: u.createdAt,
  };
}

// ─── Register / Login ───────────────────────────────────────────────────────
/**
 * `team.member_joined` (prompt §8): one outbox row per manager of the team that gained a member, with
 * the joiner's name carried as `{memberName}` — in the event path `{name}` is resolved from the
 * *recipient*, so a manager would otherwise read their own name.
 *
 * `isListening` is checked before the query, so while no such rule is enabled this costs one read
 * cached for 30s and writes nothing (§4.9). The emit cannot throw, and a joiner who is themselves a
 * manager of that team is not told about themselves.
 */
async function announceTeamJoin(
  d: Deps,
  teamId: string,
  member: { id: string; name: string },
): Promise<void> {
  // Lazy, like the `notify` import below: `users.ts` is on the sign-up path and the automation stack is
  // only reached when someone actually enabled a rule.
  const { emitAutomationEventForUsers, isListening } = await import('./push-automation-events');
  if (!(await isListening(d, 'team.member_joined'))) return;
  const managers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', teamId],
      ['role', '==', 'manager'],
      ['status', '==', 'active'],
    ],
  });
  await emitAutomationEventForUsers(
    d,
    'team.member_joined',
    managers.map((m) => m.id).filter((id) => id !== member.id),
    { memberName: member.name },
    { dedupeKey: member.id },
  );
}

export async function register(
  d: Deps,
  input: z.infer<typeof registerSchema>,
  role: Role = 'marketer',
  extra: Partial<User> = {},
  opts: { passwordless?: boolean } = {},
  identity?: Identifier,
) {
  const idf = identity ?? parseIdentifier(input.identifier);
  const keyId = ids.uniqueKey(idf.kind, idf.value);
  const now = nowIso(d);
  // Reserve the unique key first (handles concurrent sign-ups deterministically).
  try {
    await d.store.create(`unique_keys/${keyId}`, { kind: idf.kind, createdAt: now, uid: null });
  } catch (e) {
    if (e instanceof StoreConflictError) {
      const reserved = await d.store.get<{ uid: string | null }>(`unique_keys/${keyId}`);
      const owner = reserved?.uid ? await d.store.get<User>(`users/${reserved.uid}`) : null;
      if (owner?.status === 'blacklisted')
        throw new ApiError(
          'FORBIDDEN',
          idf.kind === 'nationalCode' ? BLACKLISTED_NATIONAL_CODE_MESSAGE : BLACKLISTED_MESSAGE,
        );
      throw new ApiError(
        'CONFLICT',
        idf.kind === 'phone'
          ? 'این شماره قبلاً ثبت شده است. وارد شوید.'
          : idf.kind === 'nationalCode'
            ? 'این کد ملی قبلاً ثبت شده است. وارد شوید.'
            : 'این ایمیل قبلاً ثبت شده است. وارد شوید.',
      );
    }
    throw e;
  }
  let uid: string;
  try {
    uid = await d.auth.createUser({
      email: idf.authEmail,
      password: input.password,
      displayName: input.name,
      passwordless: opts.passwordless,
    });
  } catch (e) {
    await d.store.delete(`unique_keys/${keyId}`);
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-exists') || e instanceof StoreConflictError)
      throw new ApiError('CONFLICT', 'این حساب قبلاً ثبت شده است. وارد شوید.');
    throw e;
  }
  const user: User = {
    name: input.name,
    avatarUrl: null,
    avatarPath: null,
    workplace: null,
    phone: idf.kind === 'phone' ? idf.phone : null,
    email: idf.kind === 'email' ? idf.email : null,
    nationalCodeHash: idf.kind === 'nationalCode' ? idf.nationalCodeHash : null,
    ...residence(input),
    firebaseUid: uid,
    role,
    teamId: null,
    brandIds: [],
    status: 'active',
    pointsBalance: 0,
    onboardedAt: null,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  await d.store.set(`users/${uid}`, user);
  await d.store.update(`unique_keys/${keyId}`, { uid });
  await d.auth.setClaims(uid, { role: user.role });
  await track(d, 'signup_completed', uid, { method: idf.kind });
  const created = { ...user, id: uid } as Doc<User>;
  // A self sign-up lands in the default sales team when it exists (routes/auth.ts), and that is a new
  // member for its managers — the same hook an admin's team move fires.
  if (created.teamId) await announceTeamJoin(d, created.teamId, { id: uid, name: user.name });
  return created;
}

async function loginGuard(d: Deps, key: string) {
  const g = await d.store.get<{ fails: number; lockedUntil: string | null }>(`login_guards/${key}`);
  if (g?.lockedUntil && g.lockedUntil > nowIso(d)) {
    throw new ApiError(
      'RATE_LIMIT',
      'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
    );
  }
  return g;
}

export async function login(d: Deps, input: z.infer<typeof loginSchema>) {
  let idf: Identifier;
  try {
    idf = parseIdentifier(input.identifier);
  } catch {
    throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  }
  const guardKey = ids.hash(idf.authEmail);
  const guard = await loginGuard(d, guardKey);
  const r = await d.auth.signIn(idf.authEmail, input.password);
  if (!r.ok) {
    if (r.reason === 'disabled') {
      await track(d, 'login_failed', null, { reason: 'disabled' });
      throw new ApiError('FORBIDDEN', 'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.');
    }
    const fails = (guard?.fails ?? 0) + 1;
    const locked = fails >= 5;
    await d.store.set(`login_guards/${guardKey}`, {
      fails: locked ? 0 : fails,
      lockedUntil: locked ? new Date(d.clock().getTime() + 15 * 60_000).toISOString() : null,
    });
    await track(d, 'login_failed', null, { reason: r.reason });
    if (r.reason === 'locked' || locked)
      throw new ApiError(
        'RATE_LIMIT',
        'به دلیل تلاش‌های ناموفق زیاد، ورود تا ۱۵ دقیقه بسته شد. بعداً دوباره تلاش کنید.',
      );
    throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  }
  if (guard) await d.store.delete(`login_guards/${guardKey}`);
  const user = await d.store.get<User>(`users/${r.uid}`);
  if (!user) throw new ApiError('UNAUTHENTICATED', 'رمز یا نام کاربری اشتباه است.');
  if (user.status === 'blacklisted') throw new ApiError('FORBIDDEN', BLACKLISTED_MESSAGE);
  if (user.status !== 'active')
    throw new ApiError('FORBIDDEN', 'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.');
  await d.store.update(`users/${r.uid}`, { lastActiveAt: nowIso(d) });
  await track(d, 'login_success', r.uid, {});
  return { user: publicUser(user), ...r.tokens };
}

// ─── Presence («این حساب همین حالا دیده شد») ────────────────────────────────

/** How stale `lastActiveAt` has to be before a request may refresh it again. */
export const TOUCH_THROTTLE_MS = 10 * 60_000;
/** And how long the request is willing to wait for that write before answering without it. */
export const TOUCH_GIVEUP_MS = 1_500;

/**
 * Refresh `users/<id>.lastActiveAt` — the stamp the inactivity ladder and the panel's «آخرین فعالیت»
 * read. Two callers, both of which already hold the user document: `POST /me/events` with `app_opened`
 * (the app was opened with a valid session — today the only thing that notices) and a token refresh.
 *
 * The throttle is the comparison itself, not a second document: a `_system/active_touch/<id>` row would
 * cost a read *and* a write to answer a question `lastActiveAt` already answers. Writes are what D1
 * rations here (docs/admin-push-automation-analysis.md §۵), so the cheap version wins.
 *
 * Best-effort by contract, in the `step('touch_user', …)` shape from `learning.ts:541`: presence must
 * never turn a 204 into a 500, nor a login into a slow one. The store call is raced against a short
 * give-up (the Worker's own D1 timeout is 15 s, and `deadlineAtMs` is only set for progress paths — so
 * without this race a stalled D1 would stall the request that merely wanted to say "seen"). The write
 * promise always carries a handler, so a late failure cannot surface as an unhandled rejection.
 *
 * Returns the new stamp when it landed, `null` when it was skipped — `refresh` uses that to avoid
 * answering with a `lastActiveAt` it knows is stale. No identifier is logged: the log line is for
 * "presence writes are failing", and the store already logs which path with its own trace.
 */
export async function touchUserActive(
  d: Deps,
  user: Pick<Doc<User>, 'id' | 'lastActiveAt'>,
): Promise<string | null> {
  const at = nowIso(d);
  const prev = user.lastActiveAt ? Date.parse(user.lastActiveAt) : NaN;
  // A stamp from the future also counts as fresh: the point is «not more than one write per 10 minutes».
  if (Number.isFinite(prev) && d.clock().getTime() - prev < TOUCH_THROTTLE_MS) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<'slow'>((resolve) => {
    timer = setTimeout(() => resolve('slow'), TOUCH_GIVEUP_MS);
  });
  const settled = d.store.update(`users/${user.id}`, { lastActiveAt: at }).then(
    () => 'ok' as const,
    () => 'fail' as const,
  );
  const outcome = await Promise.race([settled, giveUp]);
  if (timer !== undefined) clearTimeout(timer);
  if (outcome !== 'ok')
    console.warn(JSON.stringify({ level: 'warn', msg: 'user_active_touch_incomplete', outcome }));
  return outcome === 'ok' ? at : null;
}

export async function refresh(d: Deps, refreshToken: string) {
  const r = await d.auth.refresh(refreshToken);
  if (!r) throw new ApiError('UNAUTHENTICATED');
  const user = await d.store.get<User>(`users/${r.uid}`);
  if (!user || user.status !== 'active') throw new ApiError('UNAUTHENTICATED');
  // A disabled account is refused *before* anything is written, and nothing is written for it.
  const touched = await touchUserActive(d, user);
  const view = publicUser(user);
  if (touched) view.lastActiveAt = touched;
  return { user: view, ...r.tokens };
}

export async function logout(d: Deps, userId: string) {
  await d.auth.revoke(userId);
}

/** Always 202 (no account enumeration). Email → reset mail; phone → admins are notified (D35). */
export async function requestPasswordReset(d: Deps, identifier: string) {
  let idf: Identifier;
  try {
    idf = parseIdentifier(identifier);
  } catch {
    return;
  }
  const users = await d.store.query<User>({
    collection: 'users',
    where: [idf.kind === 'phone' ? ['phone', '==', idf.phone] : ['email', '==', idf.email]],
    limit: 1,
  });
  const user = users[0];
  if (!user || user.status !== 'active') return;
  if (idf.kind === 'email') {
    await d.auth.sendPasswordResetEmail(idf.email);
  } else {
    const { notifyUsers } = await import('./notify');
    const admins = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', 'in', ['admin', 'superadmin']],
        ['status', '==', 'active'],
      ],
    });
    await notifyUsers(
      d,
      admins.map((a) => a.id),
      'manual',
      {
        title: 'درخواست بازیابی رمز',
        body: `${user.name} درخواست بازیابی رمز عبور دارد. از بخش کاربران رمز موقت بسازید.`,
      },
      {
        actionRef: `/admin/users/${user.id}`,
        throttleKey: `pwreset_${user.id}`,
        throttleMs: 3600_000,
      },
    );
  }
  await track(d, 'password_reset_requested', null, { method: idf.kind });
}

// ─── Profile (Me) ───────────────────────────────────────────────────────────
export const patchMeSchema = z
  .object({
    name: text(2, 60, 'نام').optional(),
    province: provinceSchema.optional(),
    city: citySchema.optional(),
    workplace: z.string().trim().max(80, 'محل فعالیت خیلی طولانی است.').nullable().optional(),
  })
  .superRefine(checkResidence)
  .refine((v) => Object.keys(v).length > 0, 'هیچ تغییری ارسال نشده است.');

export const avatarUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(100),
  sizeBytes: z.number().int().positive(),
});

export const avatarFinalizeSchema = z.object({
  path: z.string().min(1).max(240),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export async function updateMe(d: Deps, user: Doc<User>, input: z.infer<typeof patchMeSchema>) {
  if (user.role === 'manager' && (input.province !== undefined || input.city !== undefined))
    throw new ApiError(
      'FORBIDDEN',
      'محدوده مدیریت مدیر از سوی ادمین تعیین می‌شود و از این بخش قابل تغییر نیست.',
    );
  const patch: Partial<User> = { updatedAt: nowIso(d) };
  if (input.name !== undefined) patch.name = input.name;
  if (input.workplace !== undefined) patch.workplace = input.workplace;
  if (input.province !== undefined || input.city !== undefined)
    Object.assign(patch, residence(input));
  await d.store.update(`users/${user.id}`, patch as Record<string, unknown>);
  return publicUser({ ...user, ...patch });
}

export async function createAvatarUploadUrl(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof avatarUploadSchema>,
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
  const ext = EXT[mime] ?? 'bin';
  const path = `avatars/${user.id}/avatar-${d.store.newId()}.${ext}`;
  return {
    path,
    upload: await d.blob.createUploadUrl(path, mime, rule.maxBytes),
  };
}

export async function finalizeAvatar(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof avatarFinalizeSchema>,
) {
  const prefix = `avatars/${user.id}/avatar-`;
  if (!input.path.startsWith(prefix))
    throw new ApiError('FORBIDDEN', 'مسیر عکس پروفایل معتبر نیست.');
  const stat = await d.blob.stat(input.path);
  if (!stat) throw new ApiError('CONFLICT', 'فایل هنوز آپلود نشده است. دوباره تلاش کنید.');
  const rule = MEDIA_RULES.image;
  if (stat.size <= 0 || stat.size > rule.maxBytes) {
    await d.blob.delete(input.path).catch(() => {});
    throw new ApiError('VALIDATION', 'حجم عکس پروفایل معتبر نیست.');
  }
  const head = await d.blob.readRange(input.path, 0, Math.min(stat.size, 63));
  const detected = sniff(head);
  if (!detected || !detected.kinds.includes('image')) {
    await d.blob.delete(input.path).catch(() => {});
    throw new ApiError('VALIDATION', 'محتوای فایل تصویر معتبر نیست.');
  }
  const avatarUrl = await d.blob.publicUrl(input.path);
  const previous = user.avatarPath;
  await d.store.update(`users/${user.id}`, {
    avatarPath: input.path,
    avatarUrl,
    updatedAt: nowIso(d),
  });
  if (previous && previous !== input.path) await d.blob.delete(previous).catch(() => {});
  return publicUser({ ...user, avatarPath: input.path, avatarUrl });
}

export async function changePassword(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof changePasswordSchema>,
) {
  const authEmail =
    user.email ??
    (user.phone
      ? phoneToAuthEmail(user.phone)
      : user.nationalCodeHash
        ? nationalCodeToAuthEmailFromDigest(user.nationalCodeHash)
        : '');
  const r = await d.auth.signIn(authEmail, input.currentPassword);
  if (!r.ok) throw new ApiError('VALIDATION', 'رمز فعلی اشتباه است.');
  await d.auth.setPassword(user.id, input.newPassword);
  await audit(d, { id: user.id, role: user.role }, 'user.password_changed', 'users', user.id);
}

export async function completeOnboarding(d: Deps, user: Doc<User>) {
  if (user.onboardedAt) return { onboardedAt: user.onboardedAt };
  const at = nowIso(d);
  await d.store.update(`users/${user.id}`, { onboardedAt: at });
  await track(d, 'onboarding_completed', user.id);
  return { onboardedAt: at };
}

const managerProfileNationalCodeSchema = z
  .string({ required_error: 'کد ملی را وارد کنید.' })
  .trim()
  .min(1, 'کد ملی را وارد کنید.')
  .max(20)
  .refine((value) => normalizeNationalCode(value) !== null, 'کد ملی معتبر ۱۰ رقمی وارد کنید.');

export const managerProfileCompletionSchema = z
  .object({
    name: text(2, 60, 'نام و نام خانوادگی'),
    nationalCode: managerProfileNationalCodeSchema,
    province: provinceSchema,
    city: citySchema,
    newPassword: passwordSchema,
  })
  .superRefine(checkResidence);

/** First-login setup for an Admin-created Manager: identity digest, management area, and new password. */
export async function completeManagerProfile(
  d: Deps,
  manager: Doc<User>,
  input: z.infer<typeof managerProfileCompletionSchema>,
) {
  if (manager.role !== 'manager' || manager.status !== 'active' || !manager.managerProfileRequired)
    throw new ApiError('CONFLICT', 'تکمیل پروفایل مدیر برای این حساب در دسترس نیست.');
  if (!manager.teamId) throw new ApiError('CONFLICT', 'حساب مدیر هنوز به تیمی متصل نشده است.');
  const team = await d.store.get<Team>(`teams/${manager.teamId}`);
  if (!team || team.archived) throw new ApiError('CONFLICT', 'تیم تخصیص‌داده‌شده در دسترس نیست.');

  const nationalCode = normalizeNationalCode(input.nationalCode);
  if (!nationalCode) throw new ApiError('VALIDATION', 'کد ملی معتبر ۱۰ رقمی وارد کنید.');
  const nationalCodeHash = nationalCodeDigest(nationalCode, d.config.localSecret);
  const keyPath = `unique_keys/${ids.uniqueKey('nationalCode', nationalCodeHash)}`;
  const at = nowIso(d);
  const canonicalResidence = residence(input);
  await d.store.runTransaction(async (tx) => {
    const [current, key] = await Promise.all([
      tx.get<User>(`users/${manager.id}`),
      tx.get<{ uid: string | null }>(keyPath),
    ]);
    if (
      !current ||
      current.role !== 'manager' ||
      current.status !== 'active' ||
      !current.managerProfileRequired ||
      current.teamId !== manager.teamId
    )
      throw new ApiError('CONFLICT', 'وضعیت حساب تغییر کرده است؛ دوباره وارد پنل شوید.');
    if (key?.uid && key.uid !== manager.id)
      throw new ApiError('CONFLICT', 'این کد ملی پیش‌تر به حساب دیگری متصل شده است.');
    if (!key) tx.create(keyPath, { kind: 'nationalCode', createdAt: at, uid: manager.id });
    else if (!key.uid) tx.update(keyPath, { uid: manager.id });
    tx.update(`users/${manager.id}`, {
      name: input.name.trim(),
      ...canonicalResidence,
      nationalCodeHash,
      updatedAt: at,
    });
  });

  // The Manager is authenticated by the Admin-issued temporary password. Replace it before
  // opening the team panel so a password merely handed over verbally is not a lasting credential.
  await d.auth.setPassword(manager.id, input.newPassword);
  await d.store.update(`users/${manager.id}`, {
    managerProfileRequired: false,
    managerProfileCompletedAt: at,
    updatedAt: at,
  });
  const updated = await d.store.get<User>(`users/${manager.id}`);
  const actor: Actor = { id: manager.id, role: 'manager' };
  await audit(d, actor, 'manager.profile_completed', 'users', manager.id, null, {
    teamId: manager.teamId,
    province: canonicalResidence.province,
    city: canonicalResidence.city,
  });
  await track(d, 'manager_profile_completed', manager.id);
  return updated ? publicUser(updated) : null;
}

// ─── Admin: users (PROMPT 007) ──────────────────────────────────────────────
export const adminUserQuery = z.object({
  q: z.string().max(80).optional(),
  role: z.enum(['marketer', 'manager', 'admin', 'superadmin']).optional(),
  teamId: z.string().max(80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function listUsers(d: Deps, f: z.infer<typeof adminUserQuery>) {
  const where: Array<[string, '==', unknown]> = [];
  if (f.role) where.push(['role', '==', f.role]);
  if (f.teamId) where.push(['teamId', '==', f.teamId === 'none' ? null : f.teamId]);
  if (f.status) where.push(['status', '==', f.status]);
  let users = await d.store.query<User>({ collection: 'users', where });
  // Deleted users live in the archive (blacklist), not in the users list.
  users = users.filter((u) => u.status !== 'blacklisted');
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const phone = normalizePhone(q);
    // Province/city are searchable too: «مشهد» / «خراسان» finds every marketer of that region.
    const residenceQuery = normalizeLocation(q);
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').includes(q) ||
        (u.phone ?? '').includes(phone ?? (q.replace(/\D/g, '') || '§')) ||
        (u.province !== null &&
          u.province !== undefined &&
          normalizeLocation(u.province).includes(residenceQuery)) ||
        (u.city !== null &&
          u.city !== undefined &&
          normalizeLocation(u.city).includes(residenceQuery)),
    );
  }
  users.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return users.map(publicUser);
}

export const adminCreateUserSchema = z
  .object({
    firstName: text(2, 30, 'نام'),
    lastName: text(2, 40, 'نام خانوادگی'),
    phone: z.string().trim().min(1, 'شماره موبایل را وارد کنید.').max(30),
    role: z.enum(['marketer', 'manager']),
    teamId: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'manager' && !value.teamId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamId'],
        message: 'برای ساخت حساب مدیر، تیم را انتخاب کنید.',
      });
  });

export const adminPatchUserSchema = z
  .object({
    name: text(2, 60, 'نام').optional(),
    role: z.enum(['marketer', 'manager', 'admin', 'superadmin']).optional(),
    teamId: z.string().max(80).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    brandIds: z.array(z.string().max(80)).max(50).optional(),
    // Admins may correct the residence captured at sign-up (also for accounts that predate it).
    province: provinceSchema.nullable().optional(),
    city: citySchema.nullable().optional(),
  })
  .superRefine(checkResidence)
  .refine((v) => Object.keys(v).length > 0, 'هیچ تغییری ارسال نشده است.');

const PRIVILEGED: Role[] = ['admin', 'superadmin'];

export async function adminUpdateUser(
  d: Deps,
  actor: Actor,
  userId: string,
  patch: z.infer<typeof adminPatchUserSchema>,
) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (target.status === 'blacklisted')
    throw new ApiError(
      'CONFLICT',
      'این کاربر در آرشیو (لیست سیاه) است. از صفحه آرشیو بازگردانی کنید.',
    );
  const selfEdit = actor.id === userId;
  if (selfEdit && (patch.role !== undefined || patch.status !== undefined)) {
    throw new ApiError('FORBIDDEN', 'نمی‌توانید نقش یا وضعیت حساب خودتان را تغییر دهید.');
  }
  const roleChanged = patch.role !== undefined && patch.role !== target.role;
  if (roleChanged || (patch.status !== undefined && PRIVILEGED.includes(target.role))) {
    // roles.manage — only superadmin may grant/revoke admin-level roles.
    const touchesPrivileged =
      PRIVILEGED.includes(target.role) ||
      (patch.role !== undefined && PRIVILEGED.includes(patch.role));
    if (touchesPrivileged && actor.role !== 'superadmin')
      throw new ApiError('FORBIDDEN', 'فقط مدیر ارشد سیستم می‌تواند نقش‌های مدیریتی را تغییر دهد.');
  }
  const losingSuper =
    target.role === 'superadmin' &&
    ((patch.role !== undefined && patch.role !== 'superadmin') || patch.status === 'inactive');
  if (losingSuper) {
    const supers = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'superadmin'],
        ['status', '==', 'active'],
      ],
    });
    if (supers.filter((s) => s.id !== userId).length === 0)
      throw new ApiError(
        'CONFLICT',
        'این آخرین مدیر ارشد سیستم است و نمی‌توان نقش یا وضعیت آن را تغییر داد.',
      );
  }
  if (patch.teamId) {
    const team = await d.store.get<Team>(`teams/${patch.teamId}`);
    if (!team || team.archived) throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');
  }
  const nextRole = patch.role ?? target.role;
  const nextTeamId = patch.teamId === undefined ? target.teamId : patch.teamId;
  if (nextRole === 'manager' && !nextTeamId)
    throw new ApiError('VALIDATION', 'مدیر باید به یک تیم فعال متصل باشد.', {
      teamId: 'تیم را انتخاب کنید.',
    });
  if (patch.brandIds?.length) {
    const brands = await d.store.getMany(patch.brandIds.map((b) => `brands/${b}`));
    if (brands.some((b) => !b)) throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  }
  const warnings: string[] = [];
  const wasManager = target.role === 'manager';
  const movedTeam = wasManager && nextTeamId !== target.teamId;
  const update: Partial<User> = { ...patch, updatedAt: nowIso(d) } as Partial<User>;
  if (roleChanged && nextRole === 'manager') {
    update.managerProfileRequired = true;
    update.managerProfileCompletedAt = null;
  } else if (roleChanged && wasManager) {
    update.managerProfileRequired = false;
    update.managerProfileCompletedAt = null;
  }
  // Store the canonical spellings, not whatever the picker/search box sent.
  if (patch.province) Object.assign(update, residence(patch));
  await d.store.update(`users/${userId}`, update as Record<string, unknown>);
  if (roleChanged) await d.auth.setClaims(userId, { role: patch.role });
  if (roleChanged || patch.status === 'inactive') await d.auth.revoke(userId);
  if (patch.status !== undefined && patch.status !== target.status)
    await d.auth.setDisabled(userId, patch.status === 'inactive');
  const affectedManagerTeams = new Set<string>();
  if (wasManager && target.teamId) affectedManagerTeams.add(target.teamId);
  if (nextRole === 'manager' && nextTeamId) affectedManagerTeams.add(nextTeamId);
  if (wasManager || nextRole === 'manager') {
    for (const teamId of affectedManagerTeams) await syncTeamManagerPointer(d, teamId);
  }
  if (wasManager && target.teamId && (roleChanged || movedTeam)) {
    const remaining = await d.store.query<User>({
      collection: 'users',
      where: [
        ['teamId', '==', target.teamId],
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    });
    if (!remaining.length) {
      const team = await d.store.get<Team>(`teams/${target.teamId}`);
      if (team)
        warnings.push(
          `مدیریت تیم «${team.name}» مدیر فعالی ندارد؛ در بخش تیم‌ها مدیر دیگری انتخاب کنید.`,
        );
    }
  }
  const before = Object.fromEntries(
    Object.keys(patch).map((k) => [k, (target as unknown as Record<string, unknown>)[k]]),
  );
  await audit(
    d,
    actor,
    roleChanged ? 'user.role_changed' : 'user.updated',
    'users',
    userId,
    before,
    patch,
  );
  await track(d, 'admin_user_updated', actor.id, { fields: Object.keys(patch) });
  // Joining the team is the event, whoever moved the person in — including an admin-created account.
  if (patch.teamId && patch.teamId !== target.teamId)
    await announceTeamJoin(d, patch.teamId, { id: userId, name: patch.name ?? target.name });
  const updated = await d.store.get<User>(`users/${userId}`);
  return { user: updated ? publicUser(updated) : null, warnings };
}

function tempPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 6; i++) s += letters[randomInt(letters.length)];
  return `${s}${randomInt(1000, 9999)}`;
}

/** Admin-provisioned accounts are active immediately; Managers receive a one-time password. */
export async function adminCreateUser(
  d: Deps,
  actor: Actor,
  input: z.infer<typeof adminCreateUserSchema>,
) {
  if (actor.role !== 'admin' && actor.role !== 'superadmin') throw new ApiError('FORBIDDEN');
  const phone = normalizePhone(input.phone);
  if (!phone)
    throw new ApiError('VALIDATION', 'شماره موبایل معتبر وارد کنید.', {
      phone: 'شماره موبایل معتبر وارد کنید.',
    });
  const teamId = input.teamId || null;
  const team = teamId ? await d.store.get<Team>(`teams/${teamId}`) : null;
  if (teamId && (!team || team.archived))
    throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.', {
      teamId: 'تیم انتخاب‌شده معتبر نیست.',
    });
  if (input.role === 'manager' && !teamId)
    throw new ApiError('VALIDATION', 'برای ساخت حساب مدیر، تیم را انتخاب کنید.', {
      teamId: 'تیم را انتخاب کنید.',
    });

  const name = `${input.firstName.trim()} ${input.lastName.trim()}`;
  const temporaryPassword = input.role === 'manager' ? tempPassword() : null;
  const user = await register(
    d,
    {
      name,
      identifier: phone,
      // Marketers use the existing identity flow. Managers receive a random, strong password
      // below and must replace it while completing their first-login profile.
      password: temporaryPassword ?? randomBytesBase64Url(24),
    },
    input.role,
    {
      teamId,
      ...(team ? { province: team.province ?? null, city: team.city ?? null } : {}),
      ...(input.role === 'manager'
        ? { managerProfileRequired: true, managerProfileCompletedAt: null }
        : {}),
    },
    { passwordless: input.role === 'marketer' },
  );
  if (input.role === 'manager' && teamId) await syncTeamManagerPointer(d, teamId);
  await audit(d, actor, 'user.admin_created', 'users', user.id, null, {
    role: user.role,
    teamId: user.teamId,
    phone,
  });
  await track(d, 'admin_user_created', actor.id, { role: user.role });
  return {
    user: publicUser(user),
    temporaryPassword,
  };
}

/** D35: phone users → temporary password shown once to the admin; email users → reset mail. */
export async function adminResetPassword(d: Deps, actor: Actor, userId: string) {
  const target = await d.store.get<User>(`users/${userId}`);
  if (!target) throw new ApiError('NOT_FOUND', 'کاربر پیدا نشد.');
  if (PRIVILEGED.includes(target.role) && actor.role !== 'superadmin')
    throw new ApiError(
      'FORBIDDEN',
      'برای بازنشانی رمز کاربر مدیریتی (admin/superadmin) وارد حساب مدیر ارشد سیستم شوید.',
    );
  await audit(d, actor, 'user.password_reset', 'users', userId);
  await track(d, 'admin_password_reset', actor.id, { method: target.email ? 'email' : 'temp' });
  if (target.email) {
    await d.auth.sendPasswordResetEmail(target.email);
    return { method: 'email' as const, temporaryPassword: null };
  }
  const pwd = tempPassword();
  await d.auth.setPassword(userId, pwd);
  await d.auth.revoke(userId);
  return { method: 'temporary' as const, temporaryPassword: pwd };
}

// ─── Teams ─────────────────────────────────────────────────────────────────
export const teamSchema = z.object({
  name: text(2, 60, 'نام تیم'),
  /** Legacy single-manager input; multi-manager clients use `managerIds`. */
  managerId: z.string().max(80).nullable().optional(),
  managerIds: z.array(z.string().max(80)).optional(),
  province: provinceSchema.nullable().optional(),
  city: citySchema.nullable().optional(),
});

export const teamPatchSchema = teamSchema.partial().extend({ archived: z.boolean().optional() });

function normalizedTeamArea(input: { province?: string | null; city?: string | null }): {
  province: string | null;
  city: string | null;
} {
  const provinceInput = input.province?.trim() ?? '';
  const cityInput = input.city?.trim() ?? '';
  if (!provinceInput && !cityInput) return { province: null, city: null };
  if (!provinceInput || !cityInput)
    throw new ApiError('VALIDATION', 'برای محدودهٔ شهر، استان و شهر را با هم انتخاب کنید.');
  const province = canonicalProvince(provinceInput);
  const city = province ? canonicalCity(province, cityInput) : null;
  if (!province || !city)
    throw new ApiError('VALIDATION', 'شهر انتخاب‌شده در استان مشخص‌شده معتبر نیست.');
  return { province, city };
}

async function ensureUniqueTeamArea(
  d: Deps,
  area: { province: string | null; city: string | null },
  exceptId?: string,
) {
  const province = area.province;
  const city = area.city;
  if (!province || !city) return;
  const teams = await d.store.query<Team>({ collection: 'teams' });
  const duplicate = teams.find(
    (team) =>
      team.id !== exceptId &&
      !team.archived &&
      !!team.province &&
      !!team.city &&
      normalizeLocation(team.province) === normalizeLocation(province) &&
      normalizeLocation(team.city) === normalizeLocation(city),
  );
  if (duplicate)
    throw new ApiError(
      'CONFLICT',
      `محدودهٔ ${city}، ${province} از قبل به تیم «${duplicate.name}» تخصیص یافته است. برای این شهر یک تیم بسازید و چند مدیر به همان تیم اضافه کنید.`,
    );
}

async function currentManagerIds(d: Deps, teamId: string, team?: Team | null): Promise<string[]> {
  const assigned = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', teamId],
      ['role', '==', 'manager'],
    ],
  });
  const ids = new Set(assigned.map((manager) => manager.id));
  if (team?.managerId && !ids.has(team.managerId)) {
    const legacy = await d.store.get<User>(`users/${team.managerId}`);
    if (legacy?.role === 'manager' && legacy.status !== 'blacklisted') ids.add(legacy.id);
  }
  return [...ids];
}

async function validateManagerIds(d: Deps, teamId: string, managerIds: string[]) {
  const unique = [...new Set(managerIds)];
  const managers = await d.store.getMany<User>(unique.map((id) => `users/${id}`));
  for (let i = 0; i < unique.length; i++) {
    const manager = managers[i];
    if (
      !manager ||
      manager.role !== 'manager' ||
      manager.status === 'blacklisted' ||
      (manager.status !== 'active' && manager.teamId !== teamId)
    )
      throw new ApiError(
        'VALIDATION',
        'همهٔ مدیران تیم باید حساب فعال داشته باشند؛ مدیر غیرفعال را فقط از تیم فعلی می‌توان نگه داشت.',
      );
  }
  return unique;
}

export async function syncTeamManagerPointer(d: Deps, teamId: string) {
  const team = await d.store.get<Team>(`teams/${teamId}`);
  if (!team) return;
  if (team.archived) {
    if (team.managerId !== null)
      await d.store.update(`teams/${teamId}`, { managerId: null, updatedAt: nowIso(d) });
    return;
  }
  const managers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', teamId],
      ['role', '==', 'manager'],
      ['status', '==', 'active'],
    ],
  });
  await d.store.update(`teams/${teamId}`, {
    managerId: managers[0]?.id ?? null,
    updatedAt: nowIso(d),
  });
}

async function assignManagers(
  d: Deps,
  teamId: string,
  requestedIds: string[],
  team: Team | null,
): Promise<string[]> {
  const desired = await validateManagerIds(d, teamId, requestedIds);
  const desiredSet = new Set(desired);
  const currentIds = await currentManagerIds(d, teamId, team);
  const previousTeamIds = new Set<string>();
  const warnings: string[] = [];
  const timestamp = nowIso(d);

  for (const id of currentIds) {
    if (desiredSet.has(id)) continue;
    const manager = await d.store.get<User>(`users/${id}`);
    if (manager?.role === 'manager' && manager.teamId === teamId) {
      await d.store.update(`users/${id}`, { teamId: null, updatedAt: timestamp });
      warnings.push(`مدیر «${manager.name}» از این تیم جدا شد.`);
    }
  }

  for (const id of desired) {
    const manager = await d.store.get<User>(`users/${id}`);
    if (!manager) continue; // The validation above already guards this; tolerate a deletion race.
    if (manager.teamId && manager.teamId !== teamId) {
      previousTeamIds.add(manager.teamId);
      const previousTeam = await d.store.get<Team>(`teams/${manager.teamId}`);
      if (previousTeam?.managerId === manager.id)
        await d.store.update(`teams/${manager.teamId}`, { managerId: null, updatedAt: timestamp });
    }
    if (manager.teamId !== teamId)
      await d.store.update(`users/${id}`, { teamId, updatedAt: timestamp });
  }

  await syncTeamManagerPointer(d, teamId);
  for (const previousTeamId of previousTeamIds) {
    const previous = await d.store.get<Team>(`teams/${previousTeamId}`);
    await syncTeamManagerPointer(d, previousTeamId);
    const remaining = await d.store.query<User>({
      collection: 'users',
      where: [
        ['teamId', '==', previousTeamId],
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    });
    if (previous && !remaining.length)
      warnings.push(`تیم قبلی «${previous.name}» هم بدون مدیر ماند؛ برایش مدیر فعالی انتخاب کنید.`);
  }
  return warnings;
}

export async function listTeams(d: Deps) {
  const [teams, users] = await Promise.all([
    d.store.query<Team>({ collection: 'teams' }),
    d.store.query<User>({ collection: 'users' }),
  ]);
  return teams
    .filter((team) => !team.archived)
    .map((team) => {
      const assigned = users.filter(
        (user) =>
          user.role === 'manager' &&
          user.status !== 'blacklisted' &&
          (user.teamId === team.id || (!user.teamId && user.id === team.managerId)),
      );
      const managers = assigned
        .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
        .map((manager) => ({ id: manager.id, name: manager.name, status: manager.status }));
      const activeManagers = managers.filter((manager) => manager.status === 'active');
      const primary = activeManagers[0] ?? null;
      return {
        id: team.id,
        name: team.name,
        managerId: primary?.id ?? null,
        managerName: primary?.name ?? null,
        managerIds: managers.map((manager) => manager.id),
        managers,
        activeManagerCount: activeManagers.length,
        province: team.province ?? null,
        city: team.city ?? null,
        memberCount: users.filter(
          (user) => user.status === 'active' && isTeamMarketer(user, team.id, team),
        ).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

function selectedManagerIds(input: {
  managerIds?: string[];
  managerId?: string | null;
}): string[] | undefined {
  if (input.managerIds !== undefined) return [...new Set(input.managerIds)];
  if (input.managerId !== undefined) return input.managerId ? [input.managerId] : [];
  return undefined;
}

export async function createTeam(d: Deps, actor: Actor, input: z.infer<typeof teamSchema>) {
  const id = d.store.newId();
  const now = nowIso(d);
  const area = normalizedTeamArea(input);
  await ensureUniqueTeamArea(d, area);
  const requested = selectedManagerIds(input) ?? [];
  await validateManagerIds(d, id, requested);
  const team: Team = {
    name: input.name,
    managerId: null,
    ...area,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await d.store.set(`teams/${id}`, team);
  const warnings = await assignManagers(d, id, requested, team);
  const saved = (await d.store.get<Team>(`teams/${id}`)) ?? team;
  await audit(d, actor, 'team.created', 'teams', id, null, saved);
  return { id, ...saved, managerIds: requested, warnings };
}

export async function updateTeam(
  d: Deps,
  actor: Actor,
  teamId: string,
  input: z.infer<typeof teamPatchSchema>,
) {
  const team = await d.store.get<Team>(`teams/${teamId}`);
  if (!team) throw new ApiError('NOT_FOUND', 'تیم پیدا نشد.');
  const area = normalizedTeamArea({
    province: input.province === undefined ? (team.province ?? null) : input.province,
    city: input.city === undefined ? (team.city ?? null) : input.city,
  });
  await ensureUniqueTeamArea(d, area, teamId);
  const currentIds = await currentManagerIds(d, teamId, team);
  const selected = selectedManagerIds(input);
  const requested = input.archived ? [] : (selected ?? currentIds);
  await validateManagerIds(d, teamId, requested);
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.archived !== undefined ? { archived: input.archived } : {}),
    ...area,
    managerId: team.managerId,
    updatedAt: nowIso(d),
  };
  await d.store.update(`teams/${teamId}`, patch);
  const warnings = await assignManagers(d, teamId, requested, { ...team, ...patch });
  if (input.archived && currentIds.length) warnings.push('مدیران قبلی از این تیم جدا شدند.');
  const updated = (await d.store.get<Team>(`teams/${teamId}`)) ?? { ...team, ...patch };
  await audit(d, actor, 'team.updated', 'teams', teamId, team, patch);
  return { ...updated, id: teamId, managerIds: requested, warnings };
}

/** Used by seed/bootstrap: first superadmin (never via public API). */
export async function ensureUser(
  d: Deps,
  p: {
    name: string;
    identifier: string;
    password: string;
    role: Role;
    teamId?: string | null;
    brandIds?: string[];
    /** Optional residence for seeded/demo accounts (sign-up collects it from the form). */
    province?: string | null;
    city?: string | null;
  },
) {
  const idf = parseIdentifier(p.identifier);
  const existing = await d.store.query<User>({
    collection: 'users',
    where: [idf.kind === 'phone' ? ['phone', '==', idf.phone] : ['email', '==', idf.email]],
    limit: 1,
  });
  if (existing[0]) return existing[0];
  const u = await register(
    d,
    {
      name: p.name,
      identifier: p.identifier,
      password: p.password,
      province: p.province ?? undefined,
      city: p.city ?? undefined,
    },
    p.role,
    { teamId: p.teamId ?? null, brandIds: p.brandIds ?? [], onboardedAt: nowIso(d) },
  );
  await audit(d, SYSTEM, 'user.seeded', 'users', u.id, null, { role: p.role });
  return u;
}
