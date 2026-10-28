import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
};
const PALETTE = [
  'bg-sky-700',
  'bg-violet-700',
  'bg-rose-700',
  'bg-amber-700',
  'bg-teal-700',
  'bg-indigo-700',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

interface UserAvatarProps {
  name: string;
  userId: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Decorative by default: the player's name is always rendered as text next to it. */
export function UserAvatar({ name, userId, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const classes = cn('shrink-0 rounded-full ring-2 ring-white/15', SIZES[size], className);
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user uploads are served from the API origin (Phase 3)
    return <img src={avatarUrl} alt="" className={cn(classes, 'object-cover')} />;
  }
  return (
    <span
      aria-hidden
      className={cn(classes, colorFor(userId), 'grid place-items-center font-semibold text-white')}
    >
      {initials(name)}
    </span>
  );
}
