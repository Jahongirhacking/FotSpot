'use client';

import * as React from 'react';
import type { MediaCategory } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { cn } from '@/lib/utils';

/**
 * The 0–100 rating slider with the guide under it, the way the upload form
 * drew it while players still rated themselves.
 *
 * Players no longer rate their own clips, so this lives with the people who
 * do: the review queue and the appeals page. The guide is the same three
 * bands per attribute the player used to read — what 30, 60 and 90 look like
 * for this skill — because the number only means something against them.
 */

const RATING_BANDS = [
  { from: 30, key: 'low' },
  { from: 60, key: 'mid' },
  { from: 90, key: 'high' },
] as const;

export function RatingInput({
  id,
  category,
  value,
  onChange,
  label,
  disabled = false,
}: {
  id: string;
  category: MediaCategory;
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <span className="font-mono text-lg font-bold tabular-nums">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary h-9 w-full"
      />
      <RatingGuide category={category} rating={value} />
    </div>
  );
}

/** What each band means for this attribute, the reached one lit. */
export function RatingGuide({ category, rating }: { category: MediaCategory; rating: number }) {
  const { t } = useI18n();
  const tips = t.clipTips[category as keyof typeof t.clipTips];

  // Guards a category added to the enum before its copy is written.
  if (!tips || typeof tips === 'string' || !tips.bands) return null;

  const reached = [...RATING_BANDS].reverse().find((band) => rating >= band.from);

  return (
    <div className="border-border bg-surface-2 space-y-1.5 rounded-lg border p-2.5">
      {RATING_BANDS.map((band) => {
        const active = reached?.key === band.key;
        return (
          <p
            key={band.key}
            className={cn(
              'flex gap-2 text-xs leading-snug transition-colors',
              active ? 'text-foreground' : 'text-muted',
            )}
          >
            <span
              className={cn(
                'w-9 shrink-0 text-right font-semibold tabular-nums',
                active && 'text-primary',
              )}
            >
              {band.from}+
            </span>
            <span>{tips.bands[band.key]}</span>
          </p>
        );
      })}
    </div>
  );
}
