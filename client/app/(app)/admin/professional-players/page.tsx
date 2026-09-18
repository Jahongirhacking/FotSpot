import { Alert } from '@/components/ui/Feedback';
import { professionalPlayers } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { isAdminActing } from '@/lib/roles';
import { getSession } from '@/lib/session';
import { Star } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProfessionalPlayerManager } from './ProfessionalPlayerManager';

export const metadata: Metadata = { title: 'Professional players' };

/** Admin console: the platform's list of professionals (README §21). */
export default async function AdminProfessionalPlayersPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/professional-players');

  const { t } = await getServerT();
  if (!isAdminActing(session?.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const first = await professionalPlayers
    .list({ pageSize: 100 }, { token: session?.accessToken, cache: 'no-store' })
    .catch(() => null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Star className="text-primary size-5" aria-hidden /> {t.professional.manage}
        </h1>
        <p className="text-muted text-sm">{t.professional.manageHint}</p>
      </header>

      <ProfessionalPlayerManager initial={first?.items ?? []} />
    </div>
  );
}
