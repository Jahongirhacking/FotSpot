import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { academies } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { AddCoach } from './AddCoach';
import { EmptyState } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Create a coach' };

/**
 * Minting a coach account.
 *
 * Its own page rather than a panel on the squad screen, because creating an
 * account and reading the credentials out to somebody is a task a manager sits
 * down to do — not something to stumble into while scrolling a list. Inviting a
 * coach who is *already* on the platform is the squad screen's job, and needs
 * that person's consent.
 */
export default async function NewCoachPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine/coaches/new');
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

  /*
   * A local team has no coaches, so it has no page for creating one.
   *
   * The link into here is already absent from the squad screen; this covers the
   * typed URL and the stale bookmark. Said rather than redirected, because a
   * silent bounce to the squad looks like the page failed to load — and
   * `AcademiesService.createCoach` refuses the request either way, so what is
   * left to get right is telling the manager why.
   */
  if (academy?.kind === 'LOCAL_TEAM') {
    return (
      <EmptyState
        icon={Building2}
        title={t.academy.localTeamNoCoaches}
        description={t.academy.noAcademyBody}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/academies/mine/squad"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.academy.squad}
      </Link>

      <header>
        <h1 className="text-xl font-bold">{t.academy.addCoach}</h1>
        <p className="text-muted text-sm">{t.academy.addCoachHint}</p>
      </header>

      <AddCoach academyId={academy?.id} defaultOpen />
    </div>
  );
}
