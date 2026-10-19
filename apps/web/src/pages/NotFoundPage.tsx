import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { NotFoundIllustration } from '@/components/ui';

export function NotFoundPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#FCF8F0] px-6 text-center">
      <div aria-hidden className="absolute -top-28 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#E5F3EA] blur-3xl" />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-[30px] border border-[#E9E1D5] bg-[#FFFDF8] px-6 py-8 shadow-[0_18px_44px_-34px_rgba(22,66,53,.42)]">
      <AppLogo withTitle={false} />
      <NotFoundIllustration className="animate-fade-up h-40" />
      <p
        aria-hidden
        className="bg-hero bg-clip-text text-6xl font-extrabold text-transparent [-webkit-text-fill-color:transparent]"
      >
        ۴۰۴
      </p>
      <h1 className="text-2xl font-bold text-text">این صفحه پیدا نشد</h1>
      <p className="text-sm text-text-secondary">
        ممکن است آدرس اشتباه باشد یا صفحه جابه‌جا شده باشد.
      </p>
      <Link
        to="/"
        className="pressable mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card bg-cta bg-brand-gradient px-6 font-bold text-on-cta hover:bg-cta-hover"
      >
        <Home className="size-5" aria-hidden />
        بازگشت به صفحه اصلی
      </Link>
      </div>
    </main>
  );
}
