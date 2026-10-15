import { toLatinDigits } from './digits';

/** Provinces where sign-up asks for national code instead of a mobile number. */
export const NATIONAL_CODE_PROVINCES = [
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
] as const;

const NATIONAL_CODE_PROVINCE_SET: ReadonlySet<string> = new Set(NATIONAL_CODE_PROVINCES);

export function provinceUsesNationalCode(province: string): boolean {
  return NATIONAL_CODE_PROVINCE_SET.has(province.trim());
}

/** Normalize Persian/Arabic digits and validate the Iranian 10-digit national-code checksum. */
export function normalizeNationalCode(input: string): string | null {
  const code = toLatinDigits(input.trim());
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return null;

  const sum = [...code.slice(0, 9)].reduce(
    (total, digit, index) => total + Number(digit) * (10 - index),
    0,
  );
  const remainder = sum % 11;
  const expectedCheckDigit = remainder < 2 ? remainder : 11 - remainder;
  return Number(code[9]) === expectedCheckDigit ? code : null;
}

/** Ten digits identify the national-code route; checksum validity is checked separately. */
export function isNationalCodeShape(input: string): boolean {
  return /^\d{10}$/.test(toLatinDigits(input.trim()));
}
