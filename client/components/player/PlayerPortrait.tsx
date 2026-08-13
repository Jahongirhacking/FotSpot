'use client';

import type { PlayerProfile } from '@/lib/api/types';
import { useImageFallback } from '@/components/ui/use-image-fallback';
import { cn } from '@/lib/utils';

/**
 * The player's photo, or a neutral silhouette.
 *
 * The silhouette is the *expected* state, not a failure: a photo of a minor is
 * guardian-consented content (§11.1), so most cards will never have one and the
 * fallback has to look deliberate rather than broken.
 */
export function PlayerPortrait({ player, small }: { player: PlayerProfile; small: boolean }) {
  // A URL that 404s falls through to the silhouette below, rather than letting
  // the browser print the `alt` text where the portrait should be.
  const { failed, onError } = useImageFallback(player?.avatarUrl);

  if (player?.avatarUrl && !failed) {
    return (
      /*
       * A plain <img>, like every other bucket asset in the app.
       *
       * `next/image` needs either width+height or `fill` — this had neither, so
       * it threw at runtime — and it also needs the R2 host in
       * `images.remotePatterns`, which is not configured. Both are avoidable:
       * the optimiser buys little for an already-resized avatar coming from a
       * CDN, and Avatar and ClipTile made the same call for the same reason.
       */
      // eslint-disable-next-line @next/next/no-img-element -- CDN asset; see above
      <img
        src={player?.avatarUrl}
        alt={player?.username || 'player'}
        onError={onError}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-x-0 bottom-0 h-[82%] w-full object-cover object-top"
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 120"
      className={cn(
        'absolute bottom-0 left-1/2 -translate-x-1/2 text-white/25',
        small ? 'h-[62%]' : 'h-[70%]',
      )}
      fill="currentColor"
      aria-hidden
    >
      <circle cx="50" cy="33" r="21" />
      <path d="M50 56c-21 0-36 14-38 34-1 9-2 18-2 30h80c0-12-1-21-2-30-2-20-17-34-38-34Z" />
    </svg>
  );
}
