# راه‌اندازی ربات تلگرام گزارش روزانهٔ مدیران — توضیح کامل + پرامپت آماده

> **نحوهٔ استفاده:** ربات را با BotFather بسازید، بعد بخش «پرامپت آماده» در انتهای همین فایل را
> کپی کنید، فقط دو مقدار `{{TELEGRAM_BOT_TOKEN}}` و `{{TELEGRAM_BOT_USERNAME}}` را با مقادیر
> واقعی عوض کنید و به ایجنت کدنویسی (Claude Code یا مشابه) بدهید. بقیهٔ کارها (سکرت‌ها،
> وب‌هوک، استقرار، تست) را خودش انجام می‌دهد و در پایان چک‌لیست گزارش می‌دهد.

---

## بخش ۱ — چه چیزی ساخته شده است (توضیح کامل برای ایجنت بعدی)

همهٔ موارد زیر در شاخهٔ `arena/70f8eac8-seylane-sabz-learning` و **PR #118** پیاده‌سازی، تست و
کمیّت‌سنجی شده‌اند (۳ کامیت: `7a3673e`، `920d1df`، `191e385`). پیش‌شرط هر کاری این است که
PR #118 در `main` مرج و دیپلوی شده باشد.

### ۱-۱. مدیر استانی (هستهٔ کار)
- مدیر هنگام ساخت توسط ادمین، به‌جای تیم اجباری، **یک یا چند استان** می‌گیرد
  (`User.managerProvinces` در `functions/src/domain/types.ts`، منطق محدوده در
  `functions/src/services/team-scope.ts`). پنل او گزارش **همهٔ بازاریاب‌های آن استان‌ها** را
  نشان می‌دهد (مثلاً مدیرِ تهران+مازندران همهٔ ۲۰۰ بازاریاب را می‌بیند). تیم دستیِ اختیاری هم
  با محدوده ادغام می‌شود. برای مدیرهای قدیمی، fallback به فیلد `province` خودشان هست.
- **تیم‌های خودکار استانی** در پنل ادمین: `GET /v1/admin/province-teams` بازاریاب‌ها را بر اساس
  استان و شهر گروه‌بندی می‌کند (بدون ساخت تیم دستی).
- **حساب دوگانه:** یک شماره موبایل می‌تواند هم‌زمان حساب بازاریاب و حساب مدیر جدا داشته باشد
  (ایمیل مصنوعی دامنهٔ `manager.` در برابر `phone.` — `functions/src/lib/ids.ts`). اعطای
  دسترسی مدیر، حساب بازاریاب را نمی‌بندد. حساب‌های قدیمیِ تبدیل‌شده به‌صورت lazy هنگام
  ثبت‌نام مجدد مهاجرت می‌کنند و **کل سابقهٔ آموزش** (پیشرفت، تکمیل‌ها، آزمون‌ها، امتیاز و
  موجودی، نشان‌ها) به حساب بازاریاب منتقل می‌شود (`functions/src/services/history-transfer.ts`).
- پوشش کامل پنل مدیر با محدودهٔ استانی با تست قفل شده است
  (`functions/test/province-managers.test.ts`).

### ۲-۱. گزارش روزانهٔ تلگرام (زیرساخت کامل، خاموش تا وقتی توکن تنظیم نشده)
- **زمان‌بندی:** هر روز ساعت **۹:۰۰ صبح تهران** (`policy.managerDailyReportHour`، پیش‌فرض ۹).
  Cloudflare: کرون `30 5 * * *` UTC در `wrangler.toml` + `CRON_JOBS` در
  `functions/src/services/cron.ts`. Firebase: فانکشن `telegramDailyReports` در
  `functions/src/index.ts` (ساعتی + قفل ساعت سیاستی). اجرای دستی:
  `POST /v1/admin/jobs/telegram-daily-reports` (سوچرadmin، با force).
- **محتوا:** برای هر مدیر یک فایل اکسل جدا (`functions/src/services/telegram-reports.ts` با
  نویسندهٔ بدون وابستگی `functions/src/lib/xlsx.ts`): شیت «خلاصه بازاریاب‌ها» + شیت «جزئیات
  آموزش‌ها»، فارسی و راست‌چین. جلوگیری از ارسال دوبل در یک روز با سند claim در کالکشن
  `telegram_report_runs`.
- **اتصال مدیر به ربات (با شماره موبایل):**
  - بعد از اولین ورود و تکمیل پروفایل، گام «اتصال به ربات تلگرام» می‌آید
    (`ManagerProfileCompletionPage`)؛ تا زمان اتصال، بنر داشبورد (`TelegramConnectBanner`)
    و کارت پروفایل (`TelegramReportCard`) یادآوری می‌کنند. لینک ربات از
    `GET /v1/manager/profile` → `telegram.{configured,botUsername,connected}` می‌آید.
  - داخل ربات (`functions/src/routes/telegram.ts` → `handleTelegramWebhook`): با `/start`
    ربات دکمهٔ «📱 ارسال شماره موبایل» (request_contact) می‌دهد → شماره نرمال‌سازی و با
    حساب مدیرِ همان شماره تطبیق داده می‌شود → `User.telegramChatId` ذخیره و پیام تأیید
    ارسال می‌شود. `/stop` قطع اتصال است. روش دستیِ شناسهٔ گفت‌وگو در پروفایل جایگزین است.
  - **امنیت:** تایپ شماره هرگز اتصال نمی‌سازد؛ فقط اشتراکِ شمارهٔ خودِ فرستنده
    (`contact.user_id === from.id`). جفت‌سازی فقط روی وب‌هوک «تأییدشده» انجام می‌شود:
    سکرت وب‌هوک ست شده و هدر مطابق باشد، یا محیط غیر prod.
    ⚠️ **نکتهٔ حیاتی:** در `wrangler.toml` مقدار `APP_ENV = "dev"` است (حتی در پروداکشن)،
    پس اگر `TELEGRAM_WEBHOOK_SECRET` ست نشود، payload جعلی وب‌هوک قابل اعتماد حساب می‌شود.
    **ست‌کردن سکرت وب‌هوک اجباری است.**
- **متغیرها** (در `functions/src/config.ts`): `TELEGRAM_BOT_TOKEN`،
  `TELEGRAM_BOT_USERNAME` (بدون @)، `TELEGRAM_WEBHOOK_SECRET`. بدون توکن، جاب no-op است و
  دکمهٔ تست پنل پیام «ربات هنوز پیکربندی نشده» می‌دهد.
- **وضعیت تست:** typecheck/lint تمیز، بک‌اند 600/600، وب 475/475، ایندکس‌ها 134/0، بیلد ✅،
  اسموک زندهٔ وب‌هوک (اتصال با شمارهٔ +98، ردّ تایپ شماره، /stop) ✅.

### ۳-۱. واقعیت‌های استقرار این ریپو (برای ایجنت مجری)
- پروداکشن اصلی **Cloudflare Workers** است: ورکر `seylane-sabz-learning`، دامنهٔ عمومی
  `https://academy-seylaneh.site` (API روی همان دامنه زیر `/v1/*`). دیپلوی با
  `.github/workflows/deploy.yml` هنگام مرج به `main`. الگوی سکرت‌ها: GitHub Actions Secret →
  بعد از دیپلوی `wrangler secret put` (الآن فقط `GEMINI_API_KEY` و `FCM_SERVICE_ACCOUNT_JSON`
  این‌طور سینک می‌شوند — تلگرام باید به همان الگو اضافه شود).
- مسیر **Firebase Functions** هم وجود دارد (`firebase.json`) ولی وب‌هوک تلگرام فقط یک URL
  می‌تواند داشته باشد → فقط روی بک‌اند اصلی (Cloudflare) ثبت شود.
- محیط Preview در `wrangler.toml` ایزوله است؛ سکرت‌های تلگرام را به Preview ندهید.

---

## بخش ۲ — پرامپت آماده (کپی کنید، دو مقدار را جایگزین کنید، به ایجنت بدهید)

```text
You are setting up the already-implemented "daily Telegram Excel report for Managers"
feature in this repository (seylane-sabz-learning). The CODE IS COMPLETE — your job is
configuration, deployment and verification only. Do not redesign the feature.

## Inputs (provided by me)
- TELEGRAM_BOT_TOKEN: {{TELEGRAM_BOT_TOKEN}}
- TELEGRAM_BOT_USERNAME: {{TELEGRAM_BOT_USERNAME}}   (without @)

## Context you must know
- Feature summary: every day at 09:00 Tehran, each Manager who paired a Telegram chat gets an
  Excel workbook of all marketers in their supervised provinces. Pairing: Manager opens the bot,
  taps /start, shares their mobile number via Telegram's contact button; the backend matches the
  number to the Manager account with that phone and stores `users.telegramChatId`.
- Key files: functions/src/services/telegram-reports.ts (job + webhook pairing),
  functions/src/routes/telegram.ts (POST /v1/telegram/webhook), functions/src/telegram/* (Bot API
  port), functions/src/config.ts (env vars TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME /
  TELEGRAM_WEBHOOK_SECRET), functions/src/services/cron.ts + wrangler.toml (cron "30 5 * * *"
  UTC = 09:00 Tehran), functions/src/index.ts (Firebase scheduled fn telegramDailyReports).
- This was built in PR #118 (branch arena/70f8eac8-seylane-sabz-learning). FIRST confirm PR #118
  is merged into main and deployed; if it is still open, stop and tell me instead of improvising.
- Production is Cloudflare Workers (worker "seylane-sabz-learning"), public site/API origin
  https://academy-seylaneh.site with the API under /v1/*. Deploys run from
  .github/workflows/deploy.yml on merge to main. Existing secret pattern in that workflow:
  GitHub secret -> `wrangler secret put` after `wrangler deploy` (see GEMINI_API_KEY block).
- A Firebase Functions deployment also exists; Telegram allows only ONE webhook URL, so the
  webhook must point at Cloudflare only.

## Hard rules
1. NEVER commit the token or any secret to git, and never print them in logs, PRs or chat output
   (mask as *** if you must reference them).
2. TELEGRAM_WEBHOOK_SECRET is MANDATORY, not optional: wrangler.toml sets APP_ENV="dev" even in
   production, and the pairing code trusts webhook payloads when env != prod and no secret is
   set. Generate a strong secret and use it in setWebhook. Do NOT "fix" APP_ENV to prod without
   asking me first (other behavior may depend on it) — just flag it in your final report.
3. Do not set Telegram secrets on the Cloudflare Preview environment.
4. Keep changes minimal and follow the existing patterns in deploy.yml / wrangler.toml.

## Tasks — do them in order, stop and report if any step fails
1. Sanity-check the bot: `curl https://api.telegram.org/bot<TOKEN>/getMe` and confirm the
   returned username equals TELEGRAM_BOT_USERNAME.
2. Generate the webhook secret: `openssl rand -hex 32`. Use THE SAME value in steps 3–5.
3. Persist the configuration so it survives redeploys:
   a. `gh secret set TELEGRAM_BOT_TOKEN` and `gh secret set TELEGRAM_WEBHOOK_SECRET` on this repo.
   b. In .github/workflows/deploy.yml, add TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET to the
      env of the "Provision Cloudflare D1 Database & Deploy Full-Stack Worker" step and add two
      `wrangler secret put` sync blocks right after the GEMINI_API_KEY one (same style, guarded
      by non-empty checks).
   c. Add `TELEGRAM_BOT_USERNAME = "<username>"` to [vars] in wrangler.toml (it is public, not a
      secret). Do not touch [previews.vars].
   d. Commit (b)+(c) on a branch and open a PR titled "chore(telegram): wire bot secrets for the
      daily Manager report"; ask me to merge it (merging triggers the deploy).
4. Make it live immediately (don't wait for the next scheduled deploy): with wrangler
   authenticated (CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID like CI), run
   `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put TELEGRAM_WEBHOOK_SECRET`,
   then deploy the merged code (or confirm the CI deploy from step 3d finished successfully).
5. Register the webhook:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://academy-seylaneh.site/v1/telegram/webhook&secret_token=<SECRET>&drop_pending_updates=true"`
   Then verify with getWebhookInfo: url correct, has_custom_certificate false, and after a test
   message: last_error_date empty / no last_error_message. If academy-seylaneh.site does not serve
   /v1/* (check `curl https://academy-seylaneh.site/v1/health`), find the real Worker origin and
   use that instead, and tell me.
6. If (and only if) Firebase Functions is also deployed and serving traffic, set the same three
   env vars there using whatever mechanism this project already uses for GEMINI_API_KEY and deploy
   functions — but do NOT re-register the webhook to Firebase.
7. End-to-end verification (the human-in-the-loop part: ask me to do the Telegram-app steps with
   a real Manager phone number, and verify each result from the API/logs):
   a. I open the bot, tap Start → bot replies in Persian asking for the mobile number with a
      "📱 ارسال شماره موبایل" button. I tap it → bot confirms «✅ اتصال انجام شد، <نام مدیر>».
   b. You verify: as that Manager, GET /v1/manager/profile returns telegram.connected = true
      (and telegram.configured = true, telegram.botUsername = the username).
   c. Force a run without waiting for 09:00: with a superadmin token,
      POST /v1/admin/jobs/telegram-daily-reports → response shows sent >= 1, and I confirm the
      Excel file (manager-report-<date>.xlsx) arrived in the chat with the right provinces'
      marketers. Also confirm the Manager profile's «ارسال گزارش آزمایشی» button works.
   d. Confirm the Cloudflare cron trigger "30 5 * * *" exists on the Worker (dashboard/wrangler)
      and note when the first automatic 09:00 Tehran send will happen.
8. Rollback (only if something is wrong): `curl .../deleteWebhook`, `wrangler secret delete
   TELEGRAM_BOT_TOKEN`, `wrangler secret delete TELEGRAM_WEBHOOK_SECRET`, redeploy — feature is
   inert without the token.

## Troubleshooting hints
- Bot silent after /start: check getWebhookInfo (last_error_message), Worker logs
  (`wrangler tail`), and that the secret in setWebhook == TELEGRAM_WEBHOOK_SECRET on the Worker
  (401 «امضای وب‌هوک» = mismatch).
- «برای این شماره، حساب مدیر پیدا نشد»: the Telegram account's number differs from the Manager
  account's phone in the system — fix the account phone in Admin → Users, or use the manual
  chat-id field in Manager → Profile.
- Job runs but sent=0: no Manager is paired yet, Manager profile not completed
  (managerProfileRequired), empty province scope, or outside the 09:00 slot without force.
- Excel arrives but a province is missing: check the Manager's «استان‌های تحت مدیریت» in Admin.

## Final report format
Reply with a checklist: bot verified (getMe), secrets set (GitHub + Worker, values masked),
deploy.yml PR link + merge status, deploy status, webhook registered + getWebhookInfo result,
pairing test result, forced-run result (sent count), cron confirmed + next 09:00 send time, and
any flags (especially the APP_ENV="dev" note). If anything is blocked, say exactly which step and
what you need from me.
```

---

## بخش ۳ — چک‌لیست دستی (اگر خواستید خودتان بدون ایجنت انجام دهید)

1. ساخت ربات: در تلگرام به **@BotFather** پیام بدهید → `/newbot` → نام و یوزرنیم (باید به
   `bot` ختم شود) → توکن را نگه دارید.
2. یک سکرت تصادفی بسازید (مثلاً از سایت‌های تولید پسورد، ۳۲ کاراکتر+).
3. در Cloudflare Dashboard → Workers & Pages → `seylane-sabz-learning` → Settings →
   Variables and Secrets: سکرت‌های `TELEGRAM_BOT_TOKEN` و `TELEGRAM_WEBHOOK_SECRET` و متغیر
   `TELEGRAM_BOT_USERNAME` را اضافه کنید. (برای ماندگاری بعد از هر دیپلوی، همین‌ها باید در
   GitHub Secrets و workflow هم باشند — ایجنت در بخش ۲ این را انجام می‌دهد.)
4. مطمئن شوید PR #118 مرج و دیپلوی شده است.
5. در مرورگر باز کنید (با مقادیر خودتان):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://academy-seylaneh.site/v1/telegram/webhook&secret_token=<SECRET>&drop_pending_updates=true`
   → پاسخ باید `{"ok":true,...}` باشد.
6. تست: با یک حساب مدیر واقعی در تلگرام ربات را باز کنید → Start → «📱 ارسال شماره موبایل» →
   پیام «✅ اتصال انجام شد». سپس در پنل مدیر → پروفایل «ارسال گزارش آزمایشی» را بزنید و رسیدن
   اکسل را ببینید. اولین ارسال خودکار: فردا ساعت ۹:۰۰ صبح.
