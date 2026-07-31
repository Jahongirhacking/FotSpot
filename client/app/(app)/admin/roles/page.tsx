import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin, type RoleWithPermissions } from '@/lib/api/resources';
import { RolesManager } from './RolesManager';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Roles & permissions' };

/** Super admin only — §1.2 bars plain admins from managing roles. */
export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/roles');

  const { t } = await getServerT();
  if (!isSuperAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.dashboard.adminSubtitle}</Alert>;
  }

  const roles = await admin
    .roles({ token: session.accessToken, activeRole: session.activeRole, cache: 'no-store' })
    .catch(() => [] as RoleWithPermissions[]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <KeyRound className="text-primary size-5" aria-hidden /> {t.admin.rolesPermissions}
        </h1>
        <p className="text-muted text-sm">{t.admin.rolesPermissionsHint}</p>
      </header>

      <RolesManager initial={roles} />
    </div>
  );
}
