import Link from 'next/link';
import { Megaphone, TrendingUp } from 'lucide-react';
import type { PlayerRecommendationSummary } from '@/lib/api/resources';
import type { Dictionary } from '@/lib/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { initials, relativeTime } from '@/lib/utils';

/**
 * Who vouched for this player, and the public global weight — README §1.5.3.
 *
 * Shows `globalWeight` only. The per-academy extra earned by specific
 * recommendations stays inside that academy's own inbox: it is their private
 * working judgement, and §21.5 rules out public composite scores for minors.
 *
 * Which academies a scout named is shown, because that a scout vouched for a
 * player to a particular academy is the scout's own public act.
 *
 * Each scout is a link to their record when the reader is allowed one. "Who
 * vouched for me" is only half an answer without "and are they any good" —
 * §1.5 exists precisely so that a name carries a track record. `linkScouts` is
 * false for coaches, who must judge the player and not the messenger; see
 * `mayViewScoutProfile`.
 */
export function RecommendationSummary({
  summary,
  linkScouts = false,
  t,
}: {
  summary: PlayerRecommendationSummary;
  linkScouts?: boolean;
  t: Dictionary;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="text-primary size-4" aria-hidden /> {t.recommendations.vouchedBy}
          </CardTitle>
          <CardDescription>{t.recommendations.globalWeightHint}</CardDescription>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted flex items-center justify-end gap-1 text-[10px] uppercase">
            <TrendingUp className="size-3" aria-hidden /> {t.recommendations.globalWeight}
          </p>
          <p className="text-primary text-2xl leading-tight font-bold">
            {Math.round(summary.globalWeight * 10) / 10}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {summary.scouts.length === 0 ? (
          <p className="text-muted text-sm">{t.recommendations.noRecommendationsYet}</p>
        ) : (
          <ul className="divide-border divide-y">
            {summary.scouts.map(({ id, name, avatarUrl, recommendation }) => (
              <li key={recommendation.id} className="flex items-start gap-3 py-3">
                <ScoutIdentity
                  id={id}
                  name={name}
                  avatarUrl={avatarUrl}
                  linked={linkScouts}
                  label={t.scouts.viewProfile}
                />

                <div className="min-w-0 flex-1">
                  <ScoutName id={id} name={name} linked={linkScouts} />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={recommendation.type === 'SPECIFIC' ? 'primary' : 'neutral'}>
                      {recommendation.type === 'SPECIFIC'
                        ? t.recommendations.specificType
                        : t.recommendations.globalType}
                    </Badge>
                    <span className="text-muted text-xs">{relativeTime(recommendation.date)}</span>
                  </div>
                  {recommendation.note && (
                    <p className="text-muted mt-1.5 text-xs italic">“{recommendation.note}”</p>
                  )}
                </div>

                {/* The scout's §1.5 weight as it stood when they filed — not a live
                    lookup, so this number never silently changes. */}
                <span
                  className="text-muted shrink-0 font-mono text-sm"
                  title={t.recommendations.globalWeight}
                >
                  +{recommendation.weight}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The avatar, wrapped in a link only when the reader may follow it.
 *
 * Rendered as a plain span otherwise rather than a disabled link: a link that
 * goes nowhere is a worse answer than no link, and a coach is not being denied
 * anything they were told about.
 */
function ScoutIdentity({
  id,
  name,
  avatarUrl,
  linked,
  label,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  linked: boolean;
  label: string;
}) {
  const avatar = (
    <Avatar src={avatarUrl} fallback={initials(...splitName(name))} className="size-9" />
  );

  if (!linked) return avatar;

  return (
    <Link
      href={`/scouts/${id}`}
      aria-label={label}
      className="focus-visible:ring-primary shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none"
    >
      {avatar}
    </Link>
  );
}

function ScoutName({ id, name, linked }: { id: string; name: string; linked: boolean }) {
  const label = name || id.slice(0, 8);
  if (!linked) return <p className="truncate text-sm font-medium">{label}</p>;

  return (
    <p className="truncate text-sm font-medium">
      <Link href={`/scouts/${id}`} className="hover:text-primary hover:underline">
        {label}
      </Link>
    </p>
  );
}

function splitName(name: string): [string, string] {
  const [first = '', last = ''] = name.split(' ');
  return [first, last];
}
