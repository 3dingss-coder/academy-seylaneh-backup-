import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ManagerProfileView } from '@/lib/types';

export interface TelegramBotInfo {
  configured: boolean;
  botUsername: string | null;
  connected: boolean;
  reportTime?: string;
  timeZone?: string;
}

/** Bot link + pairing state for this Manager (shared react-query cache with the profile page). */
export function useTelegramBotInfo(enabled = true) {
  return useQuery({
    queryKey: ['manager', 'profile'],
    queryFn: ({ signal }) => api.get<ManagerProfileView>('/manager/profile', signal),
    enabled,
    select: (view): TelegramBotInfo =>
      view.telegram ?? { configured: false, botUsername: null, connected: false },
  });
}

export const telegramBotUrl = (botUsername: string) => `https://t.me/${botUsername}`;
