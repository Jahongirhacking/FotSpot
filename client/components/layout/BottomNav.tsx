'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, LogOut, Settings, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from './I18nProvider';
import { useSession } from './SessionProvider';
import type { NavItem } from './nav';

/**
 * The phone's navigation: a bar along the bottom edge, where the thumb is.
 *
 * The burger menu it replaces hid every destination behind a press and told
 * the reader nothing about where they were. A bar shows the four places that
 * matter for the role, marks the current one, and carries the badges the
 * desktop menu carries. A role with more destinations than fit gets a fifth
 * tab, "More", which opens a sheet with the rest — plus the profile, settings
 * and sign-out for a signed-in person, so nothing is only reachable through
 * the avatar in the header.
 *
 * Hidden from `lg` up, where the inline header nav takes over. The bar is
 * `fixed`, so the app layout reserves its height under the footer.
 */
export const BOTTOM_NAV_HEIGHT_CLASS = 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0';

/** How many tabs a phone can show with a readable label under each. */
const VISIBLE = 4;

export function BottomNav({
  items,
  badgeFor,
}: {
  items: NavItem[];
  badgeFor: (label: NavItem['label']) => number | undefined;
}) {
  const { t } = useI18n();
  const { isAuthenticated } = useSession();
  const pathname = usePathname();
  const [moreOpenOn, setMoreOpenOn] = React.useState<string | null>(null);
  // Navigating closes the sheet by derivation: it was opened on another route.
  const moreOpen = moreOpenOn === pathname;

  const needsMore = items.length > VISIBLE + 1 || isAuthenticated;

  /** The same sign-out the avatar menu does: clear the cookies, then a full load of the landing. */
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
  };
  const primary = needsMore ? items.slice(0, VISIBLE) : items;
  const rest = needsMore ? items.slice(VISIBLE) : [];
  const restActive = rest.some((item) => isActive(pathname, item.href));
  const moreBadge = rest.reduce((sum, item) => sum + (badgeFor(item.label) ?? 0), 0);

  return (
    <>
      <nav
        aria-label="Main"
        className="bg-surface/95 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul
          className="mx-auto grid h-16 max-w-lg"
          style={{
            gridTemplateColumns: `repeat(${primary.length + (needsMore ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {primary.map((item) => (
            <li key={item.href} className="min-w-0">
              <Tab
                href={item.href}
                label={t.nav[item.label]}
                icon={item.icon}
                active={isActive(pathname, item.href)}
                badge={badgeFor(item.label)}
              />
            </li>
          ))}
          {needsMore && (
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMoreOpenOn(moreOpen ? null : pathname)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                className={cn(
                  'relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  restActive || moreOpen ? 'text-primary' : 'text-muted',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors',
                    (restActive || moreOpen) && 'bg-primary/12',
                  )}
                >
                  {moreOpen ? (
                    <X className="size-5" aria-hidden />
                  ) : (
                    <LayoutGrid className="size-5" aria-hidden />
                  )}
                </span>
                <span className="max-w-full truncate">{t.nav.more}</span>
                <Dot count={moreBadge} />
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Below the bar (z-40), so the bar stays crisp and its More button
          still closes the sheet; the sheet itself sits just above the bar. */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-label={t.nav.more}>
          {/* A press outside the sheet closes it; the bar underneath stays usable. */}
          <button
            type="button"
            aria-label={t.nav.closeMenu}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMoreOpenOn(null)}
          />
          <div className="bg-surface border-border absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] rounded-t-2xl border-t p-3 shadow-xl">
            <ul className="grid grid-cols-3 gap-2">
              {rest.map((item) => (
                <li key={item.href}>
                  <SheetLink
                    href={item.href}
                    label={t.nav[item.label]}
                    icon={item.icon}
                    active={isActive(pathname, item.href)}
                    badge={badgeFor(item.label)}
                  />
                </li>
              ))}
              {isAuthenticated && (
                <>
                  <li>
                    <SheetLink
                      href="/profile"
                      label={t.nav.profile}
                      icon={UserRound}
                      active={isActive(pathname, '/profile')}
                    />
                  </li>
                  <li>
                    <SheetLink
                      href="/settings"
                      label={t.nav.settings}
                      icon={Settings}
                      active={isActive(pathname, '/settings')}
                    />
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={logout}
                      className="bg-surface-2 text-danger relative flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium"
                    >
                      <LogOut className="size-5" aria-hidden />
                      <span className="max-w-full truncate">{t.nav.logout}</span>
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

function Tab({
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
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted',
      )}
    >
      <span
        className={cn(
          'grid h-7 w-12 place-items-center rounded-full transition-colors',
          active && 'bg-primary/12',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
      <Dot count={badge} />
    </Link>
  );
}

function SheetLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium',
        active ? 'bg-primary/12 text-primary' : 'bg-surface-2 text-foreground',
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
      <Dot count={badge} className="top-2 right-2 translate-x-0" />
    </Link>
  );
}

/** The count for a tab: a small pill at the icon's corner, capped at 9+. */
function Dot({ count, className }: { count?: number; className?: string }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={cn(
        'bg-primary absolute top-1.5 left-1/2 grid min-w-4 translate-x-1 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold text-white',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
