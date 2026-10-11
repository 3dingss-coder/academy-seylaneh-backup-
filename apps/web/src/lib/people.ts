/**
 * Unique people in lists. Several accounts (phone numbers) can carry the same name, e.g. one
 * person who signed up with two numbers. Lists show such a person once, with the numbers in small
 * type under the name, so «علی عدلی» is never repeated five times.
 */

/** Name key: Arabic/Persian letter variants, ZWNJ, tatweel, case and spacing are ignored. */
export function personKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u064A\u0649]/g, '\u06CC') // ي ى → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/[\u200C\u200B\u0640]/g, '') // ZWNJ, zero-width space, tatweel
    .replace(/[\u064B-\u065F\u0670]/g, '') // harakat
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface PersonGroup<T> {
  key: string;
  name: string;
  /** The first row of this person (a group always has at least one). */
  first: T;
  /** Distinct phone numbers (or emails) in first-seen order. */
  phones: string[];
  rows: T[];
}

/** Groups rows by person, keeping the order in which each person first appears. */
export function groupByPerson<T>(
  rows: T[],
  get: (r: T) => { name: string; phone?: string | null },
): Array<PersonGroup<T>> {
  const map = new Map<string, PersonGroup<T>>();
  for (const r of rows) {
    const { name, phone } = get(r);
    const key = personKey(name) || name;
    let g = map.get(key);
    if (!g) {
      g = { key, name: name.trim(), first: r, phones: [], rows: [] };
      map.set(key, g);
    }
    g.rows.push(r);
    if (phone && !g.phones.includes(phone)) g.phones.push(phone);
  }
  return [...map.values()];
}
