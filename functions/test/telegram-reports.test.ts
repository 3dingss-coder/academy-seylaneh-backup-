import { describe, expect, it, vi } from 'vitest';
import { createCtx } from './support/ctx';
import { runDailyTelegramReports } from '../src/services/telegram-reports';

/**
 * Daily 09:00 Telegram Excel to Managers: a province Manager who connected their chat
 * receives exactly one workbook per day (idempotent), forced runs re-send, Managers
 * without a chat id are skipped, and the webhook pairs a chat id by replying with it.
 */
describe('telegram daily Manager reports', () => {
  async function setup() {
    const ctx = await createCtx();
    const manager = await ctx.user('manager', {
      name: 'احمد رضایی',
      managerProvinces: ['تهران', 'مازندران'],
    });
    const marketerIn = async (name: string, province: string) => {
      const user = await ctx.user('marketer', { name });
      await ctx.deps.store.update(`users/${user.id}`, { province, city: province });
      return user;
    };
    const tehran = await marketerIn('بازاریاب تهران', 'تهران');
    await marketerIn('بازاریاب مازندران', 'مازندران');
    await marketerIn('بازاریاب قم', 'قم');
    return { ctx, manager, tehran };
  }

  it('sends one Excel per connected Manager at 09:00 Tehran, idempotently', async () => {
    const { ctx, manager } = await setup();
    await ctx.deps.store.update(`users/${manager.id}`, { telegramChatId: '123456789' });
    ctx.setNow('2026-10-03T05:30:00.000Z'); // 09:00 Tehran

    const first = await runDailyTelegramReports(ctx.deps);
    expect(first.sent).toBe(1);
    expect(ctx.deps.telegram.documents).toHaveLength(1);
    const sent = ctx.deps.telegram.documents[0] as NonNullable<
      (typeof ctx.deps.telegram.documents)[0]
    >;
    expect(sent.chatId).toBe('123456789');
    expect(sent.doc.filename).toMatch(/^manager-report-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(sent.doc.caption).toContain('احمد رضایی');
    expect(sent.doc.caption).toContain('تهران');
    // The workbook covers both supervised provinces — and not قم.
    const text = new TextDecoder('utf-8', { fatal: false }).decode(sent.doc.bytes);
    expect(text).toContain('بازاریاب تهران');
    expect(text).toContain('بازاریاب مازندران');
    expect(text).not.toContain('بازاریاب قم');

    // Same-day re-run is a no-op; a forced run (admin jobs endpoint) re-sends.
    const second = await runDailyTelegramReports(ctx.deps);
    expect(second.sent).toBe(0);
    expect(second.skippedManagers).toBe(1);
    const forced = await runDailyTelegramReports(ctx.deps, true);
    expect(forced.sent).toBe(1);
    expect(ctx.deps.telegram.documents).toHaveLength(2);
  });

  it('outside the 09:00 slot, and for managers without a chat id, nothing is sent', async () => {
    const { ctx, manager } = await setup();
    // No chat id yet — even a forced run skips this Manager.
    expect((await runDailyTelegramReports(ctx.deps, true)).sent).toBe(0);

    await ctx.deps.store.update(`users/${manager.id}`, { telegramChatId: '555000111' });
    ctx.setNow('2026-10-03T06:30:00.000Z'); // 10:00 Tehran
    const outside = await runDailyTelegramReports(ctx.deps);
    expect(outside.skipped).toBe('outside_slot');
    expect(ctx.deps.telegram.documents).toHaveLength(0);
  });

  it('Manager saves the chat id in their profile and can trigger a test send', async () => {
    const { ctx, manager } = await setup();
    const api = ctx.api(manager.token);
    const patched = await api.patch('/v1/me', { telegramChatId: '۹۸۷۶۵۴۳۲۱' });
    expect(patched.status).toBeLessThan(300);
    const me = await api.get('/v1/me');
    expect(me.body.data.telegramChatId).toBe('987654321'); // Persian digits normalized

    const invalid = await api.patch('/v1/me', { telegramChatId: 'abc' });
    expect(invalid.status).toBe(400);

    const test = await api.post('/v1/manager/telegram/test', {});
    expect(test.status).toBeLessThan(300);
    expect(test.body.data.memberCount).toBe(2);
    expect(ctx.deps.telegram.documents).toHaveLength(1);
    expect(ctx.deps.telegram.documents[0]?.chatId).toBe('987654321');
  });

  const webhook = (ctx: Awaited<ReturnType<typeof createCtx>>, message: unknown) =>
    ctx.api().post('/v1/telegram/webhook', { update_id: 1, message });

  it('does not acknowledge a webhook when the Telegram reply failed, and permits retry', async () => {
    const { ctx } = await setup();
    const send = vi.spyOn(ctx.deps.telegram, 'sendMessage');
    send.mockRejectedValueOnce(new Error('transport failure with private details'));
    const message = { chat: { id: 424242 }, text: '/start' };
    const failed = await webhook(ctx, message);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain('private details');
    expect(ctx.deps.telegram.messages).toHaveLength(0);
    const retried = await webhook(ctx, message);
    expect(retried.status).toBe(200);
    expect(ctx.deps.telegram.messages).toHaveLength(1);
  });

  it('/start asks for the mobile number with a contact-share button; secret enforced', async () => {
    const { ctx } = await setup();
    const res = await webhook(ctx, {
      chat: { id: 424242 },
      from: { id: 424242, first_name: 'احمد' },
      text: '/start',
    });
    expect(res.status).toBeLessThan(300);
    expect(ctx.deps.telegram.messages).toHaveLength(1);
    const sent = ctx.deps.telegram.messages[0];
    expect(sent?.text).toContain('ارسال شماره موبایل');
    const markup = sent?.options?.replyMarkup as {
      keyboard?: Array<Array<{ request_contact?: boolean }>>;
    };
    expect(markup.keyboard?.[0]?.[0]?.request_contact).toBe(true);

    ctx.deps.config.telegramWebhookSecret = 's3cret';
    const rejected = await webhook(ctx, { chat: { id: 424242 }, text: '/start' });
    expect(rejected.status).toBe(401);
    ctx.deps.config.telegramWebhookSecret = '';
  });

  it('sharing the mobile number pairs the chat to that Manager — and the 09:00 report follows', async () => {
    const { ctx, manager } = await setup();
    // Telegram sends the number in international form (+98…).
    const intl = `+98${manager.phone.slice(1)}`;
    const res = await webhook(ctx, {
      chat: { id: 777001 },
      from: { id: 777001, first_name: 'احمد' },
      contact: { phone_number: intl, user_id: 777001, first_name: 'احمد' },
    });
    expect(res.status).toBeLessThan(300);
    const doc = await ctx.deps.store.get<{ telegramChatId?: string | null }>(`users/${manager.id}`);
    expect(doc?.telegramChatId).toBe('777001');
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('اتصال انجام شد');
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('احمد رضایی');

    // The very number that was shared now receives this Manager's daily Excel.
    ctx.setNow('2026-10-03T05:30:00.000Z'); // 09:00 Tehran
    const run = await runDailyTelegramReports(ctx.deps);
    expect(run.sent).toBe(1);
    expect(ctx.deps.telegram.documents[0]?.chatId).toBe('777001');

    // /stop unpairs again.
    await webhook(ctx, { chat: { id: 777001 }, from: { id: 777001 }, text: '/stop' });
    const after = await ctx.deps.store.get<{ telegramChatId?: string | null }>(
      `users/${manager.id}`,
    );
    expect(after?.telegramChatId).toBeNull();
  });

  it('never pairs a typed number or somebody else’s contact; unknown numbers get help', async () => {
    const { ctx, manager } = await setup();
    const chatOf = async () =>
      (await ctx.deps.store.get<{ telegramChatId?: string | null }>(`users/${manager.id}`))
        ?.telegramChatId ?? null;

    // Typed number (spoofable) → refused, button requested instead.
    await webhook(ctx, { chat: { id: 555 }, from: { id: 555 }, text: manager.phone });
    expect(await chatOf()).toBeNull();
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('تایپ‌شده قبول نمی‌شود');

    // Phone-book contact card without a Telegram user_id → also refused.
    await webhook(ctx, {
      chat: { id: 555 },
      from: { id: 555 },
      contact: { phone_number: `+98${manager.phone.slice(1)}` },
    });
    expect(await chatOf()).toBeNull();

    // Contact card of a different Telegram user → refused.
    await webhook(ctx, {
      chat: { id: 555 },
      from: { id: 555 },
      contact: { phone_number: `+98${manager.phone.slice(1)}`, user_id: 999999 },
    });
    expect(await chatOf()).toBeNull();

    // A real share of a number that is no Manager in the system → polite dead end with the
    // manual chat-id fallback.
    await webhook(ctx, {
      chat: { id: 555 },
      from: { id: 555 },
      contact: { phone_number: '+989000000000', user_id: 555 },
    });
    expect(await chatOf()).toBeNull();
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('پیدا نشد');
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('555');
  });

  it('re-pairing moves the chat: the previous Manager is detached', async () => {
    const { ctx, manager } = await setup();
    const other = await ctx.user('manager', { name: 'مدیر دوم', managerProvinces: ['قم'] });
    const share = (phone: string) =>
      webhook(ctx, {
        chat: { id: 31337 },
        from: { id: 31337 },
        contact: { phone_number: `+98${phone.slice(1)}`, user_id: 31337 },
      });
    await share(manager.phone);
    await share(other.phone);
    const first = await ctx.deps.store.get<{ telegramChatId?: string | null }>(
      `users/${manager.id}`,
    );
    const second = await ctx.deps.store.get<{ telegramChatId?: string | null }>(
      `users/${other.id}`,
    );
    expect(first?.telegramChatId).toBeNull();
    expect(second?.telegramChatId).toBe('31337');
  });

  it('in a dev-mode deployment without a webhook secret, pairing payloads are not trusted', async () => {
    const { ctx, manager } = await setup();
    ctx.deps.config.env = 'dev';
    await webhook(ctx, {
      chat: { id: 70707 },
      from: { id: 70707 },
      contact: { phone_number: `+98${manager.phone.slice(1)}`, user_id: 70707 },
    });
    const doc = await ctx.deps.store.get<{ telegramChatId?: string | null }>(`users/${manager.id}`);
    expect(doc?.telegramChatId ?? null).toBeNull();
    ctx.deps.config.env = 'test';
  });

  it('in production without a webhook secret, pairing payloads are not trusted', async () => {
    const { ctx, manager } = await setup();
    ctx.deps.config.env = 'prod';
    await webhook(ctx, {
      chat: { id: 60606 },
      from: { id: 60606 },
      contact: { phone_number: `+98${manager.phone.slice(1)}`, user_id: 60606 },
    });
    const doc = await ctx.deps.store.get<{ telegramChatId?: string | null }>(`users/${manager.id}`);
    expect(doc?.telegramChatId ?? null).toBeNull();
    // The manual fallback (chat id) is offered instead.
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('60606');
    ctx.deps.config.env = 'test';
  });
});
