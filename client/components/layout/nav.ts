import type { Dictionary } from '@/lib/i18n';
import type { Role } from '@/lib/roles';
import {
  Building2,
  CalendarDays,
  Clapperboard,
  ClipboardCheck,
  Home,
  Inbox,
  LifeBuoy,
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
  { href: '/feed', label: 'feed', icon: Clapperboard },
  { href: '/players', label: 'players', icon: Search },
  { href: '/academies', label: 'academies', icon: Building2 },
  { href: '/trials', label: 'trials', icon: CalendarDays },
];

/**
 * Navigation is a function of the *active* role (README §1.2.1) — this is what
 * switching roles actually changes. It is not a permission gate: hiding a link is a
 * clarity decision, and the backend still guards every route behind it.
 */
/**
 * What else the menu needs to know beyond the role.
 *
 * One flag, not an object of them: the only thing that changes a menu after the
 * role is whether a manager runs an academy or a local team, and a wider
 * parameter would invite the menu to start depending on request state it cannot
 * see. Defaults to false so every existing caller keeps the menu it had.
 */
export interface NavContext {
  /** True when the signed-in manager's organisation is a local team. */
  isLocalTeam?: boolean;
}

export function navForRole(role: Role | null, context: NavContext = {}): NavItem[] {
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
    // No Trials: a scout does not host them and does not apply to them. Their
    // work is watching clips and recommending, which is the rest of this list.
    case 'scout':
      return [
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/players', label: 'players', icon: Search },
        { href: '/academies', label: 'academies', icon: Building2 },
        { href: '/recommendations', label: 'myPicks', icon: Inbox },
      ];

    /*
     * A coach works inside one academy and judges the players put in front of
     * them. Browsing other academies, hosting trials and keeping a pick list are
     * a scout's and a manager's jobs — leaving them here made the menu a list of
     * things a coach cannot do.
     *
     * Trials rather than a separate "Recommended players": both halves of a
     * coach's judging are the same job seen at two moments — read the profile,
     * then watch them play — and the online review queue now sits alongside the
     * trials it feeds, on /trials. Two menu entries made them look like two
     * unrelated inboxes.
     */
    case 'coach':
      return [
        { href: '/academies/mine', label: 'myAcademy', icon: Building2 },
        { href: '/groups/mine', label: 'myGroup', icon: Users },
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/trials', label: 'trials', icon: ClipboardCheck },
        { href: '/players', label: 'players', icon: Search },
      ];

    // No "Academies" entry. A manager runs exactly one academy and it is already
    // their home screen; the only thing the directory would offer them is a list
    // of rivals they cannot edit. Browsing to /academies still works — this is a
    // clarity decision about what the menu is *for*, not a permission gate.
    /*
     * A local team manager gets the same menu without Trials.
     *
     * Not a separate `local_team_manager` role: the role says what somebody is
     * to the platform, and both of these are the manager of an organisation.
     * What differs is the organisation, which is why it is read from the
     * academy rather than from the account — and why an admin turning a record
     * into a local team does not have to go and reissue anybody's roles.
     *
     * Trials is the only entry that goes. Dashboard, feed, inbox, squad and
     * players all mean the same thing for a local team, and dropping any of
     * them would be taking away a screen that works (§5).
     *
     * The menu is a clarity decision, never the boundary: `TrialsService
     * .create` refuses a local team whether or not this link is drawn.
     */
    case 'academy_manager':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/feed', label: 'feed', icon: Clapperboard },
        { href: '/recommendations/inbox', label: 'inbox', icon: Inbox },
        // One entry, because "who is here" and "how are they arranged" are the
        // same screen's two halves. Minting a coach account lives inside it too:
        // it is one way of adding a coach, not a separate destination.
        { href: '/academies/mine/squad', label: 'squad', icon: Users },
        { href: '/players', label: 'findPlayers', icon: Search },
        ...(context.isLocalTeam
          ? []
          : [{ href: '/trials', label: 'trials', icon: CalendarDays } as NavItem]),
      ];

    case 'admin':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/admin/academies', label: 'academies', icon: Building2 },
        { href: '/admin/users', label: 'users', icon: Users },
        { href: '/admin/requests', label: 'requests', icon: LifeBuoy },
        { href: '/admin/moderation', label: 'moderation', icon: ShieldCheck },
      ];

    // Tariff plans only for the super admin: §1.2 keeps platform-wide settings
    // out of a plain admin's hands, and a menu entry leading to a screen that
    // refuses is worse than no entry.
    case 'super_admin':
      return [
        { href: '/dashboard', label: 'home', icon: Home },
        { href: '/admin/academies', label: 'academies', icon: Building2 },
        { href: '/admin/users', label: 'users', icon: Users },
        // { href: '/admin/tariff-plans', label: 'tariffPlans', icon: Gauge },
        { href: '/admin/requests', label: 'requests', icon: LifeBuoy },
        { href: '/admin/moderation', label: 'moderation', icon: ShieldCheck },
      ];
    default:
      return COMMON;
  }
}

/**
 * Where a role begins.
 *
 * The first entry of its menu, which is the one screen that role opens the app
 * to do something on. Used on login and on a role switch, because landing
 * somewhere outside the current menu leaves nothing highlighted and no obvious
 * next move — a scout signing in used to arrive at `/dashboard`, which is not in
 * a scout's menu at all.
 *
 * Deliberately derived from `navForRole` rather than listed separately: two
 * lists would agree today and disagree the first time somebody reorders a menu.
 */
export function homeHrefForRole(role: Role | null, context: NavContext = {}): string {
  return navForRole(role, context)[0]?.href ?? '/dashboard';
}
