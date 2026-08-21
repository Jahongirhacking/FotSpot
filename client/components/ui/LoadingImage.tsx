'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Images that resolve out of a blur instead of unrolling top to bottom.
 *
 * ## What was wrong
 *
 * A progressive JPEG or a slow connection paints an image band by band, so a
 * player's clip poster or an academy photo arrived as a sharp strip that grew
 * downwards. It reads as broken rather than as loading, and it is at its worst
 * exactly where it matters most — a wall of clip tiles on a phone, each one
 * unrolling at a different rate.
 *
 * ## Why a fragment and not a wrapper
 *
 * Every image in this app already sits inside a container that is `relative` and
 * carries the aspect ratio (`ClipTile`'s button, `FeedStream`'s tile,
 * `PlayerPortrait`'s frame). Introducing another wrapper would create a *new*
 * positioning context, and every `absolute inset-0` image inside would then
 * measure itself against a box with no height — collapsing the layout this is
 * meant to protect.
 *
 * So `LoadingImage` renders the image and the overlay as siblings and positions
 * the overlay against the container that is already there. That also means the
 * fix cannot introduce a layout shift: no box changes size, because no box is
 * added.
 *
 * ## Three states, and none of them can hang
 *
 * `loading` → blurred image plus a centred spinner. `loaded` → sharp, spinner
 * gone. `failed` → the caller's own fallback, because a missing avatar and a
 * missing academy photo should not look the same. That last part is why this
 * replaces `use-image-fallback.ts` rather than sitting beside it: the old hook
 * shared failure detection and left rendering to each call site, and this keeps
 * exactly that split — the fallback is still the caller's, passed in as a node.
 */

type Status = 'loading' | 'loaded' | 'failed';

/**
 * Tracks one image's load, including the case that hangs the naive version.
 *
 * ## The cached-image trap
 *
 * An image already in the browser cache can finish loading *before* React
 * attaches `onLoad` — the element is complete by the time it is in the DOM, the
 * event has already fired, and a component waiting for it waits forever. The
 * result is a permanent spinner over a perfectly good picture, and it shows up
 * on exactly the images a returning visitor sees most.
 *
 * The ref callback closes that: on attach it asks the element whether it is
 * already `complete` rather than waiting to be told. `naturalWidth` is what
 * separates the two kinds of complete — a broken image is also `complete`, but
 * it has no intrinsic width.
 */
export function useImageLoad(src?: string | null) {
  const [status, setStatus] = React.useState<Status>(src ? 'loading' : 'failed');

  /*
   * A different `src` is a different image: a component reused for another
   * player must not inherit the previous one's state.
   *
   * Adjusted during render rather than in an effect — React's documented way to
   * reset state when a prop changes. An effect would paint one frame showing the
   * *old* image's state against the new `src` (a sharp, loaded-looking frame for
   * something that has not loaded), and then immediately re-render. This settles
   * before anything is painted, and React re-runs the component right away
   * without committing the intermediate result.
   */
  const [renderedSrc, setRenderedSrc] = React.useState(src);
  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setStatus(src ? 'loading' : 'failed');
  }

  const ref = React.useCallback((node: HTMLImageElement | null) => {
    if (!node?.complete) return;
    // Already done before React could listen — settle it from the element.
    setStatus(node.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);

  const onLoad = React.useCallback(() => setStatus('loaded'), []);

  const onError = React.useCallback(() => {
    setStatus('failed');
    /*
     * Warned, not swallowed, and not sent to Sentry: one broken object on a list
     * of twenty players would file twenty reports for a single infrastructure
     * fault the browser cannot describe anyway.
     */
    if (src) console.warn(`[image] failed to load, falling back: ${src}`);
  }, [src]);

  return { status, ref, onLoad, onError };
}

/**
 * The spinner, centred on whatever box contains it.
 *
 * `absolute inset-0` plus `grid place-items-center` centres on both axes at any
 * aspect ratio, which a translate-based centring does not do as reliably once
 * the parent is itself transformed (clip tiles scale on hover).
 *
 * `bg-surface-2/30` is a wash rather than a solid: the blurred image should stay
 * visible underneath, since a blurred preview of the right photo is a better
 * loading state than a grey rectangle.
 */
export function ImageLoadingOverlay({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-surface-2/30 pointer-events-none absolute inset-0 z-10 grid place-items-center',
        className,
      )}
      aria-hidden
    >
      <Loader2 className="text-foreground/70 size-6 animate-spin drop-shadow" />
    </span>
  );
}

/**
 * An image that blurs while it loads and sharpens when it is done.
 *
 * `className` lands on the `<img>` itself, not on a wrapper, so every existing
 * layout class at the call site keeps working exactly as it did.
 *
 * `fallback` is rendered *instead* of the image when it fails. Optional: a call
 * site that would rather show a broken-image slot than a substitute can omit it.
 */
export function LoadingImage({
  src,
  alt,
  className,
  fallback,
  overlayClassName,
  spinner = true,
  ...rest
}: {
  src?: string | null;
  alt: string;
  className?: string;
  /** Shown in place of the image if it fails. */
  fallback?: React.ReactNode;
  overlayClassName?: string;
  /**
   * Whether to show the centred loader. On by default.
   *
   * Turned off for the small square images — academy logos, squad-group
   * thumbnails, playing-style illustrations — where the box is 32–80px and a
   * centred spinner would be about as large as the picture it covers. Those keep
   * the blur, which is what stops the progressive paint; the spinner is there to
   * say "something is coming" in a space big enough for the wait to register.
   *
   * It also matters that those images have no `relative` container of their own:
   * the overlay would position itself against whatever ancestor happens to be
   * positioned, which is a layout bug rather than a loader.
   */
  spinner?: boolean;
} & Omit<React.ComponentProps<'img'>, 'src' | 'alt' | 'className' | 'onLoad' | 'onError' | 'ref'>) {
  const { status, ref, onLoad, onError } = useImageLoad(src);

  if (!src || (status === 'failed' && fallback !== undefined)) return <>{fallback ?? null}</>;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- CDN asset; next/image
          needs the R2 host in images.remotePatterns, which is not configured.
          See the note in PlayerPortrait. */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        referrerPolicy="no-referrer"
        className={cn(
          /*
           * Only `filter` transitions, and only for a third of a second.
           *
           * Transitioning `opacity` too made every cached image fade in on each
           * render, which is a flicker rather than a polish. The scale is what
           * hides the soft edge a blur leaves at the frame's border — a blurred
           * image scaled slightly past its box has no visible edge to soften.
           */
          'transition-[filter,transform] duration-300 ease-out',
          /*
           * The blur is scaled to the image, not fixed.
           *
           * `blur-lg` is a 16px radius: right for a clip poster, and total
           * erasure on a 32px academy logo, which becomes a smudge of colour
           * rather than a recognisable thing arriving. The small images — the
           * ones that take no spinner, for the same size reason — get a 4px
           * blur, which reads as soft rather than absent.
           *
           * The 5% scale is large-image-only too: it exists to push the blur's
           * soft edge past the frame border, and on a 32px icon it would be
           * sub-pixel jitter with nothing to hide.
           */
          status === 'loading' ? (spinner ? 'scale-105 blur-lg' : 'blur-sm') : 'blur-0 scale-100',
          className,
        )}
        {...rest}
      />
      {spinner && status === 'loading' && <ImageLoadingOverlay className={overlayClassName} />}
    </>
  );
}
