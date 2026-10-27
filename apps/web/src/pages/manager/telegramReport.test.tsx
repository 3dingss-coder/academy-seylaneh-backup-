import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { TelegramConnectBanner, TelegramReportCard } from './TelegramReportCard';

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

const renderCard = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};

const PROFILE_ROUTE = {
  'GET /v1/manager/profile': () => ({
    data: {
      team: null,
      managerProvinces: ['تهران'],
      managementArea: { province: 'تهران', city: 'تهران' },
      createdAt: '2026-10-01T00:00:00.000Z',
      telegram: { configured: true, botUsername: 'seylane_reports_bot', connected: false },
    },
  }),
};

describe('Manager Telegram daily-report card', () => {
  it('saves the chat id (Persian digits normalized) and offers a test send once connected', async () => {
    mocks.setUser.mockImplementation((u: Me) => {
      mocks.user = u;
    });
    const { calls } = mockApi({
      ...PROFILE_ROUTE,
      'PATCH /v1/me': (body) => ({
        data: {
          ...mocks.user,
          telegramChatId: (body as { telegramChatId: string }).telegramChatId,
        },
      }),
      'POST /v1/manager/telegram/test': () => ({ data: { sent: true, memberCount: 12 } }),
    });
    const { rerender } = renderCard(<TelegramReportCard />);

    expect(screen.getByRole('heading', { name: 'گزارش روزانهٔ تلگرام' })).toBeInTheDocument();
    // Phone-pairing instructions + a direct bot link.
    expect(screen.getByText(/دکمهٔ «📱 ارسال شماره موبایل» را بزنید/)).toBeInTheDocument();
    const botLink = await screen.findByRole('link', { name: /ورود به ربات تلگرام/ });
    expect(botLink).toHaveAttribute('href', 'https://t.me/seylane_reports_bot');
    expect(screen.queryByRole('button', { name: 'ارسال گزارش آزمایشی' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('شناسهٔ گفت‌وگوی تلگرام (روش جایگزین)'), {
      target: { value: '۱۲۳۴۵۶۷۸۹' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ اتصال تلگرام' }));

    expect(
      await screen.findByText('تلگرام متصل شد؛ گزارش روزانه در ساعت تنظیم‌شده ارسال می‌شود.'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /v1/me')?.body).toEqual({
      telegramChatId: '123456789',
    });

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <TelegramReportCard />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ارسال گزارش آزمایشی' }));
    expect(
      await screen.findByText('گزارش آزمایشی (۱۲ بازاریاب) به تلگرام ارسال شد.'),
    ).toBeInTheDocument();
  });

  it('saves a per-manager time and refreshes a time changed from the bot', async () => {
    let currentTime = '09:00';
    if (!mocks.user) throw new Error('Missing Manager');
    mocks.user = { ...mocks.user, telegramChatId: '123456789' };
    const { calls } = mockApi({
      'GET /v1/manager/profile': () => ({
        data: {
          telegram: {
            configured: true,
            connected: true,
            botUsername: 'sample_bot',
            reportTime: currentTime,
          },
        },
      }),
      'GET /v1/me': () => ({ data: { ...mocks.user, telegramReportTime: currentTime } }),
      'PATCH /v1/me': (body) => {
        currentTime = (body as { telegramReportTime: string }).telegramReportTime;
        return { data: { ...mocks.user, telegramReportTime: currentTime } };
      },
    });
    renderCard(<TelegramReportCard />);
    const input = await screen.findByLabelText('ساعت ارسال روزانه (به وقت تهران)');
    fireEvent.change(input, { target: { value: '17:43' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره ساعت ارسال' }));
    expect(
      await screen.findByText('ساعت ارسال ذخیره شد و در ربات هم اعمال می‌شود.'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /v1/me')?.body).toEqual({
      telegramReportTime: '17:43',
    });
    expect(input).toHaveValue('17:43');
    currentTime = '08:45';
    fireEvent.click(screen.getByRole('button', { name: 'بررسی وضعیت اتصال' }));
    expect(
      await screen.findByText('تلگرام متصل است؛ ساعت ارسال با پنل همگام شد.'),
    ).toBeInTheDocument();
    expect(input).toHaveValue('08:45');
  });

  it('rejects a non-numeric chat id before calling the API', async () => {
    const { calls } = mockApi({ ...PROFILE_ROUTE });
    renderCard(<TelegramReportCard />);
    fireEvent.change(screen.getByLabelText('شناسهٔ گفت‌وگوی تلگرام (روش جایگزین)'), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ اتصال تلگرام' }));
    expect(await screen.findByText(/شناسهٔ عددی گفت‌وگو را وارد کنید/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PATCH /v1/me')).toBe(false);
  });
});

describe('Manager dashboard Telegram banner', () => {
  it('prompts to pair by mobile number until the server says connected', async () => {
    mockApi({ ...PROFILE_ROUTE });
    renderCard(<TelegramConnectBanner />);
    expect(await screen.findByText('گزارش روزانه‌تان را در تلگرام بگیرید')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ورود به ربات تلگرام/ })).toHaveAttribute(
      'href',
      'https://t.me/seylane_reports_bot',
    );
  });

  it('stays hidden once the Manager is paired', async () => {
    mockApi({
      'GET /v1/manager/profile': () => ({
        data: {
          team: null,
          managerProvinces: ['تهران'],
          managementArea: { province: 'تهران', city: 'تهران' },
          createdAt: '2026-10-01T00:00:00.000Z',
          telegram: { configured: true, botUsername: 'seylane_reports_bot', connected: true },
        },
      }),
    });
    renderCard(<TelegramConnectBanner />);
    // Give the query a tick; the banner must never appear.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('گزارش روزانه‌تان را در تلگرام بگیرید')).not.toBeInTheDocument();
  });
});
