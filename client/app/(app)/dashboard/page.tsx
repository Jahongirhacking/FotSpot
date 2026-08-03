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
      {/*
        The same rule as the profile: offer the player card only to someone
        acting as a scout who has not got one. It used to show for any role that
        had not answered the welcome question, which put "are you a player?" in
        front of academy managers and admins.
      */}
      {!onboarded && activeRole === 'scout' && !roles.includes('player') && <RoleIntentCard />}

      {activeRole === 'player' && <PlayerHome token={session.accessToken} t={t} />}
      {activeRole === 'scout' && <ScoutHome token={session.accessToken} t={t} />}
      {activeRole === 'coach' && <CoachHome token={session.accessToken} t={t} />}
      {activeRole === 'academy_manager' && <AcademyHome token={session.accessToken} t={t} />}
      {(activeRole === 'admin' || activeRole === 'super_admin') && (
        <AdminHome isSuperAdmin={activeRole === 'super_admin'} t={t} />
      )}
    </div>
  );
}
