import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { Button, EmptyState, TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { MarketerIcon, type MarketerIconName } from '@/components/brand/MarketerIcon';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faRelative } from '@/lib/format';
import { qk, useMessages, useNotifications } from '@/lib/queries';
import { track } from '@/lib/telemetry';

type InboxTab = 'notifications' | 'messages';
type MarketerNotificationIcon = Extract<
  MarketerIconName,
  | 'announcement'
  | 'assignment'
  | 'badge-medal'
  | 'deadline'
  | 'manager-note'
  | 'notification'
  | 'quiz'
  | 'weekly-summary'
  | 'welcome'
>;

const ICONS: Record<string, MarketerNotificationIcon> = {
  welcome: 'welcome',
  new_assignment: 'assignment',
  reminder: 'assignment',
  deadline_warning: 'deadline',
  deadline_passed: 'deadline',
  quiz_passed: 'quiz',
  quiz_failed: 'quiz',
  retake_request: 'quiz',
  retake_reviewed: 'quiz',
  manager_message: 'manager-note',
  mentor_nudge: 'welcome',
  weekly_digest: 'weekly-summary',
  badge_earned: 'badge-medal',
  escalation: 'announcement',
  manual: 'notification',
  automation: 'notification',
};

function UnreadDot() {
  return (
    <span className="relative mt-1 flex size-2.5 shrink-0" aria-label="خوانده نشده" role="status">
      <span
        aria-hidden
        className="animate-pulse-dot absolute inset-0 rounded-full bg-marketer-brand"
      />
      <span className="relative size-2.5 rounded-full bg-marketer-brand" aria-hidden />
    </span>
  );
}

/** M11 — اعلان‌ها و پیام‌های مدیر. */
export function MessagesPage() {
  const [tab, setTab] = useState<InboxTab>('notifications');
  const n = useNotifications();
  const m = useMessages();
  const qc = useQueryClient();
  const nav = useNavigate();
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/me/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const readMsg = useMutation({
    mutationFn: (id: string) => api.post(`/me/messages/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.messages }),
  });
  const unreadMsgs = (m.data ?? []).filter((x) => !x.readAt).length;
  const unreadNotifications = n.data?.unread ?? 0;

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-marketer-canvas px-4 py-5 sm:py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-5">
        <PageHeader
          title="اعلان‌ها و پیام‌ها"
          actions={
            tab === 'notifications' && unreadNotifications > 0 ? (
              <Button
                variant="secondary"
                loading={readAll.isPending}
                onClick={() => readAll.mutate()}
                icon={<CheckCheck className="size-5" aria-hidden />}
                className="border-marketer-border bg-marketer-surface px-5 text-marketer-ink shadow-none hover:bg-marketer-surface-soft"
              >
                همه خوانده شد
              </Button>
            ) : undefined
          }
        />

        <div
          role="tablist"
          aria-label="نوع"
          className="grid grid-cols-2 overflow-hidden rounded-hero border border-marketer-border bg-marketer-surface shadow-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notifications'}
            onClick={() => setTab('notifications')}
            className={cn(
              'pressable flex min-h-16 items-center justify-center gap-3 rounded-card px-4 text-base font-extrabold sm:text-lg',
              tab === 'notifications'
                ? 'border border-marketer-brand/30 bg-marketer-brand-soft text-marketer-ink shadow-sm'
                : 'text-marketer-ink hover:bg-marketer-surface-muted',
            )}
          >
            <span>اعلان‌ها</span>
            {unreadNotifications > 0 && (
              <span
                aria-label={`${unreadNotifications.toLocaleString('fa-IR')} اعلان خوانده نشده`}
                className="flex min-w-8 items-center justify-center rounded-full bg-danger px-2 py-1 text-sm font-black text-on-danger"
              >
                {unreadNotifications.toLocaleString('fa-IR')}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'messages'}
            onClick={() => setTab('messages')}
            className={cn(
              'pressable flex min-h-16 items-center justify-center gap-3 rounded-card px-4 text-base font-extrabold sm:text-lg',
              tab === 'messages'
                ? 'border border-marketer-brand/30 bg-marketer-brand-soft text-marketer-ink shadow-sm'
                : 'text-marketer-ink hover:bg-marketer-surface-muted',
            )}
          >
            <span>پیام مدیر</span>
            {unreadMsgs > 0 && (
              <span
                aria-label={`${unreadMsgs.toLocaleString('fa-IR')} پیام خوانده نشده`}
                className="flex min-w-8 items-center justify-center rounded-full bg-danger px-2 py-1 text-sm font-black text-on-danger"
              >
                {unreadMsgs.toLocaleString('fa-IR')}
              </span>
            )}
          </button>
        </div>

        {tab === 'notifications' ? (
          <QueryState
            query={n}
            loading={<TableSkeleton rows={5} />}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState
                title="اعلانی نداری"
                illustration={
                  <span className="grid size-16 place-items-center rounded-2xl bg-marketer-brand-soft text-marketer-brand">
                    <MarketerIcon name="notification" className="size-8" />
                  </span>
                }
              />
            }
          >
            {(d) => (
              <ul className="stagger flex flex-col gap-3">
                {d.items.map((it) => {
                  const glyph = ICONS[it.type] ?? 'notification';
                  const unread = !it.readAt;
                  const reward = it.type === 'badge_earned';

                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!it.readAt) readOne.mutate(it.id);
                          if (it.actionRef) {
                            track('notification_cta_clicked', {
                              source: 'in_app',
                              type: it.type,
                            });
                            nav(it.actionRef);
                          }
                        }}
                        className={cn(
                          'pressable relative flex min-h-[132px] w-full items-start gap-4 rounded-hero border px-4 py-5 text-start shadow-xs sm:min-h-[142px] sm:px-5 sm:py-6',
                          unread
                            ? 'border-marketer-brand/25 bg-marketer-brand-soft shadow-sm'
                            : 'border-marketer-border bg-marketer-surface hover:bg-marketer-surface-soft',
                        )}
                      >
                        {unread && (
                          <span className="absolute end-4 top-4 sm:end-5 sm:top-5">
                            <UnreadDot />
                          </span>
                        )}

                        <span
                          className={cn(
                            'flex size-14 shrink-0 items-center justify-center rounded-card sm:size-16',
                            reward
                              ? 'bg-accent-light text-accent-fg'
                              : unread
                                ? 'bg-marketer-brand-soft text-marketer-brand'
                                : 'bg-marketer-surface-muted text-marketer-brand',
                          )}
                        >
                          <MarketerIcon name={glyph} className="size-7 sm:size-8" />
                        </span>

                        <div className="min-w-0 flex-1 pe-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <p
                              className={cn(
                                'text-[15px] leading-7 text-marketer-ink sm:text-base',
                                unread ? 'font-black' : 'font-extrabold',
                              )}
                            >
                              {it.title}
                            </p>
                            <p className="shrink-0 text-xs font-medium text-marketer-muted sm:text-sm">
                              {faRelative(it.createdAt)}
                            </p>
                          </div>
                          <p className="mt-1 text-sm leading-7 text-marketer-muted sm:text-base sm:leading-8">
                            {it.body}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        ) : (
          <QueryState
            query={m}
            loading={<TableSkeleton rows={4} />}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                title="پیامی از مدیر نداری"
                illustration={
                  <span className="grid size-16 place-items-center rounded-2xl bg-marketer-brand-soft text-marketer-brand">
                    <MarketerIcon name="manager-note" className="size-8" />
                  </span>
                }
              />
            }
          >
            {(list) => (
              <ul className="stagger flex flex-col gap-3">
                {list.map((it) => {
                  const unread = !it.readAt;

                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!it.readAt) readMsg.mutate(it.id);
                          if (it.packageId) nav(`/packages/${it.packageId}`);
                        }}
                        className={cn(
                          'pressable relative flex min-h-[132px] w-full items-start gap-4 rounded-hero border px-4 py-5 text-start shadow-xs sm:min-h-[142px] sm:px-5 sm:py-6',
                          unread
                            ? 'border-marketer-brand/25 bg-marketer-brand-soft shadow-sm'
                            : 'border-marketer-border bg-marketer-surface hover:bg-marketer-surface-soft',
                        )}
                      >
                        {unread && (
                          <span className="absolute end-4 top-4 sm:end-5 sm:top-5">
                            <UnreadDot />
                          </span>
                        )}

                        <span className="flex size-14 shrink-0 items-center justify-center rounded-card bg-marketer-brand-soft text-marketer-brand sm:size-16">
                          <MarketerIcon name="manager-note" className="size-7 sm:size-8" />
                        </span>

                        <div className="min-w-0 flex-1 pe-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p
                                className={cn(
                                  'text-[15px] leading-7 text-marketer-ink sm:text-base',
                                  unread ? 'font-black' : 'font-extrabold',
                                )}
                              >
                                {it.fromName}
                              </p>
                              {it.type === 'note' && (
                                <span className="rounded-full bg-accent-light px-2.5 py-1 text-xs font-bold text-accent-fg">
                                  یادداشت روی آموزش
                                </span>
                              )}
                            </div>
                            <p className="shrink-0 text-xs font-medium text-marketer-muted sm:text-sm">
                              {faRelative(it.createdAt)}
                            </p>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm leading-7 text-marketer-muted sm:text-base sm:leading-8">
                            {it.body}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        )}
      </div>
    </div>
  );
}
