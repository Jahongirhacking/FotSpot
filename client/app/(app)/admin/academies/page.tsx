import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import type { AcademyProfile } from '@/lib/api/types';
import { AcademyManager } from './AcademyManager';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Academies' };

/** Admin console: create, edit and archive academies (README §1.10). */
export default async function AdminAcademiesPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/academies');

  const { t } = await getServerT();
  const isAdmin = session.roles.includes('admin') || session.roles.includes('super_admin');

  if (!isAdmin) return <Alert tone="warning">{t.academy.adminOnly}</Alert>;

  const academies = await admin
    .listAllAcademies({ token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as (AcademyProfile & { members: { userId: string }[] })[]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Building2 className="text-primary size-5" aria-hidden /> {t.admin.manageAcademies}
        </h1>
        <p className="text-muted text-sm">{t.admin.manageAcademiesHint}</p>
      </header>

      <AcademyManager initial={academies} />
    </div>
  );
}
