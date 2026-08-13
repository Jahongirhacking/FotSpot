'use client';

import * as React from 'react';

/**
 * Turns "this image failed to load" into a value a component can branch on.
 *
 * ## The gap this closes
 *
 * Every avatar in the app already had a fallback for a *missing* URL — initials
 * on `Avatar`, a silhouette on the player card. Neither covered a URL that is
 * present and does not load, which is the case that actually happens: the object
 * was written to the wrong bucket, or deleted, or the CDN is not serving it. The
 * browser's own fallback for that is the `alt` text, so a card meant to show a
 * face showed the string `maroon-panther-overlap-537`.
 *
 * ## Why a hook rather than a wrapper component
 *
 * The two call sites fall back to genuinely different things, and they should:
 * initials are right beside a name, and a silhouette is right on a card that is
 * mostly portrait. A shared `<SafeImage>` would have to take the fallback as a
 * prop and would end up a worse version of both. What is common is only the
 * *detection*, so that is all this shares.
 *
 * Resets when `src` changes, so a component reused for a different person does
 * not inherit the previous one's failure.
 */
export function useImageFallback(src?: string | null) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

  const onError = React.useCallback(() => {
    if (!src) return;
    setFailedSrc(src);
    /*
     * Warned, not swallowed, and not sent to Sentry.
     *
     * A missing avatar is a real fault worth seeing in a console while
     * developing — it is how the wrong-bucket problem would have been noticed
     * far earlier. It is not worth an error report per render: one broken object
     * on a list of twenty players would file twenty issues for one cause, and
     * the fault is in infrastructure that the browser cannot describe anyway.
     */
    console.warn(`[avatar] image failed to load, falling back: ${src}`);
  }, [src]);

  // `src` having changed since the failure means this is a different image.
  const failed = Boolean(src) && failedSrc === src;

  return { failed, onError };
}
