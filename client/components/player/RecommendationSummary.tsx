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
 */
export function RecommendationSummary({
  summary,
  t,
}: {
  summary: PlayerRecommendationSummary;
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
                <Avatar
                  src={avatarUrl}
                  fallback={initials(...splitName(name))}
                  className="size-9"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name || id.slice(0, 8)}</p>
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

function splitName(name: string): [string, string] {
  const [first = '', last = ''] = name.split(' ');
  return [first, last];
}
