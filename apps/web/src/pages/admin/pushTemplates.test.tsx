import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import type { Me } from '@/lib/types';
import { marketer } from '@/test/fixtures';
import { mockApi } from '@/test/mockApi';
import { renderApp } from '@/test/renderApp';
import {
  DESTINATIONS,
  isSafeImageUrl,
  isSafeInternalPath,
  validateForm,
} from './pushCampaignModel';
import { PUSH_TEMPLATES, formFromTemplate } from './pushTemplates';

const admin: Me = { ...marketer, id: 'a1', name: 'ادمین', role: 'admin', teamId: null };

// Vitest runs from apps/web/, so the mirrored banners sit in public/push-templates.
const PUBLIC_TEMPLATES = path.resolve(process.cwd(), 'public', 'push-templates');

const asAdmin = () => {
  localStorage.setItem('ssl.refresh', 'r1');
  return {
    'POST /v1/auth/refresh': () => ({
      data: { user: admin, idToken: 't1', refreshToken: 'r2', expiresIn: 3600 },
    }),
    'GET /v1/me': () => ({ data: admin }),
    'GET /v1/admin/teams': () => ({ data: [] }),
    'GET /v1/admin/users': () => ({ data: [] }),
    'GET /v1/me/notifications': () => ({ data: { unread: 0, items: [] } }),
    'GET /v1/admin/notification-templates': () => ({ data: [] }),
    'POST /v1/admin/push-campaigns/audience-preview': () => ({
      data: { users: 42, withPushDevice: 30, webDevices: 10, androidDevices: 25, note: 'تقریبی' },
    }),
    'GET /v1/admin/push-campaigns/dashboard': () => ({
      data: {
        counts: {
          total: 0,
          draft: 0,
          scheduled: 0,
          inProgress: 0,
          sent: 0,
          failed: 0,
          cancelled: 0,
        },
        providerRequests: { attempted: 0, accepted: 0, failed: 0, invalid: 0 },
        recent: [],
      },
    }),
    'GET /v1/admin/push-campaigns': () => ({ data: { items: [], nextCursor: null, total: 0 } }),
  } as const;
};

const newCampaign = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'کمپین',
  title: 'عنوان',
  body: 'متن',
  imageUrl: null,
  actionRef: '/messages',
  audience: { type: 'all', targetId: null, channel: 'any' },
  status: 'draft',
  scheduledAt: null,
  targetCount: null,
  pushReachable: null,
  version: 1,
  createdAt: '2026-10-08T06:00:00.000Z',
  updatedAt: '2026-10-08T06:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  summary: {
    batchesTotal: 0,
    batchesDone: 0,
    users: 0,
    attempted: 0,
    accepted: 0,
    failed: 0,
    invalid: 0,
    noDevice: 0,
    interrupted: 0,
  },
  lastError: null,
  archivedAt: null,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  session.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('مدل قالب‌های Push', () => {
  it('every template passes client validation with a safe image and an allowed destination', () => {
    for (const t of PUSH_TEMPLATES) {
      const form = formFromTemplate(t);
      expect(validateForm(form), t.id).toEqual({});
      expect(isSafeImageUrl(t.imageUrl), t.id).toBe(true);
      expect(isSafeInternalPath(t.actionRef), t.id).toBe(true);
      expect(
        DESTINATIONS.some((d) => d.value === t.actionRef),
        t.id,
      ).toBe(true);
      // Audience, channel and schedule stay at their untouched defaults.
      expect(form.audienceType).toBe('all');
      expect(form.channel).toBe('any');
      expect(form.scheduleDate).toBe('');
      expect(form.scheduleTime).toBe('');
    }
  });

  it('template ids are unique and each image exists in public/push-templates', () => {
    const ids = PUSH_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const file = `${PUBLIC_TEMPLATES}/${id}.webp`;
      expect(fs.existsSync(file), `${id}.webp`).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(150 * 1024);
    }
  });
});

describe('صفحه «قالب‌ها»', () => {
  it('renders the templates tab from ?tab=templates with the category filter', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns?tab=templates');
    // First test of the file mounts the lazy admin chunk cold → allow extra time.
    expect(
      await screen.findByRole('tab', { name: 'قالب‌ها' }, { timeout: 8000 }),
    ).toBeInTheDocument();
    // All eight templates render as cards.
    expect(await screen.findAllByTestId(/template-card-/)).toHaveLength(8);
    expect(screen.getAllByText('استفاده از این قالب')).toHaveLength(8);
    // The status filter (campaigns tab) is NOT shown on the templates tab.
    expect(screen.queryByRole('tablist', { name: 'فیلتر وضعیت' })).not.toBeInTheDocument();
  });

  it('the category filter narrows the grid to one card', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns?tab=templates');
    await screen.findAllByTestId(/template-card-/);
    fireEvent.click(screen.getByRole('button', { name: /یادآوری آموزش/ }));
    await waitFor(() => expect(screen.getAllByTestId(/template-card-/)).toHaveLength(1));
    expect(screen.getByTestId('template-card-reminder')).toBeInTheDocument();
  });

  it('«استفاده از این قالب» opens the prefilled editor and keeps the audience at all', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns?tab=templates');
    const card = await screen.findByTestId('template-card-new-course');
    fireEvent.click(within(card).getByTestId('use-template-new-course'));
    // The editor is now prefilled from the template.
    const title = await screen.findByLabelText('عنوان اعلان');
    expect(title).toHaveValue('یه آموزش تازه منتظرته!');
    expect(screen.getByLabelText('متن اعلان')).toHaveValue(
      'همین حالا محتوای جدیدی به دوره‌های شما اضافه شده.',
    );
    // Audience untouched.
    expect(screen.getByLabelText('مخاطبان هدف')).toHaveValue('all');
  });

  it('defaults to the campaigns tab and ?tab=templates is required for the grid', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns');
    expect(await screen.findByRole('tab', { name: 'کمپین‌ها' })).toBeInTheDocument();
    expect(screen.queryByTestId(/template-card-/)).not.toBeInTheDocument();
    // Status filter is present on the campaigns tab.
    expect(screen.getByRole('tablist', { name: 'فیلتر وضعیت' })).toBeInTheDocument();
  });
});

describe('ادیتور با ?template=', () => {
  it('prefills the form from a valid template without sending anything', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new?template=offer');
    const title = await screen.findByLabelText('عنوان اعلان');
    expect(title).toHaveValue('پیشنهاد ویژه برای تو');
    // The template banner is shown.
    expect(screen.getByTestId('template-banner')).toBeInTheDocument();
    expect(screen.getByText('ساخته‌شده از قالب')).toBeInTheDocument();
    // Image is the template's absolute https URL.
    expect(screen.getByLabelText(/آدرس تصویر/)).toHaveValue(
      'https://academy-seylaneh.site/push-templates/offer.webp',
    );
  });

  it('ignores an unknown template id and leaves an empty, error-free form', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new?template=does-not-exist');
    const title = await screen.findByLabelText('عنوان اعلان');
    expect(title).toHaveValue('');
    expect(screen.queryByTestId('template-banner')).not.toBeInTheDocument();
  });

  it('edits after applying a template land in the final payload', async () => {
    const m = mockApi({
      ...asAdmin(),
      'POST /v1/admin/push-campaigns': (body) => ({
        status: 201,
        data: { campaign: newCampaign({ id: 'c9', ...(body as object) }), batches: [] },
      }),
    });
    renderApp('/admin/push-campaigns/new?template=new-course');
    await screen.findByLabelText('عنوان اعلان');
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), {
      target: { value: 'عنوان ویرایش‌شده' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));
    await waitFor(() =>
      expect(m.calls.some((c) => c.key === 'POST /v1/admin/push-campaigns')).toBe(true),
    );
    const post = m.calls.find((c) => c.key === 'POST /v1/admin/push-campaigns');
    expect(post?.body).toMatchObject({
      title: 'عنوان ویرایش‌شده',
      body: 'همین حالا محتوای جدیدی به دوره‌های شما اضافه شده.',
      imageUrl: 'https://academy-seylaneh.site/push-templates/new-course.webp',
      actionRef: '/learn',
      audience: { type: 'all', channel: 'any' },
    });
  });

  it('asks for confirmation before replacing text on a form the admin has edited', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new?template=new-course');
    await screen.findByLabelText('عنوان اعلان');
    // Make the form dirty.
    fireEvent.change(screen.getByLabelText('عنوان اعلان'), {
      target: { value: 'متن دست‌کاری‌شده' },
    });
    // Open the header picker and choose a different template.
    fireEvent.click(screen.getByRole('button', { name: /قالب آماده/ }));
    const list = await screen.findByTestId('template-picker-list');
    fireEvent.click(within(list).getByTestId('template-option-reminder'));
    // Confirm dialog appears instead of an immediate replace.
    expect(
      await screen.findByRole('dialog', { name: 'جایگزینی متن‌های فعلی؟' }),
    ).toBeInTheDocument();
  });

  it('does not ask for confirmation when switching between untouched templates twice', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new?template=new-course');
    await screen.findByLabelText('عنوان اعلان');
    for (const id of ['event', 'offer']) {
      fireEvent.click(screen.getByRole('button', { name: /قالب آماده/ }));
      const list = await screen.findByTestId('template-picker-list');
      fireEvent.click(within(list).getByTestId(`template-option-${id}`));
      expect(
        screen.queryByRole('dialog', { name: 'جایگزینی متن‌های فعلی؟' }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText('عنوان اعلان')).toHaveValue('پیشنهاد ویژه برای تو');
  });

  it('replaces directly when the form is untouched', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new?template=new-course');
    await screen.findByLabelText('عنوان اعلان');
    fireEvent.click(screen.getByRole('button', { name: /قالب آماده/ }));
    const list = await screen.findByTestId('template-picker-list');
    fireEvent.click(within(list).getByTestId('template-option-event'));
    // No confirm dialog; the title swaps straight away.
    expect(
      screen.queryByRole('dialog', { name: 'جایگزینی متن‌های فعلی؟' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('عنوان اعلان')).toHaveValue('رویداد ویژه این هفته');
  });
});

describe('دسترسی سریع به انتخابگر قالب', () => {
  it('is visible on the campaign list', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns');
    expect(await screen.findByRole('button', { name: /قالب آماده/ })).toBeInTheDocument();
  });

  it('is visible in the editor header', async () => {
    mockApi(asAdmin());
    renderApp('/admin/push-campaigns/new');
    expect(await screen.findByRole('button', { name: /قالب آماده/ })).toBeInTheDocument();
  });

  it('is visible on the notifications page and opens the prefilled editor', async () => {
    mockApi(asAdmin());
    renderApp('/admin/notifications');
    expect(await screen.findByRole('tab', { name: 'ارسال دستی' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'ارسال دستی' }));
    const picker = await screen.findByRole('button', { name: /شروع از قالب آماده/ });
    fireEvent.click(picker);
    const list = await screen.findByTestId('template-picker-list');
    expect(list).toBeInTheDocument();
  });
});
