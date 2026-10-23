import { cn } from '@/lib/cn';

export type MarketerIconName =
  | 'home'
  | 'learning'
  | 'messages'
  | 'cards'
  | 'mentor'
  | 'notification'
  | 'quiz'
  | 'audio'
  | 'video'
  | 'deadline';

const ICON_SRC: Record<MarketerIconName, string> = {
  home: '/brand/m/icons/home-3d.png',
  learning: '/brand/m/icons/learning-3d.png',
  messages: '/brand/m/icons/messages-3d.png',
  cards: '/brand/m/icons/cards-3d.png',
  mentor: '/brand/m/icons/mentor-3d.png',
  notification: '/brand/m/icons/notification-3d.png',
  quiz: '/brand/m/icons/quiz-3d.png',
  audio: '/brand/m/icons/audio-3d.png',
  video: '/brand/m/icons/video-3d.png',
  deadline: '/brand/m/icons/deadline-3d.png',
};

/** Decorative 3D marketer icon; adjacent text or the containing control names it accessibly. */
export function MarketerIcon({ name, className }: { name: MarketerIconName; className?: string }) {
  return (
    <img
      src={ICON_SRC[name]}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      className={cn('block shrink-0 object-contain', className)}
    />
  );
}
