import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Quota } from '@/lib/api/resources';
import type { ScoutStats } from '@/lib/api/types';
import { interpolate, type Dictionary } from '@/lib/i18n';
import { nextScoutTier, scoutTier } from '@/lib/scout-tiers';
import { Trophy } from 'lucide-react';

/**
 * Scout reputation — README §1.5, plus how much of the plan's allowance is spoken
 * for.
 *
 * The pending count sits on the reputation card rather than beside the
 * "recommend" button because it is the same story the rest of the card tells:
 * this is your record, and this is what you may still do with it. A scout who
 * finds out at the point of filing has already picked the player.
 */
export function ScoutLevelCard({
  stats,
  pending,
  t,
}: {
  stats: ScoutStats;
  /** Undefined where the caller has no quota to show (an older cached read). */
  pending?: Quota;
  t: Dictionary;
}) {
  const tier = scoutTier(stats.level);
  const next = nextScoutTier(stats.level);

  const recsToGo = next ? Math.max(0, next.minRecommendations - stats.totalRecommendations) : 0;
  const rateToGo = next ? Math.max(0, next.minSuccessRate - stats.successRate) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="text-primary size-4" aria-hidden /> {t.recommendations.yourReputation}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xl font-bold">{tier.name}</p>
          <p className="text-muted text-xs">
            Level {tier.level} · weight {tier.weight}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t.scouts.sent} value={stats.totalRecommendations} />
          <Stat label={t.profile.accepted} value={stats.acceptedRecommendations} />
          <Stat label={t.profile.successRate} value={`${Math.round(stats.successRate)}%`} />
        </dl>

        {pending && (
          <div
            className={
              pending.exceeded
                ? 'border-warning/40 bg-warning/10 rounded-lg border p-3 text-xs'
                : 'bg-surface-2 rounded-lg p-3 text-xs'
            }
          >
            <p className="flex items-center justify-between gap-2 font-medium">
              <span>{t.scouts.pending}</span>
              <span className="font-mono">
                {interpolate(t.plans.usedOf, { used: pending.used, limit: pending.limit })}
              </span>
            </p>
            <p className="text-muted mt-1">
              {pending.exceeded
                ? t.plans.recommendationsNone
                : interpolate(t.plans.recommendationsLeft, { count: pending.remaining })}
            </p>
          </div>
        )}

        {next ? (
          <div className="bg-surface-2 space-y-1.5 rounded-lg p-3 text-xs">
            <p className="font-medium">
              Next: {next.name} <Badge variant="outline">weight {next.weight}</Badge>
            </p>
            <ul className="text-muted space-y-0.5">
              <li>
                {recsToGo > 0
                  ? `${recsToGo} more recommendation${recsToGo === 1 ? '' : 's'}`
                  : '✓ enough recommendations'}
              </li>
              <li>
                {rateToGo > 0
                  ? `${Math.ceil(rateToGo)}% higher success rate`
                  : '✓ success rate is high enough'}
              </li>
            </ul>
            <p className="text-muted pt-1">
              Each level is worth far more than the last — one Legendary Scout outweighs a hundred
              new accounts.
            </p>
          </div>
        ) : (
          <p className="text-muted bg-surface-2 rounded-lg p-3 text-xs">
            Top tier. 125 players placed — the strongest signal on the platform.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-lg py-2">
      <dt className="text-muted text-[10px] uppercase">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}
