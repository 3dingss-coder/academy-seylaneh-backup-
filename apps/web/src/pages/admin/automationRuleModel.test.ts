import { describe, expect, it } from 'vitest';
import {
  addChild,
  countLeaves,
  countNodes,
  depthOf,
  emptyLogic,
  emptyStep,
  fromExpr,
  logicToPatch,
  nestGroup,
  newGroup,
  policyFromExpr,
  policyToExpr,
  removeChild,
  setGroupOp,
  stepsFromExpr,
  stepsToExpr,
  toExpr,
  treeIsEmpty,
  updateTree,
  validateLogic,
  validatePolicy,
  validateStepsDraft,
  validateTree,
} from './automationRuleModel';
import type { CatalogMeta } from './automationWizardModel';
import type { LogicDraft, StepDraft } from './automationRuleModel';

/**
 * The draft model behind the v2 editors. These are the tests that make the panel claim honest: the tree
 * can be grown without a fixed count, values are typed before they are sent, and nothing is invented when
 * a human left a field blank.
 */

const FIELDS = [
  { id: 'user.pointsBalance', label: 'امتیاز', kind: 'number', sweep: true, audience: true },
  { id: 'user.role', label: 'نقش', kind: 'text', sweep: true, audience: true },
  { id: 'user.hasTeam', label: 'تیم دارد', kind: 'boolean', sweep: true, audience: true },
  { id: 'progressPct', label: 'پیشرفت', kind: 'number', sweep: true, audience: false },
  { id: 'mentorScoreAvg', label: 'میانگین منتور', kind: 'number', sweep: false, audience: false },
  {
    id: 'province',
    label: 'استان',
    kind: 'enum',
    sweep: true,
    audience: true,
    options: ['tehran', 'yazd'],
  },
] as unknown as NonNullable<CatalogMeta['ruleFields']>;

const META: CatalogMeta = {
  ruleFields: FIELDS,
  ruleOperators: [
    { id: 'gte', label: 'بزرگ‌تر یا برابر', kinds: ['number'], arity: 1 },
    { id: 'eq', label: 'مساوی', kinds: ['number', 'text', 'boolean', 'enum', 'date'], arity: 1 },
    { id: 'between', label: 'در بازه', kinds: ['number'], arity: 2 },
    { id: 'isEmpty', label: 'خالی است', kinds: ['text', 'presence'], arity: 0 },
  ],
  ruleLimits: { maxNodes: 8, maxDepth: 3, maxLeaves: 6, maxChildren: 6, maxSteps: 3 },
  repeatLimits: { minIntervalFloorMs: 60_000, maxPerDay: 20, maxPerWeek: 100, maxPerMonth: 400 },
  stepLimits: { maxSteps: 3, minWaitMinutes: 1, maxWaitMinutes: 43_200, maxPolicyKeys: 3 },
  stepDefs: [
    { type: 'notify', label: 'ارسال پیام', summary: '', fields: [] },
    { type: 'wait', label: 'صبر', summary: '', fields: [] },
    { type: 'stop', label: 'توقف', summary: '', fields: [] },
  ],
} as unknown as CatalogMeta;

const leaf = (field: string, operator: string, value: string) => ({
  type: 'leaf' as const,
  field,
  operator,
  value,
  value2: '',
});
describe('the tree draft', () => {
  it('grows past any old fixed count and reports the engine budget instead', () => {
    let root = newGroup('and');
    root = { ...root, children: [] };
    for (let i = 0; i < 12; i++) root = addChild(root, '', leaf('user.pointsBalance', 'gte', '10'));
    expect(countLeaves(root)).toBe(12);
    // The only ceiling is `ruleLimits`, and it is the evaluator's number, not a form's:
    const issues = validateTree(root, META, 'trigger');
    expect(issues.some((x) => x.message.includes('سقف'))).toBe(true);
    expect(issues.some((x) => x.message.includes('۶'))).toBe(true);
    // …and nothing here refuses merely because there are more than six conditions per se:
    const small = addChild(
      addChild({ type: 'group', op: 'and', children: [] }, '', leaf('user.role', 'eq', 'marketer')),
      '',
      leaf('user.hasTeam', 'eq', 'true'),
    );
    expect(validateTree(small, META, 'trigger')).toEqual([]);
  });

  it('addresses children by path, and removing one leaves the rest intact', () => {
    let root: ReturnType<typeof newGroup> = {
      type: 'group',
      op: 'and',
      children: [leaf('user.role', 'eq', 'marketer'), leaf('user.pointsBalance', 'gte', '5')],
    };
    root = updateTree(root, '1', (n) =>
      n.type === 'leaf' ? { ...n, value: '7' } : n,
    ) as typeof root;
    expect((root.children[1] as { value: string }).value).toBe('7');
    root = removeChild(root, '', 0);
    expect(root.children).toHaveLength(1);
    root = setGroupOp(root, '', 'or');
    expect(root.op).toBe('or');
  });

  it('nests a group and counts nodes and depth like the evaluator does', () => {
    let root: ReturnType<typeof newGroup> = {
      type: 'group',
      op: 'and',
      children: [leaf('user.role', 'eq', 'marketer')],
    };
    root = nestGroup(root, '') as typeof root;
    const nested = 1;
    // `newGroup` opens with one condition row, so nesting grows the leaf count — it is not an empty shell.
    expect(countLeaves(root)).toBe(2);
    const inner = root.children[nested];
    expect(inner?.type).toBe('group');
    root = updateTree(root, `${nested}`, (n) =>
      n.type === 'group' ? { ...n, children: [leaf('user.pointsBalance', 'gte', '1')] } : n,
    ) as typeof root;
    expect(countNodes(root)).toBe(4); // and[ leaf, or[ leaf ] ]
    expect(depthOf(root)).toBe(3);
  });

  it('converts values by the field kind, and refuses rather than guessing', () => {
    const fields = FIELDS as unknown as Parameters<typeof toExpr>[1];
    expect(toExpr(leaf('user.pointsBalance', 'gte', '45'), fields)).toEqual({
      type: 'leaf',
      field: 'user.pointsBalance',
      operator: 'gte',
      value: 45,
    });
    expect(toExpr(leaf('user.hasTeam', 'eq', 'true'), fields)).toMatchObject({ value: true });
    // Not a number ⇒ no expression ⇒ the card blocks the save instead of sending `NaN` or «0».
    expect(toExpr(leaf('user.pointsBalance', 'gte', 'زیاد'), fields)).toBeNull();
    expect(toExpr({ ...leaf('progressPct', 'between', '10'), value2: '۲۰' }, fields)).toMatchObject(
      {
        value: 10,
        value2: 20,
      },
    );
  });

  it('reads a stored tree back, so editing is not starting over', () => {
    const stored = {
      type: 'group',
      op: 'or',
      children: [
        { type: 'leaf', field: 'user.role', operator: 'eq', value: 'marketer' },
        {
          type: 'group',
          op: 'and',
          children: [{ type: 'leaf', field: 'user.pointsBalance', operator: 'gte', value: 3 }],
        },
      ],
    };
    const draft = fromExpr(stored);
    expect(draft.op).toBe('or');
    expect(draft.children).toHaveLength(2);
    expect(
      ((draft.children[1] as { children: unknown[] }).children[0] as { value: string }).value,
    ).toBe('3');
    expect(
      JSON.stringify(toExpr(draft, FIELDS as unknown as Parameters<typeof toExpr>[1])),
    ).toContain('"value":3');
  });

  it('only rejects what the engine also rejects: empty group, not-with-one-child, unknown ids, blank value', () => {
    expect(validateTree({ type: 'group', op: 'and', children: [] }, META, 'trigger')).toEqual([]);
    const issues = validateTree(
      {
        type: 'group',
        op: 'not',
        children: [leaf('user.role', 'eq', 'a'), leaf('user.role', 'eq', 'b')],
      },
      META,
      'trigger',
    );
    expect(issues[0]?.message).toContain('نات');
    expect(
      validateTree(
        { type: 'group', op: 'and', children: [leaf('ghost.field', 'eq', 'x')] },
        META,
        'trigger',
      )[0]?.message,
    ).toContain('رجیستری');
    expect(
      validateTree(
        { type: 'group', op: 'and', children: [leaf('user.pointsBalance', 'eq', '')] },
        META,
        'trigger',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('knows that an audience filter may not use every field, and a scheduled run not every fact', () => {
    expect(
      validateTree(
        { type: 'group', op: 'and', children: [leaf('progressPct', 'gte', '10')] },
        META,
        'audience',
      )[0]?.message,
    ).toContain('فیلتر مخاطب');
    expect(
      validateTree(
        { type: 'group', op: 'and', children: [leaf('mentorScoreAvg', 'gte', '10')] },
        META,
        'trigger',
        {
          scheduled: true,
        },
      )[0]?.message,
    ).toContain('زمان‌بندی‌شده');
    // the same field is fine on a path that does compute it
    expect(
      validateTree(
        { type: 'group', op: 'and', children: [leaf('mentorScoreAvg', 'gte', '10')] },
        META,
        'trigger',
      ),
    ).toEqual([]);
  });

  it('treats an untouched tree as no condition at all', () => {
    const empty = { type: 'group', op: 'and', children: [] };
    expect(treeIsEmpty(empty as never)).toBe(true);
    const draft = emptyLogic({});
    expect(logicToPatch({ ...draft, when: empty as never }, META).when).toBeNull();
    expect(logicToPatch({ ...draft, when: empty as never }, META).audienceFilter).toBeNull();
  });
});

describe('the repeat policy draft', () => {
  it('round-trips what the engine stores, keeping blanks and zeros apart', () => {
    const stored = {
      minIntervalMs: 90_000,
      perDay: 12,
      perWeek: 0,
      perMonth: 0,
      oncePerEventInstance: true,
      allowSameDayMultiple: true,
      onceInLivespan: false,
      perStep: { w1: { minIntervalMs: 120_000, maxPerDay: 3 } },
    };
    const draft = policyFromExpr(stored);
    expect(draft).toMatchObject({ on: true, minIntervalMinutes: '2', perDay: '12', perWeek: '' });
    expect(draft.perStep).toEqual([{ id: 'w1', minIntervalMinutes: '2', maxPerDay: '3' }]);
    expect(policyToExpr(draft)).toMatchObject({
      perDay: 12,
      perWeek: 0,
      perMonth: 0,
      oncePerEventInstance: true,
    });
    expect(policyToExpr(draft)?.perStep?.w1).toEqual({ minIntervalMs: 120_000, maxPerDay: 3 });
  });

  it('an off switch means «inherited», not «unlimited»', () => {
    expect(policyToExpr({ ...policyFromExpr(undefined), on: false })).toBeNull();
    expect(policyFromExpr(undefined).on).toBe(false);
  });

  it('refuses a policy that changes nothing and one that exceeds the technical ceiling', () => {
    expect(validatePolicy(policyFromExpr(undefined), META)).toEqual([]);
    expect(validatePolicy({ ...policyFromExpr(undefined), on: true }, META)[0]?.message).toContain(
      'هیچ عددی',
    );
    expect(
      validatePolicy({ ...policyFromExpr(undefined), on: true, perWeek: '5000' }, META)[0]?.message,
    ).toContain('۱۰۰');
    expect(validatePolicy({ ...policyFromExpr(undefined), on: true, perDay: '12' }, META)).toEqual(
      [],
    );
  });
});

describe('the workflow draft', () => {
  const step = (over: Partial<ReturnType<typeof emptyStep>> = {}) => ({
    ...emptyStep('notify', 'g1'),
    title: 'عنوان',
    body: 'متن',
    ...over,
  });

  it('keeps ids unique, forbids a trailing wait, and demands a reason and a condition for a stop', () => {
    expect(validateStepsDraft([step(), step({ id: 'g1' })], META).map((x) => x.message)).toEqual([
      expect.stringContaining('تکراری'),
    ]);
    expect(
      validateStepsDraft([step({ type: 'wait', id: 'w', minutes: '30' })], META)
        .map((x) => x.message)
        .join(' '),
    ).toContain('گام آخر');
    expect(
      validateStepsDraft([step({ type: 'stop', id: 's', reason: '' })], META)
        .map((x) => x.message)
        .join(' '),
    ).toContain('توقف باید');
    expect(
      validateStepsDraft(
        Array.from({ length: 4 }, (_, i) => step({ id: `g${i}` })),
        META,
      )[0]?.message,
    ).toContain('۳ گام');
  });

  it('waits with a real number of minutes, and keeps the wait’s own re-check', () => {
    const steps = [
      step({ id: 'a' }),
      {
        ...step({ type: 'wait', id: 'w', minutes: '90' }),
        useCond: true,
        cond: {
          type: 'group',
          op: 'and',
          children: [leaf('user.pointsBalance', 'gte', '5')],
        } as StepDraft['cond'],
      },
      step({ id: 'b', title: 'بعد' }),
    ];
    const out = stepsToExpr(steps, FIELDS as unknown as Parameters<typeof toExpr>[1]) as Array<
      Record<string, unknown>
    >;
    expect(out[1]).toMatchObject({ type: 'wait', id: 'w', minutes: 90 });
    expect(JSON.stringify(out[1]?.recheckWhen)).toContain('user.pointsBalance');
    expect(validateStepsDraft(steps, META)).toEqual([]);
  });

  it('reads a stored flow back into editable steps', () => {
    const stored = [
      { type: 'notify', id: 'a', message: { title: 'ت', body: 'ب', actionRef: '/messages' } },
      { type: 'wait', id: 'w', minutes: 45 },
    ];
    const draft = stepsFromExpr(stored);
    expect(draft).toHaveLength(2);
    expect(draft[1]).toMatchObject({ type: 'wait', minutes: '45', useCond: false });
    expect(draft[0]).toMatchObject({ title: 'ت', body: 'ب' });
  });
});

describe('one save, one verdict', () => {
  it('blocks the save on the worst problem and names the path it came from', () => {
    const draft = {
      ...emptyLogic({}),
      when: {
        type: 'group',
        op: 'and',
        children: [leaf('user.pointsBalance', 'gte', 'abc')],
      } as LogicDraft['when'],
      steps: [emptyStep('notify', 'g1')],
      policy: { ...policyFromExpr(undefined), on: true, perDay: '12' },
    };
    const issues = validateLogic(draft, META, { scheduled: false });
    expect(issues.map((x) => x.path)).toEqual([
      expect.stringContaining('0'),
      'steps.0.title',
      'steps.0.body',
    ]);
    const ok: LogicDraft = {
      ...draft,
      when: { type: 'group', op: 'and', children: [leaf('user.pointsBalance', 'gte', '4')] },
    };
    expect(validateLogic(ok, META).some((x) => x.path.startsWith('steps.0'))).toBe(true);
    // the step is what is missing here, not the tree
    expect(
      validateLogic(
        { ...ok, steps: [{ ...emptyStep('notify', 'g1'), title: 'عنوان', body: 'متن' }] },
        META,
      ),
    ).toEqual([]);
    expect(logicToPatch(ok, META).when).toMatchObject({ type: 'group', op: 'and' });
  });
});
