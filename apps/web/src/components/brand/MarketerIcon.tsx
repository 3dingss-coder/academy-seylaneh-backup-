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
  | 'deadline'
  | 'badge-sprout'
  | 'badge-clock'
  | 'badge-brain'
  | 'badge-medal'
  | 'badge-star'
  | 'welcome'
  | 'assignment'
  | 'announcement'
  | 'manager-note'
  | 'weekly-summary'
  | 'quiz-passed'
  | 'quiz-retry'
  | 'quiz-review'
  | 'retake-pending'
  | 'quiz-unavailable'
  | 'profile'
  | 'profile-settings'
  | 'profile-security'
  | 'profile-location'
  | 'profile-camera'
  | 'profile-logout'
  | 'mentor-plus'
  | 'mentor-mic'
  | 'mentor-send';

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
  'badge-sprout': '/brand/m/icons/badge-sprout-3d.png',
  'badge-clock': '/brand/m/icons/badge-clock-3d.png',
  'badge-brain': '/brand/m/icons/badge-brain-3d.png',
  'badge-medal': '/brand/m/icons/badge-medal-3d.png',
  'badge-star': '/brand/m/icons/badge-star-3d.png',
  welcome: '/brand/m/icons/welcome-3d.png',
  assignment: '/brand/m/icons/assignment-3d.png',
  announcement: '/brand/m/icons/announcement-3d.png',
  'manager-note': '/brand/m/icons/manager-note-3d.png',
  'weekly-summary': '/brand/m/icons/weekly-summary-3d.png',
  'quiz-passed': '/brand/m/icons/quiz-passed-3d.png',
  'quiz-retry': '/brand/m/icons/quiz-retry-3d.png',
  'quiz-review': '/brand/m/icons/quiz-review-3d.png',
  'retake-pending': '/brand/m/icons/retake-pending-3d.png',
  'quiz-unavailable': '/brand/m/icons/quiz-unavailable-3d.png',
  profile: '/brand/m/icons/profile-3d.png',
  'profile-settings': '/brand/m/icons/profile-settings-3d.png',
  'profile-security': '/brand/m/icons/profile-security-3d.png',
  'profile-location': '/brand/m/icons/profile-location-3d.png',
  'profile-camera': '/brand/m/icons/profile-camera-3d.png',
  'profile-logout': '/brand/m/icons/profile-logout-3d.png',
  'mentor-plus': '/brand/m/icons/mentor-plus-3d.png',
  'mentor-mic': '/brand/m/icons/mentor-mic-3d.png',
  'mentor-send': '/brand/m/icons/mentor-send-3d.png',
};

/** Decorative 3D marketer icon; adjacent text or the containing control names it accessibly. */
export function MarketerIcon({
  name,
  className,
  onError,
}: {
  name: MarketerIconName;
  className?: string;
  onError?: () => void;
}) {
  return (
    <img
      src={ICON_SRC[name]}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      onError={onError}
      className={cn('block shrink-0 object-contain', className)}
    />
  );
}
