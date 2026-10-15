import { describe, expect, it } from 'vitest';
import {
  isNationalCodeShape,
  NATIONAL_CODE_PROVINCES,
  normalizeNationalCode,
  provinceUsesNationalCode,
} from './nationalCode';

describe('national-code sign-up rules', () => {
  it('uses national code only for the 20 configured provinces', () => {
    expect(NATIONAL_CODE_PROVINCES).toEqual([
      'آذربایجان غربی',
      'البرز',
      'ایلام',
      'بوشهر',
      'چهارمحال و بختیاری',
      'خوزستان',
      'زنجان',
      'سمنان',
      'فارس',
      'قزوین',
      'قم',
      'کهگیلویه و بویراحمد',
      'گلستان',
      'گیلان',
      'لرستان',
      'مازندران',
      'مرکزی',
      'هرمزگان',
      'همدان',
      'یزد',
    ]);
    expect(provinceUsesNationalCode('یزد')).toBe(true);
    expect(provinceUsesNationalCode('آذربایجان غربی')).toBe(true);
    expect(provinceUsesNationalCode('تهران')).toBe(false);
    expect(provinceUsesNationalCode('خراسان رضوی')).toBe(false);
  });

  it('normalizes Persian and Arabic digits and checks the national-code checksum', () => {
    expect(normalizeNationalCode('۱۲۳۴۵۶۷۸۹۱')).toBe('1234567891');
    expect(normalizeNationalCode('١٢٣٤٥٦٧٨٩١')).toBe('1234567891');
    expect(normalizeNationalCode('1234567890')).toBeNull();
    expect(normalizeNationalCode('1111111111')).toBeNull();
    expect(isNationalCodeShape('۱۲۳۴۵۶۷۸۹۰')).toBe(true);
    expect(isNationalCodeShape('۰۹۱۲۱۲۳۴۵۶۷')).toBe(false);
  });
});
