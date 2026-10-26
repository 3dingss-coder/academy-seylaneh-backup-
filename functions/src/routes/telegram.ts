import { Router, type LightRouter } from '../http/router';
import { h } from '../http/auth';
import { timingSafeEqualStr } from '../lib/crypto';
import { ApiError } from '../http/errors';
import type { Deps } from '../services/context';
import * as telegram from '../services/telegram-reports';

/**
 * Public Telegram webhook. Register it once with:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<API>/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 * When the secret is configured, Telegram echoes it in `x-telegram-bot-api-secret-token`
 * and anything else is rejected. The handler runs the phone-pairing conversation (/start →
 * share mobile number → the chat is paired to the Manager account with that phone). Pairing
 * writes only happen on a verified call: the secret matched (or the test environment); the
 * secret is required for auto-pairing everywhere else (manual chat-id entry keeps working).
 */
export function telegramRouter(d: Deps): LightRouter {
  const r = Router();
  r.post(
    '/telegram/webhook',
    h(async (req) => {
      const secret = d.config.telegramWebhookSecret;
      const raw = req.headers['x-telegram-bot-api-secret-token'];
      const header = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      if (secret && !timingSafeEqualStr(String(header), secret))
        throw new ApiError('UNAUTHENTICATED', 'امضای وب‌هوک تلگرام نامعتبر است.');
      // Pairing trusts the payload only when the secret matched. Without a secret, only the test
      // environment is trusted: production runs with APP_ENV="dev", so an env-based fallback would
      // let anyone forge a contact and hijack a Manager's daily report.
      const verified = secret ? true : d.config.env === 'test';
      return telegram.handleTelegramWebhook(d, req.body ?? {}, { verified });
    }),
  );
  return r;
}
