import Link from 'next/link';
import { CalendarDays, Sparkles, TrendingUp, Video } from 'lucide-react';
import { players, coaches, trials } from '@/lib/api/resources';
import { ApiError } from '@/lib/api/client';
import type { CoachAssessment, PlayerProfile, Trial, TrialApplication } from '@/lib/api/types';
import { cardCompletion } from '@/lib/player-card';
import { PlayerCard } from '@/components/player/PlayerCard';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/utils';

/**
 * The player's home screen IS their card (README §21.6) — not a subpage, not a feed.
 * A Server Component: all of this is known at request time.
 */
export async function PlayerHome({ token }: { token: string }) {
  let profile: PlayerProfile | null = null;
  try {
    profile = await players.getMine({ token, cache: 'no-store' });
  } catch (error) {
    // A player role without a profile is a real state (role granted, profile
    // deleted) — recover into the wizard rather than erroring.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  if (!profile) {
    return (
      <EmptyState
        icon={Sparkles}
        title="You don't have a player card yet"
        description="Set one up so academies and scouts can find you."
        action={
          <Button asChild>
            <Link href="/onboarding/player">Set up my card</Link>
          </Button>
        }
      />
    );
  }

  const [assessments, applications, upcoming] = await Promise.all([
    safe(() => coaches.assessmentsForPlayer(profile!.id, { token, cache: 'no-store' }), []),
    safe(() => trials.myApplications({ token, cache: 'no-store' }), []),
    safe(() => trials.listUpcoming({ revalidate: 300 }), []),
  ]);

  const completion = cardCompletion(profile, assessments);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <PlayerCard player={profile} assessments={assessments} />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Video className="text-primary size-4" aria-hidden /> Your clips
            </CardTitle>
            <Badge variant="neutral">{profile.media?.length ?? 0}</Badge>
          </CardHeader>
          <CardContent>
            {profile.media && profile.media.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {profile.media.map((item) => (
                  <li
                    key={item.id}
                    className="bg-surface-2 border-border rounded-lg border p-3 text-xs"
                  >
                    <Badge variant="primary">{item.category.replace('_', ' ')}</Badge>
                    <p className="text-muted mt-2">{formatDate(item.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">
                No clips yet. 60 seconds of you dribbling is worth more than any description.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        {/* Progress against your own past self, never a ranking against other
            children (§21.4). */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-primary size-4" aria-hidden /> Make your card stronger
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{completion.percent}%</span>
              <span className="text-muted text-xs">
                {completion.done} of {completion.total} done
              </span>
            </div>
            <div className="bg-surface-3 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${completion.percent}%` }}
              />
            </div>
            <ul className="space-y-1.5 text-sm">
              {completion.checks.map((check) => (
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
              <CalendarDays className="text-primary size-4" aria-hidden /> Your trials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.length === 0 ? (
              <>
                <p className="text-muted text-sm">You haven&apos;t applied to any trials yet.</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/trials">Browse {upcoming.length} open trials</Link>
                </Button>
              </>
            ) : (
              <ul className="space-y-2">
                {applications.slice(0, 5).map((application) => (
                  <li
                    key={application.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/trials/${application.trialId}`}
                      className="truncate hover:underline"
                    >
                      {titleFor(application, upcoming)}
                    </Link>
                    <Badge variant={statusTone(application.status)}>
                      {application.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {assessments.length === 0 && (
          <Alert tone="info" title="Get verified">
            Your numbers are self-reported until a verified coach assesses you. A coach-verified bar
            counts for far more with academies.
          </Alert>
        )}
      </aside>
    </div>
  );
}

function titleFor(application: TrialApplication, upcoming: Trial[]) {
  return upcoming.find((trial) => trial.id === application.trialId)?.title ?? 'Trial';
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
