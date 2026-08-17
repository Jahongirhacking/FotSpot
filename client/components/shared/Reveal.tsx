'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Brings a section in as it reaches the viewport.
 *
 * ## Why JavaScript for this, when the rest is CSS
 *
 * Scroll-driven CSS (`animation-timeline: view()`) would do it with none, and it
 * is the right answer eventually — but Safari does not support it, which on this
 * audience is most phones. An observer is about a kilobyte and behaves the same
 * everywhere, which for the page that decides whether somebody signs up is worth
 * more than the kilobyte.
 *
 * ## It reveals once and then stops watching
 *
 * `unobserve` on the first intersection: a section that fades out again when you
 * scroll back up is a section you cannot re-read, and an observer left running
 * on a long page is work done on every frame of every scroll for an animation
 * that already finished.
 *
 * ## The default is visible
 *
 * Hiding is applied by the observer, never by the server. Without JavaScript —
 * or before hydration, or in a crawler — the content is simply there, at full
 * opacity. An entrance animation must not be the thing standing between a reader
 * and the page.
 *
 * Reduced motion is handled globally in `globals.css`, which flattens every
 * animation to nothing; this still runs, it just arrives instantly.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger within a group. Keep it small — see the note in the landing page. */
  delayMs?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<'idle' | 'hidden' | 'shown'>('idle');

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /*
     * Both decisions are made in the callback, never in the effect body.
     *
     * An observer reports the current state as soon as it starts watching, so
     * the first call already knows whether this section is on screen. Anything
     * visible is left alone — hiding it and animating it back would be a flash
     * on the part of the page somebody is already reading — and only what is
     * below the fold is hidden, a frame before it could possibly be seen.
     *
     * Setting state here rather than synchronously in the effect also keeps the
     * React Compiler happy: a synchronous `setState` in an effect body is a
     * cascading render, and it flagged the earlier shape for exactly that.
     */
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState('shown');
          observer.unobserve(entry.target);
          return;
        }
        setState('hidden');
      },
      // Fires slightly before the edge, so the motion finishes as the section
      // arrives rather than starting once it is already being read.
      { rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        state === 'hidden' && 'opacity-0',
        state === 'shown' && 'animate-rise',
        className,
      )}
      style={state === 'shown' && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
