import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CompletionReport } from './CompletionReport';
import type { CompletionRow } from '@/lib/types';

const row = (id: string, deadlineAt: string | null, percent: number): CompletionRow => ({
  userId: id,
  userName: `user-${id}`,
  teamId: 't',
  province: null,
  city: null,
  packageId: `p-${id}`,
  packageTitle: `pkg-${id}`,
  brandId: null,
  brandName: null,
  productId: null,
  productName: null,
  percent,
  status: 'in_progress',
  overdue: false,
  lagging: false,
  deadlineAt,
  completedAt: null,
  onTime: null,
  lastActivityAt: null,
  stuckAt: null,
});
const rows = [
  row('a', '2026-10-01T10:00:00Z', 10),
  row('b', '2026-10-05T22:00:00Z', 50), // 2026-10-06 01:30 Tehran
  row('c', '2026-10-09T10:00:00Z', 90),
];
const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').at(0)?.textContent);

describe('CompletionReport', () => {
  it('filters by Tehran-day range', () => {
    render(
      <MemoryRouter initialEntries={['/r?from=2026-10-06&to=2026-10-09']}>
        <CompletionReport rows={rows} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    expect(names()).toEqual(['user-b', 'user-c']);
  });
  it('sorts newest → oldest by deadline', async () => {
    render(
      <MemoryRouter>
        <CompletionReport rows={rows} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'مهلت' }));
    expect(names()).toEqual(['user-c', 'user-b', 'user-a']);
    await userEvent.click(screen.getByRole('button', { name: 'مهلت' }));
    expect(names()).toEqual(['user-a', 'user-b', 'user-c']);
  });
  it('shows one row per unique name, with every number under it', () => {
    const a = { ...row('a', null, 10), userName: 'علی عدلی', phone: '09105647497' };
    const b = { ...row('b', null, 50), userName: 'علی  عدلی', phone: '09105648752' };
    const c = { ...row('c', null, 90), userName: 'سارا احمدی', phone: '09120000004' };
    render(
      <MemoryRouter>
        <CompletionReport rows={[a, b, c]} memberLink={(i) => `/m/${i}`} />
      </MemoryRouter>,
    );
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('row').slice(1)).toHaveLength(2); // 2 people, not 3 accounts
    expect(table.getAllByText('علی عدلی')).toHaveLength(1);
    expect(table.getByText('۰۹۱۰۵۶۴۷۴۹۷')).toBeInTheDocument();
    expect(table.getByText('۰۹۱۰۵۶۴۸۷۵۲')).toBeInTheDocument();
    expect(table.getByText('pkg-a')).toBeInTheDocument();
    expect(table.getByText('pkg-b')).toBeInTheDocument();
  });
  it('offers delete only to the admin (onArchive given)', async () => {
    const calls: unknown[] = [];
    render(
      <MemoryRouter>
        <CompletionReport
          rows={[row('a', null, 10)]}
          memberLink={(i) => `/m/${i}`}
          onArchive={async (items) => void calls.push(items)}
        />
      </MemoryRouter>,
    );
    const table = within(screen.getByRole('table'));
    await userEvent.click(table.getByRole('button', { name: /حذف گزارش pkg-a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'حذف و انتقال به آرشیو' }));
    expect(calls).toEqual([[{ userId: 'a', packageId: 'p-a' }]]);
  });
});
