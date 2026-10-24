import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Page title row; `back` renders an RTL back arrow (→) as a 48px target. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  variant = 'default',
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
  /** Admin variant aligns all control-room pages without changing marketer/manager headers. */
  variant?: 'default' | 'admin';
}) {
  const admin = variant === 'admin';
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2',
        admin &&
          'relative isolate overflow-hidden rounded-2xl border border-[#e4e9df] bg-gradient-to-l from-white via-white to-[#f3f8f1] px-3 py-3 shadow-sm sm:px-5 sm:py-4',
        admin &&
          'before:absolute before:inset-y-4 before:start-0 before:z-[-1] before:w-1 before:rounded-e-full before:bg-[#07815a]',
      )}
    >
      <div className="flex min-w-0 flex-[1_1_14rem] items-start gap-1">
        {back && (
          <Link
            to={back}
            aria-label="بازگشت"
            className={cn(
              'pressable -ms-3 flex size-12 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-[#FFFDF8] hover:text-primary-fg',
              admin && 'border border-[#e7ebe3] bg-white/80',
            )}
          >
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        )}
        <div className={cn('min-w-0 pt-2', admin && 'pt-0.5')}>
          {admin && (
            <p className="text-[11px] font-bold tracking-wide text-[#13815e]">پنل مدیریت</p>
          )}
          <h1
            className={cn(
              'break-words text-xl font-black text-[#143F36] sm:text-2xl',
              admin && 'mt-0.5 text-[22px] leading-8 sm:text-[26px]',
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              className={cn(
                'mt-1 text-sm text-text-secondary',
                admin && 'max-w-3xl leading-6 text-[#617269]',
              )}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {/* On narrow phones the actions wrap below the title instead of squeezing it. */}
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
