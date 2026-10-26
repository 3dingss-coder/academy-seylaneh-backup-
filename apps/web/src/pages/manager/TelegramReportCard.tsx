import { useState, type FormEvent } from 'react';
import { CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { toLatinDigits, toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';
import { telegramBotUrl, useTelegramBotInfo } from './telegramBot';

/**
 * «گزارش روزانهٔ تلگرام» — pairing is phone-based: the Manager opens the bot, taps Start and
 * shares their mobile number; the bot matches the number to this Manager account and the
 * 09:00 Excel report of their provinces arrives in that chat every day. The manual chat-id
 * field stays as a fallback (e.g. Telegram registered under a different number).
 */
export function TelegramReportCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const info = useTelegramBotInfo(Boolean(user));
  const [chatId, setChatId] = useState(user?.telegramChatId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'check' | ''>('');
  if (!user) return null;
  const connected = Boolean(user.telegramChatId);
  const botUsername = info.data?.botUsername ?? null;
  const configured = info.data?.configured ?? false;

  const checkConnection = async () => {
    setBusy('check');
    try {
      const me = await api.get<Me>('/me');
      setUser(me);
      setChatId(me.telegramChatId ?? '');
      toast.show({
        type: me.telegramChatId ? 'success' : 'warning',
        message: me.telegramChatId
          ? 'تلگرام متصل است؛ گزارش بعدی ساعت ۹ صبح می‌رسد.'
          : 'هنوز اتصالی ثبت نشده است؛ در ربات دکمهٔ «ارسال شماره موبایل» را بزنید.',
      });
    } catch (cause) {
      toast.show({ type: 'error', message: errMsg(cause) });
    } finally {
      setBusy('');
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = toLatinDigits(chatId).trim();
    if (value && !/^-?\d{5,20}$/.test(value)) {
      setError('شناسهٔ عددی گفت‌وگو را وارد کنید؛ ربات در صورت نیاز آن را می‌فرستد.');
      return;
    }
    setBusy('save');
    setError('');
    try {
      const updated = await api.patch<Me>('/me', { telegramChatId: value || null });
      setUser(updated);
      setChatId(updated.telegramChatId ?? '');
      toast.show({
        type: 'success',
        message: value
          ? 'تلگرام متصل شد؛ گزارش اکسل از این پس هر روز ساعت ۹ صبح می‌رسد.'
          : 'اتصال تلگرام حذف شد.',
      });
    } catch (cause) {
      const fields = cause instanceof ApiError ? cause.fields : {};
      setError(fields.telegramChatId ?? '');
      toast.show({ type: 'error', message: errMsg(cause) });
    } finally {
      setBusy('');
    }
  };

  const sendTest = async () => {
    setBusy('test');
    try {
      const result = await api.post<{ sent: boolean; memberCount: number }>(
        '/manager/telegram/test',
        {},
      );
      toast.show({
        type: 'success',
        message: `گزارش آزمایشی (${toPersianDigits(result.memberCount)} بازاریاب) به تلگرام ارسال شد.`,
      });
    } catch (cause) {
      toast.show({ type: 'error', message: errMsg(cause, 'ارسال آزمایشی انجام نشد.') });
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3fb] text-[#1b6fa8]">
          <Send className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-black text-[#143f36]">گزارش روزانهٔ تلگرام</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            هر روز ساعت ۹ صبح، گزارش اکسل همهٔ بازاریاب‌های استان‌های تحت مدیریت‌تان در تلگرام ارسال
            می‌شود.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dce9dc] bg-[#f6faf5] p-3 text-sm font-bold text-[#1b6549]">
          <CheckCircle2 className="size-5" aria-hidden />
          تلگرام این پنل متصل است؛ گزارش بعدی ساعت ۹ صبح می‌رسد.
        </div>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 rounded-xl border border-[#e7ece4] bg-[#f8faf6] p-4 ps-8 text-sm leading-6 text-[#3f5649]">
          <li>وارد ربات تلگرام شوید و دکمهٔ «شروع» (Start) را بزنید.</li>
          <li>ربات از شما شماره موبایل می‌خواهد؛ دکمهٔ «📱 ارسال شماره موبایل» را بزنید.</li>
          <li>ربات شماره را با پنل شما تطبیق می‌دهد و از فردا ساعت ۹ صبح گزارش همین‌جا می‌رسد.</li>
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {botUsername && (
          <a href={telegramBotUrl(botUsername)} target="_blank" rel="noreferrer">
            <Button type="button" icon={<Send className="size-4" aria-hidden />}>
              ورود به ربات تلگرام
            </Button>
          </a>
        )}
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'check'}
          icon={<RefreshCw className="size-4" aria-hidden />}
          onClick={() => void checkConnection()}
        >
          بررسی وضعیت اتصال
        </Button>
        {connected && (
          <Button
            type="button"
            variant="secondary"
            loading={busy === 'test'}
            onClick={() => void sendTest()}
          >
            ارسال گزارش آزمایشی
          </Button>
        )}
      </div>
      {!configured && !info.isLoading && (
        <p className="text-xs leading-5 text-text-secondary">
          ربات تلگرام هنوز از سوی مدیر سیستم فعال نشده است؛ اتصال شما ذخیره می‌شود و به‌محض
          فعال‌سازی، گزارش‌ها می‌رسند.
        </p>
      )}

      <form
        onSubmit={save}
        className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Input
          label="شناسهٔ گفت‌وگوی تلگرام (روش جایگزین)"
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          error={error}
          ltr
          inputMode="numeric"
          placeholder="123456789"
          hint="اگر شمارهٔ تلگرام‌تان با شمارهٔ حسابتان فرق دارد، شناسه‌ای را که ربات می‌دهد اینجا ثبت کنید؛ خالی‌کردن یعنی قطع اتصال."
          disabled={busy === 'save'}
        />
        <Button type="submit" loading={busy === 'save'}>
          ذخیرهٔ اتصال تلگرام
        </Button>
      </form>
    </Card>
  );
}

/**
 * First-thing-you-see connect prompt on the Manager dashboard: shown until the Manager
 * pairs their Telegram (the bot matches them by mobile number). Dismissible for the session.
 */
export function TelegramConnectBanner() {
  const [dismissed, setDismissed] = useState(false);
  // Server truth only (no auth-state dependency): `connected` flips as soon as the bot pairs
  // the chat by mobile number, and the shared profile query refetches on focus.
  const info = useTelegramBotInfo();
  if (dismissed || !info.data?.configured || info.data.connected) return null;
  const botUsername = info.data.botUsername;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-card border border-[#bcd8ee] bg-[#eef6fc] p-4"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1b6fa8] shadow-sm">
        <Send className="size-5" aria-hidden />
      </span>
      <div className="min-w-[220px] flex-1">
        <p className="font-black text-[#143f36]">گزارش روزانه‌تان را در تلگرام بگیرید</p>
        <p className="mt-0.5 text-sm leading-6 text-[#3f5649]">
          وارد ربات شوید، «شروع» را بزنید و شماره موبایل‌تان را ارسال کنید؛ هر روز ساعت ۹ صبح گزارش
          اکسل بازاریاب‌های استان‌هایتان در تلگرام می‌رسد.
        </p>
      </div>
      <div className="flex gap-2">
        {botUsername && (
          <a href={telegramBotUrl(botUsername)} target="_blank" rel="noreferrer">
            <Button type="button">ورود به ربات تلگرام</Button>
          </a>
        )}
        <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
          بعداً
        </Button>
      </div>
    </div>
  );
}
