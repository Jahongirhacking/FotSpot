'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, UserCircle } from 'lucide-react';
import { ROLE_META, type Role } from '@/lib/roles';
import { homeHrefForRole } from './nav';
import { useSession } from './SessionProvider';
import { Menu, MenuContent, MenuLabel, MenuRadioItem, MenuTrigger } from '@/components/ui/Menu';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from './I18nProvider';

/**
 * Role switcher — README §1.2.3.
 *
 * Renders nothing for a single-role user: chrome that explains nothing is worse
 * than no chrome. Switching changes the view only and needs no token refresh,
 * because the JWT already carries every role at once.
 */
export function RoleSwitcher() {
  const { t } = useI18n();
  const { roles, activeRole, setActiveRole } = useSession();
  const router = useRouter();

  if (!activeRole || roles.length < 2) return null;

  const active = ROLE_META[activeRole];
  const ActiveIcon = active?.icon;

  function switchTo(role: Role) {
    if (role === activeRole) return;
    setActiveRole(role);
    /*
     * Go to where the new role starts, not wherever the old one was standing.
     *
     * A manager switching to coach was left on `/recommendations/inbox` — a
     * screen a coach cannot use, with nothing in the menu highlighted. Server
     * Components render per-role content, so the tree still has to be
     * re-fetched; `push` then `refresh` does both.
     */
    router.push(homeHrefForRole(role));
    router.refresh();
  }

  return (
    <Menu>
      <MenuTrigger
        className="border-border bg-surface hover:bg-surface-2 flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors"
        aria-label={`Active role: ${active?.label}. Change role`}
      >
        <ActiveIcon className="text-primary size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{active?.label}</span>
        <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
      </MenuTrigger>

      <MenuContent>
        <MenuLabel>{t.roles.viewAs}</MenuLabel>
        {roles.map((role) => {
          const meta = ROLE_META[role];
          // A role this build has no entry for still switches — see the note in
          // ProfileRoleList. `<undefined />` throws; a generic glyph does not.
          const Icon = meta?.icon ?? UserCircle;
          return (
            <MenuRadioItem key={role} checked={role === activeRole} onSelect={() => switchTo(role)}>
              <Icon className="text-muted size-4" aria-hidden />
              <span className="flex flex-col items-start">
                <span>{meta?.label}</span>
                <span className="text-muted text-xs">{meta?.blurb}</span>
              </span>
            </MenuRadioItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

/**
 * Pending roles are shown, not hidden (§1.2.3) — an invisible pending role just
 * generates support questions. Disabled, with the reason visible.
 */
export function PendingRoleBadge({ label, status }: { label: string; status: string }) {
  return (
    <Badge variant="warning" title={`${label} — ${status}`}>
      {label} · {status}
    </Badge>
  );
}
