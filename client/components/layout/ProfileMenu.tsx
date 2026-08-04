'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Settings, User } from 'lucide-react';
import { ROLE_META, type Role } from '@/lib/roles';
import { useI18n } from './I18nProvider';
import { useSession } from './SessionProvider';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { ProfileSummaryBlock } from './ProfileSummaryBlock';

/**
 * Account button: profile, role switching, settings, sign out.
 *
 * Role switching lives here as well as in the header switcher because this is
 * where users look for "who am I" (README §1.2.3 asks for one tap from anywhere).
 * The role list is omitted entirely for single-role users — a switcher with one
 * option only raises questions.
 */
export function ProfileMenu({
  initials,
  avatarUrl,
}: {
  initials: string;
  avatarUrl: string | null;
}) {
  const { t } = useI18n();
  const { roles, activeRole, setActiveRole } = useSession();
  const router = useRouter();

  const multiRole = roles.length > 1;

  function switchTo(role: Role) {
    if (role === activeRole) return;
    setActiveRole(role);
    // Server Components render per-role content, so the tree must be re-fetched.
    router.refresh();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Full navigation: every cached Server Component payload for this user must go.
    window.location.assign('/');
  }

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors',
        )}
        aria-label={t.nav.account}
      >
        <Avatar src={avatarUrl} fallback={initials} className="size-9" />
      </MenuTrigger>

      <MenuContent className="min-w-64">
        {/* Who you are here, before what you can do about it. */}
        <ProfileSummaryBlock />
        <MenuSeparator />

        <MenuItem onSelect={() => router.push('/profile')}>
          <User aria-hidden /> {t.nav.profile}
        </MenuItem>

        {multiRole && (
          <>
            <MenuSeparator />
            <MenuLabel>{t.roles.viewAs}</MenuLabel>
            {roles.map((role) => {
              const meta = ROLE_META[role];
              const Icon = meta.icon;
              return (
                <MenuRadioItem
                  key={role}
                  checked={role === activeRole}
                  onSelect={() => switchTo(role)}
                >
                  <Icon className="text-muted size-4" aria-hidden />
                  {t.roles[role]}
                </MenuRadioItem>
              );
            })}
          </>
        )}

        <MenuSeparator />
        <MenuItem onSelect={() => router.push('/settings')}>
          <Settings aria-hidden /> {t.nav.settings}
        </MenuItem>
        <MenuItem onSelect={logout} className="text-danger">
          <LogOut aria-hidden /> {t.nav.logout}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
