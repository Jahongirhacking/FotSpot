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

  // Asked once per account, never per device. Someone who already answered lands
  // on their dashboard instead of being interrogated again on a second phone.
  //
  // `roles.length` is part of the condition, not decoration: the app layout sends
  // roleless accounts here, so leaving on the cookie alone would bounce them
  // straight back and loop. Answering the question and ending up with a role are
  // now the same event, and both have to be true to leave.
  if (session.onboarded && session.roles.length > 0) redirect('/dashboard');

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
            Pick the one that fits you today. You can add the other later, and plenty of
            people are both.
          </p>
        </div>

        <WelcomeChoice alreadyPlayer={alreadyPlayer} />
      </div>
    </main>
  );
}
