'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useImageLoad } from './LoadingImage';

/**
 * Avatar image with an initials fallback.
 *
 * Plain `<img>` rather than `next/image`: avatars come from R2 at a runtime-
 * configured host, so they'd need `images.remotePatterns` per deployment, and the
 * optimiser buys little for a 64px square. `referrerPolicy` keeps the app's URLs
 * out of the image host's logs.
 *
 * For minor profiles a photo is guardian-consented content (README §11.1), so
 * initials are the correct default rather than a placeholder implying a missing
 * image.
 *
 * The same initials stand in when a URL is present but does not load. Without
 * that the browser falls back to the `alt` text, which is how a broken object
 * ends up printing a username where a face should be.
 *
 * It blurs while loading, like every other image, but takes no spinner: an
 * avatar is typically 40px and a loader centred in it would be larger than the
 * face it covers — noise rather than information. The blur alone is enough to
 * stop the progressive top-to-bottom paint, which is the actual complaint.
 */
export function Avatar({
  src,
  fallback,
  className,
  alt = '',
}: {
  src?: string | null;
  fallback: string;
  className?: string;
  alt?: string;
}) {
  const base = 'grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold';
  const { status, ref, onLoad, onError } = useImageLoad(src);

  if (src && status !== 'failed') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- CDN asset; see above
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        referrerPolicy="no-referrer"
        className={cn(
          base,
          'bg-surface-3 size-10 object-cover transition-[filter] duration-300 ease-out',
          status === 'loading' ? 'blur-md' : 'blur-0',
          className,
        )}
      />
    );
  }

  return (
    <span className={cn(base, 'bg-primary/15 text-primary size-10 text-sm', className)} aria-hidden>
      {fallback}
    </span>
  );
}
