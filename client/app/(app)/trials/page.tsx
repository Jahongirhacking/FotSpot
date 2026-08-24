import { Button } from '@/components/ui/Button';

import { Alert, EmptyState } from '@/components/ui/Feedback';
import { academies, recommendations, trials } from '@/lib/api/resources';
import type { CoachReview, CoachTrial } from '@/lib/api/types';
import { getServerT } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';

import { TrialCard } from '@/components/trials/TrialCard';
import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AcademyTrials } from './AcademyTrials';
import { CoachTrials } from './CoachTrials';
import { MarkTrialsSeen } from './MarkTrialsSeen';
import { MyTrialInvitations } from './MyTrialInvitations';
import { TrialFilters } from './TrialFilters';

/** The tab title is translated like the page under it — see app/layout.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.nav.trials };
}

/**
 * NOTE (Next 16): `searchParams` is a Promise — see app/(app)/players/page.tsx.
 *
 * `?edit=<id>` puts the trial being edited in the URL, so the edit form is
 * directly linkable and survives a reload. The trial page's Edit button points
 * here rather than opening a second, drifting copy of the form.
 */
export default async function TrialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    region?: string;
    district?: string;
    age?: string;
    position?: string;
    sort?: string;
  }>;
}) {
  const session = await getSession();
  const { t } = await getServerT();
  const params = await searchParams;
  const editId = params?.edit;

  /*
   * Handed straight to the API rather than filtered here.
   *
   * The endpoint is unpaginated, so filtering on this side would mean fetching
   * every trial in the country in order to discard most of them — and
   * `sort=recommended` needs the viewer's player card, which only the API can
   * see. Values are passed through unvalidated on purpose: the DTO rejects a
   * nonsense one with a 400, which is a better answer than a board silently
   * showing everything.
   */
  const filters = {
    region: params?.region,
    district: params?.district,
    age: params?.age,
    position: params?.position,
    sort: params?.sort as 'newest' | 'recommended' | undefined,
  };

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

  /** Whether the board is narrowed — `sort` is not a filter. */
  const filtered = Boolean(params?.region || params?.district || params?.age || params?.position);

  const list = await trials
    .listUpcoming(
      filters,
      /*
       * Never cached once there is a session: `sort=recommended` is computed for
       * *this* player, so a shared cache entry would hand one player's ranking to
       * another. A signed-out board is the same for everybody and can be.
       */
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 120 },
    )
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

  /*
   * Resolved here rather than in the client component, so a bad `?edit=` is
   * answered before anything renders.
   *
   * Only looked up for a manager: `editTrial` is what puts the form on screen,
   * and a player following a stray link should see the ordinary board rather
   * than an edit form they could not save. The API refuses the PATCH either way
   * (`assertAcademyManager`) — this is so the screen agrees with it.
   *
   * A trial that does not exist, or belongs to another academy, leaves this null
   * and the page says so below instead of opening an empty form that would
   * create a *second* trial on save.
   */
  const editTrial =
    managed && editId
      ? await trials
          .getById(editId, { token: session!.accessToken, cache: 'no-store' })
          .then((found) => (found.academyId === managed.id ? found : null))
          .catch(() => null)
      : null;

  return (
    <div className="space-y-6">
      {/* Guests have no badge to clear, so it is only mounted for a session. */}
      {session && <MarkTrialsSeen />}
      <header>
        <h1 className="text-xl font-bold">{t.trials.openTrials}</h1>
        <p className="text-muted text-sm">{t.trials.openTrialsHint}</p>
      </header>

      {/* A private trial is never on the board below, so the only way a player
          learns of one is here (and in their notifications).

          Only for a player: the endpoint behind this is "my applications", which
          a manager or a scout does not have. Mounting it for any session asked
          every one of them for something that cannot exist, and got a 403 back on
          every visit to this page. */}
      {session?.activeRole === 'player' && <MyTrialInvitations />}

      {session?.activeRole === 'academy_manager' && editId && !editTrial && (
        <Alert tone="danger">{managed ? t.trials.editNotFound : t.trials.editNotAllowed}</Alert>
      )}

      {managed && (
        <AcademyTrials
          academyId={managed.id}
          academyName={managed.name}
          initial={managedTrials}
          editTrial={editTrial}
        />
      )}

      {/*
        Only on the public board. A manager's screen is their own two lists, and
        filtering somebody else's trials is not what they came for.
      */}
      {!managed && <TrialFilters />}

      {!managed &&
        (list?.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            /*
             * "No trials yet" is wrong when the board is filtered — the trials
             * exist, the filter excluded them, and telling somebody the platform
             * is empty sends them away rather than back to the filter.
             */
            title={filtered ? t.trials.noMatches : t.trials.noTrials}
            description={filtered ? t.trials.noMatchesHint : t.trials.noTrialsHint}
            action={
              <Button asChild variant="outline">
                <Link href="/academies">{t.trials.browseAcademies}</Link>
              </Button>
            }
          />
        ) : (
          /*
           * One column on a phone, two on a tablet, three on a laptop and four
           * on a wide screen — the card is designed to stay readable at 375px,
           * so the breakpoints add columns rather than shrinking it.
           */
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list?.map((trial) => (
              <li key={trial?.id}>
                <TrialCard trial={trial} t={t} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
