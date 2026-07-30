import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { PlayerWizard } from './PlayerWizard';

export const metadata: Metadata = { title: 'Set up your player card' };

export default async function PlayerOnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/onboarding/player');

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4 py-8">
      <PlayerWizard />
    </main>
  );
}
