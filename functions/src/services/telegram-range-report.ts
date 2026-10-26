import type { Attempt, User } from '../domain/types';
import { DAY } from '../lib/time';
import { buildXlsx, type XlsxSheet } from '../lib/xlsx';
import type { Doc } from '../store/types';
import type { Deps } from './context';
import { getPolicy } from './context';
import type { PackageCompletion } from './learning-state';
import { attemptTally, loadMembers } from './reports';
import { effectiveManagerProvinces, managerMarketers } from './team-scope';

interface PlaybackEvent {
  userId: string;
  sectionId: string;
  acceptedDeltaSec?: number;
  playedDeltaSec: number;
  ts: string;
}

/** Rolling activity report. Dates filter event time, never an assignment's deadline. */
export async function buildManagerRangeReport(d: Deps, manager: Doc<User>, days: 1 | 30) {
  const to = d.clock();
  const from = new Date(to.getTime() - days * DAY);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const policy = await getPolicy(d);
  const formatter = new Intl.DateTimeFormat('fa-IR', {
    timeZone: policy.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateTime = (at: string) => formatter.format(new Date(at));
  const label = days === 1 ? 'یک روز اخیر (۲۴ ساعت)' : '۳۰ روز اخیر';
  const users = await managerMarketers(d, manager);
  const [members, playback, attempts, completions] = await Promise.all([
    loadMembers(d, users),
    d.store.query<PlaybackEvent>({
      collection: 'playback_events',
      where: [
        ['ts', '>=', fromIso],
        ['ts', '<=', toIso],
      ],
    }),
    d.store.query<Attempt>({
      collection: 'attempts',
      where: [
        ['submittedAt', '>=', fromIso],
        ['submittedAt', '<=', toIso],
      ],
    }),
    d.store.query<PackageCompletion>({
      collection: 'package_completions',
      where: [
        ['completedAt', '>=', fromIso],
        ['completedAt', '<=', toIso],
      ],
    }),
  ]);

  type Activity = {
    seconds: number;
    attempts: number;
    passed: number;
    completed: boolean;
    last: string;
  };
  const activity = new Map<string, Activity>();
  const key = (userId: string, packageId: string) => `${userId}|${packageId}`;
  const packages = new Map(
    members.flatMap((m) =>
      m.packages
        .filter((p) => p.packageStatus === 'published' || p.status === 'completed')
        .map((p) => [key(m.user.id, p.id), p] as const),
    ),
  );
  const sectionPackage = new Map(
    [...packages.values()].flatMap((p) => p.sections.map((s) => [s.id, p.id] as const)),
  );
  const touch = (userId: string, packageId: string, at: string): Activity | null => {
    const k = key(userId, packageId);
    // The same scoped and archive-filtered packages as the site's Manager reports.
    if (!packages.has(k)) return null;
    let row = activity.get(k);
    if (!row) {
      row = { seconds: 0, attempts: 0, passed: 0, completed: false, last: at };
      activity.set(k, row);
    }
    if (at > row.last) row.last = at;
    return row;
  };
  for (const event of playback) {
    const packageId = sectionPackage.get(event.sectionId);
    if (!packageId) continue;
    const delta = event.acceptedDeltaSec ?? event.playedDeltaSec;
    if (!(delta > 0) || !Number.isFinite(delta)) continue;
    const row = touch(event.userId, packageId, event.ts);
    if (row) row.seconds += delta;
  }
  const quizRows: XlsxSheet['rows'] = [
    [
      'نام بازاریاب',
      'استان',
      'شهر',
      'آموزش',
      'شماره تلاش',
      'نمره',
      'نتیجه',
      'صحیح',
      'غلط',
      'بی‌پاسخ',
      'زمان ثبت',
    ],
  ];
  const byUser = new Map(users.map((u) => [u.id, u]));
  for (const attempt of attempts) {
    if (attempt.status !== 'submitted' || !attempt.submittedAt) continue;
    const user = byUser.get(attempt.userId);
    const pkg = packages.get(key(attempt.userId, attempt.packageId));
    if (!user || !pkg) continue;
    const row = touch(attempt.userId, attempt.packageId, attempt.submittedAt);
    if (!row) continue;
    row.attempts++;
    if (attempt.passed) row.passed++;
    const tally = attemptTally(attempt);
    quizRows.push([
      user.name,
      user.province,
      user.city,
      pkg.title,
      attempt.attemptNumber,
      attempt.score,
      attempt.passed ? 'قبول' : 'رد',
      tally.correct,
      tally.wrong,
      tally.unanswered,
      dateTime(attempt.submittedAt),
    ]);
  }
  for (const completion of completions) {
    const row = touch(completion.userId, completion.packageId, completion.completedAt);
    if (row) row.completed = true;
  }
  const summary: XlsxSheet['rows'] = [
    [
      'نام بازاریاب',
      'موبایل',
      'استان',
      'شهر',
      'دقایق آموزش در بازه',
      'آموزش‌های دارای فعالیت',
      'آموزش تکمیل‌شده در بازه',
      'تلاش آزمون در بازه',
      'آزمون قبول‌شده در بازه',
      'آخرین فعالیت در بازه',
    ],
  ];
  const detail: XlsxSheet['rows'] = [
    [
      'نام بازاریاب',
      'استان',
      'شهر',
      'آموزش',
      'برند',
      'دقایق آموزش در بازه',
      'تکمیل در بازه',
      'تلاش آزمون در بازه',
      'قبولی در بازه',
      'آخرین فعالیت در بازه',
      'پیشرفت فعلی (٪)',
    ],
  ];
  let activeMembers = 0;
  for (const member of members) {
    const rows = member.packages.flatMap((pkg) => {
      const row = activity.get(key(member.user.id, pkg.id));
      if (!row) return [];
      detail.push([
        member.user.name,
        member.user.province,
        member.user.city,
        pkg.title,
        pkg.brand?.name,
        Math.round(row.seconds / 6) / 10,
        row.completed ? 'بله' : 'خیر',
        row.attempts,
        row.passed,
        dateTime(row.last),
        pkg.percent,
      ]);
      return [row];
    });
    if (rows.length) activeMembers++;
    const last = rows
      .map((r) => r.last)
      .sort()
      .at(-1);
    summary.push([
      member.user.name,
      member.user.phone,
      member.user.province,
      member.user.city,
      Math.round(rows.reduce((n, r) => n + r.seconds, 0) / 6) / 10,
      rows.length,
      rows.filter((r) => r.completed).length,
      rows.reduce((n, r) => n + r.attempts, 0),
      rows.reduce((n, r) => n + r.passed, 0),
      last ? dateTime(last) : 'بدون فعالیت در بازه',
    ]);
  }
  const scope = effectiveManagerProvinces(manager).join('، ');
  return {
    filename: `manager-report-${days}d-${toIso.replace(/[:.]/g, '-')}.xlsx`,
    bytes: buildXlsx([
      {
        name: 'مشخصات گزارش',
        rows: [
          ['عنوان', 'مقدار'],
          ['بازه', label],
          ['از', dateTime(fromIso)],
          ['تا', dateTime(toIso)],
          ['منطقه زمانی', policy.timezone],
          ['مدیر', manager.name],
          ['استان‌ها', scope],
          [
            'توضیح',
            'آمار بر اساس زمان فعالیت و ثبت آزمون و تکمیل آموزش است. پیشرفت فعلی، وضعیت لحظه دریافت گزارش است.',
          ],
        ],
        colWidths: [24, 90],
      },
      {
        name: 'خلاصه بازاریاب‌ها',
        rows: summary,
        colWidths: [24, 16, 14, 14, 24, 24, 24, 24, 24, 26],
      },
      {
        name: 'فعالیت آموزش‌ها',
        rows: detail,
        colWidths: [24, 14, 14, 32, 18, 24, 18, 24, 18, 26, 24],
      },
      {
        name: 'نتایج آزمون‌ها',
        rows: quizRows,
        colWidths: [24, 14, 14, 32, 14, 12, 12, 12, 12, 14, 26],
      },
    ]),
    caption: `📊 گزارش ${label}\nمدیر: ${manager.name}\nاز ${dateTime(fromIso)} تا ${dateTime(toIso)}\nبازاریاب‌ها: ${members.length} نفر · دارای فعالیت در بازه: ${activeMembers} نفر`,
    memberCount: members.length,
  };
}
