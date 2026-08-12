import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { academies, academyRoster, groups } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { AcademyGroup, AcademyMember } from '@/lib/api/types';
import { EmptyState } from '@/components/ui/Feedback';
import { SquadPanel } from '@/components/academy/SquadPanel';

export const metadata: Metadata = { title: 'Reserve' };

/**
 * Everyone at the academy who is not in a squad yet.
 *
 * It opens like a group because that is how a manager thinks of it, but it is
 * not one: there is nothing to rename and nothing to delete — clearing the
 * reserve means moving people out of it, which is what the rows do.
 */
export default async function ReservePage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine/reserve');
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
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/academies/mine/squad"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.academy.squad}
      </Link>

      <header>
        <h1 className="text-xl font-bold">{t.nav.reserve}</h1>
        <p className="text-muted text-sm">{t.academy.reserveHint}</p>
      </header>

      <SquadPanel
        academyId={academy?.id}
        groupId={null}
        title={t.nav.reserve}
        initialMembers={members}
        initialGroups={list.groups}
        canManage
      />
    </div>
  );
}
