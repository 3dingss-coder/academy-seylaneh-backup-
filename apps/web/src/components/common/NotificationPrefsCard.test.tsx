import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { mockApi } from '@/test/mockApi';
import { NotificationPrefsCard } from './NotificationPrefsCard';

/**
 * The shape `GET /me/notification-prefs` answers with — a muted category is only a *push* mute, the two
 * protected rows come from the server already marked `mutable: false`, and the opt-in list is whatever the
 * engine can actually run for this account. Keys and Persian labels mirror
 * `functions/src/domain/notification-categories.ts`; the screen must not care about anything else.
 */
const view = (over: Record<string, unknown> = {}) => ({
  prefs: { mutedCategories: [], preferredHour: 18, optIns: {}, updatedAt: null },
  protectedCategories: ['deadlines', 'health'],
  categories: [
    {
      key: 'deadlines',
      label: 'تکالیف و مهلت‌ها',
      hint: 'انتصاب تکلیف، یادآوری و عبور از مهلت.',
      mutable: false,
    },
    { key: 'quizzes', label: 'آزمون‌ها', hint: 'نتیجه آزمون و نمره.', mutable: true },
    { key: 'reminders', label: 'یادآوری مطالعه', hint: 'پلکان بی‌فعالیتی.', mutable: true },
    { key: 'health', label: 'وضعیت دوره', hint: 'پرونده‌ی یادگیری شما.', mutable: false },
  ],
  optInOptions: [
    {
      key: 'evening_nudge',
      name: 'یادآوری عصرگاهی',
      description: 'هر روز ۱۸:۰۰، فقط اگر خودتان بخواهید.',
    },
  ],
  ...over,
});

const get = (routes: Record<string, () => unknown> = {}) =>
  mockApi({
    'GET /v1/me/notification-prefs': () => ({ data: view() }),
    'PUT /v1/me/notification-prefs': (body) => ({
      data: { ...(body as object), updatedAt: 'now' },
    }),
    ...routes,
  });

/** `findByRole`, because the first render of this card is the loading state. */
const switchFor = (name: string) => screen.findByRole('switch', { name });

describe('NotificationPrefsCard', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('renders what the server says, and states the promise it keeps', async () => {
    get();
    render(<NotificationPrefsCard />);
    expect(await screen.findByRole('heading', { name: 'تنظیمات اعلان' })).toBeTruthy();
    // The one sentence that must be on the screen: a mute is a push mute, never a silenced inbox.
    expect(
      screen.getByText('خاموش‌کردن فقط پوش را قطع می‌کند؛ اعلان داخل اپ همیشه می‌رسد.'),
    ).toBeTruthy();
    expect((await switchFor('اعلان‌های آزمون‌ها')).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('نتیجه آزمون و نمره.')).toBeTruthy();
    // Nothing muted, so nothing is off — the server's empty `mutedCategories` is «everything on». The two
    // protected rows answer with their own caption instead of a clickable state.
    expect(screen.getAllByText('روشن')).toHaveLength(2);
    expect(screen.getAllByText('همیشه روشن')).toHaveLength(2);
    expect((await switchFor('دریافت «یادآوری عصرگاهی»')).textContent).toContain('خاموش');
  });

  it('a protected category is on, visible, and not operable', async () => {
    const { calls } = get();
    render(<NotificationPrefsCard />);
    const locked = await screen.findByRole('switch', { name: 'اعلان‌های تکالیف و مهلت‌ها' });
    expect(locked.getAttribute('aria-checked')).toBe('true');
    expect(locked.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('همیشه روشن')).toHaveLength(2); // deadlines and health
    fireEvent.click(locked);
    expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(0);
  });

  it('a click saves the whole list, not just the row that moved, and keeps the hour it does not show', async () => {
    const { calls } = get();
    render(<NotificationPrefsCard />);
    const quizzes = await switchFor('اعلان‌های آزمون‌ها');
    fireEvent.click(quizzes);
    // Optimistic: the switch answers before the network does.
    expect(quizzes.getAttribute('aria-checked')).toBe('false');
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'PUT /v1/me/notification-prefs')).toHaveLength(1),
    );
    expect(calls.find((c) => c.key === 'PUT /v1/me/notification-prefs')?.body).toEqual({
      mutedCategories: ['quizzes'],
      preferredHour: 18, // no UI for it (the `preferred_time` scenario is not runnable) — and PUT would clear it
      optIns: {},
    });
  });

  it('a save that is already in flight locks the other switches', async () => {
    // PUT and GET cannot go through `mockApi` here: the write must stay unresolved *across an await*, and
    // the router stringifies its answer. Same response shape, one controllable promise.
    let release!: (v: unknown) => void;
    const pending = new Promise((res) => {
      release = res;
    });
    const json = (data: unknown) =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) =>
        init.method === 'PUT' ? (await pending, json(undefined)) : json(view()),
      ),
    );
    render(<NotificationPrefsCard />);
    fireEvent.click(await switchFor('اعلان‌های آزمون‌ها'));
    const other = await switchFor('اعلان‌های یادآوری مطالعه');
    expect(other.hasAttribute('disabled')).toBe(true);
    release({ mutedCategories: ['quizzes'], preferredHour: 18, optIns: {} });
    await waitFor(() => expect(other.hasAttribute('disabled')).toBe(false));
  });

  it('a refused save rolls the switch back and says so in Persian', async () => {
    get({
      'PUT /v1/me/notification-prefs': () => ({
        error: { code: 'VALIDATION', message: 'اعلان‌های مهلت و سلامت را نمی‌توان خاموش کرد.' },
      }),
    });
    render(<NotificationPrefsCard />);
    const quizzes = await switchFor('اعلان‌های آزمون‌ها');
    fireEvent.click(quizzes);
    expect(quizzes.getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(quizzes.getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toBe(
      'اعلان‌های مهلت و سلامت را نمی‌توان خاموش کرد.',
    );
  });

  it('the opt-in block follows the server, and writes optIns', async () => {
    const { calls } = get();
    render(<NotificationPrefsCard />);
    const opt = await screen.findByRole('switch', { name: 'دریافت «یادآوری عصرگاهی»' });
    expect(opt.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(opt);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.key === 'PUT /v1/me/notification-prefs' &&
            JSON.stringify(c.body).includes('evening_nudge'),
        ),
      ).toBe(true),
    );
    expect(opt.getAttribute('aria-checked')).toBe('true');
  });

  it('no runnable opt-in → no «اعلان‌های انتخابی» section at all', async () => {
    get({
      'GET /v1/me/notification-prefs': () => ({ data: view({ optInOptions: [] }) }),
    });
    render(<NotificationPrefsCard />);
    await screen.findByRole('switch', { name: 'اعلان‌های آزمون‌ها' });
    expect(screen.queryByRole('group', { name: 'اعلان‌های انتخابی' })).toBeNull();
    expect(screen.queryByText('هر روز ۱۸:۰۰، فقط اگر خودتان بخواهید.')).toBeNull();
  });

  it('a failed load offers a retry instead of switches guessed from nothing', async () => {
    const routes = {
      'GET /v1/me/notification-prefs': () => ({
        error: { code: 'NETWORK', message: 'اتصال اینترنت برقرار نیست. دوباره تلاش کنید.' },
      }),
    };
    get(routes);
    render(<NotificationPrefsCard />);
    expect((await screen.findByRole('alert')).textContent).toContain('اتصال اینترنت برقرار نیست');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    // …and «تلاش دوباره» really asks again.
    const { fetchMock } = get({ 'GET /v1/me/notification-prefs': () => ({ data: view() }) });
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(screen.getAllByRole('switch').length).toBe(5));
    expect(fetchMock).toHaveBeenCalled();
  });
});
