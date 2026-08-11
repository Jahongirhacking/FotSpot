'use client';

import * as React from 'react';
import { POSITION_COORDS } from '@/lib/player-card';
import { POSITIONS } from '@/lib/schemas/player';
import { cn } from '@/lib/utils';

export type Position = (typeof POSITIONS)[number];

/**
 * Pick positions by pressing them on a pitch.
 *
 * ## Why not a `<select>`
 *
 * "AM" is jargon. A parent helping their twelve-year-old fill in a profile does
 * not know it, and a manager writing "we want a DM and a CB" is translating from
 * a shape in their head into codes and back. The pitch is the shape — it reads in
 * one glance and in any language, which is the same argument `PitchMap` already
 * makes for *showing* a position (§1.17).
 *
 * ## One component, both jobs
 *
 * `mode="single"` is the player's own position; `mode="multi"` is the set of
 * positions a trial is recruiting for. They differ only in whether pressing a
 * selected spot clears it or is a no-op, so splitting them into two components
 * would duplicate the pitch, the coordinates and the keyboard handling to express
 * one line of difference.
 *
 * ## The dots are buttons, not SVG click handlers
 *
 * Each position is a real `<button>` positioned over the pitch, so it is
 * focusable, reachable by keyboard and announced with its state — none of which
 * an `onClick` on a `<circle>` provides. The pitch itself is `aria-hidden`
 * decoration underneath.
 */
export function PitchPositionPicker({
  mode = 'single',
  value,
  onChange,
  disabled,
  label,
  className,
}: {
  mode?: 'single' | 'multi';
  /** Selected codes. Single mode reads the first and writes at most one. */
  value: readonly string[];
  /**
   * Always real position codes — the picker cannot emit anything else, and
   * saying so in the type spares every caller a cast back into their own union.
   */
  onChange: (next: Position[]) => void;
  disabled?: boolean;
  /** Names the group for screen readers — the visible label lives on the Field. */
  label: string;
  className?: string;
}) {
  const selected = React.useMemo(() => new Set(value), [value]);

  function toggle(position: Position) {
    if (disabled) return;

    if (mode === 'single') {
      // Pressing the chosen one again clears it: "actually, not sure" is a real
      // answer, and every position on this form is optional.
      onChange(selected.has(position) ? [] : [position]);
      return;
    }

    const next = new Set(selected);
    if (next.has(position)) next.delete(position);
    else next.add(position);
    // Ordered by POSITIONS rather than by click order, so the stored value is
    // stable — "GK, CB" and "CB, GK" are the same answer and should not produce
    // two different rows.
    onChange(POSITIONS.filter((code) => next.has(code)));
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="group"
        aria-label={label}
        className="relative mx-auto w-full max-w-[260px] select-none"
      >
        <PitchBackdrop />

        {POSITIONS.map((position) => {
          const spot = POSITION_COORDS[position];
          const isSelected = selected.has(position);

          return (
            <button
              key={position}
              type="button"
              disabled={disabled}
              onClick={() => toggle(position)}
              aria-pressed={isSelected}
              className={cn(
                'absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center',
                'rounded-full border text-[11px] font-bold transition-all',
                'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                isSelected
                  ? 'border-primary bg-primary scale-110 text-white shadow-lg'
                  : 'border-border bg-surface text-muted hover:border-primary hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              style={{
                left: `${spot.x}%`,
                // `y` is distance towards the goal being attacked, so it is
                // flipped — same convention as PitchMap, which draws the same
                // coordinates.
                top: `${100 - spot.y}%`,
              }}
            >
              {position}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The markings, drawn once and never interactive.
 *
 * Deliberately the same geometry as `PitchMap` so that picking a position and
 * later seeing it on the card look like the same pitch. `aria-hidden` because
 * everything meaningful here is a button on top of it.
 */
function PitchBackdrop() {
  return (
    <svg viewBox="0 0 100 130" className="w-full" aria-hidden>
      <rect x="0" y="0" width="100" height="130" rx="4" className="fill-surface-2" />
      <g className="stroke-border" strokeWidth="0.6" fill="none">
        <rect x="4" y="4" width="92" height="122" rx="2" />
        <line x1="4" y1="65" x2="96" y2="65" />
        <circle cx="50" cy="65" r="13" />
        <rect x="26" y="4" width="48" height="18" />
        <rect x="26" y="108" width="48" height="18" />
        <rect x="38" y="4" width="24" height="7" />
        <rect x="38" y="119" width="24" height="7" />
      </g>
    </svg>
  );
}
