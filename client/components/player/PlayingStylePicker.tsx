'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { PLAYING_STYLE_INFO, exemplarInitials } from '@/lib/playing-styles';
import { PLAYING_STYLES } from '@/lib/schemas/player';
import { cn, humanizeEnum } from '@/lib/utils';
import { Check } from 'lucide-react';
import * as React from 'react';

/**
 * Pick a playing style, with the sentence that says what it is.
 *
 * A dropdown of fourteen recruitment words (§21.3) is a guess for anybody who has
 * not worked in scouting — and a guessed style points academies at the wrong
 * player, which is worse than leaving it blank. Each option therefore carries one
 * plain line and a footballer known for it: "a Destroyer" means nothing, "wins
 * the ball back and gives it to somebody better — like N'Golo Kanté" means
 * something to a thirteen-year-old.
 *
 * Grouped by the part of the pitch the style belongs to, and filtered to the
 * player's own group when one is known — a striker does not need to read the four
 * defensive styles to find theirs.
 */
export function PlayingStylePicker({
  value,
  onChange,
  /** Narrows the list to the group matching the chosen position, when there is one. */
  positionGroup,
  className,
}: {
  value?: string | null;
  onChange: (next: string) => void;
  positionGroup?: 'Goalkeeper' | 'Defence' | 'Midfield' | 'Forward' | 'Unknown';
  className?: string;
}) {
  const { t } = useI18n();

  const groups = React.useMemo(() => {
    const entries = Object.entries(PLAYING_STYLES) as [
      keyof typeof PLAYING_STYLES,
      readonly string[],
    ][];
    // Everything stays reachable when the position is unset or unrecognised —
    // filtering to nothing would leave a picker with no options at all.
    if (!positionGroup || positionGroup === 'Unknown') return entries;
    const matching = entries.filter(([group]) => group === positionGroup);
    return matching.length > 0 ? matching : entries;
  }, [positionGroup]);

  return (
    <div
      className={cn('space-y-4', className)}
      role="radiogroup"
      aria-label={t.onboarding.playingStyle}
    >
      {groups.map(([group, styles]) => (
        <div key={group} className="space-y-2">
          {groups.length > 1 && (
            <p className="text-muted text-xs font-medium uppercase">
              {t.positionGroups[group as keyof typeof t.positionGroups] ?? group}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {styles.map((style) => {
              const info = PLAYING_STYLE_INFO?.[style];
              const selected = value === style;

              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(style)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                    selected
                      ? 'border-primary bg-primary/8'
                      : 'border-border hover:border-primary/50 hover:bg-surface-2',
                  )}
                >
                  <ExemplarCrest
                    name={info?.exemplar ?? ''}
                    imageUrl={info?.imageUrl}
                    selected={selected}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{humanizeEnum(style)}</span>
                      {selected && <Check className="text-primary size-3.5 shrink-0" aria-hidden />}
                    </span>
                    <span className="text-muted mt-0.5 block text-xs leading-snug">
                      {info ? t.playingStyles[info.key] : ''}
                    </span>
                    {info?.exemplar && (
                      <span className="text-muted mt-1 block text-[11px] italic">
                        {t.onboarding.styleLikeWho}: {info.exemplar}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The exemplar, as a crest.
 *
 * An initialled badge rather than a photograph — see `lib/playing-styles.ts` for
 * why no image ships. If `imageUrl` is ever set it is used instead, so adding a
 * licensed picture is a one-line change and no component edit.
 */
function ExemplarCrest({
  name,
  imageUrl,
  selected,
}: {
  name: string;
  imageUrl?: string;
  selected: boolean;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local static asset; next/image adds a loader for no gain here
      <img
        src={imageUrl}
        alt={name}
        className="size-20 shrink-0 rounded-lg object-contain"
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-lg text-xs font-black',
        selected ? 'bg-primary text-white' : 'bg-surface-3 text-muted',
      )}
    >
      {exemplarInitials(name)}
    </span>
  );
}
