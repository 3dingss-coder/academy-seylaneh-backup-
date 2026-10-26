import { bytesToHex, hmacSha256Bytes, sha256Hex } from './crypto';

/** Deterministic document ids (idempotency + uniqueness without queries). */
export const ids = {
  attempt: (userId: string, quizId: string, n: number) => `${userId}_${quizId}_${n}`,
  progress: (userId: string, sectionId: string) => `${userId}_${sectionId}`,
  points: (userId: string, reason: string, refId: string) => `${userId}_${reason}_${refId}`,
  userBadge: (userId: string, badgeId: string) => `${userId}_${badgeId}`,
  escalation: (userId: string, packageId: string, type: string) => `${userId}_${packageId}_${type}`,
  uniqueKey: (kind: 'phone' | 'email' | 'nationalCode', value: string) =>
    `${kind}_${sha256Hex(value.toLowerCase()).slice(0, 40)}`,
  hash: (s: string) => sha256Hex(s).slice(0, 40),
};

/** Iranian mobile normalisation → 09xxxxxxxxx (accepts +98 / 0098 / Persian digits). */
export function normalizePhone(input: string): string | null {
  const latin = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-()]/g, '');
  let p = latin;
  if (p.startsWith('+98')) p = `0${p.slice(3)}`;
  else if (p.startsWith('0098')) p = `0${p.slice(4)}`;
  else if (p.startsWith('98') && p.length === 12) p = `0${p.slice(2)}`;
  else if (p.startsWith('9') && p.length === 10) p = `0${p}`;
  return /^09\d{9}$/.test(p) ? p : null;
}

/** Normalize Persian/Arabic digits and validate Iran's 10-digit national-code checksum. */
export function normalizeNationalCode(input: string): string | null {
  const code = input
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return null;

  const sum = [...code.slice(0, 9)].reduce(
    (total, digit, index) => total + Number(digit) * (10 - index),
    0,
  );
  const remainder = sum % 11;
  const expectedCheckDigit = remainder < 2 ? remainder : 11 - remainder;
  return Number(code[9]) === expectedCheckDigit ? code : null;
}

/** D35: phone users authenticate with a synthetic email. */
export const PHONE_EMAIL_DOMAIN = 'phone.seylane-sabz.app';
export function phoneToAuthEmail(phone: string): string {
  return `${phone}@${PHONE_EMAIL_DOMAIN}`;
}

/**
 * Manager accounts authenticate with their own synthetic email domain. One phone number can
 * therefore hold two accounts at once — a passwordless marketer account (phone domain) and a
 * password-protected Manager account (manager domain) — so being granted Manager access never
 * closes the person's marketer sign-in. Manager accounts created before this split use the
 * phone domain; sign-in flows try both candidates.
 */
export const MANAGER_PHONE_EMAIL_DOMAIN = 'manager.seylane-sabz.app';
export function managerPhoneToAuthEmail(phone: string): string {
  return `${phone}@${MANAGER_PHONE_EMAIL_DOMAIN}`;
}

/** Which uniqueness namespace a phone/national-code reservation belongs to (see above). */
export type IdentityScope = 'account' | 'manager';

/** `unique_keys` document id for a phone/national-code value in one identity namespace. */
export function identityUniqueKey(
  kind: 'phone' | 'nationalCode',
  value: string,
  scope: IdentityScope = 'account',
): string {
  return ids.uniqueKey(kind, scope === 'manager' ? `manager:${value}` : value);
}

/**
 * A keyed, non-reversible lookup value for national codes. Codes are low-entropy personal data, so
 * a plain SHA-256 digest would be vulnerable to an offline dictionary attack if the store leaked.
 */
export function nationalCodeDigest(nationalCode: string, secret: string): string {
  const normalized = normalizeNationalCode(nationalCode);
  if (!normalized) throw new Error('Invalid national code');
  return bytesToHex(hmacSha256Bytes(secret, `seylane:national-code:${normalized}`));
}

/** The opaque internal auth email derived from a stored national-code digest. */
export function nationalCodeToAuthEmailFromDigest(digest: string): string {
  return `nc-${digest}@national-code.seylane-sabz.app`;
}

export function extractYoutubeId(url: string): string | null {
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
