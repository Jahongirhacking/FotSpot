'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * A two-handle range, plus the two boxes that say the same thing in numbers.
 *
 * ## Why both
 *
 * A slider answers "roughly the middle of the squad" in one gesture and shows
 * the shape of what you are asking for. It cannot answer "exactly 14 to 16" —
 * on a phone, one pixel is a year. The boxes are for people who already know the
 * answer, the slider is for people finding it, and neither is a fallback for the
 * other.
 *
 * ## Two inputs, one track
 *
 * Built from two native `<input type="range">` stacked on the same track rather
 * than from pointer events on a div, so keyboard, screen readers and touch all
 * work without being re-implemented. The inputs are transparent and
 * `pointer-events: none`; only their thumbs take the pointer, which is what lets
 * the pair overlap without the upper one swallowing every drag.
 *
 * Crossing is prevented by clamping, not by swapping: a handle dragged past its
 * partner stops there. Swapping would mean the handle under your finger silently
 * becomes the other one.
 */
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  labelFrom,
  labelTo,
  className,
}: {
  min: number;
  max: number;
  /** `[from, to]`, always within `[min, max]` and never crossed. */
  value: [number, number];
  onChange: (next: [number, number]) => void;
  labelFrom: string;
  labelTo: string;
  className?: string;
}) {
  const [from, to] = value;
  const span = Math.max(1, max - min);
  const startPct = ((from - min) / span) * 100;
  const endPct = ((to - min) / span) * 100;

  const setFrom = (next: number) => onChange([clamp(next, min, to), to]);
  const setTo = (next: number) => onChange([from, clamp(next, from, max)]);

  return (
    <div className={cn('flex w-full flex-wrap items-center gap-4', className)}>
      <div className="relative !mb-0 flex h-6 w-full min-w-[100px] flex-1 items-center">
        <div className="bg-surface-3 h-1 w-full rounded-full" />
        <div
          className="bg-primary absolute h-1 rounded-full"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />

        <input
          type="range"
          min={min}
          max={max}
          value={from}
          aria-label={labelFrom}
          onChange={(event) => setFrom(Number(event.target.value))}
          className="range-thumb absolute inset-x-0 h-6 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={to}
          aria-label={labelTo}
          onChange={(event) => setTo(Number(event.target.value))}
          className="range-thumb absolute inset-x-0 h-6 w-full appearance-none bg-transparent"
        />
      </div>

      <div className="flex items-center gap-2">
        <NumberBox label={labelFrom} value={from} min={min} max={to} onCommit={setFrom} />
        <span className="text-muted text-sm">–</span>
        <NumberBox label={labelTo} value={to} min={from} max={max} onCommit={setTo} />
      </div>
    </div>
  );
}

/**
 * A number box that only reports a value once it is one.
 *
 * Typing "1" on the way to "16" would otherwise apply a filter for age 1 and
 * empty the list under the cursor, so the keystrokes are held locally and
 * committed on blur or Enter — while the arrows, which produce a complete value
 * every time, apply immediately.
 */
function NumberBox({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
}) {
  // Adjusted during render rather than in an effect: dragging the slider must
  // move the number under the cursor in the same paint, not one frame later.
  const [draft, setDraft] = React.useState(String(value));
  const [lastValue, setLastValue] = React.useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || Number.isNaN(parsed)) return setDraft(String(value));
    onCommit(clamp(Math.round(parsed), min, max));
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      value={draft}
      min={min}
      max={max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      className="bg-surface border-border min-h-9 w-16 rounded-lg border px-2 py-1 text-center text-base sm:text-sm"
    />
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
