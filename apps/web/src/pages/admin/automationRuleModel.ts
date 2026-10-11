/**
 * The draft model behind the v2 logic editors (rule tree, audience filter, workflow steps, repeat policy).
 *
 * Why this lives outside the components: everything here is the part that can be wrong silently — path
 * addressing into a nested tree, converting a text input into a typed value, and deciding what a human
 * may still press «save» with. The components below only render these results. The server re-validates
 * all of it (`validateRuleExpr`, `validateSteps`, `validateRepeatPolicy`); a client-side refusal is a
 * courtesy, never the authority — which is why nothing here can *invent* a payload either.
 *
 * The draft keeps every number as a string. That is the panel's convention for editable numbers, and it
 * is what lets «۰ یعنی نامحدود» and «پر یعنی از قاعده ارث می‌رسد» be two different states.
 */

import type { CatalogMeta } from './automationWizardModel';

// ─── Wire shapes (mirrors of functions/src/domain/types.ts) ──────────────────

export type RuleExpr =
  | { type: 'group'; op: 'and' | 'or' | 'not'; children: RuleExpr[] }
  | {
      type: 'leaf';
      field: string;
      operator: string;
      value: string | number | boolean | null;
      value2?: string | number | boolean | null;
    };

export type StepExpr =
  | {
      type: 'notify';
      id: string;
      message: { title: string; body: string; actionRef: string; imageUrl?: string | null };
      channel?: 'any' | 'web' | 'android' | null;
      when?: RuleExpr | null;
    }
  | { type: 'wait'; id: string; minutes: number; recheckWhen?: RuleExpr | null }
  | { type: 'stop'; id: string; when: RuleExpr; reason: string };

export interface PolicyExpr {
  minIntervalMs: number;
  perDay: number;
  perWeek: number;
  perMonth: number;
  oncePerEventInstance: boolean;
  allowSameDayMultiple: boolean;
  onceInLivespan: boolean;
  respectQuietHoursAlways?: boolean;
  perStep?: Record<string, { minIntervalMs?: number; maxPerDay?: number }>;
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export interface LeafDraft {
  type: 'leaf';
  field: string;
  operator: string;
  value: string;
  value2: string;
}
export interface GroupDraft {
  type: 'group';
  op: 'and' | 'or' | 'not';
  children: NodeDraft[];
}
export type NodeDraft = LeafDraft | GroupDraft;

export interface StepDraft {
  id: string;
  type: 'notify' | 'wait' | 'stop';
  title: string;
  body: string;
  actionRef: string;
  channel: 'any' | 'web' | 'android' | '';
  minutes: string;
  reason: string;
  /** A nested tree per step: `when` for notify/stop, `recheckWhen` for a wait. */
  cond: GroupDraft;
  useCond: boolean;
}

export interface PolicyDraft {
  on: boolean;
  minIntervalMinutes: string;
  perDay: string;
  perWeek: string;
  perMonth: string;
  oncePerEventInstance: boolean;
  allowSameDayMultiple: boolean;
  onceInLivespan: boolean;
  respectQuietHoursAlways: boolean;
  /** Per-step overrides, keyed by step id; blank fields mean «the rule's own number». */
  perStep: Array<{ id: string; minIntervalMinutes: string; maxPerDay: string }>;
}

export interface LogicDraft {
  when: GroupDraft;
  audience: GroupDraft;
  steps: StepDraft[];
  policy: PolicyDraft;
}

export interface Issue {
  path: string;
  message: string;
}

// ─── Tree plumbing (path = dot-joined child indices) ─────────────────────────

export const newLeaf = (): LeafDraft => ({
  type: 'leaf',
  field: '',
  operator: '',
  value: '',
  value2: '',
});
export const newGroup = (op: 'and' | 'or' | 'not' = 'and'): GroupDraft => ({
  type: 'group',
  op,
  children: [newLeaf()],
});

const split = (path: string): string[] => (path === '' ? [] : path.split('.'));

export function nodeAt(root: GroupDraft, path: string): NodeDraft | GroupDraft {
  const parts = split(path);
  let cur: NodeDraft | GroupDraft = root;
  for (const p of parts) {
    if (cur.type !== 'group') return cur;
    cur = cur.children[Number(p)] as NodeDraft;
  }
  return cur;
}

function mapNode(
  node: NodeDraft | GroupDraft,
  parts: string[],
  fn: (n: NodeDraft) => NodeDraft,
): NodeDraft {
  if (!parts.length) return fn(node);
  if (node.type !== 'group') return node;
  const idx = Number(parts[0]);
  const children = node.children.slice();
  const child = children[idx];
  if (!child) return node;
  children[idx] = mapNode(child, parts.slice(1), fn);
  return { ...node, children };
}

export function updateTree(
  root: GroupDraft,
  path: string,
  fn: (n: NodeDraft) => NodeDraft,
): GroupDraft {
  return mapNode(root, split(path), fn) as GroupDraft;
}

export function addChild(root: GroupDraft, path: string, child: NodeDraft): GroupDraft {
  return updateTree(root, path, (n) =>
    n.type === 'group' ? { ...n, children: [...n.children, child] } : n,
  );
}
export function removeChild(root: GroupDraft, path: string, index: number): GroupDraft {
  return updateTree(root, path, (n) =>
    n.type === 'group' ? { ...n, children: n.children.filter((_, i) => i !== index) } : n,
  );
}
/**
 * Reorder one item inside a list (a group's children, or the steps array). `and`/`or` do not care about
 * order for the verdict, but the engine reports the *first* failing child — so this is the order of «چرا
 * رد شد», and in a flow it is the execution order itself. It exists because the alternative was deleting a
 * condition and typing it again.
 */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [x] = next.splice(index, 1);
  next.splice(to, 0, x as T);
  return next;
}

export function moveChild(
  root: GroupDraft,
  path: string,
  index: number,
  delta: -1 | 1,
): GroupDraft {
  return updateTree(root, path, (n) =>
    n.type === 'group' ? { ...n, children: moveItem(n.children, index, delta) } : n,
  );
}

export function setGroupOp(root: GroupDraft, path: string, op: 'and' | 'or' | 'not'): GroupDraft {
  return updateTree(root, path, (n) => (n.type === 'group' ? { ...n, op } : n));
}
/** «یک گروه تودرتو» — the whole point of v2, so the button has to exist and be cheap. */
export function nestGroup(root: GroupDraft, path: string): GroupDraft {
  return addChild(root, path, newGroup('or'));
}

export function countNodes(root: NodeDraft): number {
  if (root.type === 'leaf') return 1;
  return 1 + root.children.reduce((n, c) => n + countNodes(c), 0);
}
export function depthOf(root: NodeDraft): number {
  if (root.type === 'leaf') return 1;
  return 1 + Math.max(0, ...root.children.map(depthOf));
}
export const countLeaves = (root: NodeDraft): number =>
  root.type === 'leaf' ? 1 : root.children.reduce((n, c) => n + countLeaves(c), 0);

// ─── Draft ⇄ wire ───────────────────────────────────────────────────────────

export interface FieldMeta {
  id: string;
  label: string;
  kind: 'number' | 'text' | 'boolean' | 'enum' | 'date' | 'presence';
  sweep: boolean;
  audience: boolean;
  options?: unknown[];
}

/**
 * A Persian form receives Persian digits, and the panel prints numbers with a thousands separator. Both
 * must parse, or a perfectly valid «۱۲» becomes a blocked save.
 */
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const toLatinDigits = (s: string): string =>
  s.replace(/[۰-۹٠-٩]/g, (c) => String(FA.indexOf(c) >= 0 ? FA.indexOf(c) : AR.indexOf(c)));
const num = (s: string): number | null => {
  const t = toLatinDigits(s.trim()).replace(/[٬,\s]/g, '');
  if (t === '') return null;
  return Number.isFinite(Number(t)) ? Number(t) : null;
};

export function toExpr(draft: NodeDraft, fields: FieldMeta[]): RuleExpr | null {
  if (draft.type === 'leaf') {
    if (!draft.field || !draft.operator) return null;
    const kind = fields.find((f) => f.id === draft.field)?.kind ?? 'text';
    const raw = draft.value.trim();
    const second = draft.value2?.trim() ?? '';
    let value: string | number | boolean | null = raw;
    let value2: string | number | boolean | null = second;
    if (kind === 'number') {
      value = num(raw);
      value2 = num(second);
    } else if (kind === 'boolean') {
      value = raw === 'true';
      value2 = second === 'true';
    }
    // A number that does not parse (or a half-filled `between`) is no expression at all: the card blocks
    // the save instead of sending 0, NaN or a silently one-sided range.
    if (kind === 'number' && (value === null || (second !== '' && value2 === null))) return null;
    return {
      type: 'leaf',
      field: draft.field,
      operator: draft.operator,
      value,
      ...(second === '' ? {} : { value2 }),
    };
  }
  const children = draft.children.map((c) => toExpr(c, fields)).filter((x): x is RuleExpr => !!x);
  if (!children.length) return null;
  return { type: 'group', op: draft.op, children };
}

/** Only the `and`/`or` of ≥2 usable leaves is sent; an empty tree is `null` («no condition»), not a lie. */
export function treeIsEmpty(draft: GroupDraft): boolean {
  return countLeaves(draft) === 0;
}

export function fromExpr(expr: unknown): GroupDraft {
  const walk = (n: unknown): NodeDraft | null => {
    if (!n || typeof n !== 'object') return null;
    const x = n as Record<string, unknown>;
    if (x.type === 'leaf') {
      return {
        type: 'leaf',
        field: String(x.field ?? ''),
        operator: String(x.operator ?? ''),
        value: x.value === null || x.value === undefined ? '' : String(x.value),
        value2: x.value2 === null || x.value2 === undefined ? '' : String(x.value2),
      };
    }
    if (x.type === 'group') {
      return {
        type: 'group',
        op: (x.op === 'or' || x.op === 'not' ? x.op : 'and') as 'and' | 'or' | 'not',
        children: Array.isArray(x.children)
          ? (x.children.map(walk).filter(Boolean) as NodeDraft[])
          : [],
      };
    }
    return null;
  };
  const walked = walk(expr);
  return walked && walked.type === 'group' ? walked : { type: 'group', op: 'and', children: [] };
}

// ─── Validation (a courtesy; the server is the authority) ────────────────────

export function validateTree(
  root: GroupDraft,
  meta: CatalogMeta | null,
  scope: 'trigger' | 'audience',
  opts: { scheduled?: boolean } = {},
): Issue[] {
  const issues: Issue[] = [];
  const fields = meta?.ruleFields ?? [];
  const ops = meta?.ruleOperators ?? [];
  const limits = meta?.ruleLimits;
  if (treeIsEmpty(root)) return issues;
  if (limits) {
    if (countNodes(root) > limits.maxNodes)
      issues.push({
        path: 'when',
        message: `این درخت ${fa(countNodes(root))} گره دارد و سقف مجاز ${fa(limits.maxNodes)} است؛ ساده‌اش کنید.`,
      });
    if (depthOf(root) > limits.maxDepth)
      issues.push({
        path: 'when',
        message: `تودرتویی ${fa(depthOf(root))} سطح است و سقف ${fa(limits.maxDepth)} سطح.`,
      });
    if (countLeaves(root) > limits.maxLeaves)
      issues.push({
        path: 'when',
        message: `${fa(countLeaves(root))} شرط هست و سقف ${fa(limits.maxLeaves)} تا است.`,
      });
  }
  const walk = (node: NodeDraft | GroupDraft, path: string, depth: number): void => {
    if (node.type === 'group') {
      if (node.op === 'not' && node.children.length !== 1)
        issues.push({ path: `${path}`, message: '«نات» فقط یک فرزند می‌گیرد.' });
      if (node.children.length === 0)
        issues.push({
          path,
          message: 'یک گروه خالی هیچ معنایی ندارد؛ یا شرطی بگذارید یا گروه را بردارید.',
        });
      if (limits && node.children.length > limits.maxChildren)
        issues.push({ path, message: `هر گروه حداکثر ${fa(limits.maxChildren)} فرزند دارد.` });
      node.children.forEach((c, i) => walk(c, path === '' ? `${i}` : `${path}.${i}`, depth + 1));
      return;
    }
    if (!node.field) {
      issues.push({ path, message: 'فیلد این شرط انتخاب نشده است.' });
      return;
    }
    const f = fields.find((x) => x.id === node.field);
    if (!f) {
      issues.push({
        path,
        message: 'این فیلد در رجیستری نیست (شاید حذف شده باشد)؛ آن را تازه انتخاب کنید.',
      });
      return;
    }
    if (scope === 'audience' && !f.audience)
      issues.push({ path, message: `«${f.label}» برای فیلتر مخاطب ساخته نشده است.` });
    if (scope === 'trigger' && opts.scheduled && !f.sweep)
      issues.push({
        path,
        message: `«${f.label}» در اجرای زمان‌بندی‌شده محاسبه نمی‌شود؛ این شرط همیشه رد می‌شود.`,
      });
    if (!node.operator) {
      issues.push({ path, message: 'عملگر این شرط انتخاب نشده است.' });
      return;
    }
    const o = ops.find((x) => x.id === node.operator);
    if (!o) {
      issues.push({ path, message: 'این عملگر در رجیستری نیست.' });
      return;
    }
    if (!o.kinds.includes(f.kind))
      issues.push({
        path,
        message: `«${o.label}» با داده‌ی ${kindLabel(f.kind)} («${f.label}») معنی ندارد.`,
      });
    if (f.kind !== 'presence' && node.value.trim() === '')
      issues.push({ path, message: 'مقدار این شرط خالی است.' });
    if (f.kind === 'number' && node.value.trim() !== '' && num(node.value) === null)
      issues.push({ path, message: 'این فیلد عدد می‌خواهد.' });
    if (o.arity === 2 && num(node.value2) === null && f.kind === 'number')
      issues.push({ path, message: 'این عملگر دو مقدار می‌خواهد (مثلاً بازه).' });
    if (f.kind === 'enum' && f.options?.length && !f.options.some((v) => String(v) === node.value))
      issues.push({ path, message: 'مقدار باید یکی از گزینه‌های مجاز باشد.' });
  };
  // The root is a group like any other, so it goes through the same checks — otherwise the most common
  // shape in the panel (one flat `and`) is validated nowhere: its child count, its emptiness and a
  // `not` with two children would all be silently accepted by the client.
  walk(root, '', 0);
  return issues;
}

/** A scheduled trigger cannot pay for learning facts per user — the same rule the server enforces. */
const kindLabel = (k: FieldMeta['kind']): string =>
  ({
    number: 'عددی',
    text: 'متنی',
    boolean: 'بله/خیر',
    enum: 'انتخابی',
    date: 'تاریخ',
    presence: 'وجود/عدم‌وجود',
  })[k as FieldMeta['kind']] ?? k;

export const fa = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

// ─── Policy ──────────────────────────────────────────────────────────────────

export const emptyPolicy = (): PolicyDraft => ({
  on: false,
  minIntervalMinutes: '',
  perDay: '',
  perWeek: '',
  perMonth: '',
  oncePerEventInstance: false,
  allowSameDayMultiple: true,
  onceInLivespan: false,
  respectQuietHoursAlways: false,
  perStep: [],
});

export const policyFromExpr = (p: unknown): PolicyDraft => {
  if (!p || typeof p !== 'object') return emptyPolicy();
  const x = p as Record<string, unknown>;
  const mins = (ms: unknown): string =>
    typeof ms === 'number' && ms > 0 ? String(Math.round(ms / 60_000)) : '';
  const perStep = x.perStep as
    Record<string, { minIntervalMs?: number; maxPerDay?: number }> | undefined;
  return {
    on: true,
    minIntervalMinutes: mins(x.minIntervalMs),
    perDay: typeof x.perDay === 'number' && x.perDay > 0 ? String(x.perDay) : '',
    perWeek: typeof x.perWeek === 'number' && x.perWeek > 0 ? String(x.perWeek) : '',
    perMonth: typeof x.perMonth === 'number' && x.perMonth > 0 ? String(x.perMonth) : '',
    oncePerEventInstance: !!x.oncePerEventInstance,
    allowSameDayMultiple: x.allowSameDayMultiple !== false,
    onceInLivespan: !!x.onceInLivespan,
    respectQuietHoursAlways: !!x.respectQuietHoursAlways,
    perStep: Object.entries(perStep ?? {}).map(([id, v]) => ({
      id,
      minIntervalMinutes: mins(v?.minIntervalMs),
      maxPerDay: typeof v?.maxPerDay === 'number' ? String(v.maxPerDay) : '',
    })),
  };
};

export function validatePolicy(draft: PolicyDraft, meta: CatalogMeta | null): Issue[] {
  if (!draft.on) return [];
  const limits = meta?.repeatLimits;
  const issues: Issue[] = [];
  const check = (label: string, raw: string, max: number | undefined, field: string) => {
    if (raw.trim() === '') return;
    const v = num(raw);
    if (v === null || !Number.isInteger(v) || v < 0)
      issues.push({ path: field, message: `${label} باید عدد صحیح باشد.` });
    else if (max !== undefined && v > max)
      issues.push({ path: field, message: `${label} نباید از ${fa(max)} بیشتر باشد.` });
  };
  check('فاصله‌ی حداقل (دقیقه)', draft.minIntervalMinutes, undefined, 'minIntervalMinutes');
  if (draft.minIntervalMinutes.trim() !== '' && (num(draft.minIntervalMinutes) ?? 1) < 1)
    issues.push({
      path: 'minIntervalMinutes',
      message: 'کف فنی یک دقیقه است؛ صبرِ کمتر از آن را خودِ صف تضمین می‌کند.',
    });
  check('سقف روزانه', draft.perDay, limits?.maxPerDay, 'perDay');
  check('سقف هفتگی', draft.perWeek, limits?.maxPerWeek, 'perWeek');
  check('سقف ماهانه', draft.perMonth, limits?.maxPerMonth, 'perMonth');
  for (const s of draft.perStep) {
    check(`سقف روزانه‌ی گام «${s.id}»`, s.maxPerDay, limits?.maxPerDay, `perStep.${s.id}`);
  }
  const nothing =
    !draft.minIntervalMinutes.trim() &&
    !draft.perDay.trim() &&
    !draft.perWeek.trim() &&
    !draft.perMonth.trim() &&
    !draft.oncePerEventInstance &&
    !draft.onceInLivespan;
  if (nothing)
    issues.push({
      path: 'policy',
      message:
        'سیاستی که هیچ عددی ندارد فرقی با «به‌ارث‌رسیده» نمی‌کند؛ یا یک سقف/فاصله بگذارید یا این گزینه را خاموش کنید.',
    });
  return issues;
}

export function policyToExpr(draft: PolicyDraft): PolicyExpr | null {
  if (!draft.on) return null;
  const zero = (s: string) => (s.trim() === '' ? 0 : (num(s) ?? 0));
  return {
    minIntervalMs: Math.max(60_000, (num(draft.minIntervalMinutes) ?? 1) * 60_000),
    perDay: zero(draft.perDay),
    perWeek: zero(draft.perWeek),
    perMonth: zero(draft.perMonth),
    oncePerEventInstance: draft.oncePerEventInstance,
    allowSameDayMultiple: draft.allowSameDayMultiple,
    onceInLivespan: draft.onceInLivespan,
    respectQuietHoursAlways: draft.respectQuietHoursAlways,
    ...(draft.perStep.length
      ? {
          perStep: Object.fromEntries(
            draft.perStep.map((s) => [
              s.id,
              {
                ...(s.minIntervalMinutes.trim()
                  ? { minIntervalMs: (num(s.minIntervalMinutes) ?? 0) * 60_000 }
                  : {}),
                ...(s.maxPerDay.trim() ? { maxPerDay: num(s.maxPerDay) ?? 0 } : {}),
              },
            ]),
          ),
        }
      : {}),
  };
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export const emptyStep = (type: StepDraft['type'], id: string): StepDraft => ({
  id,
  type,
  title: '',
  body: '',
  actionRef: '/messages',
  channel: '',
  minutes: '60',
  reason: '',
  cond: { type: 'group', op: 'and', children: [] },
  useCond: false,
});

export const stepsFromExpr = (steps: unknown): StepDraft[] => {
  if (!Array.isArray(steps)) return [];
  return steps.map((raw) => {
    const s = raw as Record<string, unknown>;
    const msg = (s.message ?? {}) as Record<string, unknown>;
    return {
      id: String(s.id ?? ''),
      type: (s.type === 'wait'
        ? 'wait'
        : s.type === 'stop'
          ? 'stop'
          : 'notify') as StepDraft['type'],
      title: String(msg.title ?? ''),
      body: String(msg.body ?? ''),
      actionRef: String(msg.actionRef ?? '/messages'),
      channel: (s.channel ? String(s.channel) : '') as StepDraft['channel'],
      minutes: typeof s.minutes === 'number' ? String(s.minutes) : '60',
      reason: String(s.reason ?? ''),
      cond: fromExpr(s.when ?? s.recheckWhen ?? null),
      useCond: !!(s.when || s.recheckWhen),
    };
  });
};

/** A placeholder so the type stays honest; validation blocks the save before this could ever be sent. */
const EMPTY_STOP: RuleExpr = {
  type: 'leaf',
  field: 'user.status',
  operator: 'eq',
  value: 'active',
};

export function stepsToExpr(steps: StepDraft[], fields: FieldMeta[]): StepExpr[] {
  return steps.map((s) => {
    const cond = s.useCond && !treeIsEmpty(s.cond) ? toExpr(s.cond, fields) : null;
    if (s.type === 'wait')
      return {
        type: 'wait',
        id: s.id,
        minutes: num(s.minutes) ?? 1,
        ...(cond ? { recheckWhen: cond } : {}),
      };
    if (s.type === 'stop')
      return {
        type: 'stop',
        id: s.id,
        reason: s.reason.trim(),
        when: (cond as RuleExpr) ?? EMPTY_STOP,
      };
    return {
      type: 'notify',
      id: s.id,
      message: {
        title: s.title.trim(),
        body: s.body.trim(),
        actionRef: s.actionRef.trim(),
        imageUrl: null,
      },
      ...(s.channel ? { channel: s.channel } : {}),
      ...(cond ? { when: cond } : {}),
    };
  });
}

export function validateStepsDraft(
  steps: StepDraft[],
  meta: CatalogMeta | null,
  opts: { scheduled?: boolean } = {},
): Issue[] {
  const issues: Issue[] = [];
  if (!steps.length) return issues;
  const limits = meta?.stepLimits;
  const max = limits?.maxSteps ?? 8;
  if (steps.length > max)
    issues.push({
      path: 'steps',
      message: `حداکثر ${fa(max)} گام برای هر قاعده (بودجه‌ی اجرای Worker).`,
    });
  const seen = new Set<string>();
  steps.forEach((s, i) => {
    if (!s.id.trim()) issues.push({ path: `steps.${i}`, message: 'هر گام یک شناسه می‌خواهد.' });
    else if (seen.has(s.id))
      issues.push({ path: `steps.${i}`, message: `شناسه «${s.id}» تکراری است.` });
    seen.add(s.id);
    if (s.type === 'notify') {
      if (s.title.trim().length < 2)
        issues.push({ path: `steps.${i}.title`, message: 'عنوان کوتاه است.' });
      if (s.body.trim().length < 2)
        issues.push({ path: `steps.${i}.body`, message: 'متن کوتاه است.' });
    } else if (s.type === 'wait') {
      const m = num(s.minutes);
      const min = limits?.minWaitMinutes ?? 1;
      const maxW = limits?.maxWaitMinutes ?? 43_200;
      if (m === null || m < min || m > maxW)
        issues.push({
          path: `steps.${i}.minutes`,
          message: `صبر باید بین ${fa(min)} تا ${fa(maxW)} دقیقه باشد.`,
        });
    } else {
      if (s.reason.trim().length < 2)
        issues.push({ path: `steps.${i}.reason`, message: 'توقف باید دلیلی برای لاگ داشته باشد.' });
      if (!s.useCond || treeIsEmpty(s.cond))
        issues.push({
          path: `steps.${i}.cond`,
          message: '«توقف» بی‌شرط یعنی قاعده‌ای که هرگز تمام می‌شود؛ یک شرط بگذارید.',
        });
    }
    if (s.useCond) {
      for (const issue of validateTree(s.cond, meta, 'trigger', opts))
        issues.push({ path: `steps.${i}.${issue.path}`, message: issue.message });
    }
  });
  const last = steps[steps.length - 1];
  if (last?.type === 'wait')
    issues.push({ path: `steps.${steps.length - 1}`, message: 'گام آخر نمی‌تواند «صبر» باشد.' });
  return issues;
}

// ─── One entry point for the card ───────────────────────────────────────────

export const emptyLogic = (det: {
  when?: unknown;
  audience?: unknown;
  steps?: unknown;
  repeatPolicy?: unknown;
}): LogicDraft => ({
  when: fromExpr(det.when ?? null),
  audience: fromExpr((det.audience as { filter?: unknown } | undefined)?.filter ?? null),
  steps: stepsFromExpr(det.steps ?? null),
  policy: policyFromExpr(det.repeatPolicy ?? null),
});

export interface LogicPatch {
  when: RuleExpr | null;
  audienceFilter: RuleExpr | null;
  steps: StepExpr[] | null;
  repeatPolicy: PolicyExpr | null;
}

export function logicToPatch(draft: LogicDraft, meta: CatalogMeta | null): LogicPatch {
  const fields = (meta?.ruleFields ?? []) as FieldMeta[];
  return {
    when: treeIsEmpty(draft.when) ? null : (toExpr(draft.when, fields) as RuleExpr),
    audienceFilter: treeIsEmpty(draft.audience)
      ? null
      : (toExpr(draft.audience, fields) as RuleExpr),
    steps: draft.steps.length ? stepsToExpr(draft.steps, fields) : null,
    repeatPolicy: policyToExpr(draft.policy),
  };
}

export function validateLogic(
  draft: LogicDraft,
  meta: CatalogMeta | null,
  opts: { scheduled?: boolean } = {},
): Issue[] {
  return [
    ...validateTree(draft.when, meta, 'trigger', opts),
    ...validateTree(draft.audience, meta, 'audience'),
    ...validateStepsDraft(draft.steps, meta, opts),
    ...validatePolicy(draft.policy, meta),
  ];
}
