import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { invitations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { MyInvitation } from '@/lib/api/types';
import { InvitationList } from './InvitationList';

// One person's invitations, and an empty shell to anybody without a session —
// see the note in `feed/page.tsx`.
export const metadata: Metadata = {
  title: 'Invitations',
  robots: { index: false, follow: true },
};

/**
 * Where an academy's invitation is answered.
 *
 * The notification links here with `?action=JOIN_ACADEMY`. The parameter names
 * what brought the person over rather than filtering anything away: somebody who
 * arrives to answer one invitation should still see the other two waiting.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const [session, { t }] = await Promise.all([getSession(), getServerT()]);
  if (!session) redirect('/login?next=/invitations');
  await searchParams;

  const mine = await invitations
    .listMine({ token: session?.accessToken, cache: 'no-store' })
    .catch(() => [] as MyInvitation[]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.invitations.title}</h1>
        <p className="text-muted text-sm">{t.invitations.subtitle}</p>
      </header>

      <InvitationList initial={mine} />
    </div>
  );
}
