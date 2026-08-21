'use client';

import { LoadingImage } from '@/components/ui/LoadingImage';
import type { PlayerProfile } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * The player's photo, or a neutral silhouette.
 *
 * The silhouette is the *expected* state, not a failure: a photo of a minor is
 * guardian-consented content (§11.1), so most cards will never have one and the
 * fallback has to look deliberate rather than broken.
 */
export function PlayerPortrait({ player, small }: { player: PlayerProfile; small: boolean }) {
  /*
   * A URL that 404s falls through to the silhouette, rather than letting the
   * browser print the `alt` text where the portrait should be — and while it is
   * still arriving it blurs rather than unrolling band by band.
   *
   * `LoadingImage` keeps the plain <img> this always used: `next/image` needs
   * either width+height or `fill` (this has neither) and needs the R2 host in
   * `images.remotePatterns`, which is not configured.
   */
  if (player?.avatarUrl) {
    return (
      <LoadingImage
        src={player?.avatarUrl}
        alt={player?.username || 'player'}
        loading="lazy"
        className="absolute inset-x-0 bottom-0 h-[100%] w-full object-cover object-top"
        fallback={<PlayerSilhouette small={small} />}
      />
    );
  }

  return <PlayerSilhouette small={small} />;
}

function PlayerSilhouette({ small }: { small: boolean }) {
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
