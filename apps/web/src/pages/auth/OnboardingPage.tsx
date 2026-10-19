import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, BookOpenCheck, Route } from 'lucide-react';
import { Mascot, type MascotMood } from '@/components/brand/Mascot';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Me } from '@/lib/types';

/** Real slide copy is unchanged (handoff: keep the three-slide content); mood = mascot state. */
const SLIDES: Array<{ icon: typeof BookOpenCheck; title: string; body: string; mood: MascotMood }> =
  [
    {
      icon: BookOpenCheck,
      title: 'چه چیزی یاد بگیرم؟',
      body: 'آموزش‌های کوتاه صوتی و ویدیویی درباره محصولات سیلانه‌سبز برایت فعال می‌شود.',
      mood: 'welcome',
    },
    {
      icon: Route,
      title: 'چطور پیش بروم؟',
      body: 'در صفحه خانه همیشه «کار بعدی» را می‌بینی. قسمت را کامل ببین یا گوش کن، بعد آزمون کوتاه بده.',
      mood: 'guide',
    },
    {
      icon: AlarmClock,
      title: 'اگر عقب بمانم چه؟',
      body: 'هر آموزش مهلت دارد. قبل از تمام شدن مهلت یادآوری می‌گیری و مدیرت هم در جریان است.',
      mood: 'thinking',
    },
  ];

/** M2 — Onboarding (first login only). */
export function OnboardingPage() {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const { user, setUser, refreshMe } = useAuth();
  const nav = useNavigate();

  const finish = async () => {
    setBusy(true);
    try {
      // The endpoint returns only { onboardedAt }, so merge it into the existing profile.
      const r = await api.post<Partial<Me>>('/me/onboarding');
      if (user) setUser({ ...user, onboardedAt: r.onboardedAt ?? new Date().toISOString() });
      else await refreshMe();
    } catch {
      /* non-blocking */
    }
    nav('/', { replace: true, state: { highlightNext: true } });
  };

  const slide = SLIDES[i] ?? SLIDES[0];
  if (!slide) return null;

  const Icon = slide.icon;
  const last = i === SLIDES.length - 1;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#FCF8F0] px-4 pb-6 pt-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#E5F3EA] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-[#FFF0C6]/70 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-2.75rem)] w-full max-w-[460px] flex-col">
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm font-black text-[#315A52]">شروع مسیر یادگیری</p>
          <p className="rounded-full bg-[#EEF6F1] px-3 py-1.5 text-xs font-bold text-[#315A52]">
            {i + 1} از {SLIDES.length}
          </p>
        </div>

        <div className="mt-4 flex gap-2" aria-hidden>
          {SLIDES.map((_, k) => (
            <span
              key={k}
              className={cn(
                'h-2 flex-1 rounded-full transition-[background-color,transform] duration-300 ease-soft',
                k <= i ? 'bg-[#0B7A60]' : 'bg-[#E5E2DA]',
              )}
            />
          ))}
        </div>

        <section className="relative mt-5 flex min-h-[330px] flex-1 items-end overflow-hidden rounded-[32px] border border-[#E7DED1] bg-[radial-gradient(circle_at_70%_20%,#E4F1E7_0%,transparent_32%),radial-gradient(circle_at_12%_70%,#FFF0C8_0%,transparent_34%),linear-gradient(180deg,#FFFDF7_0%,#F3F7EC_100%)] shadow-[0_18px_44px_-34px_rgba(22,66,53,.42)]">
          <div
            aria-hidden
            className="absolute -right-10 top-8 size-40 rounded-full bg-[#BBD8C5]/25 blur-2xl"
          />
          <div
            aria-hidden
            className="absolute -left-10 bottom-4 size-36 rounded-full bg-[#F7D98B]/25 blur-2xl"
          />

          <div key={i} className="animate-slide-in-end relative z-10 flex w-full flex-col items-center px-5 pb-5 pt-6 text-center">
            <div className="relative">
              <span
                aria-hidden
                className="absolute -right-2 top-4 grid size-11 place-items-center rounded-2xl border border-white/80 bg-[#FFFDF8] text-[#0B7A60] shadow-md"
              >
                <Icon className="size-6" aria-hidden />
              </span>

              <div className="relative mx-auto flex min-h-[180px] items-end justify-center">
                <span
                  aria-hidden
                  className="absolute bottom-2 size-40 rounded-full bg-[#E2F2E8]"
                />
                <Mascot mood={slide.mood} className="relative h-[188px] w-auto drop-shadow-md" />
              </div>
            </div>

            <div className="mt-2 w-full rounded-[24px] border border-[#EBE3D8] bg-[#FFFDF8]/95 px-5 py-5 shadow-[0_16px_38px_-32px_rgba(24,54,46,.5)]">
              <h1 className="text-[24px] font-black text-[#143F36]" aria-live="polite">
                {slide.title}
              </h1>
              <p className="mt-2 text-[15px] leading-8 text-[#65736F]">{slide.body}</p>
            </div>
          </div>
        </section>

        <div className="mt-4">
          <Button
            size="lg"
            block
            loading={busy}
            onClick={() => (last ? void finish() : setI(i + 1))}
            className="rounded-[22px]"
          >
            {last ? 'شروع' : 'بعدی'}
          </Button>

          {!last && (
            <button
              type="button"
              className="pressable mt-2 min-h-12 w-full rounded-2xl text-sm font-bold text-[#6C7874] hover:bg-[#F2F6F2]"
              onClick={() => void finish()}
            >
              رد شدن
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
