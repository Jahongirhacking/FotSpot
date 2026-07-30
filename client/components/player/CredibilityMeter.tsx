import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

/**
 * Credibility of the scouts backing a player — README §1.5.1.
 *
 * Shown to academy managers only. Explicitly NOT a rating of the player: it measures
 * who vouched for them, which is why the label says "scout credibility" and never
 * appears on a player-facing card (§21.5).
 *
 * The scale is anchored on the §1.5 weight ladder: 125 is one Legendary Scout, 20 an
 * Elite Scout or a verified coach, and ~5 is what a hundred fake accounts buy.
 */
export function CredibilityMeter({ value }: { value: number }) {
  const tier =
    value >= 100 ? 'exceptional' : value >= 40 ? 'strong' : value >= 15 ? 'notable' : 'thin';

  const meta = {
    exceptional: { label: 'Exceptional', variant: 'success' as const },
    strong: { label: 'Strong', variant: 'primary' as const },
    notable: { label: 'Notable', variant: 'info' as const },
    thin: { label: 'Thin', variant: 'neutral' as const },
  }[tier];

  return (
    <div className="shrink-0 text-right">
      <Badge variant={meta.variant}>{meta.label}</Badge>
      <p
        className={cn('text-muted mt-1 font-mono text-xs')}
        title="Scout credibility — harmonic sum of the backing scouts' weights"
      >
        {value.toFixed(1)}
      </p>
    </div>
  );
}
