import { Clock, House, type LucideIcon, Trophy, User, Wallet } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const APP_NAV: NavItem[] = [
  { href: '/lobby', label: 'Sảnh', icon: House },
  { href: '/history', label: 'Lịch sử', icon: Clock },
  { href: '/leaderboard', label: 'Xếp hạng', icon: Trophy },
  { href: '/wallet', label: 'Ví xu', icon: Wallet },
  { href: '/profile', label: 'Hồ sơ', icon: User },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
