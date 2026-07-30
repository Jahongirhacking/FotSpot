import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { admin, type AdminUser } from '@/lib/api/resources';
import { AdminManager } from './AdminManager';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Administrators' };

/** Super-admin only: appoint and revoke administrators (README §1.2). */
export default async function AdminsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/admins');

  const { t } = await getServerT();

  // A plain admin explicitly cannot create admins (§1.2), so this screen is
  // super-admin only. The backend enforces it; this explains it.
  if (!session.roles.includes('super_admin')) {
    return <Alert tone="warning">{t.dashboard.adminSubtitle}</Alert>;
  }

  const admins = await admin
    .listAdmins({ token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as AdminUser[]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShieldCheck className="text-primary size-5" aria-hidden /> {t.admin.manageAdmins}
        </h1>
        <p className="text-muted text-sm">{t.admin.manageAdminsHint}</p>
      </header>

      <AdminManager initialAdmins={admins} />
    </div>
  );
}
