# Secrets & variables to recreate (names only — values are NOT stored in git)

Where: GitHub repo → Settings → Secrets and variables → Actions.

## Secrets
| Name | Used for |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deploy the Worker + D1 (`.github/workflows/deploy.yml`) |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID` | Legacy aliases used by some workflows |
| `CLOUDFLARE_PAGES_PROJECT` | Optional Pages deploy |
| `GEMINI_API_KEY` | AI Mentor (optional; rule-based fallback without it) |
| `FCM_SERVICE_ACCOUNT_JSON` | Web/Android push notifications |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Daily Manager report bot (both required; the webhook secret is any random 64-hex string, `openssl rand -hex 32`) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Signed Android release (keep the keystore file backed up separately and PRIVATELY — losing it means you can never update the published app) |
| `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICES_JSON_BASE64` | Firebase config for the Android build |

## Variables
`CLOUDFLARE_D1_DATABASE_NAME`, `CLOUDFLARE_PAGES_PROJECT`, `VITE_API_BASE`, `VITE_SENTRY_DSN`,
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_VAPID_KEY`.

## Worker runtime secrets
Synced automatically by the deploy workflow after `wrangler deploy`:
`GEMINI_API_KEY`, `FCM_SERVICE_ACCOUNT_JSON`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
Public vars live in `wrangler.toml` (`[vars]`).
