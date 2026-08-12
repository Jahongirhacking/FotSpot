import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';
import { academies, recommendations, trials } from '@/lib/api/resources';
import { AcademyTrials } from './AcademyTrials';
import { CoachTrials } from './CoachTrials';
import { MyTrialInvitations } from './MyTrialInvitations';
import { MarkTrialsSeen } from './MarkTrialsSeen';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { CoachReview, CoachTrial } from '@/lib/api/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/utils';

/** The tab title is translated like the page under it — see app/layout.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.nav.trials };
}

export default async function TrialsPage() {
  const session = await getSession();
  const { t } = await getServerT();

  /*
   * A coach's Trials is a different screen, not the public board with extras.
   *
   * What they need is the sessions they are working and the profiles waiting on
   * them; the open-day list is a thing players apply to and academies host, and
   * a coach does neither. Keyed on the *active* role, so somebody who coaches
   * and also has a player profile still sees the board while wearing that hat.
   */
  if (session?.activeRole === 'coach') {
    const opts = { token: session?.accessToken, cache: 'no-store' as const };
    const [coaching, pending] = await Promise.all([
      trials?.myCoaching(opts).catch(() => [] as CoachTrial[]),
      recommendations?.myReviews('PENDING', opts).catch(() => [] as CoachReview[]),
    ]);

    return (
      <div className="space-y-6">
        {session && <MarkTrialsSeen />}
        <header>
          <h1 className="text-xl font-bold">{t.nav.trials}</h1>
          <p className="text-muted text-sm">{t.trials.coachTrialsHint}</p>
        </header>
        <CoachTrials initialTrials={coaching} initialReviews={pending} />
      </div>
    );
  }

  const list = await trials
    .listUpcoming(session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 120 })
    .catch(() => []);

  /*
   * A manager's own trials come first, above everyone else's. The academy is
   * resolved from the session rather than a route param: a manager runs exactly
   * one, and asking them to pick it would be a menu with one item.
   *
   * Only while *acting as* a manager — an admin who also manages an academy is
   * not offered its trial form while wearing the admin hat (§1.2.1).
   */
  const managed =
    session?.activeRole === 'academy_manager'
      ? await academies.mine({ token: session?.accessToken, cache: 'no-store' }).catch(() => null)
      : null;
  const managedTrials = managed
    ? await trials
        .listForAcademy(managed.id, { token: session!.accessToken, cache: 'no-store' })
        .catch(() => [])
    : [];

  return (
    <div className="space-y-6">
      {/* Guests have no badge to clear, so it is only mounted for a session. */}
      {session && <MarkTrialsSeen />}
      <header>
        <h1 className="text-xl font-bold">{t.trials.openTrials}</h1>
        <p className="text-muted text-sm">{t.trials.openTrialsHint}</p>
      </header>

      {/* A private trial is never on the board below, so the only way a player
          learns of one is here (and in their notifications). */}
      {session && <MyTrialInvitations />}

      {managed && (
        <AcademyTrials academyId={managed.id} academyName={managed.name} initial={managedTrials} />
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t.trials.noTrials}
          description={t.trials.noTrialsHint}
          action={
            <Button asChild variant="outline">
              <Link href="/academies">{t.trials.browseAcademies}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((trial) => (
            <li key={trial?.id}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <Link href={`/trials/${trial?.id}`} className="block">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{trial?.title}</p>
                      <Badge variant="primary" className="shrink-0">
                        U{trial?.ageRangeMax}
                      </Badge>
                    </div>
                    <dl className="text-muted space-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden />
                        <dt className="sr-only">Date</dt>
                        <dd>{formatDate(trial?.date)}</dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" aria-hidden />
                        <dt className="sr-only">{t.trials.location}</dt>
                        <dd>{trial?.location}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        Ages {trial?.ageRangeMin}–{trial?.ageRangeMax}
                      </Badge>
                      {trial?.positions.slice(0, 4).map((position) => (
                        <Badge key={position} variant="neutral" className="font-mono">
                          {position}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
