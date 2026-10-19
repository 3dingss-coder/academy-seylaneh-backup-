import { PhoneCall } from 'lucide-react';
import { Mascot } from '@/components/brand/Mascot';
import { MentorChat } from '@/components/learning/MentorChat';

/**
 * M9 — منتور.
 *
 * The mentor page is *only* the chat: the marketer opens it to ask and the mentor answers, like a
 * colleague on the other end of a chat. The performance-analysis card and the rule-based nudge
 * list that used to share this screen moved to Home (where the next action lives) — a second
 * place to read the same state was one screen too many.
 */
export function MentorPage() {
  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-6">
      <div className="mx-auto flex h-[calc(100dvh-10rem)] w-full max-w-[760px] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="mb-3 flex items-center gap-3 rounded-[22px] border border-[#ECE4D8] bg-[#FFFDF8] px-4 py-3 shadow-[0_10px_28px_-26px_rgba(32,60,52,.38)]">
        {/* mentor state (handoff: mascot may support mentor moments) — small, supportive */}
        <Mascot mood="welcome" className="h-11 w-auto shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-6">منتور</h1>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            <PhoneCall className="size-3" aria-hidden />
            درباره‌ی هر محصول، برند یا آزمونی بپرس
          </p>
        </div>
      </div>
      <MentorChat packageId={null} className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
