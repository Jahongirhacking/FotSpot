import { cn } from '@/lib/utils';

/**
 * The picture an empty section shows when it has nothing of its own to show.
 *
 * ## Why a drawing and not another lucide glyph
 *
 * Every empty state used to be a 20px icon in a grey circle, which reads as a
 * *button that failed to load* more than as "there is nothing here yet". A
 * drawing at a larger size reads as deliberate — the difference between a screen
 * that is empty and one that looks broken, which on a two-sided product in its
 * first months is most of the screens somebody sees (README §16).
 *
 * ## Inline, and drawn in currentColor
 *
 * No file to fetch, so it cannot arrive after the text it belongs to or 404 into
 * a broken-image glyph. Every stroke is `currentColor` at varying opacity, so it
 * takes the muted colour of whatever surrounds it and needs no separate dark
 * variant — the one thing a raster asset could not do without shipping two.
 *
 * Purely decorative: the sentence underneath carries the meaning, so this is
 * `aria-hidden` and a screen reader passes straight over it.
 */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 72"
      fill="none"
      aria-hidden
      className={cn('text-muted h-16 w-auto', className)}
    >
      {/* The container: an open, empty box seen from slightly above. */}
      <path
        d="M18 30h60v30a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V30Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M18 30 26 16h44l8 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.5"
      />
      {/* The lid line, which is what makes it read as a box rather than a bag. */}
      <path d="M40 30h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* Two faint rules where content would sit. Fainter than the box on
          purpose: they suggest the shape of what is missing without competing
          with the sentence beneath. */}
      <path
        d="M32 44h32M38 52h20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.22"
      />

      {/* A ball, because this is a football product and an unmarked box could be
          any empty state in any app. Small enough to be a detail, not a mascot. */}
      <circle cx="76" cy="18" r="7" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path
        d="m76 13 3.5 2.6-1.3 4.1h-4.4l-1.3-4.1L76 13Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.35"
      />
    </svg>
  );
}
