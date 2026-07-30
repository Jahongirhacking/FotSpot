'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ROLE_META, type Role } from '@/lib/roles';
import { useSession } from '@/components/layout/SessionProvider';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/**
 * The roles a user holds, each switchable in place.
 *
 * Labels are passed in from the Server Component that already resolved the
 * dictionary, so this island doesn't re-derive translations.
 */
export function ProfileRoleList({
  roles,
  labels,
}: {
  roles: Role[];
  labels: Record<string, { label: string; blurb: string }>;
}) {
  const { activeRole, setActiveRole } = useSession();
  const { t } = useI18n();
  const router = useRouter();

  function switchTo(role: Role) {
    if (role === activeRole) return;
    setActiveRole(role);
    router.refresh();
  }

  return (
    <ul className="space-y-2">
      {roles.map((role) => {
        const meta = ROLE_META[role];
        const Icon = meta.icon;
        const isActive = role === activeRole;
        const copy = labels[role] ?? { label: role, blurb: '' };

        return (
          <li key={role}>
            <button
              type="button"
              onClick={() => switchTo(role)}
              aria-pressed={isActive}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                isActive
                  ? 'border-primary/40 bg-primary/[0.06]'
                  : 'border-border hover:bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-surface-3 text-muted',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{copy.label}</span>
                <span className="text-muted block text-xs">{copy.blurb}</span>
              </span>

              {isActive ? (
                <Badge variant="primary" className="shrink-0">
                  <Check className="size-3" aria-hidden /> {t.roles.activeRole}
                </Badge>
              ) : (
                <span className="text-muted shrink-0 text-xs">{t.roles.switchRole}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
