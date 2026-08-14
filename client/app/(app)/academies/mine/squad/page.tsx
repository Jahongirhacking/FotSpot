import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { academies, academyRoster, groups } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { AcademyGroup, AcademyMember } from '@/lib/api/types';
import { EmptyState } from '@/components/ui/Feedback';
import { SquadManager } from './SquadManager';

export const metadata: Metadata = { title: 'Squad' };

/**
 * The manager's people and squads on one screen.
 *
 * Resolved from the session rather than a route param: a manager runs exactly one
 * academy, and asking them to pick it would be a menu with one item.
 */
export default async function SquadPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine/squad');
  const { t } = await getServerT();

  const academy = await academies
    .mine({ token: session?.accessToken, cache: 'no-store' })
    .catch(() => null);

  if (!academy) {
    return (
      <EmptyState
        icon={Building2}
        title={t.academy.noAcademyTitle}
        description={t.academy.noAcademyBody}
      />
    );
  }

  const opts = { token: session?.accessToken, cache: 'no-store' as const };
  const [members, list] = await Promise.all([
    academyRoster?.list(academy?.id, {}, opts).catch(() => [] as AcademyMember[]),
    groups?.list(academy?.id, opts).catch(() => ({ groups: [] as AcademyGroup[], reserveCount: 0 })),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.academy.squad}</h1>
        <p className="text-muted text-sm">{t.academy.squadHint}</p>
      </header>

      <SquadManager
        academyId={academy?.id}
        initialMembers={members}
        initialGroups={list.groups}
        initialReserveCount={list.reserveCount}
        isLocalTeam={academy?.kind === 'LOCAL_TEAM'}
      />
    </div>
  );
}
