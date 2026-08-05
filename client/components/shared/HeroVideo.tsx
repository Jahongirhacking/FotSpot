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
 *
 * ## A YouTube link works here too
 *
 * `NEXT_PUBLIC_HERO_VIDEO_URL` may be a file or a YouTube link, because whoever
 * sets it is as likely to have a channel as a CDN, and pasting a watch URL into
 * an `<video src>` produces a player that silently never starts.
 *
 * The embed is only mounted after the tap, so nothing is requested from Google
 * until someone asks to watch — an iframe present from the first paint would
 * contact YouTube on behalf of every visitor, including the children this
 * product is mostly for. It uses youtube-nocookie.com for the same reason.
 */
export function HeroVideo({ label, className }: { label: string; className?: string }) {
  const src = process.env.NEXT_PUBLIC_HERO_VIDEO_URL;
  const poster = process.env.NEXT_PUBLIC_HERO_POSTER_URL;
  const [playing, setPlaying] = React.useState(false);
  const youTubeId = src ? youTubeVideoId(src) : null;

  return (
    <div
      className={cn(
        'border-border bg-surface-2 rounded-card relative aspect-video w-full overflow-hidden border',
        className,
      )}
    >
      {src && playing ? (
        youTubeId ? (
          <iframe
            // `autoplay=1` is honoured because this iframe only exists after a
            // tap — the gesture browsers require has already happened.
            src={`https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
            title={label}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full border-0"
          />
        ) : (
          <video
            src={src}
            poster={poster}
            controls
            autoPlay
            playsInline
            preload="none"
            className="size-full object-cover"
          />
        )
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

/**
 * The video id in a YouTube URL, or null for anything that is not one.
 *
 * Covers the four shapes people actually paste — `watch?v=`, `youtu.be/`,
 * `/embed/` and `/shorts/` — and returns null for a plain file URL so the
 * `<video>` path stays the default rather than the exception.
 *
 * Parsed with `URL` rather than a regex over the whole string: a regex that
 * matches "youtube" anywhere would also match `https://evil.example/youtube.com/x`
 * and hand its id straight to an embed.
 */
function youTubeVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const id =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com'
        ? (url.searchParams.get('v') ??
          url.pathname.replace(/^\/(embed|shorts|v)\//, '').split('/')[0])
        : '';

  // YouTube ids are 11 characters of the URL-safe alphabet; anything else is a
  // path we have misread, and an embed of it would just fail in an iframe.
  return /^[\w-]{11}$/.test(id) ? id : null;
}
