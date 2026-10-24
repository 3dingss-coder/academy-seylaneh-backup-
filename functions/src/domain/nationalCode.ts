import { canonicalProvince } from './iranLocations';

/** Provinces where self-sign-up uses the national code instead of a mobile number. */
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

/** Whether a canonical Iranian province uses national-code sign-up. */
export function provinceUsesNationalCode(province: string): boolean {
  const canonical = canonicalProvince(province);
  return canonical !== null && NATIONAL_CODE_PROVINCE_SET.has(canonical);
}
