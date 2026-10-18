import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import type { HomeData, PackageSummary } from '@/lib/types';
import { EmptyState, ToastProvider } from '@/components/ui';
import { Mascot } from '@/components/brand/Mascot';
import { HomePage } from './HomePage';
import { MentorPage } from './MentorPage';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'سارا محمدی', role: 'marketer' } }),
}));

const PKG: PackageSummary = {
  id: 'p1',
  title: 'آموزش شامپو دافی',
  description: 'آموزش محصول',
  brand: { id: 'b1', name: 'دافی', logoUrl: '' },
  product: { id: 'pr1', name: 'شامپو', imageUrl: '' },
  deadlineAt: null,
  estimatedMinutes: 10,
  status: 'in_progress',
  packageStatus: 'published',
  percent: 33,
  overdue: false,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  pathOrder: 1,
  totalDurationSec: 600,
  sectionCount: 3,
  completedSections: 1,
};

const HOME_ROUTINE: HomeData = {
  nextItem: {
    packageId: 'p1',
    packageTitle: 'آموزش شامپو دافی',
    sectionId: 's1',
    sectionTitle: 'بخش اول',
    action: 'start',
    deadlineAt: null,
    percent: 33,
    mediaType: 'video',
    durationSec: 180,
    imageUrl: null,
  },
  totalProgress: 33,
  counts: { inProgress: 1, new: 0, completed: 0, overdue: 0 },
  pointsBalance: 120,
  packages: [PKG],
};

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const homeRoutes = (data: HomeData) => ({
  'GET /v1/me/home': () => ({ data }),
  'GET /v1/me/mentor/nudges': () => ({ data: [] }),
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — one dominant next action (marketer core principle)', () => {
  it('renders the continue-card focal action + play CTA, progress ring and suggested courses', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    renderHome();
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
    // The icon-only board CTA keeps the real action label accessible (fixture action = «start»).
    expect(screen.getByRole('button', { name: /شروع: بخش اول/ })).toBeInTheDocument();
    // board copy (marketer board «تمامی صفحات اپلیکیشن بازاریاب») replaces v1 copy:
    // «کار بعدی»→«ادامه یادگیری», «امتیاز شما»→«پیشرفت کل شما», «آموزش‌های من»→«دوره‌های پیشنهادی»;
    // the v1 count chips («در حال انجام»/«جدید»/«تکمیل») are not in the board — its 4 tiles replace them.
    expect(screen.getByText('ادامه یادگیری')).toBeInTheDocument();
    expect(screen.getByText('پیشرفت کل شما')).toBeInTheDocument();
    expect(screen.getByText('دوره‌ها')).toBeInTheDocument();
    expect(screen.getByText('مسیر یادگیری')).toBeInTheDocument();
    expect(screen.getByText('آزمون‌ها')).toBeInTheDocument();
    expect(screen.getByText('مدال')).toBeInTheDocument();
    expect(screen.getByText('دوره‌های پیشنهادی')).toBeInTheDocument();
    expect(screen.getByTestId('package-card')).toBeInTheDocument();
  });

  it('uses only hero art on the routine home screen (no empty/success illustration)', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    const { container } = renderHome();
    await screen.findByTestId('next-item');
    expect(container.querySelector('img[src="/brand/m/m-empty.png"]')).toBeNull();
    expect(container.querySelector('img[src="/brand/m/m-celebrate-trophy.png"]')).toBeNull();
  });

  it('empty state carries the delivered empty illustration and keeps its copy', async () => {
    mockApi(homeRoutes({ ...HOME_ROUTINE, nextItem: null, packages: [] }));
    const { container } = renderHome();
    expect(await screen.findByText('هنوز آموزشی ندارید')).toBeInTheDocument();
    expect(
      screen.getByText('منتظر آموزش جدید باشید؛ وقتی فعال شد همین‌جا می‌بینید.'),
    ).toBeInTheDocument();
    const illustration = container.querySelector('img[src="/brand/m/m-empty.png"]');
    expect(illustration).not.toBeNull();
    expect(illustration).toHaveAttribute('alt', '');
  });

  it('all-done success moment carries the delivered celebration asset and keeps the message', async () => {
    mockApi(
      homeRoutes({
        ...HOME_ROUTINE,
        nextItem: null,
        packages: [{ ...PKG, status: 'completed', percent: 100 }],
      }),
    );
    const { container } = renderHome();
    expect(await screen.findByText('همه آموزش‌ها را تمام کردی! 🎉')).toBeInTheDocument();
    expect(screen.getByText('به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.')).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/m/m-celebrate-trophy.png"]')).not.toBeNull();
  });
});

describe('MentorPage — real mentor surface, mascot as supportive mentor state', () => {
  it('keeps suggestions, question input and attachment entry, with decorative mascot', async () => {
    mockApi({ 'GET /v1/me/mentor/history': () => ({ data: [] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <MentorPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('منتور')).toBeInTheDocument();
    const mascot = container.querySelector('img[src="/brand/mascot.webp"]');
    expect(mascot).not.toBeNull();
    expect(mascot).toHaveAttribute('alt', '');
    // capability surface (not a reduced chat mockup): suggestions + input + attach menu entry
    expect(await screen.findByText('مزیت اصلی این محصول چیست؟')).toBeInTheDocument();
    expect(screen.getByLabelText('سؤال شما')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پیوست تصویر، متن یا لینک' })).toBeInTheDocument();
  });
});

describe('EmptyState illustration slot (Stage 4 additive)', () => {
  it('renders a custom illustration and keeps the title/description contract', () => {
    render(
      <EmptyState
        title="خالی"
        description="توضیح"
        illustration={<Mascot mood="guide" className="h-24 w-auto" />}
      />,
    );
    expect(screen.getByText('خالی')).toBeInTheDocument();
    expect(screen.getByText('توضیح')).toBeInTheDocument();
  });
});
