import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_TYPE_LABELS,
  TRIGGER_FIELDS,
  WIZARD_STEPS,
  DRAFT_STORAGE_KEY,
  allErrors,
  clearDraft,
  conditionLabel,
  draftStepLabel,
  createBody,
  deliverySummary,
  draftFromDetail,
  emptyDraft,
  eventLabel,
  loadDraft,
  saveDraft,
  incompleteSteps,
  opLabel,
  patchFromDraft,
  pendingStepsSentence,
  previewOf,
  toFa,
  triggerSentence,
  usedVars,
  validateStep,
  varLabel,
  type CatalogMeta,
  type DetailMeta,
} from './automationWizardModel';
import { emptyLogic, emptyStep, type LogicDraft } from './automationRuleModel';
import type { AutomationRow } from './pushAutomationModel';

const META: CatalogMeta = {
  entries: [],
  variables: [
    { token: '{name}', label: 'نام کوچک کاربر' },
    { token: '{title}', label: 'نام آموزش (بسته)' },
    { token: '{section}', label: 'عنوان قسمت بعدی' },
    { token: '{sectionId}', label: 'شناسه قسمت بعدی' },
    { token: '{packageId}', label: 'شناسه بسته' },
  ],
  destinations: [
    { value: '/learn', label: 'آموزش‌ها' },
    { value: '/packages/{packageId}', label: 'بسته آموزشی (مربوط به پیام)' },
    { value: '/sections/{sectionId}', label: 'قسمت بعدی کاربر' },
    { value: '/mentor', label: 'منتور هوشمند' },
  ],
  categories: [
    { id: 'deadlines', label: 'مهلت و تکلیف', hint: '', protected: true },
    { id: 'quizzes', label: 'آزمون', hint: '', protected: false },
    { id: 'general', label: 'عمومی', hint: '', protected: false },
  ],
  triggerKinds: {
    event: 'اتفاق در اپلیکیشن',
    event_delay: 'اتفاق + تأخیر',
    inactivity: 'بی‌فعالیتی کاربر',
    schedule_daily: 'هر روز در ساعت مشخص',
    schedule_weekly: 'هر هفته در روز و ساعت مشخص',
    condition: 'شرط وضعیتی روی کاربران',
  },
  facts: [
    { field: 'progress', label: 'پیشرفت بیشترین آموزش فعال (٪)', kind: 'number' },
    { field: 'todayActive', label: 'امروز فعال بوده است', kind: 'boolean' },
  ],
  events: { 'quiz.failed': 'رد شدن در آزمون', 'section.completed': 'پایان محتوای یک قسمت' },
  weekdays: ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'],
  limits: { titleMax: 80, bodyMax: 300 },
};

const ROW: AutomationRow = {
  key: 'inactive_1d',
  name: 'یک روز بی‌فعالیتی',
  description: 'ادامه دادن را یادآوری می‌کند',
  category: 'deadlines',
  categoryLabel: 'مهلت و تکلیف',
  triggerKind: 'inactivity',
  triggerLabel: 'بی‌فعالیتی کاربر',
  enabled: true,
  isSystem: true,
  isGate: false,
  templateKey: null,
  requiresFeature: null,
  optInOnly: false,
  push: true,
  priority: 'normal',
  audienceLabel: 'بازاریاب‌ها',
  timeLabel: '10:00',
  dueNow: false,
  lastRunAt: null,
  sent7d: 3,
  skipped7d: 1,
  version: 4,
};

const DETAIL: DetailMeta = {
  ...ROW,
  trigger: { kind: 'inactivity', inactivityDays: 2, time: '10:00', ladderGroup: 'inactive' },
  audience: { type: 'role', targetId: 'marketer', channel: 'any' },
  message: {
    title: '{name}، ادامه بده',
    body: 'یک مرحله دیگر از «{title}» مانده است',
    actionRef: '/learn',
    imageUrl: null,
  },
  delivery: {
    priority: 'normal',
    push: true,
    inApp: true,
    respectQuietHours: true,
    cooldownMs: 86_400_000,
    maxPerUserPerDay: null,
    sendOnce: null,
    aggregateForManager: null,
  },
  supersedes: ['reminder'],
  effectiveMessage: null,
  variables: META.variables,
  destinations: META.destinations,
  updatedAt: '2026-10-03T06:30:00.000Z',
  updatedBy: 'a1',
  createdBy: 'a1',
  canDelete: false,
  needsCriticalConfirm: false,
  audienceRole: 'marketer',
};

describe('wizard model: draft ⇄ payload', () => {
  it('reads a stored automation into one draft, with the hour and the ladder preserved', () => {
    const d = draftFromDetail(DETAIL);
    expect(d).toMatchObject({
      key: 'inactive_1d',
      name: 'یک روز بی‌فعالیتی',
      category: 'deadlines',
      triggerKind: 'inactivity',
      inactivityDays: '2',
      time: '10:00',
      ladderGroup: 'inactive',
      audienceType: 'role',
      roleTarget: 'marketer',
      audienceRole: 'marketer',
      cooldownHours: '24',
      maxPerUserPerDay: '',
      sendOnce: false,
      supersedes: 'reminder',
    });
    // a role target is a pick list, so the raw id never enters the text field
    expect(d.audienceTargetId).toBe('');
  });

  it('writes back the four sub-objects in full and never touches `enabled`', () => {
    const body = patchFromDraft(draftFromDetail(DETAIL));
    expect(body).not.toHaveProperty('enabled');
    expect(body.trigger).toEqual({
      kind: 'inactivity',
      event: null,
      delayMinutes: null,
      inactivityDays: 2,
      ladderGroup: 'inactive',
      time: '10:00',
      weekday: null,
      conditions: null,
    });
    expect(body.audience).toEqual({ type: 'role', targetId: 'marketer', channel: 'any' });
    expect(body.delivery.cooldownMs).toBe(86_400_000);
    expect(body.supersedes).toEqual(['reminder']);
    expect(body.optInOnly).toBe(false);
  });

  it('a trigger change drops the fields of the previous kind instead of leaking them', () => {
    const d = { ...draftFromDetail(DETAIL), triggerKind: 'schedule_weekly' as const, weekday: '2' };
    const body = patchFromDraft(d);
    expect(body.trigger).toMatchObject({
      kind: 'schedule_weekly',
      weekday: 2,
      inactivityDays: null,
    });
  });

  it('creates always arrive disabled, with the trimmed key', () => {
    const body = createBody({ ...emptyDraft(META), key: '  weekly_note  ' });
    expect(body.key).toBe('weekly_note');
    expect(body.enabled).toBe(false);
  });

  it('condition values follow the kind of the fact, not the keystrokes', () => {
    const d = {
      ...emptyDraft(META),
      triggerKind: 'condition' as const,
      conditions: [
        { field: 'progress', op: 'lte' as const, value: '80' },
        { field: 'todayActive', op: 'eq' as const, value: 'false' },
        { field: 'streakDays', op: 'gte' as const, value: 'abc' },
      ],
    };
    expect(patchFromDraft(d).trigger.conditions).toEqual([
      { field: 'progress', op: 'lte', value: 80 },
      { field: 'todayActive', op: 'eq', value: false },
      { field: 'streakDays', op: 'gte', value: 'abc' },
    ]);
  });

  it('empty numbers mean «inherit», not zero', () => {
    const d = { ...emptyDraft(META), cooldownHours: '', maxPerUserPerDay: '' };
    expect(patchFromDraft(d).delivery).toMatchObject({ cooldownMs: 0, maxPerUserPerDay: null });
  });

  it('supersedes is a short list of template keys', () => {
    const d = {
      ...emptyDraft(META),
      supersedes: ' a , b ,, c,d,e,f,g,h,i,j ',
    };
    expect(patchFromDraft(d).supersedes).toHaveLength(8);
  });
});

describe('wizard model: validation mirrors the server', () => {
  const okDraft = () => ({
    ...emptyDraft(META),
    key: 'weekly_note',
    name: 'یادداشت هفتگی',
    description: 'خلاصه هفته را یادآوری می‌کند',
    category: 'general',
    title: 'سلام {name}',
    body: 'هفته دیگر می‌رسیم',
    actionRef: '/learn',
  });

  it('a complete step passes with no message at all', () => {
    expect(validateStep('what', okDraft(), META)).toEqual({});
    expect(validateStep('wording', okDraft(), META)).toEqual({});
    expect(incompleteSteps(okDraft(), META)).toEqual([]);
    expect(allErrors(okDraft(), META)).toEqual({});
  });

  it('each trigger kind asks only for its own fields', () => {
    const d = { ...okDraft(), triggerKind: 'event_delay' as const, conditions: [] };
    const e = validateStep('when', d, META);
    expect(e.event).toContain('نام اتفاق لازم است');
    expect(e.delayMinutes).toContain('۱ تا ۱۰۰۸۰');
    expect(TRIGGER_FIELDS.event_delay).toEqual(['event', 'delayMinutes', 'time']);
    // a condition rule does not need an event, but it needs at least one condition
    expect(validateStep('when', { ...d, triggerKind: 'condition' }, META)).toEqual({
      conditions: 'حداقل یک شرط لازم است؛ مثلاً پیشرفت کمتر از ۸۰.',
    });
  });

  it('an event the app never publishes, and a variable the engine cannot fill, are both refused here', () => {
    const d = { ...okDraft(), triggerKind: 'event' as const, event: 'user.deleted' };
    expect(validateStep('when', d, META).event).toContain('منتشر نمی‌شود');
    expect(
      validateStep('wording', { ...okDraft(), title: 'سلام {password}' }, META).variables,
    ).toContain('{password}');
    expect(usedVars('{a} {b} {a}')).toEqual(['a', 'b']);
  });

  it('the destination is the allowlist, and a path from another era still shows', () => {
    expect(
      validateStep('wording', { ...okDraft(), actionRef: '/admin/push-campaigns' }, META).actionRef,
    ).toContain('مسیرهای داخلی مجاز');
    expect(
      validateStep('wording', { ...okDraft(), actionRef: '/mentor' }, META),
    ).not.toHaveProperty('actionRef');
    expect(
      validateStep('wording', { ...okDraft(), actionRef: '/packages/{name}' }, META),
    ).toHaveProperty('actionRef');
  });

  it('an image is either empty or a public https link', () => {
    expect(validateStep('wording', okDraft(), META)).not.toHaveProperty('imageUrl');
    for (const bad of ['http://cdn.example.com/a.png', 'javascript:alert(1)'])
      expect(validateStep('wording', { ...okDraft(), imageUrl: bad }, META).imageUrl).toContain(
        'HTTPS',
      );
  });

  it('a weekday is required for a weekly rule, and a target id for a team or a person', () => {
    const weekly = validateStep(
      'when',
      { ...okDraft(), triggerKind: 'schedule_weekly', weekday: '' },
      META,
    );
    expect(weekly.weekday).toBe('برای برنامه هفتگی، روز هفته لازم است.');
    expect(
      validateStep('when', { ...okDraft(), triggerKind: 'schedule_daily', time: '24:00' }, META)
        .time,
    ).toBe('ساعت را به قالب HH:mm بنویسید.');
    expect(
      validateStep('who', { ...okDraft(), audienceType: 'team', audienceTargetId: '' }, META)
        .audienceTargetId,
    ).toContain('شناسه هدف');
    // a role target is chosen from a list, so it can never be empty
    expect(validateStep('who', { ...okDraft(), audienceType: 'role' }, META)).toEqual({});
  });

  it('the text limits come from the catalogue meta, not from a guess', () => {
    const long = 'ک'.repeat(81);
    expect(validateStep('wording', { ...okDraft(), title: long }, META).title).toContain('۸۰');
    expect(
      validateStep(
        'wording',
        { ...okDraft(), title: long },
        { ...META, limits: { titleMax: 40, bodyMax: 300 } },
      ).title,
    ).toContain('۴۰');
  });

  it('a key is latin, lowercase, and yours alone', () => {
    for (const bad of ['A_bad', '1', 'with space', 'کلید'])
      expect(validateStep('what', { ...okDraft(), key: bad }, META).key).toBeTruthy();
  });
});

describe('wizard model: sentences and previews', () => {
  it('says in Persian what each trigger kind means', () => {
    const d = draftFromDetail(DETAIL);
    expect(triggerSentence(d, META)).toBe('بی‌فعالیتی کاربر: ۲ روز بدون فعالیت، ساعت 10:00');
    expect(
      triggerSentence({ ...emptyDraft(META), triggerKind: 'event', event: 'quiz.failed' }, META),
    ).toBe('اتفاق در اپلیکیشن: رد شدن در آزمون');
    expect(
      triggerSentence(
        {
          ...emptyDraft(META),
          triggerKind: 'event_delay',
          event: 'quiz.failed',
          delayMinutes: '120',
        },
        META,
      ),
    ).toContain('۲ ساعت بعد');
    expect(
      triggerSentence({ ...emptyDraft(META), triggerKind: 'schedule_weekly', weekday: '1' }, META),
    ).toContain('دوشنبه');
    expect(
      triggerSentence(
        {
          ...emptyDraft(META),
          triggerKind: 'condition',
          conditions: [{ field: 'progress', op: 'lte', value: '80' }],
        },
        META,
      ),
    ).toBe(
      'شرط وضعیتی روی کاربران: پیشرفت بیشترین آموزش فعال (٪) کمتر یا مساوی ۸۰، در پنجره پیش‌فرض',
    );
    expect(eventLabel(META, 'quiz.failed')).toBe('رد شدن در آزمون');
    expect(conditionLabel(META, 'progress')).toContain('پیشرفت');
    expect(opLabel('gte')).toBe('بیشتر یا مساوی');
    expect(AUDIENCE_TYPE_LABELS.team).toBe('یک تیم');
    expect(varLabel(META, 'name')).toBe('نام کوچک کاربر');
  });

  it('keeps an unfilled variable visible instead of hiding it', () => {
    const d = draftFromDetail(DETAIL);
    expect(previewOf(d, null)).toEqual({
      title: '⟨name⟩، ادامه بده',
      body: 'یک مرحله دیگر از «⟨title⟩» مانده است',
      missing: ['name', 'title'],
    });
    const filled = previewOf(d, { name: 'سارا' });
    expect(filled.title).toBe('سارا، ادامه بده');
    expect(filled.missing).toEqual(['title']);
  });

  it('summarises the delivery rules for the read-only half', () => {
    const rows = deliverySummary(draftFromDetail(DETAIL), META);
    expect(rows.find((r) => r.label === 'سردکردن هر کاربر')?.value).toBe('۲۴ ساعت');
    expect(rows.find((r) => r.label === 'سقف روزانه این قانون')?.value).toBe('بدون سقف روزانه');
    expect(rows.find((r) => r.label === 'مقصد')?.value).toBe('آموزش‌ها');
    expect(rows.find((r) => r.label === 'تصویر')?.value).toBe('بدون تصویر');
    expect(toFa(1234)).toBe('۱٬۲۳۴');
  });

  it('the four steps are the four questions an admin has to answer, in order', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['what', 'when', 'who', 'wording']);
  });
});

describe('wizard model: پیش‌نویسِ محلی', () => {
  it('writes what the form holds and reads it back', () => {
    const written = saveDraft({
      step: 'who',
      draft: { ...emptyDraft(null), key: 'x_note' },
      at: '2026-10-03T06:30:00.000Z',
    });
    expect(written).toMatchObject({ at: '2026-10-03T06:30:00.000Z', step: 'who' });
    const back = loadDraft();
    expect(back?.draft.key).toBe('x_note');
    expect(back?.step).toBe('who');
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('fills the gaps instead of trusting whatever is in there', () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ at: 'x', step: 'nope', draft: { key: 'k' } }),
    );
    const back = loadDraft();
    expect(back?.step).toBe('what');
    // Every field the current form expects is present, so an old/partial draft cannot `undefined` its way
    // into the wizard — and the one field it did store survives untouched.
    expect(Object.keys(back?.draft ?? {}).sort()).toEqual(Object.keys(emptyDraft(null)).sort());
    expect(back?.draft).toMatchObject({ key: 'k', title: emptyDraft(null).title });
    expect(draftStepLabel(back?.step ?? 'what')).toBe('چیست');
  });

  it('drops anything it does not recognise, rather than half-applying it', () => {
    for (const raw of [
      '',
      'not json',
      '[]',
      'null',
      '{"at":1}',
      '{"at":"x"}',
      '{"at":"x","draft":3}',
    ]) {
      localStorage.setItem(DRAFT_STORAGE_KEY, raw);
      expect(loadDraft()).toBeNull();
    }
  });
});

const RULE_META = {
  destinations: [
    { value: '/learn', label: 'آموزش‌ها' },
    { value: '/messages', label: 'پیام‌ها' },
  ],
  categories: [{ id: 'deadlines', label: 'مهلت و تکلیف', hint: '', protected: false }],
  variables: [],
  ruleFields: [
    { id: 'user.pointsBalance', label: 'امتیاز', kind: 'number', sweep: true, audience: true },
    { id: 'user.role', label: 'نقش', kind: 'text', sweep: true, audience: true },
  ],
  ruleOperators: [
    { id: 'gte', label: 'بزرگ‌تر یا برابر', kinds: ['number'], arity: 1 },
    { id: 'eq', label: 'مساوی', kinds: ['number', 'text', 'boolean', 'enum', 'date'], arity: 1 },
  ],
  ruleLimits: { maxNodes: 64, maxDepth: 6, maxLeaves: 48, maxChildren: 48, maxSteps: 8 },
  repeatLimits: { minIntervalFloorMs: 60_000, maxPerDay: 20, maxPerWeek: 100, maxPerMonth: 400 },
  stepLimits: { maxSteps: 8, minWaitMinutes: 1, maxWaitMinutes: 43_200, maxPolicyKeys: 8 },
} as unknown as CatalogMeta;

/** One leaf under the root `and`, in draft form — what the card holds before any conversion. */
const oneLeafTree = (): LogicDraft => ({
  ...emptyLogic({}),
  when: {
    type: 'group',
    op: 'and',
    children: [
      { type: 'leaf', field: 'user.pointsBalance', operator: 'gte', value: '10', value2: '' },
    ],
  },
});

describe('wizard model: بدنهٔ ساخت با منطق نسخهٔ ۲', () => {
  const d = {
    ...emptyDraft(RULE_META),
    key: 'x_new',
    name: 'قاعدهٔ دست‌ساز',
    description: 'توضیح',
  };

  it('a rule that carries a tree is created as version 2', () => {
    const body = createBody(d, oneLeafTree(), RULE_META) as Record<string, unknown>;
    expect(body).toMatchObject({
      key: 'x_new',
      enabled: false,
      schemaVersion: 2,
      when: {
        type: 'group',
        op: 'and',
        children: [{ type: 'leaf', field: 'user.pointsBalance', operator: 'gte', value: 10 }],
      },
    });
    // Absent parts are sent as null, so the server clears them rather than keeping an old document.
    expect(body.steps).toBeNull();
    expect((body.audience as Record<string, unknown>).filter).toBeNull();
  });

  it('an untouched card leaves the create body exactly as the v1 wizard built it', () => {
    const plain = createBody(d) as Record<string, unknown>;
    expect(createBody(d, emptyLogic({}), RULE_META)).toEqual(plain);
    expect(plain.schemaVersion).toBeUndefined();
    expect(plain.when).toBeUndefined();
  });

  it('a step added in the card is created with the rule, not patched in afterwards', () => {
    const tree: LogicDraft = {
      ...oneLeafTree(),
      steps: [{ ...emptyStep('notify', 'n1'), title: 'سلام', body: 'ادامه بده' }],
    };
    const body = createBody(d, tree, RULE_META) as { steps?: Array<Record<string, unknown>> };
    expect(body.steps?.[0]).toMatchObject({ type: 'notify', id: 'n1' });
    expect((body.steps?.[0]?.message as Record<string, unknown>)?.title).toBe('سلام');
  });
});

describe('wizard model: پیش‌نویسِ محلی با درخت', () => {
  it('keeps the tree with the form it was saved from', () => {
    const written = saveDraft({
      step: 'when',
      draft: { ...emptyDraft(null), key: 'x_note' },
      logic: oneLeafTree(),
      at: '2026-10-03T06:30:00.000Z',
    });
    expect(written?.logic.when.children).toHaveLength(1);
    const back = loadDraft();
    expect(back?.step).toBe('when');
    expect(back?.logic.when.children[0]).toMatchObject({
      field: 'user.pointsBalance',
      value: '10',
    });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('drops a stored tree that is no longer a tree, instead of rendering an empty one as saved', () => {
    const write = (logic: unknown) =>
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ at: '2026-10-03T06:30:00.000Z', step: 'when', draft: {}, logic }),
      );
    // A group without children, a leaf-shaped root, and a bare string are all refusals — none of them may
    // come back as «a rule with no conditions», which is the silent version of the bug.
    write({ when: { op: 'and' }, audience: { type: 'group', op: 'and', children: [] } });
    expect(loadDraft()?.logic.when.children).toEqual([]);
    write({ when: { type: 'leaf', field: 'user.pointsBalance' }, audience: {} });
    expect(loadDraft()?.logic.when.children).toEqual([]);
    write('nope');
    expect(loadDraft()?.logic.when.children).toEqual([]);
    clearDraft();
  });
});

describe('wizard model: خلاصهٔ گام‌های معلق', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    stepId: 'w1',
    stepIndex: 1,
    dueAt: '2026-10-04T06:00:00.000Z',
    createdAt: '2026-10-03T06:00:00.000Z',
    status: 'pending',
    ...over,
  });

  it('counts live rows and cancelled rows apart', () => {
    expect(
      pendingStepsSentence({
        items: [row(), row({ userId: 'u2', suppressed: true })],
        shards: 8,
        truncated: false,
        cancelledAt: null,
        note: '',
      }),
    ).toBe('در ۸ روزِ پیشِ رو ۱ گام در انتظار است · ۱ تای آن لغو شده‌اند');
  });

  it('says so when the listing hit its cap', () => {
    expect(
      pendingStepsSentence({
        items: [row()],
        shards: 3,
        truncated: true,
        cancelledAt: null,
        note: '',
      }),
    ).toContain('فهرست به سقف سطر رسیده');
  });
});
