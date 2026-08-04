import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { academies } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { AcademyMemberRole } from '@/lib/api/types';
import { RosterManager } from './RosterManager';

export const metadata: Metadata = { title: 'Roster' };

const ROLES: AcademyMemberRole[] = ['PLAYER', 'COACH', 'SCOUT'];

/**
 * The academy's people. Readable by anyone; editable only by its manager — and
 * the server enforces that, this only decides which buttons to draw.
 *
 * NOTE (Next 16): both `params` and `searchParams` are Promises.
 */
export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [{ id }, { role }, session, { t }] = await Promise.all([
    params,
    searchParams,
    getSession(),
    getServerT(),
  ]);
  if (!session) redirect(`/login?next=/academies/${id}/roster`);

  const relation = await academies
    .relation(id, { token: session.accessToken, cache: 'no-store' })
    .catch(() => null);

  const initialRole = ROLES.includes(role as AcademyMemberRole)
    ? (role as AcademyMemberRole)
    : 'PLAYER';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.academy.roster}</h1>
        <p className="text-muted text-sm">{t.academy.rosterHint}</p>
      </header>

      <RosterManager
        academyId={id}
        canManage={relation?.relation === 'MANAGER'}
        initialRole={initialRole}
      />
    </div>
  );
}
