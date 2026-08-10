import type { LucideIcon } from 'lucide-react';
import { Shield, ShieldCheck, Building2, ClipboardCheck, User, Search } from 'lucide-react';

/** Role names exactly as the backend seeds them (`prisma/seed.ts`). */
export const ROLES = [
  'super_admin',
  'admin',
  'academy_manager',
  'coach',
  'player',
  'scout',
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Priority order for picking a default active role — README §1.2.1.
 * Most specific first: the role with a purpose-built dashboard wins over `scout`,
 * which every account has by default and therefore says the least about intent.
 */
export const ROLE_PRIORITY: readonly Role[] = ROLES;

export const ROLE_META: Record<
  Role,
  { label: string; icon: LucideIcon; blurb: string; home: string }
> = {
  super_admin: {
    label: 'Super Admin',
    icon: ShieldCheck,
    blurb: 'Platform settings, roles and audit logs',
    home: '/dashboard',
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    blurb: 'Verification queues and moderation',
    home: '/dashboard',
  },
  academy_manager: {
    label: 'Academy Manager',
    icon: Building2,
    blurb: 'Recommendations, trials and your squad',
    home: '/dashboard',
  },
  coach: {
    label: 'Coach',
    icon: ClipboardCheck,
    blurb: 'Assess players and vouch for talent',
    home: '/dashboard',
  },
  player: {
    label: 'Player',
    icon: User,
    blurb: 'Your card, your clips, your trials',
    home: '/dashboard',
  },
  scout: {
    label: 'Scout',
    icon: Search,
    blurb: 'Spot talent and recommend players',
    home: '/dashboard',
  },
};

export function isRole(value: string | undefined | null): value is Role {
  return !!value && (ROLES as readonly string[]).includes(value);
}

/**
 * Resolve which role the UI should present.
 *
 * `stored` is a *preference*, never a permission (README §1.2.1) — it is honoured
 * only if the user still holds that role, so a coach whose verification was later
 * rejected silently falls back instead of seeing a broken coach dashboard.
 */
export function resolveActiveRole(held: string[], stored?: string | null): Role | null {
  const heldRoles = held.filter(isRole);
  if (heldRoles.length === 0) return null;
  if (isRole(stored) && heldRoles.includes(stored)) return stored;
  return ROLE_PRIORITY.find((role) => heldRoles.includes(role)) ?? heldRoles[0];
}

/** Roles the user holds, ordered for display in the switcher. */
export function sortRoles(held: string[]): Role[] {
  const heldRoles = held.filter(isRole);
  return ROLE_PRIORITY.filter((role) => heldRoles.includes(role));
}

export const ACTIVE_ROLE_COOKIE = 'fs_active_role';

/**
 * What the user may do **right now**.
 *
 * `held` is what they could switch to; `activeRole` is what they are. Every
 * permission decision keys off the active role, so switching to a lesser role
 * genuinely takes the greater one's powers away (§1.2.1) rather than only
 * relabelling the navigation. The backend narrows identically — see
 * JwtStrategy.validate.
 */
export function isAdminActing(activeRole: Role | null): boolean {
  return activeRole === 'admin' || activeRole === 'super_admin';
}

export function isSuperAdminActing(activeRole: Role | null): boolean {
  return activeRole === 'super_admin';
}

/**
 * Roles that may open a scout's reputation page.
 *
 * `coach` is missing on purpose. A coach answers "is this player worth a look"
 * from the clips in front of them (README §1.9, TRIAL.md Rule 22); putting the
 * recommending scout's level beside that question turns the review into a
 * judgement of the scout's record instead of the player's football.
 *
 * `scout` is missing too — a scout reaches their own page as themselves, and
 * nothing in the product asks one scout to weigh another's record.
 *
 * The backend refuses the same set in `RecommendationsService.getScoutProfile`.
 * This copy only decides whether to render a link: hiding one is a courtesy, and
 * the refusal is the rule.
 */
const SCOUT_PROFILE_VIEWERS: readonly Role[] = ['player', 'academy_manager', 'admin', 'super_admin'];

/**
 * Whether to link a scout's name to their profile.
 *
 * `selfUserId`/`scoutUserId` cover the one case the role list cannot: a scout
 * looking at themselves, who is always allowed.
 */
export function mayViewScoutProfile(
  activeRole: Role | null,
  ids?: { viewerUserId?: string | null; scoutUserId?: string | null },
): boolean {
  if (ids?.viewerUserId && ids.viewerUserId === ids.scoutUserId) return true;
  return !!activeRole && SCOUT_PROFILE_VIEWERS.includes(activeRole);
}
