'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useImageFallback } from './use-image-fallback';

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
  const { failed, onError } = useImageFallback(src);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        onError={onError}
        referrerPolicy="no-referrer"
        className={cn(base, 'bg-surface-3 size-10 object-cover', className)}
      />
    );
  }

  return (
    <span className={cn(base, 'bg-primary/15 text-primary size-10 text-sm', className)} aria-hidden>
      {fallback}
    </span>
  );
}
