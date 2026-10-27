import { randomBytesBase64Url, randomInt } from '../lib/crypto';
import { z } from 'zod';
import { ApiError } from '../http/errors';
import { text } from '../http/validate';
import {
  identityUniqueKey,
  ids,
  managerPhoneToAuthEmail,
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
import { transferLearningHistory } from './history-transfer';
import { reportTimeSchema } from '../telegram/schedule';
import { normalizeTelegramChatId } from '../telegram/types';
import { canonicalManagerProvinces, effectiveManagerProvinces, isTeamMarketer } from './team-scope';

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

/** «استان‌های تحت مدیریت»: the provinces whose marketers a Manager supervises (31 max). */
export const managerProvincesSchema = z
  .array(provinceSchema, { invalid_type_error: 'استان‌های تحت مدیریت را انتخاب کنید.' })
  .max(31, 'حداکثر ۳۱ استان را می‌توان انتخاب کرد.');

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

/**
 * Auth-email candidates for one phone across the identity namespaces, legacy (marketer)
 * first: pre-split Manager accounts still live on the phone domain, newer Manager accounts
 * on the manager domain. Sign-in tries them in order under a single login guard.
 */
export function phoneLoginEmailCandidates(phone: string): string[] {
  return [phoneToAuthEmail(phone), managerPhoneToAuthEmail(phone)];
}

/** All auth emails a sign-in identifier may resolve to (first one is the primary/guard key). */
export function loginEmailCandidates(idf: Identifier): string[] {
  if (idf.kind === 'phone') return phoneLoginEmailCandidates(idf.phone);
  return [idf.authEmail];
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
          telegramChatId: u.telegramChatId ?? null,
          telegramReportTime: u.telegramReportTime ?? null,
          managerProvinces: effectiveManagerProvinces(u),
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
  member: { id: string; name: string; province?: string | null },
): Promise<void> {
  // Lazy, like the `notify` import below: `users.ts` is on the sign-up path and the automation stack is
  // only reached when someone actually enabled a rule.
  const { emitAutomationEventForUsers, isListening } = await import('./push-automation-events');
  if (!(await isListening(d, 'team.member_joined'))) return;
  const managers = teamId
    ? await d.store.query<User>({
        collection: 'users',
        where: [
          ['teamId', '==', teamId],
          ['role', '==', 'manager'],
          ['status', '==', 'active'],
        ],
      })
    : [];
  // A province Manager (no manual team) also "gains a member" when a marketer of their
  // province joins — marketers usually land in the default team, not the Manager's team.
  if (member.province) {
    const province = canonicalProvince(member.province) ?? member.province;
    const active = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    });
    for (const manager of active)
      if (
        effectiveManagerProvinces(manager).includes(province) &&
        !managers.some((m) => m.id === manager.id)
      )
        managers.push(manager);
  }
  await emitAutomationEventForUsers(
    d,
    'team.member_joined',
    managers.map((m) => m.id).filter((id) => id !== member.id),
    { memberName: member.name },
    { dedupeKey: member.id },
  );
}

/**
 * Lazy identity migration for pre-split Manager accounts: the Manager keeps signing in with
 * the same phone + password (now through the manager-domain auth email and the
 * manager-scoped unique key), while the legacy phone reservation is released so the person
 * can hold a marketer account on the same number again. Returns false when the phone is not
 * a clean legacy-Manager case (a marketer already exists, or another Manager holds the key).
 */
async function freeLegacyManagerPhone(
  d: Deps,
  phone: string,
  owner: Doc<User>,
): Promise<string | null> {
  const samePhone = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
  });
  if (samePhone.some((user) => user.role === 'marketer' && user.status !== 'blacklisted'))
    return null;
  const legacyKeyPath = `unique_keys/${ids.uniqueKey('phone', phone)}`;
  const managerKeyPath = `unique_keys/${identityUniqueKey('phone', phone, 'manager')}`;
  const managerKey = await d.store.get<{ uid: string | null }>(managerKeyPath);
  if (managerKey?.uid && managerKey.uid !== owner.id) return null;
  const now = nowIso(d);
  if (!managerKey)
    await d.store.create(managerKeyPath, { kind: 'phone', createdAt: now, uid: owner.id });
  else if (!managerKey.uid) await d.store.update(managerKeyPath, { uid: owner.id });
  await d.auth.setEmail(owner.id, managerPhoneToAuthEmail(phone));
  await d.store.delete(legacyKeyPath);
  return owner.id;
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
  // A Manager account for a phone lives in its own identity namespace (manager-domain auth
  // email + manager-scoped unique key), so the same phone keeps working as a marketer too.
  const managerPhone = role === 'manager' && idf.kind === 'phone';
  const authEmail = managerPhone ? managerPhoneToAuthEmail(idf.phone) : idf.authEmail;
  const keyId = managerPhone
    ? identityUniqueKey('phone', idf.value, 'manager')
    : ids.uniqueKey(idf.kind, idf.value);
  const now = nowIso(d);
  // Set when this phone's pre-split Manager account was just migrated to the manager identity
  // namespace: its marketer learning history moves to the new account below.
  let legacyHistoryFrom: string | null = null;
  // Reserve the unique key first (handles concurrent sign-ups deterministically).
  const reserveKey = async (): Promise<boolean> => {
    try {
      await d.store.create(`unique_keys/${keyId}`, { kind: idf.kind, createdAt: now, uid: null });
      return true;
    } catch (e) {
      if (e instanceof StoreConflictError) return false;
      throw e;
    }
  };
  if (!(await reserveKey())) {
    const reserved = await d.store.get<{ uid: string | null }>(`unique_keys/${keyId}`);
    const owner = reserved?.uid ? await d.store.get<User>(`users/${reserved.uid}`) : null;
    if (owner?.status === 'blacklisted')
      throw new ApiError(
        'FORBIDDEN',
        idf.kind === 'nationalCode' ? BLACKLISTED_NATIONAL_CODE_MESSAGE : BLACKLISTED_MESSAGE,
      );
    // Phones granted Manager access before the identity split still hold the phone in the
    // legacy namespace. Move that Manager account to the manager namespace on the fly so the
    // same phone can register as a marketer again (the bug this split exists to fix).
    const migratedFrom =
      !managerPhone && role !== 'manager' && idf.kind === 'phone' && owner?.role === 'manager'
        ? await freeLegacyManagerPhone(d, idf.phone, owner).catch(() => null)
        : null;
    legacyHistoryFrom = migratedFrom;
    if (!migratedFrom || !(await reserveKey()))
      throw new ApiError(
        'CONFLICT',
        managerPhone
          ? 'برای این شماره قبلاً حساب مدیر ساخته شده است.'
          : idf.kind === 'phone'
            ? 'این شماره قبلاً ثبت شده است. وارد شوید.'
            : idf.kind === 'nationalCode'
              ? 'این کد ملی قبلاً ثبت شده است. وارد شوید.'
              : 'این ایمیل قبلاً ثبت شده است. وارد شوید.',
      );
  }
  let uid: string;
  try {
    uid = await d.auth.createUser({
      email: authEmail,
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
  // The pre-split Manager account on this phone started life as this person's marketer
  // account: hand its learning history (progress, attempts, badges, points) back to the new
  // marketer account so nobody loses their training record over an old role conversion.
  if (legacyHistoryFrom) {
    try {
      const result = await transferLearningHistory(d, legacyHistoryFrom, uid);
      created.pointsBalance = (created.pointsBalance ?? 0) + result.pointsMoved;
      await audit(d, SYSTEM, 'user.history_transferred', 'users', uid, null, {
        fromUserId: legacyHistoryFrom,
        moved: result.moved,
        pointsMoved: result.pointsMoved,
      });
    } catch {
      console.warn('[register] legacy learning-history transfer failed; it can be re-run safely.');
    }
  }
  // A self sign-up lands in the default sales team when it exists (routes/auth.ts), and that is a new
  // member for its managers — the same hook an admin's team move fires. Province Managers of the
  // joiner's province hear about it too, whichever team the joiner landed in.
  if (created.role === 'marketer' && (created.teamId || created.province))
    await announceTeamJoin(d, created.teamId ?? '', {
      id: uid,
      name: user.name,
      province: user.province,
    });
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
  // One guard strike per attempt, however many namespace candidates were tried.
  let r = await d.auth.signIn(idf.authEmail, input.password);
  if (!r.ok && r.reason === 'invalid') {
    for (const candidate of loginEmailCandidates(idf).slice(1)) {
      const retry = await d.auth.signIn(candidate, input.password);
      if (retry.ok || retry.reason !== 'invalid') {
        r = retry;
        break;
      }
    }
  }
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
  });
  // One phone may hold a (passwordless) marketer account and a password Manager account;
  // a reset request is about the password account.
  const user = users.find((candidate) => candidate.role === 'manager') ?? users[0];
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
    telegramReportTime: reportTimeSchema.nullable().optional(),
    telegramChatId: z.string().trim().max(24).nullable().optional(),
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
  if (input.telegramReportTime !== undefined && user.role !== 'manager')
    throw new ApiError('FORBIDDEN', 'تنظیم گزارش فقط برای مدیران در دسترس است.');
  const patch: Partial<User> = { updatedAt: nowIso(d) };
  if (input.telegramReportTime !== undefined) {
    patch.telegramReportTime = input.telegramReportTime;
    if (input.telegramReportTime !== (user.telegramReportTime ?? null))
      patch.telegramReportTimeUpdatedAt = nowIso(d);
  }
  if (input.name !== undefined) patch.name = input.name;
  if (input.workplace !== undefined) patch.workplace = input.workplace;
  if (input.telegramChatId !== undefined)
    patch.telegramChatId = normalizeTelegramChatId(input.telegramChatId);
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
  const candidates = user.email
    ? [user.email]
    : user.phone
      ? user.role === 'manager'
        ? [managerPhoneToAuthEmail(user.phone), phoneToAuthEmail(user.phone)]
        : phoneLoginEmailCandidates(user.phone)
      : user.nationalCodeHash
        ? [nationalCodeToAuthEmailFromDigest(user.nationalCodeHash)]
        : [''];
  let ok = false;
  for (const authEmail of candidates) {
    const r = await d.auth.signIn(authEmail, input.currentPassword);
    if (r.ok && r.uid === user.id) {
      ok = true;
      break;
    }
  }
  if (!ok) throw new ApiError('VALIDATION', 'رمز فعلی اشتباه است.');
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
  // A Manager is scoped by their supervised provinces and/or an optional manual team; either
  // one is enough to start (province-only Managers never get a team).
  if (!manager.teamId && !effectiveManagerProvinces(manager).length)
    throw new ApiError('CONFLICT', 'برای حساب مدیر هنوز استان یا تیمی تعیین نشده است.');
  if (manager.teamId) {
    const team = await d.store.get<Team>(`teams/${manager.teamId}`);
    if (!team || team.archived) throw new ApiError('CONFLICT', 'تیم تخصیص‌داده‌شده در دسترس نیست.');
  }

  const nationalCode = normalizeNationalCode(input.nationalCode);
  if (!nationalCode) throw new ApiError('VALIDATION', 'کد ملی معتبر ۱۰ رقمی وارد کنید.');
  const nationalCodeHash = nationalCodeDigest(nationalCode, d.config.localSecret);
  // The Manager reserves the code in the Manager identity namespace; the legacy key is only
  // consulted so the same person holding the code on their marketer account is not rejected.
  const keyPath = `unique_keys/${identityUniqueKey('nationalCode', nationalCodeHash, 'manager')}`;
  const legacyKeyPath = `unique_keys/${ids.uniqueKey('nationalCode', nationalCodeHash)}`;
  const at = nowIso(d);
  const canonicalResidence = residence(input);
  await d.store.runTransaction(async (tx) => {
    const [current, key, legacyKey] = await Promise.all([
      tx.get<User>(`users/${manager.id}`),
      tx.get<{ uid: string | null }>(keyPath),
      tx.get<{ uid: string | null }>(legacyKeyPath),
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
    if (legacyKey?.uid && legacyKey.uid !== manager.id) {
      // Same person, second account: the marketer account with this phone may hold the code.
      const owner = await tx.get<User>(`users/${legacyKey.uid}`);
      if (!owner || !current.phone || owner.phone !== current.phone)
        throw new ApiError('CONFLICT', 'این کد ملی پیش‌تر به حساب دیگری متصل شده است.');
    }
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
    /** «استان‌های تحت مدیریت» for a Manager — a team is optional when provinces are given. */
    managerProvinces: managerProvincesSchema.optional(),
    /** A marketer's residence decides their automatic province team + supervising Managers. */
    province: provinceSchema.optional(),
    city: citySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'manager' && !value.teamId && !value.managerProvinces?.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['managerProvinces'],
        message: 'برای ساخت حساب مدیر، دست‌کم یک استان تحت مدیریت انتخاب کنید.',
      });
  })
  .superRefine(checkResidence);

export const adminPatchUserSchema = z
  .object({
    name: text(2, 60, 'نام').optional(),
    role: z.enum(['marketer', 'manager', 'admin', 'superadmin']).optional(),
    teamId: z.string().max(80).nullable().optional(),
    managerProvinces: managerProvincesSchema.optional(),
    status: z.enum(['active', 'inactive']).optional(),
    brandIds: z.array(z.string().max(80)).max(50).optional(),
    telegramChatId: z.string().trim().max(24).nullable().optional(),
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
  let patchTeam: Team | null = null;
  if (patch.teamId) {
    patchTeam = await d.store.get<Team>(`teams/${patch.teamId}`);
    if (!patchTeam || patchTeam.archived)
      throw new ApiError('VALIDATION', 'تیم انتخاب‌شده معتبر نیست.');
  }
  if (patch.brandIds?.length) {
    const brands = await d.store.getMany(patch.brandIds.map((b) => `brands/${b}`));
    if (brands.some((b) => !b)) throw new ApiError('VALIDATION', 'برند انتخاب‌شده معتبر نیست.');
  }
  const patchedProvinces =
    patch.managerProvinces !== undefined
      ? canonicalManagerProvinces(patch.managerProvinces)
      : undefined;
  const patchedTelegramChatId =
    patch.telegramChatId !== undefined ? normalizeTelegramChatId(patch.telegramChatId) : undefined;
  const nextRole = patch.role ?? target.role;
  const nextTeamId = patch.teamId === undefined ? target.teamId : patch.teamId;
  const nextProvinces = patchedProvinces ?? effectiveManagerProvinces(target);

  // Granting Manager access to a marketer no longer converts their account: a separate
  // Manager account is created for the same phone (its own password + identity namespace),
  // and the marketer account — sign-in, learning history, points — stays exactly as it was.
  // The one-time temporary password is returned so the admin can hand it over once.
  if (patch.role === 'manager' && target.role === 'marketer') {
    const provinces = patchedProvinces ?? [];
    const managerTeamId = patch.teamId ?? null;
    if (!managerTeamId && !provinces.length)
      throw new ApiError('VALIDATION', 'برای ساخت حساب مدیر، دست‌کم یک استان انتخاب کنید.', {
        managerProvinces: 'دست‌کم یک استان تحت مدیریت انتخاب کنید.',
      });
    if (!target.phone)
      throw new ApiError(
        'VALIDATION',
        'این حساب شماره موبایل ندارد؛ حساب مدیر را از «کاربر جدید» با شمارهٔ موبایل بسازید.',
      );
    const personResidence =
      patch.province !== undefined || patch.city !== undefined
        ? residence(patch)
        : { province: target.province, city: target.city };
    const temporaryPassword = tempPassword();
    const manager = await register(
      d,
      {
        name: patch.name ?? target.name,
        identifier: target.phone,
        password: temporaryPassword,
      },
      'manager',
      {
        teamId: managerTeamId,
        managerProvinces: provinces,
        province: personResidence.province ?? provinces[0] ?? patchTeam?.province ?? null,
        city: personResidence.city ?? null,
        nationalCodeHash: target.nationalCodeHash ?? null,
        managerProfileRequired: true,
        managerProfileCompletedAt: null,
      },
    );
    if (managerTeamId) await syncTeamManagerPointer(d, managerTeamId);
    // The rest of the patch describes the person/marketer account itself (name, residence…).
    const marketerUpdate: Partial<User> = { updatedAt: nowIso(d) };
    if (patch.name !== undefined) marketerUpdate.name = patch.name;
    if (patch.status !== undefined) marketerUpdate.status = patch.status;
    if (patch.brandIds !== undefined) marketerUpdate.brandIds = patch.brandIds;
    if (patch.province !== undefined || patch.city !== undefined)
      Object.assign(marketerUpdate, residence(patch));
    if (Object.keys(marketerUpdate).length > 1)
      await d.store.update(`users/${userId}`, marketerUpdate as Record<string, unknown>);
    if (patch.status !== undefined && patch.status !== target.status) {
      await d.auth.setDisabled(userId, patch.status === 'inactive');
      if (patch.status === 'inactive') await d.auth.revoke(userId);
    }
    const warnings = [
      'حساب بازاریاب دست‌نخورده ماند و حساب مدیر جداگانه‌ای با همین شماره ساخته شد؛ از این به بعد ورود بازاریاب با همان شماره و ورود مدیر با رمز موقت انجام می‌شود.',
    ];
    await audit(
      d,
      actor,
      'user.manager_account_created',
      'users',
      userId,
      { role: 'marketer' },
      {
        managerUserId: manager.id,
        managerProvinces: provinces,
        teamId: managerTeamId,
      },
    );
    await track(d, 'admin_user_updated', actor.id, { fields: Object.keys(patch) });
    const updated = await d.store.get<User>(`users/${userId}`);
    return {
      user: updated ? publicUser(updated) : null,
      warnings,
      createdManager: { user: publicUser(manager), temporaryPassword },
    };
  }

  // Turning a Manager account back into a marketer only makes sense when the person has no
  // separate marketer account for the same phone; otherwise block the Manager account instead.
  if (target.role === 'manager' && patch.role === 'marketer' && target.phone) {
    const samePhone = await d.store.query<User>({
      collection: 'users',
      where: [
        ['phone', '==', target.phone],
        ['role', '==', 'marketer'],
      ],
    });
    if (samePhone.some((u) => u.id !== userId && u.status !== 'blacklisted'))
      throw new ApiError(
        'CONFLICT',
        'برای این شماره حساب بازاریاب جداگانه وجود دارد؛ به‌جای تغییر نقش، دسترسی این حساب مدیر را مسدود کنید.',
      );
  }
  if (nextRole === 'manager' && !nextTeamId && !nextProvinces.length)
    throw new ApiError('VALIDATION', 'مدیر باید دست‌کم یک استان تحت مدیریت داشته باشد.', {
      managerProvinces: 'دست‌کم یک استان تحت مدیریت انتخاب کنید.',
      teamId: 'استان‌ها را انتخاب کنید یا مدیر را به تیمی وصل کنید.',
    });
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
  if (patchedProvinces !== undefined) update.managerProvinces = patchedProvinces;
  if (patchedTelegramChatId !== undefined) update.telegramChatId = patchedTelegramChatId;
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
    await announceTeamJoin(d, patch.teamId, {
      id: userId,
      name: patch.name ?? target.name,
      province: patch.province ?? target.province,
    });
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
  const managerProvinces =
    input.role === 'manager' ? canonicalManagerProvinces(input.managerProvinces) : [];
  if (input.role === 'manager' && !teamId && !managerProvinces.length)
    throw new ApiError('VALIDATION', 'برای ساخت حساب مدیر، دست‌کم یک استان انتخاب کنید.', {
      managerProvinces: 'دست‌کم یک استان تحت مدیریت انتخاب کنید.',
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
      // A marketer's residence decides their automatic province team + supervising Managers.
      ...(input.role === 'marketer' && input.province
        ? { province: input.province, city: input.city }
        : {}),
    },
    input.role,
    {
      teamId,
      ...(input.role === 'manager'
        ? {
            managerProvinces,
            province: team?.province ?? managerProvinces[0] ?? null,
            city: team?.city ?? null,
            managerProfileRequired: true,
            managerProfileCompletedAt: null,
          }
        : team && !input.province
          ? { province: team.province ?? null, city: team.city ?? null }
          : {}),
    },
    { passwordless: input.role === 'marketer' },
  );
  if (input.role === 'manager' && teamId) await syncTeamManagerPointer(d, teamId);
  await audit(d, actor, 'user.admin_created', 'users', user.id, null, {
    role: user.role,
    teamId: user.teamId,
    ...(input.role === 'manager' ? { managerProvinces } : {}),
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

/**
 * «تیم‌های استانی خودکار» — the virtual province teams: every marketer grouped by their
 * residence province, plus the Managers who supervise that province (effective scope).
 * Nothing is stored; the groups always reflect live registrations, so a Manager assigned to
 * a province sees exactly these people in their panel.
 */
export async function listProvinceTeams(d: Deps) {
  const users = await d.store.query<User>({ collection: 'users' });
  const memberView = (u: Doc<User>) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    city: u.city ?? null,
    status: u.status,
    teamId: u.teamId,
    pointsBalance: u.pointsBalance,
    lastActiveAt: u.lastActiveAt,
  });
  const marketers = users.filter((u) => u.role === 'marketer' && u.status !== 'blacklisted');
  const managers = users.filter((u) => u.role === 'manager' && u.status !== 'blacklisted');
  const provinces = canonicalManagerProvinces([
    ...marketers.map((u) => u.province ?? ''),
    ...managers.flatMap((u) => effectiveManagerProvinces(u)),
  ]);
  const groups = provinces.map((province) => {
    const members = marketers
      .filter((u) => u.province && (canonicalProvince(u.province) ?? u.province) === province)
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const provinceManagers = managers
      .filter((u) => effectiveManagerProvinces(u).includes(province))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
    return {
      province,
      memberCount: members.length,
      activeMemberCount: members.filter((u) => u.status === 'active').length,
      managers: provinceManagers.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        status: u.status,
        teamId: u.teamId,
        managerProvinces: effectiveManagerProvinces(u),
      })),
      members: members.map(memberView),
    };
  });
  const unassigned = marketers
    .filter((u) => !u.province || !canonicalProvince(u.province))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return {
    provinces: groups,
    unassigned: { memberCount: unassigned.length, members: unassigned.map(memberView) },
  };
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
    managerProvinces?: string[];
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
  });
  // One phone may hold both a marketer and a Manager account; ensure the one for this role.
  const sameRole = existing.find((user) => user.role === p.role);
  if (sameRole) return sameRole;
  if (existing[0] && p.role !== 'manager' && existing[0].role !== 'manager') return existing[0];
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
    {
      teamId: p.teamId ?? null,
      brandIds: p.brandIds ?? [],
      ...(p.managerProvinces ? { managerProvinces: p.managerProvinces } : {}),
      onboardedAt: nowIso(d),
    },
  );
  await audit(d, SYSTEM, 'user.seeded', 'users', u.id, null, { role: p.role });
  return u;
}
