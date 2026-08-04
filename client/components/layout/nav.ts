import type { Dictionary } from '@/lib/i18n';
import type { Role } from '@/lib/roles';
import {
  Building2,
  CalendarDays,
  Clapperboard,
  Home,
  Inbox,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

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
        // Players watch the feed too — it is where they see what the standard
        // looks like at their age, which is the whole argument for uploading.
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/trials', label: 'trials', icon: CalendarDays },
        { href: '/academies', label: 'academies', icon: Building2 },
        { href: '/players', label: 'players', icon: Search },
      ];

    // The scout's home *is* the feed: what they open the app to do is watch the
    // next clip worth watching, not read a dashboard. Their own reputation and
    // stats still live at /dashboard, which the logo goes to.
    case 'scout':
      return [
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/players', label: 'players', icon: Search },
        { href: '/academies', label: 'academies', icon: Building2 },
        { href: '/trials', label: 'trials', icon: CalendarDays },
        { href: '/recommendations', label: 'myPicks', icon: Inbox },
      ];

    case 'coach':
      return [...COMMON, { href: '/recommendations', label: 'myPicks', icon: Inbox }];

    // No "Academies" entry. A manager runs exactly one academy and it is already
    // their home screen; the only thing the directory would offer them is a list
    // of rivals they cannot edit. Browsing to /academies still works — this is a
    // clarity decision about what the menu is *for*, not a permission gate.
    case 'academy_manager':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/recommendations/inbox', label: 'inbox', icon: Inbox },
        { href: '/players', label: 'findPlayers', icon: Search },
        { href: '/trials', label: 'trials', icon: CalendarDays },
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
