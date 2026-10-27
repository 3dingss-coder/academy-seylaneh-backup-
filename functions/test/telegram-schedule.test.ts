import { describe, it, expect } from 'vitest';
import { createCtx } from './support/ctx';
import { runDailyTelegramReports } from '../src/services/telegram-reports';

async function setup() {
  const ctx = await createCtx({ start: '2026-10-26T05:29:00Z' }); // 08:59 Tehran
  const a = await ctx.user('manager', { managerProvinces: ['تهران'] });
  const b = await ctx.user('manager', { managerProvinces: ['تهران'] });
  await ctx.user('marketer', { province: 'تهران' });
  await ctx.deps.store.update(`users/${a.id}`, {
    telegramChatId: '777001',
    managerProfileRequired: false,
  });
  await ctx.deps.store.update(`users/${b.id}`, {
    telegramChatId: '777002',
    managerProfileRequired: false,
  });
  let id = 200;
  const webhook = (text: string, chat = 777001, type = 'private', from = chat) =>
    ctx
      .api()
      .post('/v1/telegram/webhook', {
        update_id: id++,
        message: { chat: { id: chat, type }, from: { id: from }, text },
      });
  return { ctx, a, b, webhook };
}

describe('shared per-manager Telegram schedule', () => {
  it('saves from either channel, exposes it in the other and rejects invalid time/roles/chats', async () => {
    const { ctx, a, webhook } = await setup();
    expect((await ctx.api(a.token).patch('/v1/me', { telegramReportTime: '۰۹:۰۷' })).status).toBe(
      200,
    );
    expect((await ctx.api(a.token).get('/v1/manager/profile')).body.data.telegram.reportTime).toBe(
      '09:07',
    );
    await webhook('تنظیم ساعت ارسال');
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('09:07');
    await webhook('۲۴:۰۰');
    expect((await ctx.api(a.token).get('/v1/me')).body.data.telegramReportTime).toBe('09:07');
    await webhook('۱۸:۳۷');
    expect((await ctx.api(a.token).get('/v1/me')).body.data.telegramReportTime).toBe('18:37');
    expect((await ctx.api(a.token).patch('/v1/me', { telegramReportTime: '12:60' })).status).toBe(
      400,
    );
    const marketer = await ctx.user('marketer', { province: 'تهران' });
    expect(
      (await ctx.api(marketer.token).patch('/v1/me', { telegramReportTime: '12:00' })).status,
    ).toBe(403);
    await webhook('تنظیم ساعت ارسال', 777001, 'group');
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('خصوصی');
    await webhook('تنظیم ساعت ارسال', 777001, 'private', 777002);
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('خصوصی');
    expect((await ctx.api(a.token).get('/v1/me')).body.data.telegramReportTime).toBe('18:37');
  });
  it('sends on each managers own minute, once per local day, and catches delayed ticks', async () => {
    const { ctx, a, b } = await setup();
    await ctx.api(a.token).patch('/v1/me', { telegramReportTime: '09:07' });
    await ctx.api(b.token).patch('/v1/me', { telegramReportTime: '10:10' });
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(0);
    ctx.setNow('2026-10-26T05:36:59Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(0);
    ctx.setNow('2026-10-26T05:37:00Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(1);
    expect(ctx.deps.telegram.documents.at(-1)?.chatId).toBe('777001');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(0);
    ctx.setNow('2026-10-26T06:43:00Z'); // delayed by 3 minutes
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(1);
    expect(ctx.deps.telegram.documents.at(-1)?.chatId).toBe('777002');
    ctx.setNow('2026-10-27T05:37:00Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(1);
  });
  it('a past-time change starts tomorrow and midnight follows Tehran, not UTC', async () => {
    const { ctx, a, b } = await setup();
    await ctx.api(a.token).patch('/v1/me', { telegramReportTime: '08:00' });
    await ctx.api(b.token).patch('/v1/me', { telegramReportTime: '00:00' });
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(0);
    ctx.setNow('2026-10-26T20:29:59Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(0);
    ctx.setNow('2026-10-26T20:30:00Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(1);
    expect(ctx.deps.telegram.documents.at(-1)?.chatId).toBe('777002');
    ctx.setNow('2026-10-27T04:30:00Z');
    expect((await runDailyTelegramReports(ctx.deps)).sent).toBe(1);
    expect(ctx.deps.telegram.documents.at(-1)?.chatId).toBe('777001');
  });
});
