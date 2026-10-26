import type { TelegramDocument, TelegramMessageOptions, TelegramSender } from './types';

/**
 * Telegram Bot API over plain fetch (Workers- and Node-compatible).
 * Docs: https://core.telegram.org/bots/api — only sendMessage/sendDocument are needed.
 */
export class HttpTelegramSender implements TelegramSender {
  readonly enabled = true;
  constructor(
    private readonly token: string,
    // Workers' native fetch must not be invoked with the sender instance as `this`.
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async call(method: string, init: RequestInit): Promise<void> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, init);
    if (!res.ok) {
      let description = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { description?: string };
        if (body.description) description = body.description;
      } catch {
        // keep the status-based message
      }
      throw new Error(`Telegram ${method} failed: ${description}`);
    }
  }

  async sendMessage(chatId: string, text: string, options?: TelegramMessageOptions): Promise<void> {
    await this.call('sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    });
  }

  async sendDocument(chatId: string, doc: TelegramDocument): Promise<void> {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (doc.caption) form.set('caption', doc.caption);
    form.set(
      'document',
      new Blob([new Uint8Array(doc.bytes)] as unknown as ConstructorParameters<typeof Blob>[0], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      doc.filename,
    );
    await this.call('sendDocument', { method: 'POST', body: form });
  }

  describe() {
    return { provider: 'telegram' as const, configured: true };
  }
}
