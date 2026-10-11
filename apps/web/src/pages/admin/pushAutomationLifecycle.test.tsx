import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';
import type { CatalogMeta } from './automationWizardModel';

/**
 * The lifecycle UI of stage D6: a server-side validation that does not save, a per-user preview that does not
 * send, and a duplicate that creates a switched-off copy. Each test names the request the panel must NOT make
 * as loudly as the one it must make, because «it looked right in the form» is exactly what these endpoints
 * exist to argue with.
 */

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

const RULE_META = {
  ruleFields: [
    { id: 'user.pointsBalance', label: 'امتیاز', kind: 'number', sweep: true, audience: true },
    { id: 'user.role', label: 'نقش', kind: 'text', sweep: true, audience: true },
    { id: 'mentorScoreAvg', label: 'میانگین منتور', kind: 'number', sweep: false, audience: false },
  ],
  ruleOperators: [
    { id: 'gte', label: 'بزرگ‌تر یا برابر', kinds: ['number'], arity: 1 },
    { id: 'eq', label: 'مساوی', kinds: ['number', 'text', 'boolean', 'enum', 'date'], arity: 1 },
  ],
  ruleLimits: { maxNodes: 64, maxDepth: 6, maxLeaves: 48, maxChildren: 48, maxSteps: 8 },
  repeatLimits: { minIntervalFloorMs: 60_000, maxPerDay: 20, maxPerWeek: 100, maxPerMonth: 400 },
  stepLimits: { maxSteps: 8, minWaitMinutes: 1, maxWaitMinutes: 43_200, maxPolicyKeys: 8 },
  stepDefs: [
    { type: 'notify', label: 'ارسال پیام', summary: '', fields: [] },
    { type: 'wait', label: 'صبر', summary: '', fields: [] },
  ],
} as unknown as CatalogMeta;

const CATALOG = {
  ...RULE_META,
  entries: [],
  variables: [{ token: '{name}', label: 'نام کوچک کاربر' }],
  destinations: [{ value: '/learn', label: 'آموزش‌ها' }],
  categories: [{ id: 'deadlines', label: 'مهلت و تکلیف', hint: '', protected: true }],
  triggerKinds: { schedule_daily: 'هر روز در ساعت مشخص' },
  facts: [],
  events: { 'quiz.failed': 'رد شدن در آزمون' },
  weekdays: [],
  limits: { titleMax: 80, bodyMax: 300 },
};

const detail = (over: Record<string, unknown> = {}) => ({
  key: 'follow_up',
  name: 'پیگیری هفتگی',
  description: 'یک قاعده دست‌ساز با درخت شرط',
  category: 'deadlines',
  categoryLabel: 'مهلت و تکلیف',
  triggerKind: 'schedule_daily',
  triggerLabel: 'هر روز در ساعت مشخص',
  enabled: false,
  isSystem: false,
  isGate: false,
  templateKey: null,
  requiresFeature: null,
  optInOnly: false,
  push: true,
  priority: 'normal',
  audienceLabel: 'بازاریاب‌ها',
  timeLabel: '10:00',
  dueNow: true,
  lastRunAt: null,
  sent7d: 0,
  skipped7d: 0,
  version: 4,
  trigger: { kind: 'schedule_daily', time: '10:00' },
  audience: { type: 'role', targetId: 'marketer', channel: 'any', filter: null },
  message: {
    title: '{name}، ادامه بده',
    body: 'آموزش فعال تو بی‌نتیجه مانده است',
    actionRef: '/learn',
    imageUrl: null,
  },
  delivery: {
    priority: 'normal',
    push: true,
    inApp: true,
    respectQuietHours: true,
    cooldownMs: 0,
    maxPerUserPerDay: null,
    sendOnce: null,
    aggregateForManager: null,
  },
  supersedes: [],
  effectiveMessage: null,
  variables: CATALOG.variables,
  destinations: CATALOG.destinations,
  updatedAt: '2026-10-03T06:30:00.000Z',
  updatedBy: 'a1',
  createdBy: 'a1',
  canDelete: true,
  needsCriticalConfirm: false,
  audienceRole: 'marketer',
  schemaVersion: 2,
  when: {
    type: 'group',
    op: 'and',
    children: [{ type: 'leaf', field: 'user.pointsBalance', operator: 'gte', value: 10 }],
  },
  steps: null,
  repeatPolicy: null,
  usesFlow: false,
  stepsSummary: null,
  deadConditions: [],
  ...over,
});

const REVIEW = {
  key: 'follow_up',
  isGate: false,
  enabled: false,
  triggerKind: 'schedule_daily',
  event: null,
  treeSource: 'when',
  treeSummary: 'امتیاز بزرگ‌تر یا برابر ۱۰',
  budget: { nodes: 2, leaves: 1, depth: 2 },
  limits: { maxNodes: 64, maxDepth: 6, maxLeaves: 48, maxChildren: 48, maxSteps: 8 },
  usesFlow: false,
  stepIds: [],
  deadConditions: [],
  eventProduced: null,
  pendingSteps: 0,
  runNote: 'قاعده خاموش است؛ «معتبر است» یعنی «ذخیره شدنی است»، نه «ارسال می‌شود».',
};

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({
      data: [
        { id: 'u1', name: 'سارا', role: 'marketer' },
        { id: 'u2', name: 'بهرام', role: 'manager' },
      ],
    }),
  };
};

const baseRoutes = (over: Record<string, () => unknown> = {}) => ({
  ...asAdmin(),
  'GET /v1/admin/push-automations/catalog': () => ({ data: CATALOG }),
  'GET /v1/admin/push-automations/follow_up': () => ({ data: detail() }),
  'GET /v1/admin/push-automations': () => ({
    data: {
      rows: [],
      paused: false,
      settings: { paused: false },
      counts: { total: 1, enabled: 0, gates: 0, v2: 1 },
      today: { sent: 0, skipped: {} },
    },
  }),
  'GET /v1/admin/push-automations/runs': () => ({ data: [] }),
  'GET /v1/admin/push-automations/follow_up/revisions': () => ({ data: [] }),
  'GET /v1/admin/push-automations/follow_up/pending-steps': () => ({
    data: { items: [], shards: 8, truncated: false },
  }),
  'PATCH /v1/admin/push-automations/follow_up': () => ({ data: detail({ version: 5 }) }),
  ...over,
});

const open = (routes: Record<string, () => unknown> = {}) => {
  const m = mockApi(baseRoutes(routes));
  renderApp('/admin/push-campaigns/automations/follow_up');
  return m;
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('اعتبارسنجی با سرور', () => {
  it('asks the server about the draft and does not save it', async () => {
    const m = open({
      'POST /v1/admin/push-automations/follow_up/validate': () => ({
        data: {
          ok: false,
          errors: [
            {
              path: 'when.children[0].value',
              message: '«بزرگ‌تر یا برابر» به یک مقدار نیاز دارد.',
            },
          ],
          warnings: [
            {
              path: 'when',
              message:
                '«میانگین منتور» در بررسی زمان‌بندی‌شده محاسبه نمی‌شود؛ این شرط همیشه رد می‌شود.',
            },
          ],
          normalized: null,
          review: REVIEW,
        },
      }),
    });
    const btn = await screen.findByRole(
      'button',
      { name: /اعتبارسنجی با سرور/ },
      { timeout: 5000 },
    );
    fireEvent.click(btn);
    expect(await screen.findByText('«بزرگ‌تر یا برابر» به یک مقدار نیاز دارد.')).toBeTruthy();
    expect(await screen.findByText(/همیشه رد می‌شود/)).toBeTruthy();
    // The budget numbers come from the answer, not from a counter in the form.
    expect(await screen.findByText(/خلاصهٔ شرط/)).toBeTruthy();
    // Validation is a question, not a write.
    expect(m.calls.map((c) => c.key)).toContain(
      'POST /v1/admin/push-automations/follow_up/validate',
    );
    expect(m.calls.map((c) => c.key)).not.toContain('PATCH /v1/admin/push-automations/follow_up');
  });

  it('keeps «saveable» and «will send» apart in its own words', async () => {
    open({
      'POST /v1/admin/push-automations/follow_up/validate': () => ({
        data: { ok: true, errors: [], warnings: [], normalized: null, review: REVIEW },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /اعتبارسنجی با سرور/ }));
    expect(await screen.findByText('این تعریف ذخیره شدنی است.')).toBeTruthy();
    expect(await screen.findByText(/قولِ ارسال نیست/)).toBeTruthy();
    // The rule is switched off, and the verdict says so instead of pretending it will send.
    expect(await screen.findByText(/قاعده خاموش است/)).toBeTruthy();
  });
});

describe('پیش‌نمایش گروه آزمایشی', () => {
  it('reads the rule for the picked users and never sends', async () => {
    const m = open({
      'GET /v1/admin/push-automations/follow_up/preview': () => ({
        data: {
          key: 'follow_up',
          evaluatedAt: '2026-10-03T06:30:00.000Z',
          paused: false,
          enabled: false,
          note: 'این پیش‌نمایش مخاطب، شرط و متن را می‌گوید؛ سقف‌ها، دروازه و دستگاه‌های کاربر را نه.',
          rows: [
            {
              userId: 'u1',
              name: 'سارا',
              exists: true,
              inPopulation: true,
              inFilter: true,
              audienceWhy: null,
              matched: false,
              whyNot: 'امتیاز ۴ بزرگ‌تر یا برابر ۱۰ نیست',
              truncated: false,
              explain: ['✗ امتیاز ۴ بزرگ‌تر یا برابر ۱۰ نیست'],
              title: 'سارا، ادامه بده',
              body: 'آموزش فعال تو بی‌نتیجه مانده است',
              steps: [],
            },
            {
              userId: 'u2',
              name: 'بهرام',
              exists: true,
              inPopulation: false,
              inFilter: true,
              audienceWhy: 'خارج از مخاطب انتخابی این قاعده است.',
              matched: true,
              whyNot: null,
              truncated: false,
              explain: ['✓ امتیاز ۳۰ بزرگ‌تر یا برابر ۱۰ است'],
              title: 'بهرام، ادامه بده',
              body: 'آموزش فعال تو بی‌نتیجه مانده است',
              steps: [],
            },
          ],
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /سارا · marketer/ }));
    expect(screen.getByDisplayValue('u1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /پیش‌نمایش \(بدون ارسال\)/ }));

    // Per user: which half of the audience said no, and what the condition answered.
    expect(await screen.findByText('خارج از مخاطب')).toBeTruthy();
    expect(await screen.findByText(/خارج از مخاطب انتخابی/)).toBeTruthy();
    expect(await screen.findByText('شرط قاعده رد شد')).toBeTruthy();
    // The same sentence is shown as the reason and inside the per-leaf trace, so both are there.
    expect(
      (await screen.findAllByText(/امتیاز ۴ بزرگ‌تر یا برابر ۱۰ نیست/)).length,
    ).toBeGreaterThan(1);
    // The rendered text is shown as the push itself, with that user's variables filled in.
    // The rendered text is shown as the push itself (its two surfaces), with that user's variables filled.
    expect((await screen.findAllByText('سارا، ادامه بده')).length).toBeGreaterThan(0);
    expect(m.calls.map((c) => c.key)).not.toContain(
      'POST /v1/admin/push-automations/follow_up/test-send',
    );
    expect(m.calls.map((c) => c.key)).not.toContain('PATCH /v1/admin/push-automations/follow_up');
  });

  it('explains the scope of the preview instead of implying a send test', async () => {
    open({
      'GET /v1/admin/push-automations/follow_up/preview': () => ({
        data: {
          key: 'follow_up',
          evaluatedAt: '2026-10-03T06:30:00.000Z',
          paused: true,
          enabled: true,
          note: 'سقف‌ها و دستگاه‌ها این‌جا بررسی نمی‌شوند.',
          rows: [],
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /بهرام · manager/ }));
    fireEvent.click(screen.getByRole('button', { name: /پیش‌نمایش \(بدون ارسال\)/ }));
    expect(await screen.findByText(/کلید توقف کلی فعال است/)).toBeTruthy();
  });
});

describe('تکثیر قاعده', () => {
  it('creates a copy under a new key and opens it', async () => {
    const m = open({
      'POST /v1/admin/push-automations/follow_up/duplicate': () => ({
        data: { key: 'follow_up_copy', name: 'پیگیری هفتگی (کپی)', enabled: false },
      }),
      'GET /v1/admin/push-automations/follow_up_copy': () => ({
        data: detail({ key: 'follow_up_copy', name: 'پیگیری هفتگی (کپی)', enabled: false }),
      }),
    });
    // The key the panel offers is the rule's own key plus `_copy`, so a duplicate cannot overwrite itself.
    expect(await screen.findByDisplayValue('follow_up_copy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ساخت کپی \(خاموش\)/ }));
    await waitFor(() =>
      expect(m.calls.map((c) => c.key)).toContain(
        'POST /v1/admin/push-automations/follow_up/duplicate',
      ),
    );
    const sent = m.calls.find((c) => c.key.endsWith('/duplicate'));
    expect(sent?.body).toEqual({ key: 'follow_up_copy' });
    // …and the panel walks the operator to the copy, which is where the work continues.
    expect(await screen.findByText('پیگیری هفتگی (کپی)')).toBeTruthy();
  });

  it('refuses a key that is not a key, before asking', async () => {
    const m = open();
    const input = await screen.findByDisplayValue('follow_up_copy');
    fireEvent.change(input, { target: { value: 'Follow Up' } });
    const btn = await screen.findByRole('button', { name: /ساخت کپی \(خاموش\)/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/کوچک و لاتین/)).toBeTruthy();
    expect(m.calls.map((c) => c.key)).not.toContain(
      'POST /v1/admin/push-automations/follow_up/duplicate',
    );
  });

  it('shows the server’s reason when the key is already taken', async () => {
    open({
      'POST /v1/admin/push-automations/follow_up/duplicate': () => ({
        status: 409,
        error: { code: 'CONFLICT', message: 'اتوماسیونی با همین کلید وجود دارد.' },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /ساخت کپی \(خاموش\)/ }));
    expect(await screen.findByText('اتوماسیونی با همین کلید وجود دارد.')).toBeTruthy();
  });
});

const REV = [
  {
    version: 1,
    at: '2026-10-01T06:30:00.000Z',
    by: 'a1',
    note: 'متن',
    message: {
      title: 'ادامه بده',
      body: 'متنی که در نسخه اول ذخیره شده است.',
      actionRef: '/learn',
      imageUrl: null,
    },
    delivery: { priority: 'normal', push: true, cooldownMs: 0 },
  },
  {
    version: 3,
    at: '2026-10-02T06:30:00.000Z',
    by: 'a1',
    note: 'متن و نحوه ارسال',
    message: {
      title: 'یک مرحله دیگر',
      body: 'متنی که بعد از آن نوشته شد.',
      actionRef: '/learn',
      imageUrl: null,
    },
    delivery: { priority: 'high', push: false, cooldownMs: 60000 },
  },
];

describe('بازگردانی متن از تاریخچه', () => {
  it('opens the list, asks once, then posts a versioned restore', async () => {
    const m = open({
      'GET /v1/admin/push-automations/follow_up/revisions': () => ({ data: REV }),
      'POST /v1/admin/push-automations/follow_up/revisions/1/restore': () => ({
        data: detail({ version: 6 }),
      }),
    });
    const toggle = await screen.findByRole('button', { name: 'نمایش ۲' }, { timeout: 5000 });
    fireEvent.click(toggle);
    // The card says what a text revision holds, so «rollback» is not read as «roll back the conditions».
    expect(
      await screen.findByText(/بازگردانی فقط همین متن و «نحوه ارسال» را برمی‌گرداند/),
    ).toBeTruthy();
    expect(screen.getByText(/ارسال: پوش و داخل اپ · اولویت/)).toBeTruthy();
    expect(m.calls.some((c) => c.key.includes('/restore'))).toBe(false);

    fireEvent.click(screen.getByTestId('restore-ask-1'));
    fireEvent.click(screen.getByTestId('restore-1'));
    await waitFor(() =>
      expect(m.calls.map((c) => c.key)).toContain(
        'POST /v1/admin/push-automations/follow_up/revisions/1/restore',
      ),
    );
    // …and it is an ordinary edit: the version the page was reading goes along as the guard.
    expect(m.calls.find((c) => c.key.endsWith('/revisions/1/restore'))?.body).toEqual({
      expectedVersion: 4,
    });
    expect(m.calls.some((c) => c.key === 'PATCH /v1/admin/push-automations/follow_up')).toBe(false);
  });

  it('offers the older text of every revision, not only the newest one', async () => {
    open({ 'GET /v1/admin/push-automations/follow_up/revisions': () => ({ data: REV }) });
    fireEvent.click(await screen.findByRole('button', { name: 'نمایش ۲' }, { timeout: 5000 }));
    expect(await screen.findByTestId('restore-ask-1')).toBeTruthy();
    expect(screen.getByTestId('restore-ask-3')).toBeTruthy();
    // The current version is shown as the row that is *not* offered for restore.
    expect(screen.queryByTestId('restore-ask-4')).toBeNull();
  });
});

describe('بایگانی از صفحه قاعده', () => {
  it('confirms first and says that a live rule is switched off by it', async () => {
    const m = open({
      'GET /v1/admin/push-automations/follow_up': () => ({ data: detail({ enabled: true }) }),
      'POST /v1/admin/push-automations/follow_up/archive': () => ({
        data: detail({ version: 5, enabled: false, archived: true }),
      }),
    });
    // The card explains the difference before anything is clicked, so the button is never a mystery.
    const hint = await screen.findByTestId('detail-archive-hint');
    expect(hint.textContent).toMatch(/بایگانی یعنی خروج از سرویس/);
    fireEvent.click(await screen.findByTestId('detail-archive'));
    const dialog = await waitFor(() => {
      const el = document.querySelector('[role="dialog"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(within(dialog).getByText(/گام‌های معلقش لغو می‌شود/)).toBeTruthy();
    expect(within(dialog).getByText(/این قاعده الان روشن است/)).toBeTruthy();
    expect(m.calls.some((c) => c.key.endsWith('/archive'))).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'بایگانی کن' }));
    await waitFor(() =>
      expect(m.calls.map((c) => c.key)).toContain(
        'POST /v1/admin/push-automations/follow_up/archive',
      ),
    );
    expect(m.calls.find((c) => c.key.endsWith('/archive'))?.body).toEqual({ archived: true });
  });

  it('turns into the way back out, which does not switch the rule on', async () => {
    const m = open({
      'GET /v1/admin/push-automations/follow_up': () => ({
        data: detail({ enabled: false, archived: true }),
      }),
      'POST /v1/admin/push-automations/follow_up/archive': () => ({
        data: detail({ version: 6, enabled: false, archived: false }),
      }),
    });
    expect(await screen.findByText('بایگانی‌شده')).toBeTruthy();
    const btn = await screen.findByTestId('detail-archive');
    expect(btn.textContent).toContain('خروج از بایگانی');
    expect(btn.textContent).not.toContain('بایگانی‌کردن');
    // The hint says the second half of the story, so «بازگردان» is not read as «روشن کن».
    expect((await screen.findByTestId('detail-archive-hint')).textContent).toMatch(
      /روشن‌کردن تصمیم جداگانه‌ی شماست/,
    );
    fireEvent.click(btn);
    const dialog = await waitFor(() => {
      const el = document.querySelector('[role="dialog"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'بازگردان' }));
    await waitFor(() =>
      expect(m.calls.map((c) => c.key)).toContain(
        'POST /v1/admin/push-automations/follow_up/archive',
      ),
    );
    expect(m.calls.find((c) => c.key.endsWith('/archive'))?.body).toEqual({ archived: false });
  });
});
