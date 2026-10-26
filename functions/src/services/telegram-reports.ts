import { ApiError } from '../http/errors';
import { buildXlsx, type XlsxSheet } from '../lib/xlsx';
import { dayKey, zonedParts } from '../lib/time';
import { normalizePhone } from '../lib/ids';
import { HttpTelegramSender } from '../telegram/bot';
import {
  UnconfiguredTelegramSender,
  type TelegramReplyMarkup,
  type TelegramSender,
} from '../telegram/types';
import type { User } from '../domain/types';
import { StoreConflictError, type Doc } from '../store/types';
import { getPolicy, nowIso, track, type Deps } from './context';
import { effectiveManagerProvinces, managerMarketers } from './team-scope';
import { managerMembers } from './reports';

/**
 * Daily Manager report over Telegram: every morning (09:00 Tehran by default, policy-tunable)
 * each Manager who connected a Telegram chat receives an Excel workbook of *their own scope*
 * — every marketer of their supervised provinces (plus their manual team, if any) with
 * learning progress, and a per-package detail sheet.
 *
 * Pairing: after their first login the Manager is sent to the bot; /start asks for their
 * mobile number (Telegram contact-share), the number is matched to the Manager account with
 * that phone, and from then on that Manager's daily reports go to this chat. Manual chat-id
 * entry in the profile remains as a fallback. Without TELEGRAM_BOT_TOKEN the job is a no-op.
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

export interface TelegramBotInfo {
  /** A bot token is configured, so daily reports can actually be delivered. */
  configured: boolean;
  /** Public @username for t.me links (null when TELEGRAM_BOT_USERNAME is not set). */
  botUsername: string | null;
}

export function telegramBotInfo(d: Deps): TelegramBotInfo {
  return {
    configured: telegramSender(d).enabled,
    botUsername: d.config.telegramBotUsername || null,
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
    from?: { id?: number | string; first_name?: string };
    text?: string;
    contact?: { phone_number?: string; user_id?: number | string; first_name?: string };
  };
}

const ASK_PHONE_MARKUP: TelegramReplyMarkup = {
  keyboard: [[{ text: '📱 ارسال شماره موبایل', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVE_KEYBOARD: TelegramReplyMarkup = { remove_keyboard: true };

const UNPAIR_TEXTS = new Set(['/stop', 'قطع اتصال', 'لغو گزارش', 'لغو']);

/** Managers (any status) holding this canonical phone — a phone may have a marketer twin too. */
async function managersByPhone(d: Deps, phone: string): Promise<Array<Doc<User>>> {
  const byPhone = await d.store.query<User>({
    collection: 'users',
    where: [['phone', '==', phone]],
  });
  return byPhone.filter((user) => user.role === 'manager');
}

/** The Manager currently paired to a chat, if any. */
async function managerByChatId(d: Deps, chatId: string): Promise<Doc<User> | null> {
  const rows = await d.store.query<User>({
    collection: 'users',
    where: [['telegramChatId', '==', chatId]],
  });
  return rows.find((user) => user.role === 'manager') ?? null;
}

/**
 * Pairs a chat to a Manager. A chat belongs to exactly one Manager at a time: pairing a new
 * Manager (the person switched Telegram accounts, or a shared phone) detaches the old one so
 * reports never leak into a chat that now belongs to somebody else.
 */
async function pairTelegramChat(d: Deps, manager: Doc<User>, chatId: string): Promise<void> {
  const others = await d.store.query<User>({
    collection: 'users',
    where: [['telegramChatId', '==', chatId]],
  });
  for (const other of others)
    if (other.id !== manager.id)
      await d.store.update(`users/${other.id}`, {
        telegramChatId: null,
        telegramPairedAt: null,
        updatedAt: nowIso(d),
      });
  await d.store.update(`users/${manager.id}`, {
    telegramChatId: chatId,
    telegramPairedAt: nowIso(d),
    updatedAt: nowIso(d),
  });
  await track(d, 'telegram_paired', manager.id, {}).catch(() => {});
}

async function unpairTelegramChat(d: Deps, chatId: string): Promise<boolean> {
  const manager = await managerByChatId(d, chatId);
  if (!manager) return false;
  await d.store.update(`users/${manager.id}`, {
    telegramChatId: null,
    telegramPairedAt: null,
    updatedAt: nowIso(d),
  });
  await track(d, 'telegram_unpaired', manager.id, {}).catch(() => {});
  return true;
}

/**
 * Webhook — the phone-pairing conversation:
 *
 *  1. `/start` (or any first message) → greeting + a button that shares the user's own
 *     mobile number («📱 ارسال شماره موبایل»).
 *  2. The shared contact is matched to the Manager account with that phone and the chat is
 *     paired to it; from the next 09:00 run that Manager's Excel lands in this chat.
 *  3. `/stop` unpairs.
 *
 * Security: pairing only happens for a *verified* webhook call (Telegram's secret-token
 * header matched, or a non-prod environment) and only when the shared contact is the
 * sender's own (`contact.user_id === from.id`) — Telegram fills it from the account's real
 * number, so nobody can pair a Manager's reports to a stranger's chat by typing a number.
 * Typed numbers are therefore never paired; the bot asks for the button instead.
 */
export async function handleTelegramWebhook(
  d: Deps,
  update: TelegramUpdate,
  opts: { verified?: boolean } = {},
): Promise<{ ok: true }> {
  const message = update.message;
  const rawChatId = message?.chat?.id;
  if (rawChatId === undefined || rawChatId === null) return { ok: true };
  const chatId = String(rawChatId);
  const verified = opts.verified ?? true;
  const sender = telegramSender(d);
  const reply = async (text: string, replyMarkup?: TelegramReplyMarkup) => {
    if (!sender.enabled) return;
    try {
      await sender.sendMessage(chatId, text, replyMarkup ? { replyMarkup } : undefined);
    } catch {
      // A 200 acknowledgement would discard the update even though no reply was delivered.
      // Return a retryable failure without exposing the Bot API URL/token or contact details.
      throw new ApiError('INTERNAL', 'ارسال پاسخ ربات تلگرام ناموفق بود.');
    }
  };
  const firstName = (message?.from?.first_name ?? message?.chat?.first_name ?? '').trim();
  const hello = firstName ? `سلام ${firstName} 👋` : 'سلام 👋';
  const askPhone = () =>
    reply(
      `${hello}\n` +
        'به ربات گزارش روزانهٔ سیلانه سبز خوش آمدید.\n' +
        'برای اتصال این گفت‌وگو به پنل مدیرتان، دکمهٔ «📱 ارسال شماره موبایل» را بزنید تا شماره‌تان با حساب مدیرتان تطبیق داده شود؛ بعد از آن، هر روز ساعت ۹ صبح گزارش اکسل بازاریاب‌های استان‌هایتان را همین‌جا می‌گیرید.',
      ASK_PHONE_MARKUP,
    );

  // 1) Shared contact → pairing.
  const contact = message?.contact;
  if (contact?.phone_number) {
    // The button always yields the sender's own contact (user_id === from.id). Anything
    // else — a phone-book contact card, a forwarded contact — proves nothing about whose
    // number it is, so it can never pair.
    if (
      contact.user_id === undefined ||
      message?.from?.id === undefined ||
      String(contact.user_id) !== String(message.from.id)
    ) {
      await reply(
        'این شماره متعلق به حساب تلگرام شما نیست. برای اتصال، شمارهٔ خودتان را با دکمهٔ «📱 ارسال شماره موبایل» بفرستید.',
        ASK_PHONE_MARKUP,
      );
      return { ok: true };
    }
    if (!verified) {
      // Production without a webhook secret: never trust a pairing payload. The manual
      // chat-id method in the Manager profile still works.
      await reply(
        'اتصال خودکار در حال حاضر فعال نیست. شناسهٔ این گفت‌وگو را در «پنل مدیر ← پروفایل ← گزارش روزانهٔ تلگرام» وارد کنید:\n' +
          chatId,
      );
      return { ok: true };
    }
    const phone = normalizePhone(contact.phone_number);
    if (!phone) {
      await reply(
        'شمارهٔ موبایل معتبر نیست. شماره باید یک موبایل ایران (مثل ۰۹۱۲…) باشد؛ دوباره با دکمهٔ ارسال شماره تلاش کنید.',
        ASK_PHONE_MARKUP,
      );
      return { ok: true };
    }
    const managers = await managersByPhone(d, phone);
    const manager = managers.find((m) => m.status === 'active') ?? managers[0];
    if (!manager) {
      await reply(
        'برای این شماره، حساب «مدیر» در سامانهٔ سیلانه سبز پیدا نشد.\n' +
          'اگر شمارهٔ حسابتان در سامانه چیز دیگری است، با همان شماره وارد تلگرام شوید یا از مدیر سیستم بخواهید شمارهٔ حسابتان را اصلاح کند.\n' +
          `شناسهٔ این گفت‌وگو برای اتصال دستی: ${chatId}`,
        REMOVE_KEYBOARD,
      );
      return { ok: true };
    }
    if (manager.status !== 'active') {
      await reply(
        'حساب مدیر این شماره در حال حاضر فعال نیست؛ برای فعال‌سازی با مدیر سیستم در تماس باشید.',
        REMOVE_KEYBOARD,
      );
      return { ok: true };
    }
    await pairTelegramChat(d, manager, chatId);
    const provinces = effectiveManagerProvinces(manager);
    await reply(
      `✅ اتصال انجام شد، ${manager.name}\n` +
        (provinces.length ? `محدودهٔ مدیریت شما: ${provinces.join('، ')}\n` : '') +
        'از این پس هر روز ساعت ۹ صبح، گزارش اکسل بازاریاب‌های محدوده‌تان همین‌جا ارسال می‌شود.\n' +
        'برای قطع اتصال، /stop را بفرستید.',
      REMOVE_KEYBOARD,
    );
    return { ok: true };
  }

  const text = (message?.text ?? '').trim();

  // 2) Unpair.
  if (UNPAIR_TEXTS.has(text)) {
    if (verified && (await unpairTelegramChat(d, chatId)))
      await reply(
        'اتصال این گفت‌وگو قطع شد و دیگر گزارش روزانه نمی‌گیرید. برای اتصال دوباره /start را بفرستید.',
        REMOVE_KEYBOARD,
      );
    else
      await reply(
        'این گفت‌وگو به هیچ پنل مدیری متصل نیست. برای اتصال /start را بفرستید.',
        REMOVE_KEYBOARD,
      );
    return { ok: true };
  }

  // 3) A typed phone number never pairs (anyone can type someone else's number).
  if (text && normalizePhone(text)) {
    await reply(
      'برای امنیت گزارش‌ها، شمارهٔ تایپ‌شده قبول نمی‌شود؛ تلگرام باید مالکیت شماره را تأیید کند. دکمهٔ «📱 ارسال شماره موبایل» را بزنید.',
      ASK_PHONE_MARKUP,
    );
    return { ok: true };
  }

  // 4) /start and everything else.
  if (text.startsWith('/start')) {
    const paired = await managerByChatId(d, chatId);
    if (paired) {
      await reply(
        `${hello}\nاین گفت‌وگو به پنل مدیر «${paired.name}» متصل است و گزارش روزانه ساعت ۹ صبح می‌رسد.\nبرای اتصال با شمارهٔ دیگر، شماره را با دکمهٔ زیر بفرستید؛ برای قطع اتصال /stop را بفرستید.`,
        ASK_PHONE_MARKUP,
      );
      return { ok: true };
    }
    await askPhone();
    return { ok: true };
  }

  const paired = await managerByChatId(d, chatId);
  if (paired)
    await reply(
      'این گفت‌وگو به پنل مدیر شما متصل است؛ گزارش بعدی ساعت ۹ صبح می‌رسد. برای قطع اتصال /stop را بفرستید.',
    );
  else await askPhone();
  return { ok: true };
}
