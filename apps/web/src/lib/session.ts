import { Capacitor } from '@capacitor/core';

/**
 * Token storage (D36): the refresh token is persisted so low-digital-literacy users are not asked
 * to log in every time. The short-lived (1 h) access token is also mirrored to localStorage, next
 * to the refresh token (which is strictly more powerful), so a returning visitor's first API calls
 * can go out at once instead of waiting for a /auth/refresh round trip. A stale or revoked copy is
 * harmless: the API answers 401 and `request()` refreshes and retries. On Android (Capacitor)
 * the WebView's localStorage is app-private; the Preferences plugin can be swapped in here.
 */
const REFRESH_KEY = 'ssl.refresh';
const ACCESS_KEY = 'ssl.access';

function loadAccess(): { token: string | null; exp: number } {
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    if (!raw) return { token: null, exp: 0 };
    const v = JSON.parse(raw) as { t?: unknown; e?: unknown };
    if (typeof v.t === 'string' && typeof v.e === 'number') return { token: v.t, exp: v.e };
  } catch {
    /* storage unavailable or corrupt */
  }
  return { token: null, exp: 0 };
}
const stored = loadAccess();
let accessToken: string | null = stored.token;
/** On Android the refresh token lives in Capacitor Preferences (D36); mirrored here in memory. */
let nativeRefresh: string | null = null;
let native = false;
let accessExpiresAt = stored.exp;

export const session = {
  get access() {
    return accessToken && Date.now() < accessExpiresAt - 30_000 ? accessToken : null;
  },
  setAccess(token: string, expiresInSec: number) {
    accessToken = token;
    accessExpiresAt = Date.now() + expiresInSec * 1000;
    try {
      localStorage.setItem(ACCESS_KEY, JSON.stringify({ t: token, e: accessExpiresAt }));
    } catch {
      /* private mode — memory only */
    }
  },
  get refresh(): string | null {
    if (native) return nativeRefresh;
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setRefresh(token: string | null) {
    if (native) {
      nativeRefresh = token;
      void import('@capacitor/preferences').then(({ Preferences }) =>
        token
          ? Preferences.set({ key: REFRESH_KEY, value: token })
          : Preferences.remove({ key: REFRESH_KEY }),
      );
      return;
    }
    try {
      if (token) localStorage.setItem(REFRESH_KEY, token);
      else localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* storage unavailable (private mode) — session stays in memory */
    }
  },
  clear() {
    accessToken = null;
    accessExpiresAt = 0;
    try {
      localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* ignore */
    }
    this.setRefresh(null);
  },
};

/** Must run before the first render on native builds so `session.refresh` is available synchronously. */
export async function initNativeSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  native = true;
  const { Preferences } = await import('@capacitor/preferences');
  nativeRefresh = (await Preferences.get({ key: REFRESH_KEY })).value;
}
