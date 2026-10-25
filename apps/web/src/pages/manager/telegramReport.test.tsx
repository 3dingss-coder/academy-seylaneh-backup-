import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { TelegramReportCard } from './TelegramReportCard';

const mocks = vi.hoisted(() => ({
  user: null as Me | null,
  setUser: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mocks.user, setUser: mocks.setUser, logout: vi.fn() }),
}));

beforeEach(() => {
  mocks.setUser.mockReset();
  mocks.user = { ...marketer, id: 'manager-1', role: 'manager', telegramChatId: null };
});

describe('Manager Telegram daily-report card', () => {
  it('saves the chat id (Persian digits normalized) and offers a test send once connected', async () => {
    mocks.setUser.mockImplementation((u: Me) => {
      mocks.user = u;
    });
    const { calls } = mockApi({
      'PATCH /v1/me': (body) => ({
        data: {
          ...mocks.user,
          telegramChatId: (body as { telegramChatId: string }).telegramChatId,
        },
      }),
      'POST /v1/manager/telegram/test': () => ({ data: { sent: true, memberCount: 12 } }),
    });
    const { rerender } = render(
      <ToastProvider>
        <TelegramReportCard />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { name: 'گزارش روزانهٔ تلگرام' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ارسال گزارش آزمایشی' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('شناسهٔ گفت‌وگوی تلگرام'), {
      target: { value: '۱۲۳۴۵۶۷۸۹' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ اتصال تلگرام' }));

    expect(
      await screen.findByText('تلگرام متصل شد؛ گزارش اکسل از این پس هر روز ساعت ۹ صبح می‌رسد.'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /v1/me')?.body).toEqual({
      telegramChatId: '123456789',
    });

    rerender(
      <ToastProvider>
        <TelegramReportCard />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ارسال گزارش آزمایشی' }));
    expect(
      await screen.findByText('گزارش آزمایشی (۱۲ بازاریاب) به تلگرام ارسال شد.'),
    ).toBeInTheDocument();
  });

  it('rejects a non-numeric chat id before calling the API', async () => {
    const { calls } = mockApi({});
    render(
      <ToastProvider>
        <TelegramReportCard />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('شناسهٔ گفت‌وگوی تلگرام'), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ اتصال تلگرام' }));
    expect(await screen.findByText(/شناسهٔ عددی گفت‌وگو را وارد کنید/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
