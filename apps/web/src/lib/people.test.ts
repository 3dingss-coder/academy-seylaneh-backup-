import { describe, expect, it } from 'vitest';
import { groupByPerson, personKey } from './people';

describe('personKey', () => {
  it('ignores Arabic letter variants, ZWNJ and extra spaces', () => {
    expect(personKey('علي  عدلي')).toBe(personKey('علی عدلی'));
    expect(personKey('می‌گیرم')).toBe(personKey('میگیرم'));
    expect(personKey(' Ali  Adli ')).toBe(personKey('ali adli'));
  });
  it('keeps different names apart', () => {
    expect(personKey('علی عدلی')).not.toBe(personKey('علی عدلی تست نهایی ۱'));
  });
});

describe('groupByPerson', () => {
  it('merges same-name accounts, listing each phone once', () => {
    const rows = [
      { n: 'علی عدلی', p: '09105647497' },
      { n: 'علی عدلی', p: '09105648752' },
      { n: 'علی  عدلی', p: '09105647497' },
      { n: 'سارا احمدی', p: '09120000004' },
    ];
    const g = groupByPerson(rows, (r) => ({ name: r.n, phone: r.p }));
    expect(g).toHaveLength(2);
    expect(g[0]?.phones).toEqual(['09105647497', '09105648752']);
    expect(g[0]?.rows).toHaveLength(3);
    expect(g[1]?.name).toBe('سارا احمدی');
  });
});
