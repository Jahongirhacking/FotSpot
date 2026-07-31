import type { CoachAssessment, PlayerProfile } from '@/lib/api/types';
import { deriveAttributes, PROVENANCE_META } from '@/lib/player-card';
import { ageBand, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

/**
 * The six attribute bars with their provenance — README §21.1.
 *
 * A Server Component: pure presentation over data the caller already has, so there
 * is no reason to ship it to the browser. Bars are CSS, not canvas or WebGL
 * (§21.6) — the target device is an entry-level Android phone.
 *
 * Deliberately absent: any composite "overall" rating. §21.5 forbids printing the
 * Player Index on a public card — a single number rating a child is a playground
 * weapon. The bars stay separate so nobody can average them into one.
 */
export function AttributeBars({
  player,
  assessments = [],
  title,
  className,
}: {
  player: PlayerProfile;
  assessments?: CoachAssessment[];
  title?: string;
  className?: string;
}) {
  const attributes = deriveAttributes(player, assessments);
  const band = ageBand(player.birthDate);

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0">
        <div className="divide-border divide-y">
          {attributes.map((attribute) => (
            <AttributeRow key={attribute.key} attribute={attribute} />
          ))}
        </div>
        <p className="text-muted border-border border-t px-5 py-3 text-xs">
          Bars are compared within {band} only — “fast for {band}”, never across age groups.
        </p>
      </CardContent>
    </Card>
  );
}

function AttributeRow({ attribute }: { attribute: ReturnType<typeof deriveAttributes>[number] }) {
  const provenance = PROVENANCE_META[attribute.provenance];
  const hasValue = attribute.value !== null;

  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <span className="w-20 shrink-0 text-xs font-medium tracking-wide uppercase">
        {attribute.label}
      </span>

      <div
        className="bg-surface-3 relative h-2 flex-1 overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={attribute.value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${attribute.label}: ${hasValue ? `${attribute.value} out of 100, ${provenance.label}` : 'no data yet'}`}
      >
        {hasValue && (
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              attribute.provenance === 'combine' && 'bg-prov-combine',
              attribute.provenance === 'coach' && 'bg-prov-coach',
              // A self-reported bar is visibly weaker than a measured one — that is
              // what makes verification something a player wants (§21.1).
              attribute.provenance === 'self' &&
                'bg-prov-self/50 outline-prov-self/40 outline-1 -outline-offset-1 outline-dashed',
            )}
            style={{ width: `${attribute.value}%` }}
          />
        )}
      </div>

      <span
        className={cn(
          'w-8 shrink-0 text-right font-mono text-sm font-semibold',
          !hasValue && 'text-muted',
        )}
      >
        {hasValue ? attribute.value : '–'}
      </span>

      <span
        className={cn(
          'hidden w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium sm:block',
          provenance.className,
        )}
        title={provenance.label}
      >
        {provenance.short}
      </span>
    </div>
  );
}
