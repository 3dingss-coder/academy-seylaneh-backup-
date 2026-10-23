import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import type { HomeData, PackageSummary } from '@/lib/types';
import { EmptyState, ToastProvider } from '@/components/ui';
import { Mascot } from '@/components/brand/Mascot';
import { CardsPage } from './CardsPage';
import { HomePage } from './HomePage';
import { LearnPage } from './LearnPage';
import { LearningPathPage } from './LearningPathPage';
import { MentorPage } from './MentorPage';
import { MessagesPage } from './MessagesPage';

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

function renderCards() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CardsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderMessages() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderLearn() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LearnPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderLearningPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LearningPathPage />
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
  it('renders the next lesson, live progress metrics, route shortcuts and assigned courses', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    renderHome();
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
    // The visible button keeps the real action label accessible (fixture action = «start»).
    expect(screen.getByRole('button', { name: /شروع: بخش اول/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'بخش اول' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'پیشرفت کلی شما' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'در حال یادگیری: ۱' })).toHaveAttribute(
      'href',
      '/learn/all',
    );
    expect(screen.getByRole('link', { name: 'آموزش جدید: ۰' })).toHaveAttribute(
      'href',
      '/learn/all',
    );
    expect(screen.getByRole('link', { name: 'تکمیل‌شده: ۰' })).toHaveAttribute(
      'href',
      '/learn/all',
    );
    expect(screen.getByRole('link', { name: 'امتیازها: ۱۲۰' })).toHaveAttribute('href', '/cards');
    expect(screen.getByText('امروز یک قدم دیگر به موفقیت نزدیک‌تر شدی!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'دوره‌ها' })).toHaveAttribute('href', '/learn/all');
    expect(screen.getByRole('link', { name: 'مسیر یادگیری' })).toHaveAttribute('href', '/learn');
    expect(screen.getByRole('link', { name: 'آزمون‌ها' })).toHaveAttribute('href', '/learn/all');
    expect(screen.getByRole('link', { name: 'امتیاز و نشان‌ها' })).toHaveAttribute(
      'href',
      '/cards',
    );
    expect(screen.getByRole('heading', { name: 'آموزش‌های من' })).toBeInTheDocument();
    expect(screen.getByTestId('package-card')).toBeInTheDocument();
  });

  it('reuses marketer illustrations for the home shortcuts and a live mentor nudge', async () => {
    mockApi({
      ...homeRoutes(HOME_ROUTINE),
      'GET /v1/me/mentor/nudges': () => ({
        data: [
          {
            id: 'nudge-1',
            ruleId: 'rule-1',
            message: 'برای این آموزش از منتور کمک بگیر.',
            actionRef: '/mentor',
            createdAt: '2026-10-22T10:00:00.000Z',
          },
        ],
      }),
    });
    const { container } = renderHome();
    expect(await screen.findByText('برای این آموزش از منتور کمک بگیر.')).toBeInTheDocument();
    for (const name of ['mentor', 'assignment', 'learning', 'quiz', 'badge-medal']) {
      expect(container.querySelector(`img[src="/brand/m/icons/${name}-3d.png"]`)).not.toBeNull();
    }
  });

  it('uses the mascot as the default profile avatar and keeps success art out of the routine state', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    const { container } = renderHome();
    await screen.findByTestId('next-item');
    const avatar = container.querySelector('img[src="/brand/m/m-empty.png"]');
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveAttribute('alt', '');
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

  it('uses a neutral no-next message when assigned learning is not all complete', async () => {
    mockApi(homeRoutes({ ...HOME_ROUTINE, nextItem: null }));
    const { container } = renderHome();
    expect(
      await screen.findByRole('heading', { name: 'فعلاً درس بعدی در دسترس نیست' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /دیدن همه آموزش‌ها/ })).toHaveAttribute(
      'href',
      '/learn/all',
    );
    expect(container.querySelector('img[src="/brand/m/m-celebrate-trophy.png"]')).toBeNull();
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
    expect(
      await screen.findByRole('heading', { name: 'همه آموزش‌ها را تمام کردی!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('به محض فعال‌شدن آموزش جدید، همین‌جا می‌بینیش.')).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/m/m-celebrate-trophy.png"]')).not.toBeNull();
  });
});

describe('CardsPage — points and badge ledger', () => {
  it('shows the API balance, earned and locked badges, and ledger reasons', async () => {
    mockApi({
      'GET /v1/me/points': () => ({
        data: {
          balance: 420,
          ledger: [
            {
              id: 'ledger-1',
              amount: 50,
              reason: 'on_time_completion',
              refId: 'p1',
              createdAt: '2026-10-22T10:00:00.000Z',
            },
          ],
        },
      }),
      'GET /v1/me/badges': () => ({
        data: [
          {
            id: 'badge-earned',
            code: 'first-step',
            title: 'قدم اول',
            description: 'نخستین آموزش را کامل کن.',
            icon: 'sprout',
            earned: true,
            earnedAt: '2026-10-22T10:00:00.000Z',
          },
          {
            id: 'badge-locked',
            code: 'quiz-master',
            title: 'آزمون‌یار',
            description: 'در آزمون قبول شو.',
            icon: 'brain',
            earned: false,
            earnedAt: null,
          },
          {
            id: 'badge-on-time',
            code: 'on-time',
            title: 'به‌موقع',
            description: 'آموزش را سر وقت کامل کن.',
            icon: 'alarm-clock-check',
            earned: true,
            earnedAt: '2026-10-22T10:00:00.000Z',
          },
          {
            id: 'badge-medal',
            code: 'consistent',
            title: 'پیوسته',
            description: 'یادگیری را ادامه بده.',
            icon: 'medal',
            earned: true,
            earnedAt: '2026-10-22T10:00:00.000Z',
          },
          {
            id: 'badge-star',
            code: 'top-star',
            title: 'ستاره',
            description: 'به روند خوبت ادامه بده.',
            icon: 'star',
            earned: true,
            earnedAt: '2026-10-22T10:00:00.000Z',
          },
        ],
      }),
    });
    const { container } = renderCards();
    expect(await screen.findByTestId('points-balance')).toHaveTextContent('۴۲۰');
    expect(container.querySelector('.bg-hero')).not.toBeNull();
    expect(screen.getByText('قدم اول')).toBeInTheDocument();
    expect(screen.getByText('آزمون‌یار')).toBeInTheDocument();
    expect(screen.getByText('تکمیل به‌موقع')).toBeInTheDocument();
    expect(screen.getByText('+۵۰')).toBeInTheDocument();
    for (const name of [
      'badge-sprout',
      'badge-clock',
      'badge-brain',
      'badge-medal',
      'badge-star',
    ]) {
      expect(container.querySelector(`img[src="/brand/m/icons/${name}-3d.png"]`)).not.toBeNull();
    }
  });
});

describe('MessagesPage — notifications and manager notes', () => {
  it('keeps the two inboxes distinct and shows their live content', async () => {
    mockApi({
      'GET /v1/me/notifications': () => ({
        data: {
          unread: 1,
          items: [
            {
              id: 'notification-1',
              type: 'manual',
              title: 'یادآوری آموزش',
              body: 'یک درس برای تکمیل داری.',
              actionRef: null,
              readAt: null,
              createdAt: '2026-10-22T10:00:00.000Z',
            },
            {
              id: 'notification-2',
              type: 'welcome',
              title: 'به مسیر یادگیری خوش آمدی',
              body: 'هر روز یک قدم جلوتر برو.',
              actionRef: null,
              readAt: '2026-10-22T10:00:00.000Z',
              createdAt: '2026-10-22T09:00:00.000Z',
            },
            {
              id: 'notification-3',
              type: 'new_assignment',
              title: 'آموزش تازه',
              body: 'یک آموزش جدید به تو اختصاص داده شد.',
              actionRef: null,
              readAt: '2026-10-22T10:00:00.000Z',
              createdAt: '2026-10-21T10:00:00.000Z',
            },
            {
              id: 'notification-4',
              type: 'manager_message',
              title: 'پیام مدیر',
              body: 'مدیر تیم برایت پیامی فرستاده است.',
              actionRef: null,
              readAt: '2026-10-22T10:00:00.000Z',
              createdAt: '2026-10-20T10:00:00.000Z',
            },
            {
              id: 'notification-5',
              type: 'weekly_digest',
              title: 'خلاصه هفتگی',
              body: 'مروری بر هفته گذشته.',
              actionRef: null,
              readAt: '2026-10-22T10:00:00.000Z',
              createdAt: '2026-10-19T10:00:00.000Z',
            },
            {
              id: 'notification-6',
              type: 'escalation',
              title: 'اطلاعیه جدید',
              body: 'یک نکته تازه برای تیمت داریم.',
              actionRef: null,
              readAt: '2026-10-22T10:00:00.000Z',
              createdAt: '2026-10-18T10:00:00.000Z',
            },
          ],
        },
      }),
      'GET /v1/me/messages': () => ({
        data: [
          {
            id: 'message-1',
            type: 'message',
            body: 'لطفاً درس اول را مرور کن.',
            packageId: 'p1',
            fromName: 'مدیر تیم',
            readAt: null,
            createdAt: '2026-10-22T10:00:00.000Z',
          },
        ],
      }),
    });
    const { container } = renderMessages();
    expect(await screen.findByText('یادآوری آموزش')).toBeInTheDocument();
    for (const name of [
      'notification',
      'welcome',
      'assignment',
      'weekly-summary',
      'announcement',
    ]) {
      expect(container.querySelector(`img[src="/brand/m/icons/${name}-3d.png"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getByRole('tab', { name: /پیام مدیر/ }));
    expect(await screen.findByText('مدیر تیم')).toBeInTheDocument();
    expect(screen.getByText('لطفاً درس اول را مرور کن.')).toBeInTheDocument();
    expect(container.querySelector('img[src="/brand/m/icons/manager-note-3d.png"]')).not.toBeNull();
  });

  it('shows separate empty states for notifications and manager messages', async () => {
    mockApi({
      'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
      'GET /v1/me/messages': () => ({ data: [] }),
    });
    renderMessages();
    expect(await screen.findByText('اعلانی نداری')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /پیام مدیر/ }));
    expect(await screen.findByText('پیامی از مدیر نداری')).toBeInTheDocument();
  });
});

describe('LearnPage — all assigned education and course-specific quizzes', () => {
  it('shows all courses by default and filters in-progress and completed courses', async () => {
    const completedPackage: PackageSummary = {
      ...PKG,
      id: 'p-completed',
      title: 'آموزش تکمیل‌شده',
      status: 'completed',
      percent: 100,
      completedSections: 3,
    };
    const newPackage: PackageSummary = {
      ...PKG,
      id: 'p-new',
      title: 'آموزش تازه',
      status: 'new',
      percent: 0,
      completedSections: 0,
    };
    mockApi({
      'GET /v1/me/packages': () => ({ data: [PKG, newPackage, completedPackage] }),
    });
    renderLearn();

    expect(await screen.findByText('آموزش شامپو دافی')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'آموزش‌ها' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^همه/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('آموزش تازه')).toBeInTheDocument();
    expect(screen.getByText('آموزش تکمیل‌شده')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /در حال یادگیری/ }));
    expect(screen.getByText('آموزش شامپو دافی')).toBeInTheDocument();
    expect(screen.queryByText('آموزش تازه')).toBeNull();
    expect(screen.queryByText('آموزش تکمیل‌شده')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /تکمیل‌شده/ }));
    expect(screen.getByText('آموزش تکمیل‌شده')).toBeInTheDocument();
    expect(screen.queryByText('آموزش شامپو دافی')).toBeNull();
  });
});

describe('LearningPathPage — live course roadmap and all-education handoff', () => {
  it('orders assigned packages by path order, reflects actual package status, and opens the course list', async () => {
    const completedPackage: PackageSummary = {
      ...PKG,
      id: 'p-completed',
      title: 'آموزش تکمیل‌شده',
      status: 'completed',
      percent: 100,
      pathOrder: 1,
    };
    const inProgressPackage: PackageSummary = { ...PKG, pathOrder: 2 };
    const newPackage: PackageSummary = {
      ...PKG,
      id: 'p-new',
      title: 'آموزش تازه',
      status: 'new',
      percent: 0,
      pathOrder: 3,
    };
    mockApi({
      'GET /v1/me/packages': () => ({ data: [newPackage, inProgressPackage, completedPackage] }),
    });
    renderLearningPath();

    expect(await screen.findByRole('heading', { name: 'مسیر یادگیری من' })).toBeInTheDocument();
    const steps = await screen.findAllByTestId('learning-path-step');
    expect(steps.map((step) => step.getAttribute('href'))).toEqual([
      '/packages/p-completed',
      '/packages/p1',
      '/packages/p-new',
    ]);
    expect(screen.getByText('تکمیل‌شده')).toBeInTheDocument();
    expect(screen.getByText(/در حال یادگیری/)).toBeInTheDocument();
    expect(screen.getByText('شروع‌نشده')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'مشاهده تمام دوره‌ها' })).toHaveAttribute(
      'href',
      '/learn/all',
    );
  });

  it('alternates mascot side from left to right across segments as courses grow', async () => {
    const manyPackages: PackageSummary[] = [
      { ...PKG, id: 'p1', title: 'آموزش کیت درمانی فورمی', status: 'completed', pathOrder: 1 },
      {
        ...PKG,
        id: 'p2',
        title: 'آموزش فوم شستشوی صورت بابل',
        status: 'in_progress',
        pathOrder: 2,
      },
      { ...PKG, id: 'p3', title: 'آموزش کرم گرم کننده آتل', status: 'new', pathOrder: 3 },
      { ...PKG, id: 'p4', title: 'آموزش کرم ترک پا ویت آس', status: 'new', pathOrder: 4 },
      { ...PKG, id: 'p5', title: 'آموزش ضدآفتاب استیکی پیکسل', status: 'new', pathOrder: 5 },
      { ...PKG, id: 'p6', title: 'آموزش فروش برند آیس بال', status: 'new', pathOrder: 6 },
    ];
    mockApi({ 'GET /v1/me/packages': () => ({ data: manyPackages }) });
    renderLearningPath();

    expect(await screen.findByText('۱. آموزش کیت درمانی فورمی')).toBeInTheDocument();
    expect(screen.getByText('۵. آموزش ضدآفتاب استیکی پیکسل')).toBeInTheDocument();
    expect(screen.getByText('۶. آموزش فروش برند آیس بال')).toBeInTheDocument();

    const segments = screen.getAllByTestId('learning-path-segment');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveAttribute('data-mascot-side', 'left');
    expect(segments[1]).toHaveAttribute('data-mascot-side', 'right');
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
