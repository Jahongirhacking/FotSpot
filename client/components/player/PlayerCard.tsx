import { Ruler, Weight, MapPin, Footprints } from 'lucide-react';
import type { CoachAssessment, PlayerProfile } from '@/lib/api/types';
import { deriveAttributes, PROVENANCE_META } from '@/lib/player-card';
import { ageBand, cn, humanizeEnum, initials } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

/**
 * The player card — README §21.
 *
 * A Server Component: it is pure presentation over data the caller already has, so
 * there is no reason to ship it to the browser. Bars are CSS, not canvas or WebGL
 * (§21.6) — the target device is an entry-level Android phone.
 *
 * Deliberately absent: any composite "overall" rating. §21.5 forbids printing the
 * Player Index on a public card — a single number rating a child is a playground
 * weapon.
 */
export function PlayerCard({
  player,
  assessments = [],
  className,
}: {
  player: PlayerProfile;
  assessments?: CoachAssessment[];
  className?: string;
}) {
  const attributes = deriveAttributes(player, assessments);
  const band = ageBand(player.birthDate);

  return (
    <article
      className={cn(
        'bg-surface border-border rounded-card overflow-hidden border shadow-sm',
        className,
      )}
    >
      <header className="pitch-gradient border-border relative border-b p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="bg-surface/80 text-foreground grid size-14 shrink-0 place-items-center rounded-full text-lg font-bold backdrop-blur"
              aria-hidden
            >
              {initials(player.firstName, player.lastName)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg leading-tight font-bold">
                {player.firstName} {player.lastName}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {player.primaryPosition && (
                  <Badge variant="primary" className="font-mono font-bold">
                    {player.primaryPosition}
                  </Badge>
                )}
                {player.playingStyle && (
                  <Badge variant="accent">{humanizeEnum(player.playingStyle)}</Badge>
                )}
              </div>
            </div>
          </div>
          {/* Age band is always on the card — a youth football number without an age
              is meaningless (§21.1). */}
          <Badge variant="outline" className="bg-surface/70 shrink-0 backdrop-blur">
            {band}
          </Badge>
        </div>

        <dl className="text-muted mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {player.region && (
            <div className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              <dt className="sr-only">Region</dt>
              <dd>{player.region}</dd>
            </div>
          )}
          {player.dominantFoot && (
            <div className="flex items-center gap-1">
              <Footprints className="size-3.5" aria-hidden />
              <dt className="sr-only">Dominant foot</dt>
              <dd>{humanizeEnum(player.dominantFoot)} foot</dd>
            </div>
          )}
          {player.height && (
            <div className="flex items-center gap-1">
              <Ruler className="size-3.5" aria-hidden />
              <dt className="sr-only">Height</dt>
              <dd>{player.height} cm</dd>
            </div>
          )}
          {player.weight && (
            <div className="flex items-center gap-1">
              <Weight className="size-3.5" aria-hidden />
              <dt className="sr-only">Weight</dt>
              <dd>{player.weight} kg</dd>
            </div>
          )}
        </dl>
      </header>

      <div className="divide-border divide-y">
        {attributes.map((attribute) => (
          <AttributeRow key={attribute.key} attribute={attribute} />
        ))}
      </div>

      <footer className="text-muted border-border border-t px-5 py-3 text-xs">
        Bars are compared within {band} only — “fast for {band}”, never across age groups.
      </footer>
    </article>
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
