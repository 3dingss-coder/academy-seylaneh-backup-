import { Link } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { CountdownChip, ProgressBar } from '@/components/ui';
import { ProductImage } from '@/components/common/ProductImage';
import { toPersianDigits } from '@/lib/digits';
import { faDuration, faPercent } from '@/lib/format';
import type { PackageSummary } from '@/lib/types';

/**
 * Package card (M3/M4) — row construction matches after/m-*.png «آموزش‌های من» rows:
 * brand eyebrow + title + meta (duration • parts • deadline chip) + progress bar,
 * real product image (or brand logo for brand-level packages) at the start side.
 */
export function PackageCard({ p }: { p: PackageSummary }) {
  const image = p.product?.imageUrl ?? p.brand?.logoUrl;
  return (
    <Link
      to={`/packages/${p.id}`}
      className="pressable group grid min-h-36 grid-cols-[96px_1fr] gap-4 overflow-hidden rounded-[20px] border border-border bg-surface p-4 shadow-xs hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:border-primary sm:grid-cols-[104px_1fr]"
      data-testid="package-card"
    >
      <ProductImage
        src={image}
        alt={p.product?.name ?? p.brand?.name ?? p.title}
        className="size-24 self-start rounded-[18px] border border-border bg-background object-contain p-2 shadow-xs transition-transform duration-300 ease-soft group-hover:scale-[1.03] sm:size-28"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-primary-fg">
            {p.brand?.name}
            {p.product ? '' : p.brand ? ' — آموزش برند' : ''}
          </p>
          {p.status === 'completed' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-[11px] font-bold text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden /> تکمیل شد
            </span>
          )}
        </div>
        <h3 className="mt-1 line-clamp-2 text-base font-extrabold leading-7 text-text">
          {p.title}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {faDuration(p.totalDurationSec)}
          </span>
          <span>
            {toPersianDigits(p.completedSections)} از {toPersianDigits(p.sectionCount)} قسمت
          </span>
          {p.status !== 'completed' && p.deadlineAt && <CountdownChip deadline={p.deadlineAt} />}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <ProgressBar value={p.percent} label={`پیشرفت ${p.title}`} className="min-w-0 flex-1" />
          <span className="text-xs font-extrabold text-primary-fg">{faPercent(p.percent)}</span>
        </div>
      </div>
    </Link>
  );
}
