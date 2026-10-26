import { describe, expect, it, vi } from 'vitest';
import { buildFixture, createCtx } from './support/ctx';
import { buildManagerRangeReport } from '../src/services/telegram-range-report';
import type { User } from '../src/domain/types';
import type { TelegramKeyboardMarkup } from '../src/telegram/types';

/** Read the actual stored-ZIP worksheet XML, not a stringified report object. */
function sheet(bytes: Uint8Array, number: number): string[][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const length = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    if (name === `xl/worksheets/sheet${number}.xml`) {
      const xml = new TextDecoder().decode(bytes.subarray(start, start + length));
      return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
        const cells: string[] = [];
        for (const c of (r[1] ?? '').matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
          const column = [...(c[1] ?? '')].reduce(
            (n, letter) => n * 26 + letter.charCodeAt(0) - 64,
            0,
          );
          cells[column - 1] = (
            (c[2] ?? '').match(/<(?:t|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:t|v)>/)?.[1] ?? ''
          ).replace(/&amp;/g, '&');
        }
        return cells;
      });
    }
    offset = start + length;
  }
  throw new Error('Worksheet not found');
}

async function setup() {
  const ctx = await createCtx({ start: '2026-10-26T10:00:00.000Z' });
  const manager = await ctx.user('manager', { name: 'مدیر تهران', managerProvinces: ['تهران'] });
  const member = await ctx.user('marketer', { name: 'بازاریاب داخل محدوده', province: 'تهران' });
  const outsider = await ctx.user('marketer', { name: 'خارج محدوده محرمانه', province: 'قم' });
  await ctx.deps.store.update(`users/${manager.id}`, {
    telegramChatId: '777001',
    managerProfileRequired: false,
  });
  const fixture = await buildFixture(ctx, { sections: 1, deadlineDays: 10 });
  const section = fixture.sections[0];
  if (!section) throw new Error('Missing fixture section');
  const addActivity = async (id: string, userId: string, at: string, seconds: number) => {
    await ctx.deps.store.set(`playback_events/${id}`, {
      userId,
      sectionId: section.id,
      ts: at,
      acceptedDeltaSec: seconds,
      playedDeltaSec: 9999,
    });
  };
  const doc = await ctx.deps.store.get<User>(`users/${manager.id}`);
  if (!doc) throw new Error('Missing fixture manager');
  let updateId = 1;
  const webhook = (
    text: string,
    options: { chatId?: number; type?: string; fromId?: number; updateId?: number } = {},
  ) => {
    const id = options.chatId ?? 777001;
    return ctx.api().post('/v1/telegram/webhook', {
      update_id: options.updateId ?? updateId++,
      message: {
        chat: { id, type: options.type ?? 'private' },
        from: { id: options.fromId ?? id },
        text,
      },
    });
  };
  return { ctx, manager, member, outsider, fixture, addActivity, doc, webhook, section };
}

describe('Telegram instant activity report', () => {
  it('filters exact 24h/30d event boundaries, accepted playback, completions and quiz submission time', async () => {
    const { ctx, member, outsider, fixture, addActivity, doc, section } = await setup();
    await addActivity('recent', member.id, '2026-10-26T09:00:00.000Z', 60);
    await addActivity('at-start', member.id, '2026-10-25T10:00:00.000Z', 60);
    await addActivity('older', member.id, '2026-10-20T10:00:00.000Z', 120);
    await addActivity('month-boundary', member.id, '2026-09-26T10:00:00.000Z', 60);
    await addActivity('too-old', member.id, '2026-09-26T09:59:59.999Z', 6000);
    await addActivity('future', member.id, '2026-10-26T10:00:00.001Z', 6000);
    await addActivity('outside', outsider.id, '2026-10-26T09:00:00.000Z', 6000);
    const completion = {
      userId: member.id,
      packageId: fixture.packageId,
      teamId: null,
      completedAt: '2026-10-20T10:00:00.000Z',
      onTime: true,
      delayHours: 0,
    };
    await ctx.deps.store.set('package_completions/test', completion);
    for (const [id, submittedAt] of [
      ['today', '2026-10-26T09:00:00.000Z'],
      ['older', '2026-10-20T10:00:00.000Z'],
      ['old', '2026-09-01T00:00:00.000Z'],
    ]) {
      await ctx.deps.store.set(`attempts/${id}`, {
        userId: member.id,
        packageId: fixture.packageId,
        sectionId: section.id,
        quizId: section.quizId,
        status: 'submitted',
        submittedAt,
        startedAt: '2026-09-01T00:00:00.000Z',
        attemptNumber: 1,
        score: 100,
        passed: true,
        snapshot: [],
        answers: {},
      });
    }
    const day = await buildManagerRangeReport(ctx.deps, doc, 1);
    const month = await buildManagerRangeReport(ctx.deps, doc, 30);
    expect(sheet(day.bytes, 2)[1]?.slice(4, 9)).toEqual(['2', '1', '0', '1', '1']);
    expect(sheet(month.bytes, 2)[1]?.slice(4, 9)).toEqual(['5', '1', '1', '2', '2']);
    expect(sheet(day.bytes, 4)).toHaveLength(2); // header + today's submitted quiz
    expect(sheet(month.bytes, 4)).toHaveLength(3);
    expect(sheet(day.bytes, 3)[1]?.[3]).toBe('آموزش کرم مرطوب کننده'); // future deadline does not exclude activity
    for (const report of [day, month]) {
      expect(new TextDecoder().decode(report.bytes)).not.toContain('خارج محدوده محرمانه');
      expect(sheet(report.bytes, 1).flat()).toContain('Asia/Tehran');
    }
  });

  it('sends a valid empty workbook and excludes archived training activity', async () => {
    const { ctx, member, fixture, addActivity, doc } = await setup();
    await addActivity('recent', member.id, '2026-10-26T09:00:00.000Z', 60);
    await ctx.deps.store.set('archived_reports/test', {
      userId: member.id,
      packageId: fixture.packageId,
    });
    const report = await buildManagerRangeReport(ctx.deps, doc, 1);
    expect(sheet(report.bytes, 2)[1]?.slice(4, 9)).toEqual(['0', '0', '0', '0', '0']);
    expect(sheet(report.bytes, 3)).toHaveLength(1);
    expect(sheet(report.bytes, 4)).toHaveLength(1);
  });

  it('shows Persian menus and sends either range, deduplicating Telegram delivery retries', async () => {
    const { ctx, webhook } = await setup();
    expect((await webhook('شروع کنیم')).status).toBe(200);
    const menu = ctx.deps.telegram.messages.at(-1)?.options?.replyMarkup as TelegramKeyboardMarkup;
    expect(menu.keyboard.flat().map((b) => b.text)).toContain('دریافت گزارشات');
    await webhook('دریافت گزارشات');
    const formats = ctx.deps.telegram.messages.at(-1)?.options
      ?.replyMarkup as TelegramKeyboardMarkup;
    expect(formats.keyboard.flat().map((b) => b.text)).toEqual([
      'اکسل (Excel)',
      'پی‌دی‌اف (PDF)',
      'بازگشت',
    ]);
    await webhook('اکسل (Excel)');
    await webhook('همه استان‌های من');
    const range = ctx.deps.telegram.messages.at(-1)?.options?.replyMarkup as TelegramKeyboardMarkup;
    expect(range.keyboard.flat().map((b) => b.text)).toContain('بازه دلخواه');
    expect((await webhook('یک روز اخیر', { updateId: 100 })).status).toBe(200);
    expect((await webhook('یک روز اخیر', { updateId: 100 })).status).toBe(200);
    expect(ctx.deps.telegram.documents).toHaveLength(1);
    expect((await webhook('۳۰ روز اخیر')).status).toBe(200);
    expect(ctx.deps.telegram.documents).toHaveLength(2);
    expect(ctx.deps.telegram.documents[0]?.doc.filename).toContain('-1-');
    expect(ctx.deps.telegram.documents[1]?.doc.filename).toContain('-30-');
  });

  it('blocks unpaired, disabled, incomplete, non-private and unverified report requests', async () => {
    const { ctx, manager, webhook } = await setup();
    await webhook('یک روز اخیر', { chatId: 888001 });
    await webhook('یک روز اخیر', { type: 'group' });
    await webhook('یک روز اخیر', { fromId: 888001 });
    ctx.deps.config.env = 'dev'; // no webhook secret => never trust payload
    await webhook('یک روز اخیر');
    ctx.deps.config.env = 'test';
    await ctx.deps.store.update(`users/${manager.id}`, { status: 'inactive' });
    await webhook('یک روز اخیر');
    await ctx.deps.store.update(`users/${manager.id}`, {
      status: 'active',
      managerProfileRequired: true,
    });
    await webhook('یک روز اخیر');
    expect(ctx.deps.telegram.documents).toHaveLength(0);
    expect(ctx.deps.telegram.messages.at(-1)?.text).toContain('تکمیل');
  });

  it('returns a sanitized failure and can retry after a failed document send', async () => {
    const { ctx, webhook } = await setup();
    vi.spyOn(ctx.deps.telegram, 'sendDocument').mockRejectedValueOnce(
      new Error('private transport details'),
    );
    const failed = await webhook('یک روز اخیر', { updateId: 100 });
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain('private transport details');
    expect((await webhook('یک روز اخیر', { updateId: 100 })).status).toBe(200);
    expect(ctx.deps.telegram.documents).toHaveLength(1);
  });
});
