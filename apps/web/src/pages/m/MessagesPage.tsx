import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bell,
  BookCheck,
  CalendarDays,
  CheckCheck,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
import { Button, EmptyState, TableSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Mascot } from '@/components/brand/Mascot';
import { QueryState } from '@/components/common/QueryState';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faRelative } from '@/lib/format';
import { qk, useMessages, useNotifications } from '@/lib/queries';
import { track } from '@/lib/telemetry';

type InboxTab = 'notifications' | 'messages';
type NotificationIcon = ComponentType<LucideProps>;

const ICONS: Record<string, NotificationIcon> = {
  welcome: Sparkles,
  new_assignment: GraduationCap,
  reminder: GraduationCap,
  deadline_warning: CalendarDays,
  deadline_passed: CalendarDays,
  quiz_passed: BookCheck,
  quiz_failed: BookCheck,
  retake_request: BookCheck,
  retake_reviewed: BookCheck,
  manager_message: Megaphone,
  mentor_nudge: Sparkles,
  weekly_digest: Megaphone,
  badge_earned: Award,
  escalation: Megaphone,
  manual: Bell,
  automation: Bell,
};

function UnreadDot() {
  return (
    <span className="relative mt-1 flex size-2.5 shrink-0" aria-label="خوانده نشده" role="status">
      <span aria-hidden className="animate-pulse-dot absolute inset-0 rounded-full bg-primary" />
      <span className="relative size-2.5 rounded-full bg-primary" aria-hidden />
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
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[#FCF8F0] px-4 py-5 sm:py-7">
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
                className="border-[#C9DDD3] bg-[#F2F8F4] px-5 text-[#154E42] shadow-none hover:bg-[#EAF4EF]"
              >
                همه خوانده شد
              </Button>
            ) : undefined
          }
        />

        <div
          role="tablist"
          aria-label="نوع"
          className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-[#E6DED2] bg-[#FFFDF8] shadow-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notifications'}
            onClick={() => setTab('notifications')}
            className={cn(
              'pressable flex min-h-16 items-center justify-center gap-3 rounded-[20px] px-4 text-base font-extrabold sm:text-lg',
              tab === 'notifications'
                ? 'border border-[#0B6F59] bg-[#F1F8F4] text-[#123E35] shadow-sm'
                : 'text-[#263B37] hover:bg-[#F8F5EE]',
            )}
          >
            <span>اعلان‌ها</span>
            {unreadNotifications > 0 && (
              <span
                aria-label={`${unreadNotifications.toLocaleString('fa-IR')} اعلان خوانده نشده`}
                className="flex min-w-8 items-center justify-center rounded-full bg-[#F45B57] px-2 py-1 text-sm font-black text-white"
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
              'pressable flex min-h-16 items-center justify-center gap-3 rounded-[20px] px-4 text-base font-extrabold sm:text-lg',
              tab === 'messages'
                ? 'border border-[#0B6F59] bg-[#F1F8F4] text-[#123E35] shadow-sm'
                : 'text-[#263B37] hover:bg-[#F8F5EE]',
            )}
          >
            <span>پیام مدیر</span>
            {unreadMsgs > 0 && (
              <span
                aria-label={`${unreadMsgs.toLocaleString('fa-IR')} پیام خوانده نشده`}
                className="flex min-w-8 items-center justify-center rounded-full bg-[#F45B57] px-2 py-1 text-sm font-black text-white"
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
                illustration={<Mascot mood="thinking" className="h-24 w-auto" />}
              />
            }
          >
            {(d) => (
              <ul className="stagger flex flex-col gap-3">
                {d.items.map((it) => {
                  const Icon = ICONS[it.type] ?? Bell;
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
                          'pressable relative flex min-h-[132px] w-full items-start gap-4 rounded-[22px] border px-4 py-5 text-start shadow-xs sm:min-h-[142px] sm:px-5 sm:py-6',
                          unread
                            ? 'border-[#CFE2D7] bg-[#F3F9F5] shadow-[0_8px_24px_-22px_rgba(17,79,63,0.55)]'
                            : 'border-[#E8E0D5] bg-[#FFFDF8] hover:bg-white',
                        )}
                      >
                        {unread && (
                          <span className="absolute end-4 top-4 sm:end-5 sm:top-5">
                            <UnreadDot />
                          </span>
                        )}

                        <span
                          className={cn(
                            'flex size-14 shrink-0 items-center justify-center rounded-[18px] sm:size-16',
                            reward
                              ? 'bg-[#FFF2CF] text-[#E59A13]'
                              : unread
                                ? 'bg-[#E7F3EC] text-[#0B6F59]'
                                : 'bg-[#EFF4EF] text-[#1B6958]',
                          )}
                        >
                          <Icon className="size-7 sm:size-8" aria-hidden />
                        </span>

                        <div className="min-w-0 flex-1 pe-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <p
                              className={cn(
                                'text-[15px] leading-7 text-[#113F36] sm:text-base',
                                unread ? 'font-black' : 'font-extrabold',
                              )}
                            >
                              {it.title}
                            </p>
                            <p className="shrink-0 text-xs font-medium text-[#65736F] sm:text-sm">
                              {faRelative(it.createdAt)}
                            </p>
                          </div>
                          <p className="mt-1 text-sm leading-7 text-[#5B6462] sm:text-base sm:leading-8">
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
                illustration={<Mascot mood="thinking" className="h-24 w-auto" />}
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
                          'pressable relative flex min-h-[132px] w-full items-start gap-4 rounded-[22px] border px-4 py-5 text-start shadow-xs sm:min-h-[142px] sm:px-5 sm:py-6',
                          unread
                            ? 'border-[#CFE2D7] bg-[#F3F9F5] shadow-[0_8px_24px_-22px_rgba(17,79,63,0.55)]'
                            : 'border-[#E8E0D5] bg-[#FFFDF8] hover:bg-white',
                        )}
                      >
                        {unread && (
                          <span className="absolute end-4 top-4 sm:end-5 sm:top-5">
                            <UnreadDot />
                          </span>
                        )}

                        <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-[#E7F3EC] text-[#0B6F59] sm:size-16">
                          <MessageSquareText className="size-7 sm:size-8" aria-hidden />
                        </span>

                        <div className="min-w-0 flex-1 pe-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p
                                className={cn(
                                  'text-[15px] leading-7 text-[#113F36] sm:text-base',
                                  unread ? 'font-black' : 'font-extrabold',
                                )}
                              >
                                {it.fromName}
                              </p>
                              {it.type === 'note' && (
                                <span className="rounded-full bg-[#FFF2CF] px-2.5 py-1 text-xs font-bold text-[#8C5B06]">
                                  یادداشت روی آموزش
                                </span>
                              )}
                            </div>
                            <p className="shrink-0 text-xs font-medium text-[#65736F] sm:text-sm">
                              {faRelative(it.createdAt)}
                            </p>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm leading-7 text-[#4F5D59] sm:text-base sm:leading-8">
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
