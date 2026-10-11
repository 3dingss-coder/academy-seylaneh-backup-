/**
 * The step registry (§2.2 and §3 of the rule-engine plan).
 *
 * A workflow is a list of steps, and a step is one of three *effects*: send a message, wait, stop.
 * This module owns everything about them except the running: what they are called in Persian, which
 * fields they take, what a legal one looks like, and how to say what one does in one sentence. The
 * engine asks this registry before it accepts a rule and before it shows a rule to a human; it never
 * hard-codes a scenario.
 *
 * Why validation lives here and not in the caller: a rule that stores `wait: { minutes: 1e9 }` would be
 * a queue row that is never due, and a `stop` with no condition would be a rule that silently never
 * finishes. Both are storable JSON and both must be refused at the door, in Persian, with a path.
 */

import type { AutomationStep, PushAutomation, RuleExpr } from '../../domain/types';
import { validateRuleExpr, type ValidationIssue } from './expr';

export const STEP_LIMITS = {
  /** A flow longer than this is a schedule, not a workflow — and it would blow the run budget. */
  maxSteps: 8,
  /** Floor of one minute: a `wait: 0` is a retry loop with a queue row. */
  minWaitMinutes: 1,
  /** Thirty days: beyond that, the rule should be a scheduled rule with its own window. */
  maxWaitMinutes: 30 * 24 * 60,
  /** How many step ids one rule may reference in `repeatPolicy.perStep`. */
  maxPolicyKeys: 8,
} as const;

export interface StepIssue {
  path: string;
  message: string;
}

/** What the panel may offer. A step type absent from here cannot be saved, whatever a client sends. */
export interface StepDef {
  type: AutomationStep['type'];
  label: string;
  /** One Persian sentence for the read-only definition page. */
  summary: string;
  /** Fields the panel has to render for this type — metadata only, never a React component. */
  fields: Array<{ name: string; kind: 'text' | 'number' | 'condition' | 'enum'; label: string }>;
}

const STEP_DEFS: StepDef[] = [
  {
    type: 'notify',
    label: 'ارسال پیام',
    summary:
      'یک پیام (یا همان پیام قاعده) به همین کاربر؛ سقف‌ها و ترجیح خودش برای همین گام هم سنجیده می‌شود.',
    fields: [
      { name: 'message.title', kind: 'text', label: 'عنوان' },
      { name: 'message.body', kind: 'text', label: 'متن' },
      { name: 'channel', kind: 'enum', label: 'کانال' },
      { name: 'when', kind: 'condition', label: 'فقط اگر' },
    ],
  },
  {
    type: 'wait',
    label: 'صبر',
    summary:
      'یک سطر در صف می‌نشیند و ادامه‌ی گردش‌کار در اجرای بعدی موتور اجرا می‌شود؛ در آن لحظه شرط‌ها دوباره خوانده می‌شوند.',
    fields: [{ name: 'minutes', kind: 'number', label: 'دقیقه' }],
  },
  {
    type: 'stop',
    label: 'توقف',
    summary: 'اگر شرطش برقرار باشد گردش‌کار همین‌جا تمام می‌شود و دلیلش در لاگ می‌نشیند.',
    fields: [
      { name: 'when', kind: 'condition', label: 'اگر' },
      { name: 'reason', kind: 'text', label: 'دلیل (برای لاگ و پنل)' },
    ],
  },
];

export function stepDefs(): StepDef[] {
  return STEP_DEFS;
}

export function stepDefFor(type: string): StepDef | undefined {
  return STEP_DEFS.find((s) => s.type === type);
}

/** The only structural facts the rest of the system needs about a step list. */
export function hasFlow(a: Pick<PushAutomation, 'steps'>): boolean {
  return Array.isArray(a.steps) && a.steps.length > 0;
}

/**
 * Whether a rule must go through the flow runner instead of the plain single send.
 *
 * `steps: [notify without condition]` is *exactly* what a v1 rule already does, so it is deliberately left
 * on the old path: its claim key, its counter buckets and its provider throttle stay untouched. Only a
 * flow that can branch, wait or send twice needs the runner — and therefore only such a rule gets the
 * step-scoped claim buckets. That is what keeps «migrated rules keep their behaviour» true even after a
 * marketer adds one step and removes it again.
 */
export function needsFlowEngine(a: Pick<PushAutomation, 'steps'>): boolean {
  if (!hasFlow(a)) return false;
  const steps = a.steps as AutomationStep[];
  if (steps.length > 1) return true;
  const only = steps[0] as AutomationStep;
  return only.type !== 'notify' || !!only.when || !!only.channel;
}

/**
 * Keys of `repeatPolicy.perStep` that no step declares. A typo there is a policy that never runs, which
 * is worse than a validation error at save time — and it is invisible in the panel, because the cadence
 * still looks right. (The reverse case cannot happen: `perStep` lives inside `repeatPolicy`, so a rule
 * without a policy cannot smuggle step caps in.)
 */
export function unknownStepPolicyKeys(a: Pick<PushAutomation, 'steps' | 'repeatPolicy'>): string[] {
  const perStep = a.repeatPolicy?.perStep;
  if (!perStep) return [];
  const known = new Set(stepIds(a.steps));
  return Object.keys(perStep).filter((k) => !known.has(k));
}

/** Every number a marketer reads is Persian (۱۲، not 12) — the same rule the sender follows. */
const faNum = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

const CHANNELS = new Set(['any', 'web', 'android']);

/**
 * Validate a whole flow. `scope` is passed to the condition validator so a step condition is checked
 * with the same data-availability rules as the rule's own `when` (a `learning` field that cannot be
 * loaded in a scheduled sweep must not be savable inside a step either).
 */
export function validateSteps(
  steps: unknown,
  opts: { scope?: 'trigger' | 'audience'; now?: Date } = {},
): StepIssue[] {
  const issues: StepIssue[] = [];
  if (steps === null || steps === undefined) return issues;
  if (!Array.isArray(steps)) {
    return [{ path: 'steps', message: 'گام‌ها باید یک فهرست باشند.' }];
  }
  if (steps.length > STEP_LIMITS.maxSteps) {
    issues.push({
      path: 'steps',
      message: `حداکثر ${STEP_LIMITS.maxSteps} گام برای هر قاعده (بودجه‌ی اجرای Worker).`,
    });
  }
  const seen = new Set<string>();
  steps.forEach((raw, i) => {
    const at = `steps[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      issues.push({ path: at, message: 'هر گام یک شیء است.' });
      return;
    }
    const step = raw as Record<string, unknown>;
    const id = typeof step.id === 'string' ? step.id.trim() : '';
    if (!id) issues.push({ path: `${at}.id`, message: 'هر گام یک شناسه یکتا می‌خواهد.' });
    else if (seen.has(id)) issues.push({ path: `${at}.id`, message: `شناسه «${id}» تکراری است.` });
    else seen.add(id);

    const type = step.type;
    if (!stepDefFor(String(type))) {
      issues.push({
        path: `${at}.type`,
        message: `گام ناشناخته «${String(type)}». مجاز: ${STEP_DEFS.map((s) => s.type).join('، ')}.`,
      });
      return;
    }
    if (type === 'notify') {
      const msg = step.message as
        { title?: unknown; body?: unknown; actionRef?: unknown; imageUrl?: unknown } | undefined;
      if (!msg || typeof msg !== 'object') {
        issues.push({ path: `${at}.message`, message: 'گام «ارسال پیام» عنوان و متن می‌خواهد.' });
      } else {
        if (typeof msg.title !== 'string' || !msg.title.trim())
          issues.push({ path: `${at}.message.title`, message: 'عنوان خالی نمی‌تواند ارسال شود.' });
        if (typeof msg.body !== 'string' || !msg.body.trim())
          issues.push({ path: `${at}.message.body`, message: 'متن خالی نمی‌تواند ارسال شود.' });
      }
      if (
        step.channel !== null &&
        step.channel !== undefined &&
        !CHANNELS.has(String(step.channel))
      )
        issues.push({
          path: `${at}.channel`,
          message: 'کانال باید any، web یا android باشد.',
        });
      issues.push(...exprIssues(step.when, `${at}.when`, opts.scope));
    } else if (type === 'wait') {
      const m = step.minutes;
      if (typeof m !== 'number' || !Number.isFinite(m) || !Number.isInteger(m))
        issues.push({ path: `${at}.minutes`, message: 'صبر باید عدد دقیق دقیقه باشد.' });
      else if (m < STEP_LIMITS.minWaitMinutes || m > STEP_LIMITS.maxWaitMinutes)
        issues.push({
          path: `${at}.minutes`,
          message: `صبر باید بین ${STEP_LIMITS.minWaitMinutes} تا ${STEP_LIMITS.maxWaitMinutes} دقیقه باشد (۳۰ روز).`,
        });
      issues.push(...exprIssues(step.recheckWhen, `${at}.recheckWhen`, opts.scope));
    } else if (type === 'stop') {
      const r = step.reason;
      if (typeof r !== 'string' || !r.trim())
        issues.push({
          path: `${at}.reason`,
          message: 'توقف باید دلیلی داشته باشد که در لاگ و پنل خوانده شود.',
        });
      else if (r.length > 200)
        issues.push({ path: `${at}.reason`, message: 'دلیل کوتاه‌تر شود (۲۰۰ نویسه).' });
      const cond = exprIssues(step.when, `${at}.when`, opts.scope);
      if (!step.when)
        issues.push({
          path: `${at}.when`,
          message:
            'گام «توقف» بی‌شرط یعنی قاعده‌ای که هیچ‌وقت تمام نمی‌شود؛ یک `stop` بدون شرط را با حذف گام‌های بعدی بسازید.',
        });
      issues.push(...cond);
    }
  });

  const list = steps as AutomationStep[];
  const last = list[list.length - 1];
  if (last && last.type === 'wait')
    issues.push({
      path: `steps[${list.length - 1}]`,
      message: 'گام آخر نمی‌تواند «صبر» باشد: بعدش کاری نیست که صبرش منطقی باشد.',
    });
  return issues;
}

function exprIssues(
  expr: unknown,
  path: string,
  scope: 'trigger' | 'audience' | undefined,
): StepIssue[] {
  if (expr === null || expr === undefined) return [];
  const res = validateRuleExpr(expr as RuleExpr, { scope: scope ?? 'trigger', path });
  return res.issues.map((x: ValidationIssue) => ({ path: x.path, message: x.message }));
}

/** «۳ گام: ارسال پیام → صبر ۶۰ دقیقه → ارسال پیام» — the sentence the read-only card shows. */
export function describeSteps(steps: AutomationStep[] | null | undefined): string | null {
  if (!Array.isArray(steps) || !steps.length) return null;
  const parts = steps.map((s) => {
    if (s.type === 'wait') return `صبر ${faNum(s.minutes)} دقیقه`;
    if (s.type === 'stop') return `توقف (${s.reason})`;
    return `ارسال «${s.message.title}»`;
  });
  return `${faNum(steps.length)} گام: ${parts.join(' ← ')}`;
}

/** A step's own condition, evaluated the same way the rule's `when` is (fail-closed, with a trace). */
export function stepLabel(step: AutomationStep): string {
  const def = stepDefFor(step.type);
  return `${def?.label ?? step.type} · ${step.id}`;
}

/** Every id a `repeatPolicy.perStep` may legitimately mention. */
export function stepIds(steps: AutomationStep[] | null | undefined): string[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s) => s.id).filter(Boolean);
}
