import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { RequestQueue } from './RequestQueue';

export const metadata: Metadata = { title: 'Requests' };

/**
 * What users have asked the team to do.
 *
 * Guarded here as well as on the API, which refuses every route behind this to
 * anybody else — this is about not showing a screen that would 403, not the
 * boundary itself.
 */
export default async function AdminRequestsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/requests');

  const { t } = await getServerT();
  if (!isAdminActing(session?.activeRole)) {
    return <Alert tone="warning">{t.academy?.adminOnly}</Alert>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LifeBuoy className="text-primary size-5" aria-hidden />
          {t.requests?.title}
        </h1>
        <p className="text-muted mt-1 text-sm">{t.requests?.subtitle}</p>
      </header>

      <RequestQueue canDelete={session?.activeRole === 'super_admin'} />
    </div>
  );
}
