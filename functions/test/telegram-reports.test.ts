import { describe, expect, it } from 'vitest';
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

  it('webhook replies with the chat id for pairing (and enforces the secret)', async () => {
    const { ctx } = await setup();
    const update = {
      update_id: 1,
      message: { chat: { id: 424242, first_name: 'احمد' }, text: '/start' },
    };
    const res = await ctx.api().post('/v1/telegram/webhook', update);
    expect(res.status).toBeLessThan(300);
    expect(ctx.deps.telegram.messages).toHaveLength(1);
    expect(ctx.deps.telegram.messages[0]?.text).toContain('424242');

    ctx.deps.config.telegramWebhookSecret = 's3cret';
    const rejected = await ctx.api().post('/v1/telegram/webhook', update);
    expect(rejected.status).toBe(401);
  });
});
