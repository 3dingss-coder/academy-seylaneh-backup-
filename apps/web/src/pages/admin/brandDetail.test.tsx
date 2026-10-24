import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type {
  AdminBrand,
  AdminPackage,
  AdminProduct,
  CompletionReport,
  Me,
  QuizReport,
} from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';

const admin: Me = { ...marketer, id: 'admin-1', name: 'ادمین', role: 'admin', teamId: null };
const member: Me = {
  ...marketer,
  id: 'member-1',
  name: 'سارا احمدی',
  role: 'marketer',
  teamId: 'team-1',
  brandIds: ['brand-1'],
  status: 'active',
};
const brand: AdminBrand = {
  id: 'brand-1',
  name: 'آتل',
  nameLatin: 'Atel',
  logoUrl: '/catalog/brands/atel.png',
  logoIsFallback: false,
  sortOrder: 1,
  archived: false,
  createdAt: '2026-05-15T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const product: AdminProduct = {
  id: 'product-1',
  brandId: brand.id,
  name: 'سرم آبرسان',
  code: 'A-101',
  category: 'مراقبت پوست',
  description: 'توضیح محصول',
  imageUrl: '/catalog/products/serum.webp',
  imageIsFallback: false,
  archived: false,
};
const pkg: AdminPackage = {
  id: 'package-1',
  title: 'آموزش معرفی سرم',
  description: 'آموزش معرفی محصول',
  brandId: brand.id,
  productId: product.id,
  status: 'published',
  deadlineAt: null,
  estimatedMinutes: 8,
  coverUrl: null,
  sections: [{ id: 'section-1', title: 'معرفی محصول', order: 1 }],
  publishedAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};
const completion: CompletionReport = {
  rows: [
    {
      userId: member.id,
      userName: member.name,
      phone: member.phone,
      teamId: member.teamId,
      province: member.province,
      city: member.city,
      packageId: pkg.id,
      packageTitle: pkg.title,
      brandId: brand.id,
      brandName: brand.name,
      productId: product.id,
      productName: product.name,
      percent: 100,
      status: 'completed',
      overdue: false,
      lagging: false,
      deadlineAt: null,
      completedAt: new Date().toISOString(),
      onTime: true,
      lastActivityAt: new Date().toISOString(),
      stuckAt: null,
    },
  ],
};
const quizzes: QuizReport = {
  attempts: [
    {
      attemptId: 'attempt-1',
      userId: member.id,
      userName: member.name,
      phone: member.phone,
      teamId: member.teamId,
      province: member.province,
      city: member.city,
      packageId: pkg.id,
      packageTitle: pkg.title,
      brandName: brand.name,
      productName: product.name,
      sectionId: 'section-1',
      sectionTitle: 'آزمون معرفی محصول',
      quizId: 'quiz-1',
      attemptNumber: 1,
      total: 5,
      correct: 4,
      wrong: 1,
      unanswered: 0,
      score: 80,
      passScore: 70,
      passed: true,
      startedAt: '2026-10-10T10:00:00.000Z',
      submittedAt: new Date().toISOString(),
      durationSec: 180,
    },
  ],
  summary: [],
};

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

function mocks(extra: Record<string, unknown> = {}) {
  localStorage.setItem('ssl.refresh', 'refresh-1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 'token-1', refreshToken: 'refresh-2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/brands': () => ({ data: [brand] }),
    'GET /v1/admin/products?brandId=brand-1': () => ({ data: [product] }),
    'GET /v1/admin/packages?brandId=brand-1': () => ({ data: [pkg] }),
    'GET /v1/admin/users': () => ({ data: [member] }),
    'GET /v1/admin/teams': () => ({
      data: [
        { id: 'team-1', name: 'تیم تهران', managerId: null, managerName: null, memberCount: 1 },
      ],
    }),
    'GET /v1/admin/reports/completion?brand=brand-1': () => ({ data: completion }),
    'GET /v1/admin/reports/quizzes?brand=brand-1': () => ({ data: quizzes }),
    ...extra,
  };
}

describe('BrandDetailPage — reference dashboard with real brand data', () => {
  it('shows live brand metrics, recent activity, products and assigned members', async () => {
    mockApi(mocks());
    renderApp('/admin/content/brands/brand-1');

    expect(
      await screen.findByRole('heading', { name: 'آتل' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('محصولات فعال')).toBeInTheDocument();
    expect(screen.getByText('میانگین نمرهٔ آزمون')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'نمودار تکمیل آموزش‌های برند در شش ماه اخیر' }),
    ).toBeInTheDocument();
    expect(screen.getByText('سرم آبرسان')).toBeInTheDocument();
    expect(screen.getByText('محتوای آموزشی اخیر')).toBeInTheDocument();
    expect(screen.getByText('اعضای برند')).toBeInTheDocument();
    expect(screen.getByText('سارا احمدی')).toBeInTheDocument();
  });

  it('keeps product management and existing brand-level learning actions on their tabs', async () => {
    mockApi(mocks());
    renderApp('/admin/content/brands/brand-1');

    await screen.findByRole('heading', { name: 'آتل' }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: /محصولات/ }));
    expect(await screen.findByRole('button', { name: 'محصول جدید' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش سرم آبرسان' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /محتوای آموزشی/ }));
    expect(await screen.findByRole('heading', { name: 'آموزش‌های سطح برند' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /آموزش معرفی سرم/ })).toHaveAttribute(
      'href',
      '/admin/packages/package-1',
    );
  });
});
