import { ApiError } from '../http/errors';
import { buildXlsx, type XlsxSheet } from '../lib/xlsx';
import { dayKey, zonedParts } from '../lib/time';
import { HttpTelegramSender } from '../telegram/bot';
import { UnconfiguredTelegramSender, type TelegramSender } from '../telegram/types';
import type { User } from '../domain/types';
import { StoreConflictError, type Doc } from '../store/types';
import { getPolicy, nowIso, track, type Deps } from './context';
import { managerMarketers } from './team-scope';
import { managerMembers } from './reports';

/**
 * Daily Manager report over Telegram: every morning (09:00 Tehran by default, policy-tunable)
 * each Manager who connected a Telegram chat receives an Excel workbook of *their own scope*
 * — every marketer of their supervised provinces (plus their manual team, if any) with
 * learning progress, and a per-package detail sheet.
 *
 * Infrastructure only: without TELEGRAM_BOT_TOKEN the job is a no-op, and a Manager opts in
 * by saving their chat id (the bot tells it to them via the webhook reply).
 */

export function telegramSender(d: Deps): TelegramSender {
  if (d.telegram) return d.telegram;
  return d.config.telegramBotToken
    ? new HttpTelegramSender(d.config.telegramBotToken)
    : new UnconfiguredTelegramSender();
}

/** Jalali display date (fa-IR calendar) with an ISO fallback for runtimes without ICU data. */
export function faDate(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  blacklisted: 'مسدود',
  completed: 'تکمیل‌شده',
  in_progress: 'در حال انجام',
  new: 'شروع‌نشده',
};

export interface ManagerDailyReport {
  filename: string;
  bytes: Uint8Array;
  caption: string;
  memberCount: number;
}

/** Builds the Excel workbook for one Manager's scope (no sending). */
export async function buildManagerDailyReport(
  d: Deps,
  manager: Doc<User>,
): Promise<ManagerDailyReport> {
  const policy = await getPolicy(d);
  const timezone = policy.timezone;
  const today = dayKey(d.clock(), timezone);
  const displayDate = faDate(d.clock(), timezone);
  const [view, scoped] = await Promise.all([
    managerMembers(d, manager),
    managerMarketers(d, manager),
  ]);
  const pointsById = new Map(scoped.map((user) => [user.id, user.pointsBalance ?? 0]));
  const members = view.members;

  const summarySheet: XlsxSheet = {
    name: 'خلاصه بازاریاب‌ها',
    colWidths: [6, 24, 15, 14, 14, 10, 12, 12, 14, 12, 10, 14],
    rows: [
      [
        'ردیف',
        'نام بازاریاب',
        'موبایل',
        'استان',
        'شهر',
        'وضعیت',
        'بسته تخصیص‌یافته',
        'تکمیل‌شده',
        'میانگین پیشرفت (٪)',
        'بسته عقب‌مانده',
        'امتیاز',
        'آخرین فعالیت',
      ],
      ...members.map((member, i) => [
        i + 1,
        member.name,
        member.phone ?? '',
        member.province ?? '',
        member.city ?? '',
        STATUS_LABEL[member.status] ?? member.status,
        member.stats.assigned,
        member.stats.completed,
        member.stats.averageProgress,
        member.stats.lagging,
        pointsById.get(member.id) ?? 0,
        member.lastActiveAt ? faDate(new Date(member.lastActiveAt), timezone) : '—',
      ]),
    ],
  };

  const detailRows: XlsxSheet['rows'] = [
    ['نام بازاریاب', 'استان', 'شهر', 'آموزش', 'برند', 'وضعیت', 'پیشرفت (٪)', 'مهلت', 'عقب‌مانده'],
  ];
  for (const member of members)
    for (const pkg of member.packages)
      detailRows.push([
        member.name,
        member.province ?? '',
        member.city ?? '',
        pkg.title,
        pkg.brandName ?? '',
        STATUS_LABEL[pkg.status] ?? pkg.status,
        pkg.percent,
        pkg.deadlineAt ? faDate(new Date(pkg.deadlineAt), timezone) : '—',
        pkg.overdue ? 'بله' : '',
      ]);

  const bytes = buildXlsx([
    summarySheet,
    { name: 'جزئیات آموزش‌ها', colWidths: [24, 14, 14, 32, 16, 12, 12, 12, 10], rows: detailRows },
  ]);
  const scopeLabel = view.provinces?.length
    ? view.provinces.join('، ')
    : (view.team?.name ?? 'محدودهٔ مدیریت شما');
  const caption =
    `📊 گزارش روزانهٔ آموزش — ${displayDate}\n` +
    `مدیر: ${manager.name}\n` +
    `محدوده: ${scopeLabel}\n` +
    `بازاریاب‌ها: ${members.length} نفر · نیازمند پیگیری: ${view.totals.lagging} نفر`;
  return {
    filename: `manager-report-${today}.xlsx`,
    bytes,
    caption,
    memberCount: members.length,
  };
}

interface DailyRunResult {
  sent: number;
  failed: number;
  skippedManagers: number;
  skipped?: string;
  date: string;
}

/**
 * The 09:00 job. Idempotent per Manager per day via a claim document
 * (`telegram_report_runs/<date>_<managerId>`), so the hourly cron safety net and manual
 * re-runs can never send a Manager the same morning report twice (unless forced).
 */
export async function runDailyTelegramReports(d: Deps, force = false): Promise<DailyRunResult> {
  const policy = await getPolicy(d);
  const timezone = policy.timezone;
  const date = dayKey(d.clock(), timezone);
  const sender = telegramSender(d);
  if (!sender.enabled)
    return { sent: 0, failed: 0, skippedManagers: 0, skipped: 'not_configured', date };
  const parts = zonedParts(d.clock(), timezone);
  if (!force && parts.hour !== (policy.managerDailyReportHour ?? 9))
    return { sent: 0, failed: 0, skippedManagers: 0, skipped: 'outside_slot', date };

  const managers = (
    await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'manager'],
        ['status', '==', 'active'],
      ],
    })
  ).filter((manager) => manager.telegramChatId && !manager.managerProfileRequired);

  let sent = 0;
  let failed = 0;
  let skippedManagers = 0;
  for (const manager of managers) {
    const runPath = `telegram_report_runs/${date}_${manager.id}`;
    if (!force) {
      try {
        await d.store.create(runPath, {
          managerId: manager.id,
          date,
          status: 'claimed',
          createdAt: nowIso(d),
        });
      } catch (e) {
        if (e instanceof StoreConflictError) {
          skippedManagers++; // already sent (or being sent) today
          continue;
        }
        throw e;
      }
    }
    try {
      const report = await buildManagerDailyReport(d, manager);
      if (report.memberCount === 0) {
        skippedManagers++;
        if (!force)
          await d.store.update(runPath, { status: 'skipped_empty_scope', updatedAt: nowIso(d) });
        continue;
      }
      await sender.sendDocument(manager.telegramChatId as string, {
        filename: report.filename,
        bytes: report.bytes,
        caption: report.caption,
      });
      sent++;
      await d.store.set(runPath, {
        managerId: manager.id,
        date,
        status: 'sent',
        memberCount: report.memberCount,
        forced: force,
        sentAt: nowIso(d),
      });
      await track(d, 'telegram_daily_report_sent', manager.id, {
        members: report.memberCount,
      }).catch(() => {});
    } catch (e) {
      failed++;
      console.warn(
        `[telegram] daily report failed for manager ${manager.id}: ${(e as Error).message}`,
      );
      await d.store
        .set(runPath, {
          managerId: manager.id,
          date,
          status: 'failed',
          error: (e as Error).message?.slice(0, 200),
          updatedAt: nowIso(d),
        })
        .catch(() => {});
      // The claim stays, so a broken chat id is not retried every run all day long; an admin
      // can force a re-run from the jobs endpoint after fixing it.
    }
  }
  return { sent, failed, skippedManagers, date };
}

/** «ارسال گزارش آزمایشی» from the Manager profile: sends today's workbook right now. */
export async function sendManagerTelegramTest(
  d: Deps,
  manager: Doc<User>,
  chatIdOverride?: string | null,
) {
  const sender = telegramSender(d);
  if (!sender.enabled)
    throw new ApiError(
      'CONFLICT',
      'ربات تلگرام هنوز از سوی مدیر سیستم پیکربندی نشده است (توکن ربات تنظیم نیست).',
    );
  const chatId = chatIdOverride ?? manager.telegramChatId;
  if (!chatId)
    throw new ApiError('VALIDATION', 'اول شناسهٔ گفت‌وگوی تلگرام را ذخیره کنید.', {
      telegramChatId: 'شناسهٔ گفت‌وگوی تلگرام را وارد کنید.',
    });
  const report = await buildManagerDailyReport(d, manager);
  try {
    await sender.sendDocument(chatId, {
      filename: report.filename,
      bytes: report.bytes,
      caption: `🧪 گزارش آزمایشی\n${report.caption}`,
    });
  } catch (e) {
    throw new ApiError(
      'CONFLICT',
      `ارسال به تلگرام انجام نشد: ${(e as Error).message} — مطمئن شوید گفت‌وگو با ربات را با /start آغاز کرده‌اید.`,
    );
  }
  return { sent: true, memberCount: report.memberCount };
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string; first_name?: string };
    text?: string;
  };
}

/**
 * Webhook: any message to the bot gets the chat id back, so a Manager can copy it into
 * their profile («شناسهٔ گفت‌وگو»). Nothing else is stored from the update.
 */
export async function handleTelegramWebhook(
  d: Deps,
  update: TelegramUpdate,
): Promise<{ ok: true }> {
  const chatId = update.message?.chat?.id;
  if (chatId === undefined || chatId === null) return { ok: true };
  const sender = telegramSender(d);
  if (!sender.enabled) return { ok: true };
  const name = update.message?.chat?.first_name?.trim();
  await sender
    .sendMessage(
      String(chatId),
      `سلام${name ? ` ${name}` : ''} 👋\n` +
        `شناسهٔ گفت‌وگوی شما: ${chatId}\n` +
        `این شناسه را در «پنل مدیر ← پروفایل ← گزارش روزانهٔ تلگرام» وارد کنید تا هر روز ساعت ۹ صبح، گزارش اکسل بازاریاب‌های استان‌هایتان را همین‌جا دریافت کنید.`,
    )
    .catch(() => {});
  return { ok: true };
}
