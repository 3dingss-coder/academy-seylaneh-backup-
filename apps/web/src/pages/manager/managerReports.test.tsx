import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { mockApi } from '@/test/mockApi';
import type { CompletionReport, ManagerMembersResponse, QuizReport } from '@/lib/types';
import { ManagerReports } from './ManagerReports';

const now = Date.now();
const COMPLETION: CompletionReport = {
  rows: [{
    userId: 'user-a', userName: 'عضو نمونه', teamId: 'team-a', province: 'تهران', city: 'تهران', phone: '09120000001',
    packageId: 'package-a', packageTitle: 'آموزش محصول واقعی', brandId: 'brand-a', brandName: 'برند الف',
    productId: 'product-a', productName: 'محصول الف', percent: 100, status: 'completed', overdue: false, lagging: false,
    deadlineAt: null, completedAt: new Date(now - 8 * 86_400_000).toISOString(), onTime: true,
    lastActivityAt: new Date(now - 8 * 86_400_000).toISOString(), stuckAt: null,
  }],
};
const QUIZZES: QuizReport = {
  attempts: [{
    attemptId: 'attempt-a', userId: 'user-a', userName: 'عضو نمونه', teamId: 'team-a', province: 'تهران', city: 'تهران',
    packageId: 'package-a', packageTitle: 'آموزش محصول واقعی', brandName: 'برند الف', productName: 'محصول الف',
    sectionId: 'section-a', sectionTitle: 'بخش یک', quizId: 'quiz-a', attemptNumber: 1, total: 4, correct: 4, wrong: 0,
    unanswered: 0, score: 100, passScore: 70, passed: true, startedAt: new Date(now - 8 * 86_400_000).toISOString(),
    submittedAt: new Date(now - 8 * 86_400_000).toISOString(), durationSec: 60,
  }],
  summary: [],
};
const MEMBERS: ManagerMembersResponse = {
  team: { id: 'team-a', name: 'تیم نمونه' }, totals: { members: 1, active: 1, inactive: 0, lagging: 0 },
  members: [{ id: 'user-a', name: 'عضو نمونه', avatarUrl: null, phone: '09120000001', province: 'تهران', city: 'تهران', status: 'active', createdAt: new Date(now - 30 * 86_400_000).toISOString(), lastActiveAt: new Date(now - 8 * 86_400_000).toISOString(), stats: { assigned: 1, completed: 1, averageProgress: 100, lagging: 0 }, packages: [] }],
};

function renderReports(initialEntry = '/manager/reports') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ManagerReports />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ManagerReports — executive report and existing report tabs', () => {
  it('presents team-scoped real learning and quiz metrics with explicit data limits', async () => {
    mockApi({
      'GET /v1/manager/reports/completion': () => ({ data: COMPLETION }),
      'GET /v1/manager/reports/quizzes': () => ({ data: QUIZZES }),
      'GET /v1/manager/members': () => ({ data: MEMBERS }),
    });
    renderReports();
    expect(await screen.findByText('نرخ تکمیل فعلی')).toBeInTheDocument();
    expect(screen.getByText('تکمیل در بازه')).toBeInTheDocument();
    expect(screen.getByText('آمادگی محصول')).toBeInTheDocument();
    expect(screen.getByText('پوشش منطقه‌ای')).toBeInTheDocument();
    expect(screen.getByText(/هزینهٔ تبلیغات، فروش، ROAS/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بازه زمانی'), { target: { value: '90' } });
    expect(await screen.findByText('۹۰ روز اخیر')).toBeInTheDocument();
  });

  it('keeps completion and quiz detail tabs accessible', async () => {
    mockApi({
      'GET /v1/manager/reports/completion': () => ({ data: COMPLETION }),
      'GET /v1/manager/reports/quizzes': () => ({ data: QUIZZES }),
      'GET /v1/manager/members': () => ({ data: MEMBERS }),
    });
    renderReports();
    await screen.findByText('نرخ تکمیل فعلی');
    fireEvent.click(screen.getByRole('tab', { name: 'تکمیل آموزش' }));
    expect(await screen.findByText('برند')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'نتایج آزمون' }));
    expect(await screen.findByText('خلاصه هر کاربر')).toBeInTheDocument();
  });

  it('opens the existing overdue-report deep link on the filtered completion tab', async () => {
    mockApi({
      'GET /v1/manager/reports/completion': () => ({ data: COMPLETION }),
      'GET /v1/manager/reports/quizzes': () => ({ data: QUIZZES }),
      'GET /v1/manager/members': () => ({ data: MEMBERS }),
    });
    renderReports('/manager/reports?status=overdue');
    expect(await screen.findByLabelText('وضعیت')).toHaveValue('overdue');
    expect(screen.getByRole('tab', { name: 'تکمیل آموزش' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('نرخ تکمیل فعلی')).not.toBeInTheDocument();
  });
});
