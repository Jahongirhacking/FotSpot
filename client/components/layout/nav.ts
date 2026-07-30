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
import type { Dictionary } from '@/lib/i18n';

export interface NavItem {
  href: string;
  /** Key into the translated nav dictionary, so labels aren't hardcoded English. */
  label: keyof Dictionary['nav'];
  icon: React.ComponentType<{ className?: string }>;
}

const COMMON: NavItem[] = [
  { href: '/dashboard', label: 'home', icon: Home },
  { href: '/players', label: 'players', icon: Search },
  { href: '/academies', label: 'academies', icon: Building2 },
  { href: '/trials', label: 'trials', icon: CalendarDays },
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
        { href: '/dashboard', label: 'myCard', icon: Sparkles },
        { href: '/trials', label: 'trials', icon: CalendarDays },
        { href: '/academies', label: 'academies', icon: Building2 },
        { href: '/players', label: 'players', icon: Search },
      ];

    case 'scout':
    case 'coach':
      return [...COMMON, { href: '/recommendations', label: 'myPicks', icon: Inbox }];

    case 'academy_manager':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/recommendations/inbox', label: 'inbox', icon: Inbox },
        { href: '/players', label: 'findPlayers', icon: Search },
        { href: '/trials', label: 'trials', icon: CalendarDays },
        { href: '/academies', label: 'academies', icon: Building2 },
      ];

    case 'admin':
    case 'super_admin':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/admin/academies', label: 'academies', icon: Building2 },
        { href: '/admin/users', label: 'users', icon: Users },
        { href: '/admin/moderation', label: 'moderation', icon: ShieldCheck },
        { href: '/players', label: 'players', icon: Search },
      ];

    default:
      return COMMON;
  }
}
