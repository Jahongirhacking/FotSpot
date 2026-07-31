import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { PlayerHome } from './PlayerHome';
import { ScoutHome } from './ScoutHome';
import { AcademyHome } from './AcademyHome';
import { AdminHome } from './AdminHome';
import { CoachHome } from './CoachHome';
import { RoleIntentCard } from './RoleIntentCard';

export const metadata: Metadata = { title: 'Home' };

/**
 * Role-aware home — README §1.2.1.
 *
 * A single route that renders by active role, rather than /player/home,
 * /scout/home, … : switching roles then needs no navigation, and every deep link
 * into the app keeps working after a switch.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');

  const { activeRole, roles, onboarded } = session;
  const { t } = await getServerT();

  return (
    <div className="space-y-6">
      {/* Skipping /welcome is non-terminal (§1.2.2): the question comes back here,
          dismissibly, instead of being lost forever. */}
      {!onboarded && !roles.includes('player') && <RoleIntentCard />}

      {activeRole === 'player' && <PlayerHome token={session.accessToken} />}
      {activeRole === 'scout' && <ScoutHome token={session.accessToken} />}
      {activeRole === 'coach' && <CoachHome token={session.accessToken} />}
      {activeRole === 'academy_manager' && <AcademyHome token={session.accessToken} t={t} />}
      {(activeRole === 'admin' || activeRole === 'super_admin') && (
        <AdminHome isSuperAdmin={activeRole === 'super_admin'} t={t} />
      )}
    </div>
  );
}
