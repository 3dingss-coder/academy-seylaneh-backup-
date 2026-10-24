import { describe, expect, it } from 'vitest';
import type { CompletionRow, ManagerMemberRow, QuizAttemptRow } from '@/lib/types';
import { buildManagerReportSnapshot, type ManagerReportFilters } from './managerReportModel';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-21T12:00:00.000Z');

function completion(overrides: Partial<CompletionRow> = {}): CompletionRow {
  return {
    userId: 'user-a',
    userName: 'عضو الف',
    teamId: 'team-a',
    province: 'تهران',
    city: 'تهران',
    packageId: 'pkg-a',
    packageTitle: 'آموزش محصول الف',
    brandId: 'brand-a',
    brandName: 'برند الف',
    productId: 'product-a',
    productName: 'محصول الف',
    percent: 100,
    status: 'completed',
    overdue: false,
    lagging: false,
    deadlineAt: null,
    completedAt: new Date(NOW - 10 * DAY).toISOString(),
    onTime: true,
    lastActivityAt: new Date(NOW - 10 * DAY).toISOString(),
    stuckAt: null,
    ...overrides,
  };
}
function attempt(overrides: Partial<QuizAttemptRow> = {}): QuizAttemptRow {
  return {
    attemptId: 'attempt-a',
    userId: 'user-a',
    userName: 'عضو الف',
    teamId: 'team-a',
    province: 'تهران',
    city: 'تهران',
    packageId: 'pkg-a',
    packageTitle: 'آموزش محصول الف',
    brandName: 'برند الف',
    productName: 'محصول الف',
    sectionId: 'section-a',
    sectionTitle: 'بخش اول',
    quizId: 'quiz-a',
    attemptNumber: 1,
    total: 4,
    correct: 3,
    wrong: 1,
    unanswered: 0,
    score: 75,
    passScore: 70,
    passed: true,
    startedAt: new Date(NOW - 10 * DAY).toISOString(),
    submittedAt: new Date(NOW - 10 * DAY).toISOString(),
    durationSec: 60,
    ...overrides,
  };
}
const member = (overrides: Partial<ManagerMemberRow> = {}): ManagerMemberRow => ({
  id: 'user-a',
  name: 'عضو الف',
  avatarUrl: null,
  phone: '09120000001',
  province: 'تهران',
  city: 'تهران',
  status: 'active',
  createdAt: new Date(NOW - 100 * DAY).toISOString(),
  lastActiveAt: new Date(NOW - 10 * DAY).toISOString(),
  stats: { assigned: 1, completed: 1, averageProgress: 100, lagging: 0 },
  packages: [],
  ...overrides,
});
const FILTERS: ManagerReportFilters = {
  period: '30',
  brand: '',
  product: '',
  province: '',
  city: '',
};

describe('manager executive report model', () => {
  it('compares equal periods, scopes dimensions, and counts real quiz attempts', () => {
    const rows = [
      completion(),
      completion({
        userId: 'user-b',
        packageId: 'pkg-b',
        productId: 'product-b',
        productName: 'محصول ب',
        status: 'in_progress',
        percent: 40,
        completedAt: null,
        onTime: null,
        overdue: true,
        lagging: true,
      }),
      completion({
        userId: 'user-c',
        packageId: 'pkg-c',
        completedAt: new Date(NOW - 45 * DAY).toISOString(),
      }),
      completion({
        userId: 'user-d',
        packageId: 'pkg-d',
        brandName: 'برند دیگر',
        brandId: 'brand-b',
        completedAt: new Date(NOW - 5 * DAY).toISOString(),
      }),
    ];
    const attempts = [
      attempt(),
      attempt({
        attemptId: 'unscored',
        passed: null,
        score: null,
        submittedAt: new Date(NOW - 2 * DAY).toISOString(),
      }),
      attempt({ attemptId: 'future', submittedAt: new Date(NOW + DAY).toISOString() }),
      attempt({ attemptId: 'old', submittedAt: new Date(NOW - 45 * DAY).toISOString() }),
      attempt({
        attemptId: 'other-brand',
        brandName: 'برند دیگر',
        submittedAt: new Date(NOW - 5 * DAY).toISOString(),
      }),
    ];
    const snapshot = buildManagerReportSnapshot(
      rows,
      attempts,
      [member()],
      { ...FILTERS, brand: 'برند الف', province: 'تهران' },
      NOW,
    );
    expect(snapshot.assignments).toBe(3);
    expect(snapshot.completed).toBe(2);
    expect(snapshot.overdue).toBe(1);
    expect(snapshot.lagging).toBe(1);
    expect(snapshot.completedInPeriod).toBe(1);
    expect(snapshot.previousPeriodCompleted).toBe(1);
    expect(snapshot.quizAttempts).toBe(2);
    expect(snapshot.quizScoredAttempts).toBe(1);
    expect(snapshot.quizPassRate).toBe(100);
    expect(snapshot.averageScore).toBe(75);
    expect(snapshot.products[0]).toMatchObject({
      brand: 'برند الف',
      product: 'محصول الف',
      assigned: 2,
      completed: 2,
    });
    expect(snapshot.regions[0]).toMatchObject({ province: 'تهران', members: 3, assigned: 3 });
  });

  it('does not manufacture a prior-period comparison for the all-data view', () => {
    const snapshot = buildManagerReportSnapshot(
      [completion({ completedAt: new Date(NOW - 200 * DAY).toISOString() })],
      [],
      [member()],
      { ...FILTERS, period: 'all' },
      NOW,
    );
    expect(snapshot.completedInPeriod).toBe(1);
    expect(snapshot.previousPeriodCompleted).toBeNull();
    expect(snapshot.quizPassRate).toBeNull();
  });
});
