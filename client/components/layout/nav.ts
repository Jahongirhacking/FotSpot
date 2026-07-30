import {
  Building2,
  CalendarDays,
  Home,
  Inbox,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { Role } from '@/lib/roles';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const COMMON: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/players', label: 'Players', icon: Search },
  { href: '/academies', label: 'Academies', icon: Building2 },
  { href: '/trials', label: 'Trials', icon: CalendarDays },
];

/**
 * Navigation is a function of the *active* role (README §1.2.1) — this is what
 * switching roles actually changes. It is not a permission gate: hiding a link is a
 * clarity decision, and the backend still guards every route behind it.
 */
export function navForRole(role: Role | null): NavItem[] {
  switch (role) {
    case 'player':
      return [
        { href: '/dashboard', label: 'My card', icon: Sparkles },
        { href: '/trials', label: 'Trials', icon: CalendarDays },
        { href: '/academies', label: 'Academies', icon: Building2 },
        { href: '/players', label: 'Players', icon: Search },
      ];

    case 'scout':
      return [...COMMON, { href: '/recommendations', label: 'My picks', icon: Inbox }];

    case 'coach':
      return [...COMMON, { href: '/recommendations', label: 'My picks', icon: Inbox }];

    case 'academy_manager':
      return [
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/recommendations/inbox', label: 'Inbox', icon: Inbox },
        { href: '/players', label: 'Find players', icon: Search },
        { href: '/trials', label: 'Trials', icon: CalendarDays },
        { href: '/academies', label: 'Academies', icon: Building2 },
      ];

    case 'admin':
    case 'super_admin':
      return [
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/admin/verification', label: 'Verification', icon: ShieldCheck },
        { href: '/admin/moderation', label: 'Moderation', icon: Users },
        { href: '/players', label: 'Players', icon: Search },
      ];

    default:
      return COMMON;
  }
}
