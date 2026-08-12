import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { UserDirectory } from './UserDirectory';
import { Alert } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';

export const metadata: Metadata = { title: 'Users' };

/**
 * User directory — README §1.2.
 *
 * Any admin may read it. Changing a user (roles, enabling/disabling) is super
 * admin only: "can look" and "can alter" are very different powers over an
 * account that may belong to a child (§11).
 */
export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/users');

  const { t } = await getServerT();
  const isAdmin = isAdminActing(session?.activeRole);
  const isSuperAdmin = isSuperAdminActing(session?.activeRole);

  if (!isAdmin) return <Alert tone="warning">{t.academy.adminOnly}</Alert>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Users className="text-primary size-5" aria-hidden /> {t.admin.users}
          {!isSuperAdmin && (
            <Badge variant="neutral" className="ml-1">
              {t.admin.readOnly}
            </Badge>
          )}
        </h1>
        <p className="text-muted text-sm">{t.admin.usersHint}</p>
      </header>

      <UserDirectory />
    </div>
  );
}
