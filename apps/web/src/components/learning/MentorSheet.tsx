import { useEffect, useState } from 'react';
import { MarketerIcon } from '@/components/brand/MarketerIcon';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { track } from '@/lib/telemetry';
import { MentorChat } from './MentorChat';

/**
 * Floating «از منتور بپرس» button (M5/M6) opening a package-scoped chat sheet.
 * It floats a small, constant gap above the bottom nav (the nav publishes its real height as
 * --bottom-nav-h), tucks away while reading down the page and returns on scroll-up, so it never
 * sits on top of section content.
 */
export function MentorLauncher({ packageId }: { packageId: string }) {
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 80;
      if (y < 120 || nearBottom || lastY - y > 6) setTucked(false);
      else if (y - lastY > 8) setTucked(true);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
      {/* Reserves room at the end of the page so the button never hides the last content. */}
      <div aria-hidden className="h-16 lg:hidden" />
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          track('mentor_chat_opened', { context: 'package' });
        }}
        aria-hidden={tucked || undefined}
        tabIndex={tucked ? -1 : undefined}
        className={cn(
          'pressable glass fixed bottom-[calc(var(--bottom-nav-h,4.5rem)+0.875rem)] start-4 z-30 flex min-h-12 items-center gap-2 rounded-full border border-primary/30 px-4 text-sm font-bold text-primary-fg shadow-lg transition-[translate,opacity] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none lg:bottom-6',
          tucked && 'pointer-events-none translate-y-6 opacity-0',
        )}
      >
        <span className="relative flex">
          <span
            aria-hidden
            className="animate-pulse-dot absolute inset-0 rounded-full bg-primary"
          />
          <MarketerIcon name="mentor" className="relative size-6" />
        </span>
        از منتور بپرس
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="منتور" size="lg">
        <MentorChat packageId={packageId} className="h-[60dvh]" />
      </Modal>
    </>
  );
}
