import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, PackageCardSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState, StaleBanner } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Mascot } from '@/components/brand/Mascot';
import { PackageCard } from '@/components/learning/PackageCard';
import { cn } from '@/lib/cn';
import { clearSubject, rememberSubject } from '@/lib/pageContext';
import { usePackages } from '@/lib/queries';

type LearnFilter = 'all' | 'in_progress' | 'completed';

const FILTERS: Array<{ value: LearnFilter; label: string }> = [
  { value: 'all', label: 'همه' },
  { value: 'in_progress', label: 'در حال یادگیری' },
  { value: 'completed', label: 'تکمیل‌شده' },
];

const EMPTY: Record<LearnFilter, string> = {
  all: 'هنوز آموزشی به تو اختصاص داده نشده.',
  in_progress: 'چیزی برای ادامه نداری.',
  completed: 'هنوز آموزشی را تمام نکرده‌ای.',
};

/** M4 — آموزش‌ها: all / in-progress / completed filters and real assigned packages. */
export function LearnPage() {
  const q = usePackages();
  const [params, setParams] = useSearchParams();
  const brand = params.get('brand');
  const setBrand = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('brand', id);
    else next.delete('brand');
    setParams(next, { replace: true });
    if (!id) clearSubject();
  };
  const [tab, setTab] = useState<LearnFilter>('all');
  const counts = useMemo(() => {
    const c: Record<LearnFilter, number> = { all: 0, in_progress: 0, completed: 0 };
    for (const p of q.data ?? []) {
      c.all++;
      if (p.status === 'in_progress') c.in_progress++;
      if (p.status === 'completed') c.completed++;
    }
    return c;
  }, [q.data]);
  const brands = useMemo(() => {
    const m = new Map<string, { id: string; name: string; logoUrl: string }>();
    for (const p of q.data ?? []) if (p.brand) m.set(p.brand.id, p.brand);
    return [...m.values()];
  }, [q.data]);
  useEffect(() => {
    const id = brand ?? (brands.length === 1 ? brands[0]?.id : null);
    if (!id) return;
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    rememberSubject({
      kind: 'brand',
      brandId: b.id,
      brandName: b.name,
      productId: null,
      productName: null,
      packageId: null,
      packageTitle: null,
      sectionId: null,
      sectionTitle: null,
      activityLine: `صفحه برند «${b.name}» را باز کرد`,
    });
  }, [brand, brands]);

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-6">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
        <PageHeader title="آموزش‌ها" />

        <section
          aria-label="فیلتر آموزش‌ها"
          className="rounded-hero border border-marketer-border bg-marketer-surface p-3 shadow-sm sm:p-4"
        >
          <div
            role="group"
            aria-label="وضعیت آموزش‌ها"
            className="grid grid-cols-3 gap-1.5 rounded-card bg-marketer-surface-muted p-1.5 sm:gap-2"
          >
            {FILTERS.map(({ value, label }) => {
              const selected = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTab(value)}
                  className={cn(
                    'pressable flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-full px-1.5 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketer-brand sm:gap-1.5 sm:px-2 sm:text-sm',
                    selected
                      ? 'bg-cta text-on-cta shadow-sm'
                      : 'text-marketer-muted hover:bg-marketer-surface hover:text-marketer-ink',
                  )}
                >
                  <span className="truncate">{label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none sm:text-xs',
                      selected
                        ? 'bg-marketer-surface text-marketer-brand'
                        : 'bg-marketer-surface text-marketer-muted',
                    )}
                  >
                    {counts[value].toLocaleString('fa-IR')}
                  </span>
                </button>
              );
            })}
          </div>

          {brands.length > 1 && (
            <div className="mt-4 border-t border-marketer-border pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-marketer-ink">برندها</p>
                {brand && (
                  <button
                    type="button"
                    onClick={() => setBrand(null)}
                    className="min-h-12 rounded-full px-3 text-xs font-bold text-marketer-brand hover:bg-marketer-brand-soft"
                  >
                    نمایش همه
                  </button>
                )}
              </div>
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                role="group"
                aria-label="فیلتر برند"
              >
                {brands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={brand === b.id}
                    onClick={() => setBrand(brand === b.id ? null : b.id)}
                    className={cn(
                      'pressable flex min-h-14 shrink-0 items-center gap-2 rounded-full border px-2 pe-4 text-sm font-bold transition-colors',
                      brand === b.id
                        ? 'border-marketer-brand bg-marketer-brand-soft text-marketer-brand shadow-sm'
                        : 'border-marketer-border bg-marketer-surface text-marketer-muted hover:border-marketer-brand/40 hover:bg-marketer-brand-soft',
                    )}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-marketer-surface shadow-xs">
                      <BrandLogo
                        name={b.name}
                        logoUrl={b.logoUrl}
                        size="sm"
                        className="size-8 p-1"
                      />
                    </span>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <StaleBanner show={q.isError && q.data !== undefined} onRetry={() => void q.refetch()} />
        <QueryState
          query={q}
          loading={
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PackageCardSkeleton />
              <PackageCardSkeleton />
              <PackageCardSkeleton />
            </div>
          }
        >
          {(list) => {
            const items = list.filter(
              (p) => (tab === 'all' || p.status === tab) && (!brand || p.brand?.id === brand),
            );
            return items.length === 0 ? (
              <EmptyState
                title={EMPTY[tab]}
                description="وقتی آموزش مرتبطی برایت فعال شود، همین‌جا نمایش داده می‌شود."
                illustration={<Mascot mood="thinking" className="h-28 w-auto" />}
              />
            ) : (
              <section
                aria-labelledby="learn-list-title"
                className="rounded-hero border border-marketer-border bg-marketer-surface p-4 shadow-sm"
              >
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 id="learn-list-title" className="text-base font-extrabold text-marketer-ink">
                    {tab === 'all'
                      ? 'آموزش‌های من'
                      : tab === 'in_progress'
                        ? 'در حال یادگیری'
                        : 'آموزش‌های تکمیل‌شده'}
                  </h2>
                  <p className="shrink-0 text-xs text-marketer-muted">
                    {items.length.toLocaleString('fa-IR')} آموزش
                  </p>
                </div>
                <div key={`${tab}-${brand}`} className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
                  {items.map((p) => (
                    <PackageCard key={p.id} p={p} layout="education" />
                  ))}
                </div>
              </section>
            );
          }}
        </QueryState>
      </div>
    </div>
  );
}
