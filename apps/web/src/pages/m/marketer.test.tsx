import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import type { HomeData, PackageSummary } from '@/lib/types';
import { EmptyState, ToastProvider } from '@/components/ui';
import { Mascot } from '@/components/brand/Mascot';
import { HomePage } from './HomePage';
import { LearnPage } from './LearnPage';
import { LearningPathPage } from './LearningPathPage';
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
  it('renders the continue-card focal action + play CTA, progress ring and suggested courses', async () => {
    mockApi(homeRoutes(HOME_ROUTINE));
    renderHome();
    expect(await screen.findByTestId('next-item')).toBeInTheDocument();
    // The visible button keeps the real action label accessible (fixture action = «start»).
    expect(screen.getByRole('button', { name: /شروع: بخش اول/ })).toBeInTheDocument();
    // Fixed microcopy follows the approved page reference; names, course content and progress stay live.
    expect(screen.getByText('ادامه یادگیری')).toBeInTheDocument();
    expect(screen.getByText('پیشرفت کلی شما')).toBeInTheDocument();
    expect(screen.getByText('در مسیر عالی هستید!')).toBeInTheDocument();
    expect(screen.getByText('امروز یک قدم دیگر به موفقیت نزدیک‌تر شدی!')).toBeInTheDocument();
    expect(screen.getByText('دوره‌ها')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'دوره‌ها' })).toHaveAttribute('href', '/learn/all');
    expect(screen.getByText('مسیر یادگیری')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'مسیر یادگیری' })).toHaveAttribute('href', '/learn');
    expect(screen.getByText('آزمون‌ها')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'آزمون‌ها' })).toHaveAttribute('href', '/learn/all');
    expect(screen.getByText('مدال')).toBeInTheDocument();
    expect(screen.getByText('دوره‌های پیشنهادی')).toBeInTheDocument();
    expect(screen.getByTestId('package-card')).toBeInTheDocument();
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
