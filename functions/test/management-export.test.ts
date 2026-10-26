import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createCtx, buildFixture, watchSection, passQuiz } from './support/ctx';
import {
  loadManagementReport,
  managementExportQuery,
  exportManagementReport,
} from '../src/services/management-export';
import { parseReportDateRange } from '../src/reporting/date-range';
import type { User } from '../src/domain/types';

async function setup() {
  const ctx = await createCtx({ start: '2026-10-20T10:00:00Z' });
  const fixture = await buildFixture(ctx, { sections: 1, durationSec: 60 });
  const section = fixture.sections[0];
  if (!section) throw new Error('Missing section');
  const old = await ctx.user('marketer', { name: 'بازاریاب قدیمی', province: 'تهران' });
  await watchSection(ctx, old.token, section.id, 60);
  await passQuiz(ctx, old.token, section.quizId, section.answers);
  ctx.setNow('2026-10-26T10:00:00Z');
  const manager = await ctx.user('manager', { name: 'مدیر تهران', managerProvinces: ['تهران'] });
  const fresh = await ctx.user('marketer', { name: 'بازاریاب تازه', province: 'تهران' });
  const outside = await ctx.user('marketer', { name: 'اطلاعات غیرمجاز قم', province: 'قم' });
  for (const user of [fresh, outside]) {
    await watchSection(ctx, user.token, section.id, 60);
    await passQuiz(ctx, user.token, section.quizId, section.answers);
  }
  await ctx.deps.store.update(`users/${manager.id}`, {
    telegramChatId: '777001',
    managerProfileRequired: false,
  });
  const doc = await ctx.deps.store.get<User>(`users/${manager.id}`);
  if (!doc) throw new Error('Missing manager');
  let update = 1;
  const webhook = (text: string) =>
    ctx.api().post('/v1/telegram/webhook', {
      update_id: update++,
      message: { chat: { id: 777001, type: 'private' }, from: { id: 777001 }, text },
    });
  return { ctx, manager, doc, webhook, fresh };
}
const parts = (bytes: Uint8Array) =>
  Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

describe('shared Manager report templates', () => {
  it('uses submission/completion times for the period and excludes other provinces', async () => {
    const { ctx, doc } = await setup();
    const day = await loadManagementReport(
      ctx.deps,
      doc,
      managementExportQuery.parse({ period: '1' }),
    );
    const month = await loadManagementReport(
      ctx.deps,
      doc,
      managementExportQuery.parse({ period: '30' }),
    );
    expect(day.snapshot.completedInPeriod).toBe(1);
    expect(month.snapshot.completedInPeriod).toBe(2);
    expect(day.snapshot.quizAttempts).toBe(1);
    expect(month.snapshot.quizAttempts).toBe(2);
    expect(day.snapshot.completed).toBe(2); // labelled current snapshot, not a historical percentage
    expect(day.tables.map((t) => t.name)).toEqual([
      'تکمیل آموزش',
      'تلاش‌های آزمون',
      'عملکرد محصول',
      'تفکیک منطقه',
      'بازاریاب‌ها',
    ]);
    expect(JSON.stringify(month)).not.toContain('اطلاعات غیرمجاز قم');
  });
  it('panel and bot produce the same styled workbook data with embedded chart, RTL and numeric cells', async () => {
    const { ctx, manager, webhook } = await setup();
    const site = await ctx
      .api(manager.token)
      .post('/v1/manager/reports/export', { period: '1', format: 'xlsx' });
    expect(site.status).toBe(200);
    expect((await webhook('یک روز اخیر')).status).toBe(200);
    const sent = ctx.deps.telegram.documents.at(-1);
    expect(sent?.doc.filename.endsWith('.xlsx')).toBe(true);
    const web = parts(new Uint8Array(Buffer.from(site.body.data.base64, 'base64')));
    const bot = parts(sent?.doc.bytes ?? new Uint8Array());
    for (let i = 1; i <= 6; i++)
      expect(bot[`xl/worksheets/sheet${i}.xml`]).toBe(web[`xl/worksheets/sheet${i}.xml`]);
    expect(bot['xl/styles.xml']).toContain('Vazirmatn');
    expect(bot['xl/styles.xml']).not.toContain('Calibri');
    expect(bot['xl/charts/chart1.xml']).toContain("'خلاصه مدیریتی'!$B$17:$B$22");
    expect(bot['xl/worksheets/sheet1.xml']).toContain('rightToLeft="1"');
    for (let i = 2; i <= 6; i++) {
      expect(bot[`xl/worksheets/sheet${i}.xml`]).toContain('state="frozen"');
      expect(bot[`xl/worksheets/sheet${i}.xml`]).toContain('rightToLeft="1"');
    }
    expect(bot['xl/worksheets/sheet1.xml']).toMatch(/r="D6"[^>]*><v>1<\/v>/);
  });
  it('delivers PDF with correct MIME and shared real data through the format/province/range flow', async () => {
    const { ctx, manager, webhook } = await setup();
    await webhook('دریافت گزارشات');
    await webhook('پی‌دی‌اف (PDF)');
    await webhook('استان: تهران');
    expect((await webhook('یک روز اخیر')).status).toBe(200);
    const file = ctx.deps.telegram.documents.at(-1)?.doc;
    expect(file?.mimeType).toBe('application/pdf');
    expect(new TextDecoder().decode(file?.bytes.subarray(0, 8))).toContain('%PDF-');
    const pdf = new TextDecoder().decode(file?.bytes);
    expect(pdf).toContain('/FontFile2');
    expect(pdf).toContain('Vazirmatn');
    const site = await ctx
      .api(manager.token)
      .post('/v1/manager/reports/export', { period: '1', format: 'pdf' });
    expect(site.status).toBe(200);
    expect(site.body.data.mimeType).toBe('application/pdf');
  });
  it('validates Persian custom ranges, invalid dates and stale province permissions', async () => {
    const { ctx, manager, webhook } = await setup();
    expect(parseReportDateRange('۱۴۰۵/۰۸/۰۱ تا ۱۴۰۵/۰۸/۰۴')).toEqual({
      from: '2026-10-23',
      to: '2026-10-26',
    });
    expect(parseReportDateRange('۱۴۰۴/۱۲/۳۰ تا ۱۴۰۵/۰۱/۰۱')).toBeNull();
    expect(parseReportDateRange('2026/02/30 تا 2026/03/01')).toBeNull();
    await webhook('اکسل (Excel)');
    await webhook('استان: قم');
    expect(ctx.deps.telegram.documents).toHaveLength(0);
    await webhook('استان: تهران');
    await webhook('بازه دلخواه');
    expect((await webhook('۱۴۰۵/۰۸/۰۱ تا ۱۴۰۵/۰۸/۰۴')).status).toBe(200);
    expect(ctx.deps.telegram.documents).toHaveLength(1);
    expect(
      (
        await ctx.api(manager.token).post('/v1/manager/reports/export', {
          period: 'custom',
          from: '2026-02-30',
          to: '2026-03-01',
        })
      ).status,
    ).toBe(400);
    expect(
      (await ctx.api(manager.token).post('/v1/manager/reports/export', { province: 'قم' })).status,
    ).toBe(403);
    const anonymous = await ctx.api().post('/v1/manager/reports/export', { format: 'pdf' });
    expect(anonymous.status).toBe(401);
    const marketer = await ctx.user('marketer', { province: 'تهران' });
    expect((await ctx.api(marketer.token).post('/v1/manager/reports/export', {})).status).toBe(403);
  });
  it('keeps empty/unassigned members in the roster and produces an empty-period workbook', async () => {
    const { ctx, doc } = await setup();
    await ctx.user('marketer', { name: 'بدون آموزش', province: 'تهران' });
    const report = await loadManagementReport(
      ctx.deps,
      doc,
      managementExportQuery.parse({ period: 'custom', from: '2026-01-01', to: '2026-01-02' }),
    );
    expect(report.snapshot.completedInPeriod).toBe(0);
    expect(report.snapshot.quizAttempts).toBe(0);
    expect(report.tables[1]?.rows).toHaveLength(0);
    const file = await exportManagementReport(
      ctx.deps,
      doc,
      managementExportQuery.parse({ period: 'custom', from: '2026-01-01', to: '2026-01-02' }),
    );
    expect(parts(file.bytes)['xl/worksheets/sheet6.xml']).toContain('بدون آموزش');
  });
});
