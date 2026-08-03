import { Trophy } from 'lucide-react';
import type { ScoutStats } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Scout reputation — README §1.5.
 *
 * The tiers and weights are mirrored from `backend/src/recommendations/scout-level.util.ts`.
 * They are frozen there; if they ever change, this table changes in the same PR.
 */
const TIERS = [
  { level: 1, name: 'Observer', minRecommendations: 0, minSuccessRate: 0, weight: 1 },
  { level: 2, name: 'Spotter', minRecommendations: 5, minSuccessRate: 10, weight: 3 },
  { level: 3, name: 'Talent Hunter', minRecommendations: 20, minSuccessRate: 20, weight: 8 },
  { level: 4, name: 'Elite Scout', minRecommendations: 50, minSuccessRate: 30, weight: 20 },
  { level: 5, name: 'Master Scout', minRecommendations: 100, minSuccessRate: 40, weight: 50 },
  { level: 6, name: 'Legendary Scout', minRecommendations: 250, minSuccessRate: 50, weight: 125 },
] as const;

export function ScoutLevelCard({ stats }: { stats: ScoutStats }) {
  const { t } = useI18n();
  const tier = TIERS.find((t) => t.level === stats.level) ?? TIERS[0];
  const next = TIERS.find((t) => t.level === stats.level + 1);

  const recsToGo = next ? Math.max(0, next.minRecommendations - stats.totalRecommendations) : 0;
  const rateToGo = next ? Math.max(0, next.minSuccessRate - stats.successRate) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="text-primary size-4" aria-hidden /> Your reputation
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
          <Stat label="Sent" value={stats.totalRecommendations} />
          <Stat label={t.profile.accepted} value={stats.acceptedRecommendations} />
          <Stat label={t.profile.successRate} value={`${Math.round(stats.successRate)}%`} />
        </dl>

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
