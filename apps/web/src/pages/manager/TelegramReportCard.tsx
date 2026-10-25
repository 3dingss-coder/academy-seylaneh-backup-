import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button, Card, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/errors';
import { toLatinDigits, toPersianDigits } from '@/lib/digits';
import type { Me } from '@/lib/types';

/**
 * «گزارش روزانهٔ تلگرام» — the Manager pairs a Telegram chat (the bot replies with the chat id
 * on /start) and receives the 09:00 Excel report of their supervised provinces every morning.
 */
export function TelegramReportCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [chatId, setChatId] = useState(user?.telegramChatId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | ''>('');
  if (!user) return null;
  const connected = Boolean(user.telegramChatId);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = toLatinDigits(chatId).trim();
    if (value && !/^-?\d{5,20}$/.test(value)) {
      setError('شناسهٔ عددی گفت‌وگو را وارد کنید؛ ربات با دستور /start آن را می‌فرستد.');
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
            می‌شود. برای اتصال: در تلگرام به ربات گزارش‌گیری پیام بدهید و دستور /start را بفرستید؛
            ربات «شناسهٔ گفت‌وگو» را برایتان می‌فرستد — آن را اینجا وارد کنید.
          </p>
        </div>
      </div>
      <form
        onSubmit={save}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Input
          label="شناسهٔ گفت‌وگوی تلگرام"
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          error={error}
          ltr
          inputMode="numeric"
          placeholder="123456789"
          hint={
            connected ? 'تلگرام متصل است. برای قطع اتصال، شناسه را پاک و ذخیره کنید.' : undefined
          }
          disabled={busy === 'save'}
        />
        <Button type="submit" loading={busy === 'save'}>
          ذخیرهٔ اتصال تلگرام
        </Button>
      </form>
      {connected && (
        <div>
          <Button variant="secondary" loading={busy === 'test'} onClick={() => void sendTest()}>
            ارسال گزارش آزمایشی
          </Button>
        </div>
      )}
    </Card>
  );
}
