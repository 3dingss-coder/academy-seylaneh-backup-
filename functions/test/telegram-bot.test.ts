import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTelegramSender } from '../src/telegram/bot';

afterEach(() => vi.unstubAllGlobals());

describe('Telegram HTTP sender', () => {
  it('calls native fetch without binding it to the sender for messages and documents', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', function (this: unknown, url: string, init?: RequestInit) {
      // Model the Workers native fetch receiver check (Node fetch does not enforce it).
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push({ url, init });
      return Promise.resolve(Response.json({ ok: true }));
    });
    const sender = new HttpTelegramSender('test-token');
    await sender.sendMessage('123', 'hello', {
      replyMarkup: { keyboard: [[{ text: 'phone', request_contact: true }]] },
    });
    await sender.sendDocument('123', { filename: 'report.xlsx', bytes: new Uint8Array([1, 2]) });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.telegram.org/bottest-token/sendMessage',
      'https://api.telegram.org/bottest-token/sendDocument',
    ]);
    expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({
      chat_id: '123',
      reply_markup: { keyboard: [[{ request_contact: true }]] },
    });
    const form = calls[1]?.init?.body as FormData;
    expect(form.get('chat_id')).toBe('123');
    expect((form.get('document') as File).name).toBe('report.xlsx');
  });
});
