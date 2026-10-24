import type { ZodIssue } from 'zod';

/**
 * zod's own wording is English, and it used to reach the admin panel verbatim: a workflow step whose
 * `minutes` arrived as text answered «Expected number, received string» — a sentence about a library, not
 * about the rule being edited. The schemas themselves carry Persian for the checks a human is expected to
 * hit (`text(min, max, 'نام')`, the `HH:mm` regex, `validateSteps`' own answers, `validateRuleExpr`); this
 * module is the net under the rest, so no validation response can be English-only.
 *
 * One rule keeps it honest: a message that already contains Persian passes through untouched. Nothing here
 * overwrites a deliberate wording — it only fills the gaps nobody wrote, and it always says which field and
 * which bound, because «invalid input» is not an instruction.
 */
const HAS_FA = /[\u0600-\u06FF]/;

/** The extra properties zod puts on specific issue codes, read without narrowing the whole union. */
type LooseIssue = ZodIssue & {
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  exact?: boolean;
  type?: string;
  expected?: unknown;
  received?: unknown;
  keys?: (string | number)[];
  options?: unknown[];
  multipleOf?: number;
  unionErrors?: { issues: ZodIssue[] }[];
};

/**
 * The field the admin should look at. The response already carries the full dotted path in `field`, so the
 * message names the leaf (and a numeric segment — an array index — is not a name, hence the walk backwards).
 */
const labelOf = (path: (string | number)[]): string => {
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i];
    if (typeof seg === 'string' && seg) return seg;
  }
  return '';
};

const TYPE_WORD: Record<string, string> = {
  string: 'متن',
  number: 'عدد',
  integer: 'عدد صحیح',
  boolean: 'بله یا خیر',
  array: 'فهرست',
  object: 'یک شیء',
  date: 'تاریخ',
  nan: 'عدد',
  null: 'خالی',
  undefined: 'خالی',
};

const of = (n: number | bigint | undefined): string =>
  typeof n === 'bigint' ? n.toString() : n === undefined ? '—' : String(n);

const bounds = (l: string, i: LooseIssue, kind: 'min' | 'max'): string => {
  const n = kind === 'min' ? i.minimum : i.maximum;
  const type = i.type ?? '';
  if (i.exact === true)
    return type === 'string'
      ? `${l} باید دقیقاً ${of(n)} نویسه باشد.`
      : `${l} باید دقیقاً ${of(n)} مورد داشته باشد.`;
  if (type === 'string')
    return kind === 'min'
      ? Number(n) <= 1
        ? `${l} نباید خالی باشد.`
        : `${l} باید حداقل ${of(n)} نویسه باشد.`
      : `${l} حداکثر ${of(n)} نویسه است.`;
  if (type === 'array' || type === 'set')
    return kind === 'min'
      ? Number(n) <= 1
        ? `${l} نمی‌تواند خالی باشد.`
        : `${l} باید حداقل ${of(n)} مورد داشته باشد.`
      : `${l} حداکثر ${of(n)} مورد دارد.`;
  if (type === 'number' || type === 'int' || type === 'integer') {
    const incl = i.inclusive !== false;
    if (kind === 'min')
      return incl ? `${l} باید حداقل ${of(n)} باشد.` : `${l} باید بیشتر از ${of(n)} باشد.`;
    return incl ? `${l} باید حداکثر ${of(n)} باشد.` : `${l} باید کمتر از ${of(n)} باشد.`;
  }
  return kind === 'min'
    ? `${l} از کفِ مجاز (${of(n)}) پایین‌تر رفته است.`
    : `${l} از سقفِ مجاز (${of(n)}) بالاتر رفته است.`;
};

export function faIssueMessage(issue: ZodIssue): string {
  if (HAS_FA.test(issue.message)) return issue.message;
  const i = issue as LooseIssue;
  const label = labelOf(i.path);
  const l = label ? `«${label}»` : 'این مقدار';
  switch (i.code) {
    case 'invalid_type':
      if (i.received === 'undefined') return `${l} را وارد کنید.`;
      return TYPE_WORD[String(i.expected)]
        ? `${l} باید ${TYPE_WORD[String(i.expected)]} باشد.`
        : `${l} معتبر نیست.`;
    case 'invalid_literal':
      return `${l} باید «${String(i.expected)}» باشد.`;
    case 'invalid_enum_value':
      return `${l} نمی‌تواند «${String(i.received)}» باشد؛ مجاز: ${(i.options ?? [])
        .map((x) => String(x))
        .join('، ')}.`;
    case 'unrecognized_keys':
      return `${(i.keys ?? []).map((k) => `«${String(k)}»`).join(' و ')} در این درخواست جایی ندارد.`;
    case 'invalid_union': {
      // A discriminated choice usually fails because the value is not one of a few literals; that is the
      // one case where the sub-issues say something the admin can act on.
      const subs = (i.unionErrors ?? []).flatMap((e) => e.issues as LooseIssue[]);
      const literals = subs
        .filter((x) => x.code === 'invalid_literal')
        .map((x) => String(x.expected));
      return literals.length && literals.length === subs.length
        ? `${l} یکی از این‌ها باید باشد: ${literals.join('، ')}.`
        : `${l} با هیچ‌یک از شکل‌های مجاز نمی‌خواند.`;
    }
    case 'invalid_string':
      return `${l} قالبش را رعایت نکرده است.`;
    case 'not_multiple_of':
      return `${l} باید مضربِ ${of(i.multipleOf)} باشد.`;
    case 'not_finite':
      return `${l} باید عدد متناهی باشد.`;
    case 'invalid_date':
      return `${l} تاریخ معتبر نیست.`;
    case 'too_small':
      return bounds(l, i, 'min');
    case 'too_big':
      return bounds(l, i, 'max');
    default:
      return `${l} معتبر نیست.`;
  }
}

/** Every message of a failed parse, in Persian — the shape `parse()` turns into `details`. */
export const faIssueDetails = (issues: ZodIssue[]): Array<{ field: string; message: string }> =>
  issues.map((i) => ({ field: i.path.join('.'), message: faIssueMessage(i) }));
