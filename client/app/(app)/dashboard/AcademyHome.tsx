import * as React from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Inbox,
  Plus,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import {
  academies,
  insights,
  recommendations,
  trials,
  type AcademySummary,
  type WeeklyInsights,
} from '@/lib/api/resources';
import type { AcademyProfile, RankedRecommendation, Trial } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Feedback';
import { CredibilityMeter } from '@/components/player/CredibilityMeter';
import { ageBand, formatDate, initials } from '@/lib/utils';

/**
 * Academy manager home.
 *
 * There is no "register an academy" call to action here, and that is the point: an
 * academy manager cannot exist without an academy. The role is granted by an admin
 * at the moment the academy record is created (§1.10), so a manager reaching this
 * screen always has one — and the only way to arrive without one is a hand-over
 * that left the role behind, which the empty state names honestly rather than
 * offering a form that would 403.
 *
 * The academy comes from `GET /academies/mine`. This used to scan the public list
 * and take the first entry, which showed managers somebody else's academy.
 */
export async function AcademyHome({ token, t }: { token: string; t: Dictionary }) {
  const academy = await safe<AcademyProfile | null>(
    () => academies.mine({ token, cache: 'no-store' }),
    null,
  );

  if (!academy) {
    return (
      <EmptyState
        icon={Building2}
        title={t.academy.noAcademyLinked}
        description={t.academy.noAcademyLinkedHint}
      />
    );
  }

  const [summary, ranked, academyTrials, weekly] = await Promise.all([
    safe<AcademySummary | null>(
      () => insights.forAcademy(academy.id, { token, cache: 'no-store' }),
      null,
    ),
    safe<{ items: RankedRecommendation[]; total: number }>(
      () => recommendations.listRanked(academy.id, { token, cache: 'no-store' }),
      { items: [], total: 0 },
    ),
    safe<Trial[]>(() => trials.listForAcademy(academy.id, { token, cache: 'no-store' }), []),
    // Cached server-side for five minutes, so this costs little per dashboard load.
    safe<WeeklyInsights | null>(() => insights.weekly({ token, revalidate: 120 }), null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{academy.name}</h1>
          <p className="text-muted flex items-center gap-2 text-sm">
            {academy.region ?? '—'}
            <Badge variant={academy.status === 'VERIFIED' ? 'success' : 'warning'}>
              {academy.status.toLowerCase()}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/academies/${academy.id}/scouts`}>
              <ShieldCheck aria-hidden /> {t.academy.scoutNetwork}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/trials/new?academyId=${academy.id}`}>
              <Plus aria-hidden /> {t.academy.postTrial}
            </Link>
          </Button>
        </div>
      </div>

      {summary && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric
            icon={Inbox}
            label={t.academy.pendingRecommendations}
            value={summary.pendingRecommendations}
            href="/recommendations/inbox"
            highlight
          />
          <Metric icon={TrendingUp} label={t.academy.newThisWeek} value={summary.newThisWeek} />
          <Metric
            icon={ShieldCheck}
            label={t.academy.endorsedScouts}
            value={summary.endorsedScouts}
            href={`/academies/${academy.id}/scouts`}
          />
          <Metric
            icon={Users}
            label={t.academy.endorsedCoaches}
            value={summary.endorsedCoaches}
            href={`/academies/${academy.id}/scouts`}
          />
          <Metric icon={CalendarDays} label={t.academy.openTrials} value={summary.openTrials} />
          <Metric
            icon={ClipboardCheck}
            label={t.academy.applications}
            value={summary.applications}
          />
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="text-primary size-4" aria-hidden /> {t.academy.inbox}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/recommendations/inbox">{t.common.seeAll}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ranked.items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={t.academy.inboxEmpty}
                description={t.academy.inboxEmptyHint}
              />
            ) : (
              <ul className="divide-border divide-y">
                {ranked.items.slice(0, 6).map((item) => (
                  <li key={item.playerId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/players/${item.playerId}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {t.academy.player} {item.playerId.slice(0, 8)}
                      </Link>
                      <p className="text-muted text-xs">
                        {item.recommendationCount} · {t.academy.backing}
                      </p>
                    </div>
                    <CredibilityMeter value={item.credibility} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="text-primary size-4" aria-hidden /> {t.academy.yourTrials}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {academyTrials.length === 0 ? (
                <p className="text-muted text-sm">{t.academy.noTrials}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {academyTrials.slice(0, 5).map((trial) => (
                    <li key={trial.id}>
                      <Link href={`/trials/${trial.id}`} className="block hover:underline">
                        <span className="font-medium">{trial.title}</span>
                        <span className="text-muted block text-xs">{formatDate(trial.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {weekly && <WeeklyBoards weekly={weekly} t={t} />}
    </div>
  );
}

/**
 * "What moved this week" — three lists side by side.
 *
 * The players list ranks **scout attention, not ability**: §21.4 forbids ranking
 * children against each other, so the number beside each player is a count of who
 * put them forward, labelled as such, and this screen is unreachable by a player
 * role. See InsightsService for the full reasoning.
 */
function WeeklyBoards({ weekly, t }: { weekly: WeeklyInsights; t: Dictionary }) {
  const empty =
    weekly.players.length === 0 && weekly.scouts.length === 0 && weekly.coaches.length === 0;
  if (empty) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy className="text-primary size-4" aria-hidden /> {t.academy.thisWeek}
        </h2>
        <p className="text-muted text-sm">{t.academy.thisWeekHint}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Board title={t.academy.mostBackedPlayers} hint={t.academy.mostBackedPlayersHint}>
          {weekly.players.map((player, index) => (
            <Row
              key={player.id}
              rank={index + 1}
              href={`/players/${player.id}`}
              avatarUrl={player.avatarUrl}
              name={`${player.firstName} ${player.lastName}`}
              detail={[ageBand(player.birthDate), player.primaryPosition, player.region]
                .filter(Boolean)
                .join(' · ')}
              value={player.backingCount}
              valueLabel={t.academy.backing}
            />
          ))}
        </Board>

        <Board title={t.academy.topScouts} hint={t.academy.topScoutsHint}>
          {weekly.scouts.map((scout, index) => (
            <Row
              key={scout.id}
              rank={index + 1}
              avatarUrl={scout.avatarUrl}
              name={
                [scout.firstName, scout.lastName].filter(Boolean).join(' ') || scout.id.slice(0, 8)
              }
              detail={`${t.profile.level} ${scout.level} · ${Math.round(scout.successRate)}%`}
              value={scout.acceptedThisWeek}
              valueLabel={t.academy.accepted}
            />
          ))}
        </Board>

        <Board title={t.academy.topCoaches} hint={t.academy.topCoachesHint}>
          {weekly.coaches.map((coach, index) => (
            <Row
              key={coach.id}
              rank={index + 1}
              avatarUrl={coach.avatarUrl}
              name={
                [coach.firstName, coach.lastName].filter(Boolean).join(' ') || coach.id.slice(0, 8)
              }
              detail={t.academy.assessments}
              value={coach.assessmentsThisWeek}
              valueLabel={t.academy.assessments}
            />
          ))}
        </Board>
      </div>
    </section>
  );
}

function Board({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted text-sm">—</p>
        ) : (
          <ol className="divide-border divide-y">{items}</ol>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  rank,
  href,
  avatarUrl,
  name,
  detail,
  value,
  valueLabel,
}: {
  rank: number;
  href?: string;
  avatarUrl: string | null;
  name: string;
  detail: string;
  value: number;
  valueLabel: string;
}) {
  const [first, second] = name.split(' ');
  const inner = (
    <>
      <span className="text-muted w-4 shrink-0 text-center font-mono text-xs">{rank}</span>
      <Avatar src={avatarUrl} fallback={initials(first, second)} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="text-muted block truncate text-xs">{detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
        <span className="text-muted block text-[10px] uppercase">{valueLabel}</span>
      </span>
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="hover:bg-surface-2 flex items-center gap-2.5 py-2 transition-colors"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex items-center gap-2.5 py-2">{inner}</span>
      )}
    </li>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  href,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href?: string;
  /** Draws the eye only when there is something waiting — zero stays quiet. */
  highlight?: boolean;
}) {
  const body = (
    <>
      <dt className="text-muted flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
    </>
  );

  const className = `rounded-lg border p-3 ${
    highlight && value > 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface'
  }`;

  return href ? (
    <Link href={href} className={`${className} hover:border-primary/60 block transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Dashboard widgets degrade individually — one failing panel must not blank the page. */
async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}
