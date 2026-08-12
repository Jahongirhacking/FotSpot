import { AttributeBoard } from '@/components/player/AttributeBoard';
import { OnThePitchCard } from '@/components/player/OnThePitchCard';
import { PlayerCard } from '@/components/player/PlayerCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { ApiError } from '@/lib/api/client';
import { coaches, media, players, trials } from '@/lib/api/resources';
import type { CoachAssessment, PlayerProfile, Trial, TrialApplication } from '@/lib/api/types';
import { interpolate, type Dictionary } from '@/lib/i18n';
import { cardCompletion } from '@/lib/player-card';
import { CalendarDays, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';

/**
 * The player's home screen IS their card (README §21.6) — not a subpage, not a feed.
 * A Server Component: all of this is known at request time.
 */
export async function PlayerHome({ token, t }: { token: string; t: Dictionary }) {
  let profile: PlayerProfile | null = null;
  try {
    profile = await players?.getMine({ token, cache: 'no-store' });
  } catch (error) {
    // A player role without a profile is a real state (role granted, profile
    // deleted) — recover into the wizard rather than erroring.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  if (!profile) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t.player.noPlayerCardYet}
        description={t.player.noPlayerCardHint}
        action={
          <Button asChild>
            <Link href="/onboarding/player">{t.dashboard.setUpMyCard}</Link>
          </Button>
        }
      />
    );
  }

  const [assessments, clips, applications, upcoming] = await Promise.all([
    // `.items`: both of these are paginated now, and both screens want the
    // first page — the newest assessments and the newest clips.
    safe(
      () =>
        coaches
          .assessmentsForPlayer(profile!.id, {}, { token, cache: 'no-store' })
          .then((p) => p.items),
      [],
    ),
    safe(
      () =>
        media
          .listForPlayer(profile!.id, undefined, {}, { token, cache: 'no-store' })
          .then((p) => p.items),
      [],
    ),
    safe(() => trials?.myApplications({ token, cache: 'no-store' }), []),
    safe(() => trials?.listUpcoming({ revalidate: 300 }), []),
  ]);
  // A clip that failed to process is not a clip the player has. Counted from the
  // first page, which is newest-first and holds twenty — plenty to answer
  // "is there at least one".
  const usableClips = clips?.filter((clip) => clip?.status !== 'FAILED').length;
  const completion = cardCompletion(profile, t, usableClips);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <div className="grid min-w-0 items-center gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <PlayerCard player={profile} selfLabel={t.relation.you} className="m-auto" />
          <OnThePitchCard player={profile} t={t} className="!h-full" />

          {/* The clips live with the bars they move, not in a gallery of their
              own — uploading one is how a player raises a bar. */}
          {/* min-w-0: a grid item defaults to min-width:auto, which means it
              refuses to shrink below its content. The clip category strip inside
              scrolls horizontally, and without this the item grows to the strip's
              full width instead — taking the whole page sideways with it. */}
          <div className="min-w-0 sm:col-span-2">
            <AttributeBoard player={profile} assessments={assessments} clips={clips} canUpload />
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        {/* Progress against your own past self, never a ranking against other
            children (§21.4). */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-primary size-4" aria-hidden /> {t.player.makeCardStronger}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{completion?.percent}%</span>
              <span className="text-muted text-xs">
                {interpolate(t.player.completionDone, {
                  done: completion?.done,
                  total: completion?.total,
                })}
              </span>
            </div>
            <div className="bg-surface-3 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${completion?.percent}%` }}
              />
            </div>
            <ul className="space-y-1.5 text-sm">
              {completion?.checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2">
                  <span
                    className={
                      check.done
                        ? 'bg-success size-1.5 shrink-0 rounded-full'
                        : 'bg-surface-3 size-1.5 shrink-0 rounded-full'
                    }
                    aria-hidden
                  />
                  <span className={check.done ? 'text-muted line-through' : ''}>{check.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="text-primary size-4" aria-hidden /> {t.trials.yourTrials}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications?.length === 0 ? (
              <>
                <p className="text-muted text-sm">{t.trials.noApplications}</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/trials">
                    {interpolate(t.trials.browseOpen, { count: upcoming.length })}
                  </Link>
                </Button>
              </>
            ) : (
              <ul className="space-y-2">
                {applications?.slice(0, 5).map((application) => (
                  <li
                    key={application?.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/trials/${application?.trialId}`}
                      className="truncate hover:underline"
                    >
                      {titleFor(application, upcoming, t.trials.trial)}
                    </Link>
                    <Badge variant={statusTone(application?.status)}>
                      {application?.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {assessments?.length === 0 && (
          <Alert tone="info" title={t.player.getVerifiedTitle}>
            {t.player.getVerifiedBody}
          </Alert>
        )}
      </aside>
    </div>
  );
}

function titleFor(application: TrialApplication, upcoming: Trial[], fallback: string) {
  return upcoming.find((trial) => trial?.id === application?.trialId)?.title ?? fallback;
}

function statusTone(status: TrialApplication['status']) {
  if (status === 'ACCEPTED') return 'success' as const;
  if (status === 'REJECTED') return 'danger' as const;
  if (status === 'INVITED') return 'primary' as const;
  if (status === 'SHORTLISTED') return 'info' as const;
  return 'neutral' as const;
}

/** Dashboard widgets degrade individually — one failing panel must not blank the page. */
async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export type { CoachAssessment };
