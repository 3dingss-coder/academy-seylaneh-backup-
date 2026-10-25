import { Router, type LightRouter } from '../http/router';
import { h } from '../http/auth';
import { ApiError } from '../http/errors';
import type { Deps } from '../services/context';
import * as telegram from '../services/telegram-reports';

/**
 * Public Telegram webhook. Register it once with:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<API>/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 * When the secret is configured, Telegram echoes it in `x-telegram-bot-api-secret-token`
 * and anything else is rejected. The handler only replies with the sender's chat id
 * (the pairing flow) — it never reads or stores message content.
 */
export function telegramRouter(d: Deps): LightRouter {
  const r = Router();
  r.post(
    '/telegram/webhook',
    h(async (req) => {
      const secret = d.config.telegramWebhookSecret;
      if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret)
        throw new ApiError('UNAUTHENTICATED', 'امضای وب‌هوک تلگرام نامعتبر است.');
      return telegram.handleTelegramWebhook(d, req.body ?? {});
    }),
  );
  return r;
}
