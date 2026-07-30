import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { academies, endorsements, follows } from '@/lib/api/resources';
import type { Endorsement } from '@/lib/api/resources';
import type { AcademyScoutFollow } from '@/lib/api/types';
import { EndorsementManager } from './EndorsementManager';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Scout network' };

/**
 * An academy's people — README §1.5.3.
 *
 * Deliberately one page for both relationships, because the distinction between
 * them is the thing that needs explaining: following is social and changes
 * nothing, endorsing is what lets a scout recommend to you. Splitting them across
 * two screens would hide exactly the comparison that makes it clear.
 */
export default async function ScoutNetworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/academies/${id}/scouts`);

  const { t } = await getServerT();
  const token = session.accessToken;

  const academy = await academies.getById(id, { token, cache: 'no-store' }).catch(() => null);
  if (!academy) return <Alert tone="danger">{t.common.couldNotLoad}</Alert>;

  // Both are manager-only on the backend; a non-manager gets empty lists rather
  // than a crash, and the page explains why below.
  const [endorsed, followed] = await Promise.all([
    endorsements.list(id, undefined, { token, cache: 'no-store' }).catch(() => [] as Endorsement[]),
    follows.scoutNetwork(id, { token, cache: 'no-store' }).catch(() => [] as AcademyScoutFollow[]),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Users className="text-primary size-5" aria-hidden /> {t.academy.scoutNetwork}
        </h1>
        <p className="text-muted text-sm">{academy.name}</p>
      </header>

      <Alert tone="info">{t.academy.scoutNetworkHint}</Alert>

      <EndorsementManager academyId={id} initialEndorsements={endorsed} followed={followed} />
    </div>
  );
}
