import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ACCENT_CLASSES, PUSH_TEMPLATES, type PushTemplate } from './pushTemplates';

export interface PushTemplatePickerProps {
  /** Called with the chosen template. Callers decide what happens next. */
  onPick: (t: PushTemplate) => void;
  /** Accessible name of the trigger button. */
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  className?: string;
  /** Optional line shown under the dialog title. */
  hint?: string;
}

/**
 * Quick template chooser used on the campaign list, the dashboard, the editor header and the
 * notifications page. Read-only: it never sends anything, it only hands a template back.
 */
export function PushTemplatePicker({
  onPick,
  label = 'قالب آماده',
  variant = 'secondary',
  disabled,
  className,
  hint,
}: PushTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        disabled={disabled}
        className={className}
        icon={<LayoutTemplate className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="قالب‌های آماده اعلان" size="lg">
        <div className="flex flex-col gap-3">
          {hint && <p className="text-xs leading-6 text-text-secondary">{hint}</p>}
          <ul className="flex flex-col gap-2" data-testid="template-picker-list">
            {PUSH_TEMPLATES.map((t) => {
              const Icon = t.icon;
              const accent = ACCENT_CLASSES[t.accent];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    data-testid={`template-option-${t.id}`}
                    aria-label={`قالب ${t.category}: ${t.title}`}
                    onClick={() => {
                      setOpen(false);
                      onPick(t);
                    }}
                    className="pressable flex w-full items-start gap-3 rounded-card border border-border bg-surface p-3 text-start hover:border-primary/40 hover:bg-primary-light/40 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-card border',
                        accent.chip,
                      )}
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-xs font-bold', accent.text)}>
                        {t.category}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-bold text-text">
                        {t.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-secondary">
                        {t.body}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
