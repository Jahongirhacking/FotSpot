'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { ROLE_META, type Role } from '@/lib/roles';
import { useSession } from './SessionProvider';
import { Menu, MenuContent, MenuLabel, MenuRadioItem, MenuTrigger } from '@/components/ui/Menu';
import { Badge } from '@/components/ui/Badge';

/**
 * Role switcher — README §1.2.3.
 *
 * Renders nothing for a single-role user: chrome that explains nothing is worse
 * than no chrome. Switching changes the view only and needs no token refresh,
 * because the JWT already carries every role at once.
 */
export function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useSession();
  const router = useRouter();

  if (!activeRole || roles.length < 2) return null;

  const active = ROLE_META[activeRole];
  const ActiveIcon = active.icon;

  function switchTo(role: Role) {
    if (role === activeRole) return;
    setActiveRole(role);
    // Server Components render per-role content, so the tree has to be re-fetched.
    router.refresh();
  }

  return (
    <Menu>
      <MenuTrigger
        className="border-border bg-surface hover:bg-surface-2 flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors"
        aria-label={`Active role: ${active.label}. Change role`}
      >
        <ActiveIcon className="text-primary size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{active.label}</span>
        <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
      </MenuTrigger>

      <MenuContent>
        <MenuLabel>View FotSpot as</MenuLabel>
        {roles.map((role) => {
          const meta = ROLE_META[role];
          const Icon = meta.icon;
          return (
            <MenuRadioItem key={role} checked={role === activeRole} onSelect={() => switchTo(role)}>
              <Icon className="text-muted size-4" aria-hidden />
              <span className="flex flex-col items-start">
                <span>{meta.label}</span>
                <span className="text-muted text-xs">{meta.blurb}</span>
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
