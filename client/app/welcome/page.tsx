import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { WelcomeChoice } from './WelcomeChoice';
import { FotSpotMark } from '@/components/shared/FotSpotMark';

export const metadata: Metadata = { title: 'Welcome' };

/**
 * First-login role discovery — README §1.2.2.
 *
 * A real route rather than a modal: linkable, back-button safe, full-screen touch
 * targets for §14's target device, and it can be revisited without hunting for the
 * dialog that triggered it.
 */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/welcome');

  // Asked once per account, never per device. Someone who already answered lands on
  // their dashboard instead of being interrogated again on a second phone.
  if (session.onboarded) redirect('/dashboard');

  const alreadyPlayer = session.roles.includes('player');

  return (
    <main className="pitch-gradient flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <FotSpotMark className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What brings you to FotSpot?
          </h1>
          <p className="text-muted mx-auto mt-2 max-w-md text-sm">
            This just sets up your home screen. You can change it any time, and you can be both.
          </p>
        </div>

        <WelcomeChoice alreadyPlayer={alreadyPlayer} />
      </div>
    </main>
  );
}
