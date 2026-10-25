import { describe, expect, it } from 'vitest';
import { buildXlsx } from '../src/lib/xlsx';

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

describe('buildXlsx', () => {
  it('produces a stored-ZIP xlsx with Persian content and two sheets', () => {
    const bytes = buildXlsx([
      {
        name: 'خلاصه بازاریاب‌ها',
        rows: [
          ['نام', 'امتیاز'],
          ['علی محمدی', 120],
          ['زهرا کریمی', 85],
        ],
      },
      { name: 'جزئیات', rows: [['آموزش'], ['معرفی محصول & برند <جدید>']] },
    ]);
    // ZIP local header + end-of-central-directory
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    const tail = bytes.subarray(bytes.length - 22);
    expect(new DataView(tail.buffer, tail.byteOffset).getUint32(0, true)).toBe(0x06054b50);
    const text = decode(bytes);
    expect(text).toContain('خلاصه بازاریاب‌ها');
    expect(text).toContain('علی محمدی');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('xl/worksheets/sheet2.xml');
    // XML escaping
    expect(text).toContain('&amp;');
    expect(text).toContain('&lt;جدید&gt;');
    // RTL sheet view for Persian readability
    expect(text).toContain('rightToLeft="1"');
  });

  it('handles empty sheets and null cells', () => {
    const bytes = buildXlsx([{ name: 'خالی', rows: [[null, undefined, '']] }]);
    expect(decode(bytes)).toContain('خالی');
  });
});
