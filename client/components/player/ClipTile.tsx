'use client';

import { Play, Trophy } from 'lucide-react';
import type { Media } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { CARD_THEME, positionGroup } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { ClipModerationBadge } from '@/components/player/ClipModerationBadge';
import { cn } from '@/lib/utils';

/**
 * One square in the clip grid.
 *
 * ## The tile does not play
 *
 * It is a button that opens the clip, never a `<video>`. A grid of autoplaying or
 * even merely *loadable* videos means a dozen media elements competing for
 * bandwidth on a phone before the user has asked for any of them (§14), and the
 * private-media design would need a signed URL per tile whether or not one was
 * ever watched. The cover is a single ~40 KB JPEG; the video is fetched when
 * someone actually chooses it.
 *
 * The claim sits in the middle at full contrast, because that is the content: a
 * scout scanning this grid is reading "Finishing 28", and the frame behind it is
 * context.
 */
export function ClipTile({ clip, onOpen }: { clip: Media; onOpen: () => void }) {
  const { t } = useI18n();
  const attribute = CATEGORY_ATTRIBUTE[clip?.category];
  const isHighlight = clip?.category === 'MATCH_HIGHLIGHTS';
  const label = isHighlight
    ? t.attributes.highlights
    : attribute
      ? t.attributes[attribute]
      : clip?.category;

  // Reuses the card palette so a clip reads as belonging to the same player.
  const theme = CARD_THEME[positionGroup(null)];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}${clip?.rating != null ? ` ${clip?.rating}` : ''} — ${t.clips.play}`}
      className="group focus-visible:ring-ring relative block aspect-square w-full overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:outline-none"
    >
      {clip?.posterUrl ? (
        <img
          src={clip?.posterUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
          aria-hidden
        />
      )}

      {/* Dark wash so the label is legible over any frame, bright or dark. */}
      <span className="absolute inset-0 bg-black/45 transition-colors group-hover:bg-black/30" />

      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-white">
        {isHighlight ? (
          <>
            <Trophy className="size-5 drop-shadow" aria-hidden />
            <span className="text-xs font-semibold tracking-wide drop-shadow">{label}</span>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold tracking-wide uppercase opacity-90 drop-shadow">
              {label}
            </span>
            {clip?.rating != null && (
              <span className="font-mono text-3xl leading-none font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.7)]">
                {clip?.rating}
              </span>
            )}
          </>
        )}
      </span>

      {/*
        The moderation state, when there is one worth saying.
        Top-left and over the wash, so it is the first thing read on a tile the
        owner is scanning for "did my upload go through". Renders nothing for a
        verified clip — see ClipModerationBadge — so a public profile's grid is
        unchanged, and nothing but the owner is ever served a clip in any other
        state to begin with.
      */}
      <ClipModerationBadge
        status={clip?.moderationStatus}
        className="absolute top-1.5 left-1.5 max-w-[calc(100%-0.75rem)]"
      />

      {/* Says "this opens" without pretending to be a control. */}
      <span
        className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <Play className="size-3" />
      </span>

      {clip?.title && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-left text-[11px] text-white/90">
          {clip?.title}
        </span>
      )}
    </button>
  );
}

/** Square placeholders so the grid does not jump as covers arrive. */
export function ClipTileSkeleton({ className }: { className?: string }) {
  return <div className={cn('bg-surface-3 aspect-square animate-pulse rounded-lg', className)} />;
}
