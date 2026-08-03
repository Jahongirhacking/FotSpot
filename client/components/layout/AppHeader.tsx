'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Menu as MenuIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from './I18nProvider';
import { useSession } from './SessionProvider';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { ProfileMenu } from './ProfileMenu';
import { navForRole } from './nav';
import { Button } from '@/components/ui/Button';
import { FotSpotMark } from '@/components/shared/FotSpotMark';

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

  return (
    <header className="bg-surface/85 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t.nav.closeMenu : t.nav.openMenu}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X aria-hidden /> : <MenuIcon aria-hidden />}
        </Button>

        <Link href="/dashboard" className="mr-1 flex items-center gap-2">
          <FotSpotMark className="size-7" />
          <span className="hidden text-base font-bold tracking-tight sm:inline">
            {t.common.appName}
          </span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 md:flex">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={t.nav[item.label]}
              icon={item.icon}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
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
          className="border-border bg-surface flex flex-col gap-0.5 border-t p-2 md:hidden"
        >
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={t.nav[item.label]}
              icon={item.icon}
              active={isActive(pathname, item.href)}
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
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  mobile?: boolean;
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
    </Link>
  );
}
