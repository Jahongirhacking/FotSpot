'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PitchBackdrop, FootballBall } from './FootballArt';

/**
 * Optional hero video, tap-to-play.
 *
 * Only renders a `<video>` when `NEXT_PUBLIC_HERO_VIDEO_URL` is set; otherwise it
 * shows the SVG pitch, so the page is complete either way and no broken player
 * appears when no asset exists.
 *
 * Never autoplays and never preloads (README §14: metered mobile data, §21.6:
 * poster frames, tap to start). The first tap loads and plays it — that is a
 * deliberate choice by someone who wants to spend the megabytes.
 */
export function HeroVideo({ label, className }: { label: string; className?: string }) {
  const src = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;
  const poster = process.env.NEXT_PUBLIC_HERO_POSTER_URL;
  const [playing, setPlaying] = React.useState(false);

  return (
    <div
      className={cn(
        'border-border bg-surface-2 rounded-card relative aspect-video w-full overflow-hidden border',
        className,
      )}
    >
      {src && playing ? (
        <video
          src={src}
          poster={poster}
          controls
          autoPlay
          playsInline
          preload="none"
          className="size-full object-cover"
        />
      ) : (
        <>
          <PitchBackdrop />
          <div className="absolute inset-0 grid place-items-center">
            {src ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="bg-primary text-primary-foreground hover:bg-primary-strong flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-lg transition-colors"
              >
                <Play className="size-4" aria-hidden /> {label}
              </button>
            ) : (
              <FootballBall className="size-24 drop-shadow-lg sm:size-32" spin />
            )}
          </div>
        </>
      )}
    </div>
  );
}
