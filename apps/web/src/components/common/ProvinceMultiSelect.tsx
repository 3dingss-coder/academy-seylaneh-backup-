import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { faNumber } from '@/lib/format';

/** The province directory lives with the 1547-city list (~30 kB) — lazy-load it like ResidencePicker. */
type IranLocations = typeof import('@/lib/iranLocations');
let locationsPromise: Promise<IranLocations> | null = null;
const loadLocations = (): Promise<IranLocations> =>
  (locationsPromise ??= import('@/lib/iranLocations'));

interface ProvinceMultiSelectProps {
  label?: string;
  value: string[];
  onChange: (provinces: string[]) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * «استان‌های تحت مدیریت» — multi-select of Iran's 31 provinces. Selected provinces stay pinned
 * as removable chips on top; the full list below is searchable toggle chips (same pattern as the
 * brand picker in the user dialog). Order always follows the directory, never click order.
 */
export function ProvinceMultiSelect({
  label = 'استان‌های تحت مدیریت',
  value,
  onChange,
  error,
  hint,
  disabled,
}: ProvinceMultiSelectProps) {
  const [locations, setLocations] = useState<IranLocations | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadLocations()
      .then((loaded) => alive && setLocations(loaded))
      .catch(() => alive && setLocations(null));
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => locations?.PROVINCE_NAMES ?? [], [locations]);
  const visible = useMemo(() => {
    if (!locations) return [];
    return locations.searchProvinces(query);
  }, [locations, query]);

  const toggle = (province: string) => {
    const next = value.includes(province)
      ? value.filter((name) => name !== province)
      : [...value, province];
    onChange(all.length ? all.filter((name) => next.includes(name)) : next);
  };
  const selectedOrdered = all.length ? all.filter((name) => value.includes(name)) : value;

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        {label}
        {value.length > 0 && (
          <span className="ms-2 text-xs font-bold text-primary-fg">
            {faNumber(value.length)} استان انتخاب شده
          </span>
        )}
      </legend>
      {selectedOrdered.length > 0 && (
        <ul aria-label="استان‌های انتخاب‌شده" className="flex flex-wrap gap-1.5">
          {selectedOrdered.map((province) => (
            <li key={province}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(province)}
                aria-label={`حذف ${province}`}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary bg-primary-light px-2.5 text-xs font-bold text-primary-fg"
              >
                <Check className="size-3.5" aria-hidden />
                {province}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        label="جست‌وجوی استان"
        hideLabel
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        icon={<Search className="size-4" aria-hidden />}
        placeholder="جست‌وجوی استان…"
        disabled={disabled}
      />
      {!locations ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner className="size-4" /> در حال بارگذاری فهرست استان‌ها…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-text-secondary">استانی با این نام پیدا نشد.</p>
      ) : (
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border p-2">
          {visible.map((province) => {
            const on = value.includes(province);
            return (
              <button
                key={province}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(province)}
                className={cn(
                  'min-h-10 rounded-full border px-3 text-sm',
                  on
                    ? 'border-primary bg-primary-light font-bold text-primary-fg'
                    : 'border-border text-text-secondary',
                )}
              >
                {province}
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-text-secondary">{hint}</p>
      ) : null}
    </fieldset>
  );
}
