'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { LogOut, Menu as MenuIcon, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from './SessionProvider';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { navForRole } from './nav';
import { Button } from '@/components/ui/Button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { FotSpotMark } from '@/components/shared/FotSpotMark';

export function AppHeader() {
  const { activeRole } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  // The drawer records *which route* it was opened on, so navigating away closes it
  // by derivation. An effect that called setState on pathname change would work but
  // triggers a cascading render — deriving is both cheaper and simpler.
  const [openedOnPath, setOpenedOnPath] = React.useState<string | null>(null);
  const mobileOpen = openedOnPath === pathname;
  const setMobileOpen = (open: boolean) => setOpenedOnPath(open ? pathname : null);

  const nav = navForRole(activeRole);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Full navigation, not router.push: every cached Server Component payload for
    // this user must be discarded.
    window.location.assign('/');
  }

  return (
    <header className="bg-surface/85 border-border sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X aria-hidden /> : <MenuIcon aria-hidden />}
        </Button>

        <Link href="/dashboard" className="mr-1 flex items-center gap-2">
          <FotSpotMark className="size-7" />
          <span className="hidden text-base font-bold tracking-tight sm:inline">FotSpot</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 md:flex">
          {nav.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <RoleSwitcher />
          <NotificationBell />
          <Menu>
            <MenuTrigger
              className="hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-lg"
              aria-label="Account"
            >
              <Settings className="size-4" aria-hidden />
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => router.push('/settings')}>
                <Settings aria-hidden /> Settings & devices
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={logout} className="text-danger">
                <LogOut aria-hidden /> Log out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Main"
          className="border-border bg-surface flex flex-col gap-0.5 border-t p-2 md:hidden"
        >
          {nav.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} mobile />
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
