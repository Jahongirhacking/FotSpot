import { users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlayerWizard } from './PlayerWizard';

export const metadata: Metadata = { title: 'Set up your player card' };

export default async function PlayerOnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/onboarding/player');

  // The account often already knows the person's name (they typed it at
  // registration). Asking again is a pointless step, so pass it in and let the
  // wizard skip straight to the date of birth.
  const me = await users?.me({ token: session?.accessToken, cache: 'no-store' }).catch(() => null);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-4 py-8">
      <PlayerWizard knownName={{ firstName: me?.firstName ?? '', lastName: me?.lastName ?? '' }} />
    </main>
  );
}
