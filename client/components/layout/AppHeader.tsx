'use client';

import { useQuery } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Menu as MenuIcon, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useI18n } from './I18nProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { ProfileMenu } from './ProfileMenu';
import { RoleSwitcher } from './RoleSwitcher';
import { useSession } from './SessionProvider';
import { ThemeToggle } from './ThemeToggle';
import { navForRole } from './nav';

/**
 * The inline nav appears at `lg`, not `md`.
 *
 * At exactly 768px the six nav links plus the five account controls needed 880px
 * and pushed every page sideways — and that is measuring English, the shortest of
 * the three languages. The drawer holds them until there is genuinely room.
 */
export function AppHeader({ initials, avatarUrl }: { initials: string; avatarUrl: string | null }) {
  const { t } = useI18n();
  const { activeRole, isAuthenticated } = useSession();
  const pathname = usePathname();

  // The drawer records *which route* it was opened on, so navigating away closes it
  // by derivation rather than by a setState-in-effect cascade.
  const [openedOnPath, setOpenedOnPath] = React.useState<string | null>(null);
  const mobileOpen = openedOnPath === pathname;
  const setMobileOpen = (open: boolean) => setOpenedOnPath(open ? pathname : null);

  const nav = navForRole(activeRole);

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
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  /*
   * The Inbox badge: players nobody has been asked about yet.
   *
   * Only fetched while acting as a manager, since Inbox is only in that menu —
   * asking as a player would be a request whose answer is always zero.
   */
  const { data: inbox } = useQuery({
    queryKey: ['inbox-awaiting-review'],
    queryFn: () => browserFetch<{ count: number }>('/recommendations/inbox/awaiting-review-count'),
    enabled: isAuthenticated && activeRole === 'academy_manager',
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  /** Which menu entries carry a count, so the two lists below stay in step. */
  const badgeFor = (label: string) =>
    label === 'trials' ? unseenTrials?.count : label === 'inbox' ? inbox?.count : undefined;

  return (
    <header className="bg-surface/85 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-2 py-2.5 sm:gap-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t.nav.closeMenu : t.nav.openMenu}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X aria-hidden /> : <MenuIcon aria-hidden />}
        </Button>

        <Link href="/dashboard" className="mr-2.5 flex min-h-11 items-center gap-1 pr-1">
          <FotSpotMark className="size-11" />
          <span className="hidden text-base font-bold tracking-tight sm:inline">
            {t.common.appName}
          </span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {nav.map((item) => (
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
              <RoleSwitcher />
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

      {mobileOpen && (
        <nav
          aria-label="Main"
          className="border-border bg-surface flex flex-col gap-0.5 border-t p-2 lg:hidden"
        >
          {nav.map((item) => (
            <NavLink
              key={item?.href}
              href={item?.href}
              label={t.nav[item?.label]}
              icon={item?.icon}
              active={isActive(pathname, item?.href)}
              mobile
            />
          ))}
        </nav>
      )}
    </header>
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
  mobile,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  mobile?: boolean;
  /** How many new things wait behind this link. Hidden at zero. */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
        mobile && 'min-h-12',
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
