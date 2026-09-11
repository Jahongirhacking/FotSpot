'use client';

import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { Button } from '@/components/ui/Button';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyKind } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useI18n } from './I18nProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { ProfileMenu } from './ProfileMenu';
import { useSession } from './SessionProvider';
import { ThemeToggle } from './ThemeToggle';
import { BottomNav } from './BottomNav';
import { AdminChatFloat } from './AdminChatFloat';
import { isAdminActing } from '@/lib/roles';
import { navForRole } from './nav';

/**
 * The inline nav appears at `lg`, not `md`.
 *
 * At exactly 768px the six nav links plus the five account controls needed 880px
 * and pushed every page sideways — and that is measuring English, the shortest of
 * the three languages. Below `lg` the same list is the bottom bar (`BottomNav`),
 * which replaced the burger drawer: a bar shows where you are and where you can
 * go without a press, and sits where a thumb reaches.
 */
/**
 * How often the three header badges re-count.
 *
 * Every poll is an API call and every API call costs Redis commands upstream,
 * so this number is a standing bill paid by every open tab whether or not
 * anybody is looking. Three badges at five minutes was ~2,600 requests a day
 * per tab left open; at fifteen it is a third of that, and none of these
 * numbers is urgent — an unread notification that appears twelve minutes late
 * is indistinguishable from one that appeared on time, and the socket already
 * pushes the ones that genuinely cannot wait.
 *
 * TanStack Query pauses polling for a hidden tab by default, so this is the
 * cost of a *visible* tab only.
 */
const BADGE_POLL_MS = 15 * 60 * 1000;

export function AppHeader({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  const { t } = useI18n();
  const { activeRole, isAuthenticated } = useSession();
  const pathname = usePathname();

  /*
   * Which organisation this manager runs.
   *
   * Asked only while acting as a manager, and cached for the session: a
   * record's kind is set once at creation and never edited, so refetching it
   * every five minutes would be polling for an event that cannot happen.
   *
   * The menu waits for nothing — while this is in flight `isLocalTeam` is
   * false, so a local team manager may see Trials for the length of one
   * request. That is the right way round: the alternative is every academy
   * manager's menu missing an entry until a request lands, and pressing Trials
   * early reaches a page whose actions the API refuses anyway.
   */
  const { data: myAcademy } = useQuery({
    queryKey: ['my-academy-kind'],
    queryFn: () => browserFetch<{ kind?: AcademyKind } | null>('/academies/mine'),
    enabled: isAuthenticated && activeRole === 'academy_manager',
    staleTime: Infinity,
  });

  const nav = navForRole(activeRole, { isLocalTeam: myAcademy?.kind === 'LOCAL_TEAM' });

  /*
   * The Trials badge.
   *
   * Polled rather than pushed: a new trial is not urgent enough for a socket
   * message, and the notifications gateway is deliberately scoped to
   * notifications (§1.17). `staleTime` matches the interval so a route change
   * does not refetch on top of the poll.
   *
   * Guests have no "since" to compare against, so it is not asked for at all.
   */
  const { data: unseenTrials } = useQuery({
    queryKey: ['trials-unseen'],
    queryFn: () => browserFetch<{ count: number }>('/trials/unseen-count'),
    enabled: isAuthenticated,
    refetchInterval: BADGE_POLL_MS,
    staleTime: BADGE_POLL_MS,
  });

  /*
   * The Inbox badge: recommended players the academy has not yet answered —
   * neither invited to a trial nor turned down.
   *
   * Only fetched while acting as a manager, since Inbox is only in that menu —
   * asking as a player would be a request whose answer is always zero.
   */
  const { data: inbox } = useQuery({
    queryKey: ['inbox-count'],
    queryFn: () => browserFetch<{ count: number }>('/recommendations/inbox/count'),
    enabled: isAuthenticated && activeRole === 'academy_manager',
    refetchInterval: BADGE_POLL_MS,
    staleTime: BADGE_POLL_MS,
  });

  /*
   * The Requests badge: what users have asked the team to do and nobody has
   * picked up yet.
   *
   * Counts NEW only, and there is nothing to mark as seen — a request stops being
   * counted when an admin actually takes it, not when one glances at the menu. So
   * the number is a queue depth, and it going up means somebody is waiting.
   *
   * Only asked for while acting as an admin, since Requests is only in that menu.
   */
  const { data: newRequests } = useQuery({
    queryKey: ['support-requests-new'],
    queryFn: () => browserFetch<{ count: number }>('/requests/new-count'),
    enabled: isAuthenticated && (activeRole === 'admin' || activeRole === 'super_admin'),
    refetchInterval: BADGE_POLL_MS,
    staleTime: BADGE_POLL_MS,
  });

  /** Which menu entries carry a count, so the two lists below stay in step. */
  const badgeFor = (label: string) =>
    label === 'trials'
      ? unseenTrials?.count
      : label === 'inbox'
        ? inbox?.count
        : label === 'requests'
          ? newRequests?.count
          : undefined;

  return (
    <>
      <header className="bg-surface/85 border-border sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2.5 sm:gap-2 sm:px-4">
          <Link href="/dashboard" className="mr-2.5 flex min-h-11 items-center gap-1 pr-1">
            <FotSpotMark className="size-11" />
            <span className="hidden text-base font-bold tracking-tight sm:inline">
              {t.common.appName}
            </span>
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
            {nav?.map((item) => (
              <NavLink
                key={item?.href}
                href={item?.href}
                label={t.nav[item?.label]}
                icon={item?.icon}
                active={isActive(pathname, item?.href)}
                badge={badgeFor(item?.label)}
              />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            {/* Guests browse the same pages, so they get the same shell minus the
              signed-in controls — and a way in, rather than a forced redirect. */}
            {isAuthenticated ? (
              <>
                <ThemeToggle compact />
                <LanguageSwitcher compact />
                <NotificationBell />
                <ProfileMenu initials={initials} avatarUrl={avatarUrl} />
              </>
            ) : (
              <>
                <ThemeToggle compact />
                <LanguageSwitcher compact />
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{t.auth.signIn}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">{t.auth.createAccount}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <BottomNav items={nav} badgeFor={badgeFor} />
      {/* The team's messages to users: a floating button for an admin acting as one. */}
      {isAuthenticated && isAdminActing(activeRole) && <AdminChatFloat />}
    </>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  /** How many new things wait behind this link. Hidden at zero. */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/12 text-primary'
          : 'text-muted hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
      {/* Capped at 9+: past a handful the exact number stops being information
          and starts being a wide pill that pushes the menu around. */}
      {badge != null && badge > 0 && (
        <span className="bg-primary ml-0.5 grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );
}
