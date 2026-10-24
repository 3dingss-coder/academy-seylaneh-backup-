import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { faIssueMessage } from '../src/http/faIssues';
import { parse } from '../src/http/validate';
import { ApiError } from '../src/http/errors';
import { automationSchema } from '../src/services/push-automation-admin';

/**
 * Validation copy is part of the product: the admin panel shows whatever the API answers, so an English
 * «Expected number, received string» is a bug report the admin has to decode alone. The schemas carry their
 * own Persian for the checks a person is meant to hit; these tests cover the rest — zod's own issues — and
 * the rule that a written message is never overwritten.
 */

/** A refusal is the point of these tests, so a pass here is a bug in the test — said out loud. */
function issuesOf(schema: z.ZodTypeAny, data: unknown): z.ZodIssue[] {
  const r = schema.safeParse(data);
  if (r.success) throw new Error('انتظار داشتیم رد شود، ولی قبول شد.');
  return r.error.issues;
}

function first(schema: z.ZodTypeAny, data: unknown): string {
  const [issue] = issuesOf(schema, data);
  if (!issue) throw new Error('بدون پیام رد شد.');
  return faIssueMessage(issue);
}
const HAS_FA = /[\u0600-\u06FF]/;

describe('ترجمهٔ خطاهای خود zod', () => {
  it('هر نوعی را به زبان خود کاربر برمی‌گرداند', () => {
    expect(first(z.object({ a: z.number() }), { a: 'x' })).toBe('«a» باید عدد باشد.');
    expect(first(z.object({ a: z.number() }), {})).toBe('«a» را وارد کنید.');
    expect(first(z.object({ a: z.boolean() }), { a: 'true' })).toBe('«a» باید بله یا خیر باشد.');
    expect(first(z.object({ a: z.string().min(3) }), { a: 'xy' })).toBe(
      '«a» باید حداقل 3 نویسه باشد.',
    );
    expect(first(z.object({ a: z.string().min(1) }), { a: '' })).toBe('«a» نباید خالی باشد.');
    expect(first(z.object({ a: z.string().max(80) }), { a: 'x'.repeat(81) })).toBe(
      '«a» حداکثر 80 نویسه است.',
    );
    expect(first(z.object({ a: z.array(z.string()).max(8) }), { a: new Array(9).fill('x') })).toBe(
      '«a» حداکثر 8 مورد دارد.',
    );
    expect(first(z.object({ a: z.array(z.string()).min(1) }), { a: [] })).toBe(
      '«a» نمی‌تواند خالی باشد.',
    );
    expect(first(z.object({ a: z.number().int().min(1).max(43_200) }), { a: 50_000 })).toBe(
      '«a» باید حداکثر 43200 باشد.',
    );
    expect(first(z.object({ a: z.number().int().min(1).max(43_200) }), { a: 0 })).toBe(
      '«a» باید حداقل 1 باشد.',
    );
    expect(first(z.object({ a: z.number().gt(5) }), { a: 5 })).toBe('«a» باید بیشتر از 5 باشد.');
    expect(first(z.object({ a: z.enum(['x', 'y']) }), { a: 'z' })).toBe(
      '«a» نمی‌تواند «z» باشد؛ مجاز: x، y.',
    );
    expect(first(z.object({ a: z.union([z.literal(1), z.literal(2)]) }), { a: 3 })).toBe(
      '«a» یکی از این‌ها باید باشد: 1، 2.',
    );
    expect(first(z.object({ a: z.number().multipleOf(3) }), { a: 4 })).toBe(
      '«a» باید مضربِ 3 باشد.',
    );
    expect(first(z.object({ a: z.number() }).strict(), { a: 1, b: 2 })).toBe(
      '«b» در این درخواست جایی ندارد.',
    );
  });

  it('پیامِ فارسیِ نوشته‌شده در اسکیما را دست نمی‌زند', () => {
    expect(
      first(
        z.object({ a: z.string().refine((x) => x.length > 2, '«a» برای این قاعده کوتاه است.') }),
        { a: 'x' },
      ),
    ).toBe('«a» برای این قاعده کوتاه است.');
    // and a regex message the schema already words in Persian stays word-for-word
    expect(
      first(z.object({ t: z.string().regex(/^\d\d:\d\d$/, 'ساعت را به قالب HH:mm بنویسید.') }), {
        t: '9',
      }),
    ).toBe('ساعت را به قالب HH:mm بنویسید.');
    // while an unnamed regex — nobody wrote one — is still explained
    expect(HAS_FA.test(first(z.object({ t: z.string().regex(/^\d\d:\d\d$/) }), { t: '9' }))).toBe(
      true,
    );
  });

  it('وقتی نامِ فیلد نبود، اشاره به همان ردیف می‌کند نه به «invalid input»', () => {
    // a bad element inside an array has an index as its last path segment
    const msg = first(z.object({ a: z.array(z.number()) }), { a: ['x'] });
    expect(msg).toContain('«a»');
    expect(msg).toMatch(/باید عدد باشد/);
  });
});

describe('بدنهٔ ساخت قاعده: هیچ پاسخی انگلیسی نمی‌ماند', () => {
  const bodies: unknown[] = [
    {},
    { key: 'BAD KEY', name: 'x', description: '', enabled: 'yes', schemaVersion: 3 },
    {
      key: 'x_new',
      name: 'قاعده',
      description: 'توضیح',
      category: 'deadlines',
      audienceRole: 'marketer',
      trigger: { kind: 'schedule_daily', time: '25:99' },
      audience: { type: 'everyone' },
      message: { title: 'a', body: 'b' },
      delivery: { priority: 'normal', push: true, inApp: true, respectQuietHours: true },
      steps: [{ type: 'wait', id: '', minutes: '60' }],
      when: { type: 'group', op: 'xor', children: [] },
    },
  ];

  for (const [n, body] of bodies.entries()) {
    it(`بدنهٔ ${n + 1}: همه‌ی پیام‌های details فارسی‌اند`, () => {
      const e = (() => {
        try {
          parse(automationSchema, body);
          return null;
        } catch (err) {
          return err;
        }
      })();
      expect(e).toBeInstanceOf(ApiError);
      const details = (e as ApiError).details as Array<{ field: string; message: string }>;
      expect(details.length).toBeGreaterThan(0);
      for (const d of details) expect(d.message).toMatch(HAS_FA);
      // The message names the field or its bound, so it is an instruction and not a verdict.
      expect((e as ApiError).message).toMatch(HAS_FA);
    });
  }

  it('یک گامِ خراب، همان جمله‌ای را می‌گیرد که در فرم می‌بینید', () => {
    const body = {
      key: 'x_new',
      name: 'قاعده',
      description: 'توضیحی کوتاه',
      category: 'deadlines',
      audienceRole: 'marketer',
      trigger: { kind: 'schedule_daily', time: '10:00' },
      audience: { type: 'all' },
      message: { title: 'عنوان', body: 'متن پیام', actionRef: '/learn' },
      delivery: {
        priority: 'normal',
        push: true,
        inApp: true,
        respectQuietHours: true,
        cooldownMs: 0,
      },
      steps: [{ type: 'wait', id: 'w1', minutes: '60' }],
    };
    let details: Array<{ field: string; message: string }> = [];
    try {
      parse(automationSchema, body);
    } catch (e) {
      details = (e as ApiError).details as typeof details;
    }
    expect(details).toEqual([{ field: 'steps.0.minutes', message: '«minutes» باید عدد باشد.' }]);
  });
});
