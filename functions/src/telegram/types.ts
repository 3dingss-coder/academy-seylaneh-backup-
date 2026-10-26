import { ApiError } from '../http/errors';
/**
 * Telegram Bot API port (same shape as the push/mail ports): production talks to
 * api.telegram.org, tests use the recording sender, and an unconfigured sender never
 * pretends a message was delivered.
 */
export interface TelegramDocument {
  filename: string;
  bytes: Uint8Array;
  caption?: string;
}

/** Reply keyboard asking Telegram to share the user's own phone number (pairing flow). */
export interface TelegramKeyboardMarkup {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}
export interface TelegramRemoveKeyboardMarkup {
  remove_keyboard: true;
}
export type TelegramReplyMarkup = TelegramKeyboardMarkup | TelegramRemoveKeyboardMarkup;

export interface TelegramMessageOptions {
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramSender {
  /** True when a bot token is configured and sends will really go out. */
  readonly enabled: boolean;
  sendMessage(chatId: string, text: string, options?: TelegramMessageOptions): Promise<void>;
  sendDocument(chatId: string, doc: TelegramDocument): Promise<void>;
  describe?(): { provider: 'telegram' | 'unconfigured' | 'recording'; configured: boolean };
}

/** Records messages instead of sending (tests / local). */
export class RecordingTelegramSender implements TelegramSender {
  readonly enabled = true;
  readonly messages: Array<{ chatId: string; text: string; options?: TelegramMessageOptions }> = [];
  readonly documents: Array<{ chatId: string; doc: TelegramDocument }> = [];
  async sendMessage(chatId: string, text: string, options?: TelegramMessageOptions) {
    this.messages.push({ chatId, text, options });
  }
  async sendDocument(chatId: string, doc: TelegramDocument) {
    this.documents.push({ chatId, doc });
  }
  describe() {
    return { provider: 'recording' as const, configured: true };
  }
}

/** Used when TELEGRAM_BOT_TOKEN is not set: sends fail loudly instead of faking delivery. */
export class UnconfiguredTelegramSender implements TelegramSender {
  readonly enabled = false;
  async sendMessage(): Promise<void> {
    throw new Error('ربات تلگرام پیکربندی نشده است: TELEGRAM_BOT_TOKEN تنظیم نشده است.');
  }
  async sendDocument(): Promise<void> {
    throw new Error('ربات تلگرام پیکربندی نشده است: TELEGRAM_BOT_TOKEN تنظیم نشده است.');
  }
  describe() {
    return { provider: 'unconfigured' as const, configured: false };
  }
}

/** Normalizes a Telegram chat id coming from a form (Persian digits ok); null clears it. */
export function normalizeTelegramChatId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
  if (!value) return null;
  if (!/^-?\d{5,20}$/.test(value))
    throw new ApiError('VALIDATION', 'شناسهٔ گفت‌وگوی تلگرام معتبر نیست.', {
      telegramChatId: 'شناسهٔ عددی گفت‌وگو را وارد کنید (ربات با دستور /start آن را می‌فرستد).',
    });
  return value;
}
