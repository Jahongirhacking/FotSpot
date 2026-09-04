import { cn } from '@/lib/utils';
import type * as React from 'react';

/**
 * One band of the landing page.
 *
 * ## Why bands, and why three tones
 *
 * The page used to be a column of `max-w-6xl` blocks on one background, and
 * the sections ran into each other: a reader could not tell where the clips
 * stopped and the players began without reading the headings. Each band now
 * owns its background edge to edge and its own vertical rhythm, and the tones
 * alternate so two neighbours never share one. Three is enough for that and
 * few enough to still be one design — the page colour, a green-tinted surface,
 * and FotSpot's black for the one section that is featured content.
 *
 * `dark` is the same in both themes on purpose. It is the brand's black rather
 * than "the dark-mode surface", so the clips band reads as a feature in the
 * light theme and is still darker than the page in the dark one; the hairline
 * borders keep its edges visible either way.
 */
type Tone = 'base' | 'tint' | 'dark' | 'green';

const TONES: Record<Tone, string> = {
  base: 'bg-background',
  tint: 'bg-surface-2 border-border border-y',
  dark: 'landing-band-dark border-y border-white/10 text-white',
  green: 'landing-band-primary border-y border-white/10 text-white',
};

export function LandingSection({
  tone = 'base',
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & { tone?: Tone }) {
  return (
    <section
      className={cn('relative isolate overflow-hidden py-12 sm:py-16', TONES[tone], className)}
      {...props}
    >
      {children}
    </section>
  );
}

/** The one container width every band shares, so edges line up down the page. */
export function LandingContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('relative mx-auto max-w-6xl px-4', className)} {...props} />;
}
