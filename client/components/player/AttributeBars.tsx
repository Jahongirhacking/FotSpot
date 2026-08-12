'use client';

import { ChevronRight } from 'lucide-react';
import type { CoachAssessment, Media, PlayerProfile } from '@/lib/api/types';
import { deriveAttributes, PROVENANCE_META, type Attribute, type AttributeKey } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { ageBand, cn } from '@/lib/utils';

/**
 * The six attribute bars with their provenance — README §21.1.
 *
 * Bars are CSS, not canvas or WebGL (§21.6) — the target device is an entry-level
 * Android phone.
 *
 * Deliberately absent: any composite "overall" rating. §21.5 forbids printing the
 * Player Index on a public card — a single number rating a child is a playground
 * weapon. The bars stay separate so nobody can average them into one.
 *
 * Each row is a button. A bar is a claim, and the evidence for it is one tap away
 * — a number nobody can interrogate is exactly the kind of self-reported figure
 * this platform exists to replace.
 */
export function AttributeBars({
  player,
  assessments = [],
  clips,
  selected,
  onSelect,
  className,
}: {
  player: PlayerProfile;
  assessments?: CoachAssessment[];
  clips?: Media[];
  selected?: AttributeKey | null;
  onSelect?: (key: AttributeKey) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const attributes = deriveAttributes(player, assessments, clips ?? player?.media ?? []);
  const band = ageBand(player?.birthDate);

  return (
    <div className={className}>
      <div className="divide-border divide-y">
        {attributes.map((attribute) => (
          <AttributeRow
            key={attribute.key}
            attribute={attribute}
            label={t.attributes[attribute.key]}
            selected={selected === attribute.key}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p className="text-muted border-border border-t px-4 py-3 text-xs">
        {t.player.comparedWithinPlain.replace('{band}', band)}
      </p>
    </div>
  );
}

function AttributeRow({
  attribute,
  label,
  selected,
  onSelect,
}: {
  attribute: Attribute;
  label: string;
  selected: boolean;
  onSelect?: (key: AttributeKey) => void;
}) {
  const { t } = useI18n();
  const provenance = PROVENANCE_META[attribute.provenance];
  const hasValue = attribute.value !== null;

  const body = (
    <>
      <span className="w-20 shrink-0 text-left text-xs font-medium tracking-wide uppercase">
        {label}
      </span>

      <span
        className="bg-surface-3 relative h-2 flex-1 overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={attribute.value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${hasValue ? `${attribute.value} out of 100, ${provenance.label}` : 'no data yet'}`}
      >
        {hasValue && (
          <span
            className={cn(
              'absolute inset-y-0 left-0 block rounded-full',
              attribute.provenance === 'combine' && 'bg-prov-combine',
              attribute.provenance === 'coach' && 'bg-prov-coach',
              // A self-reported bar is visibly weaker than a measured one — that is
              // what makes verification something a player wants (§21.1). Attaching
              // a clip raises the claim, not its standing.
              attribute.provenance === 'self' &&
                'bg-prov-self/50 outline-prov-self/40 outline-1 -outline-offset-1 outline-dashed',
            )}
            style={{ width: `${attribute.value}%` }}
          />
        )}
      </span>

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
    </>
  );

  if (!onSelect) {
    return <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(attribute.key)}
      aria-expanded={selected}
      aria-label={`${label} — ${t.clips.seeEvidence}`}
      className={cn(
        'hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 transition-colors',
        selected && 'bg-surface-2',
      )}
    >
      {body}
      <ChevronRight
        className={cn('text-muted size-4 shrink-0 transition-transform', selected && 'rotate-90')}
        aria-hidden
      />
    </button>
  );
}
