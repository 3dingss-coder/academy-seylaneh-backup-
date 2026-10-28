# Restoring Academy Seylaneh (آکادمی سیلانه) from this backup

This repository is a full mirror of `3dingss-coder/seylane-sabz-learning`: every file at the time of
the backup, the complete git history (all commits) and all branches.

**Not in git, and therefore NOT in this backup** (keep these backed up separately):
1. **Production data** — Cloudflare D1 database `seylane-sabz-db` (users, progress, quiz attempts,
   points, packages, settings) and the R2 bucket `seylane-sabz-media` (audio/video/images).
   User data is personal, so it must never be put in a public repository.
2. **Secret values** — see `backup-meta/SECRETS-CHECKLIST.md`.
3. **Android signing keystore** (the file behind `ANDROID_KEYSTORE_BASE64`).
4. Domain / DNS (`academy-seylaneh.site`) and Telegram bot ownership (BotFather).

## What is in `backup-meta/`
- `github/pulls.json`, `issues.json`, `comments.json`, `review_comments.json` — every pull request
  (with description), issue and comment as of the backup date, exported from the original repo.
- `SECRETS-CHECKLIST.md` — names of all secrets and variables you must recreate.

## Rebuild steps (new GitHub repo + Cloudflare account)
1. Create a Cloudflare account (or use the existing one); create an API token with *Workers*, *D1*
   and *R2* edit permissions; note the Account ID.
2. Push this repository to a new GitHub repo (or just use this one) and add the secrets from
   `backup-meta/SECRETS-CHECKLIST.md` (at minimum `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
3. If the D1 database / R2 bucket still exist, nothing else is needed: `wrangler.toml` already points at
   D1 `seylane-sabz-db` (id `f7a2ed30-00f4-42e6-b26f-343c24fe1853`) and R2 `seylane-sabz-media`.
   If they were lost, restore them from your own export first (D1: `wrangler d1 execute` with a SQL
   dump; R2: copy the objects back), then update the ids in `wrangler.toml`.
4. Push to `main` (or run the "Build & Deploy to Cloudflare + D1" workflow manually). The workflow builds
   the web app, deploys the Worker with its cron triggers and syncs the Worker secrets.
5. Telegram bot: the deploy step re-registers the webhook automatically when both Telegram secrets exist.
6. Check `https://<your-domain>/v1/health` returns OK, then log in as an admin.

## Facts
- Worker name `seylane-sabz-learning`; production site `https://academy-seylaneh.site`, API under `/v1/*`.
- Stack: React/Vite PWA (`apps/web`, Capacitor Android in `apps/web/android`), Cloudflare Worker backend
  (`functions/`), D1 (SQLite) document store, R2 for media, Gemini for the AI mentor.
- Local development and tests: see `README.md`; checks are `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test`.
