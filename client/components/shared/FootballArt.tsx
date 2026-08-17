import { cn } from '@/lib/utils';

/**
 * Football imagery for the landing page, as inline SVG.
 *
 * Deliberately not stock photography or a background video: README §14's target
 * user is on an entry-level Android phone paying for mobile data, and a hero image
 * is typically the single heaviest thing on a landing page. These are a few hundred
 * bytes each, scale to any size, inherit the theme colours, and need no network
 * request at all.
 *
 * A real hero video is supported where it belongs — see `HeroVideo`, which only
 * renders when a URL is configured, never autoplays with sound, and never
 * preloads.
 */

/** Pitch markings, for use as a section backdrop. */
export function PitchBackdrop({
  className,
  live = false,
}: {
  className?: string;
  /**
   * Let a ball loose on it — bouncing off the touchlines at a steady pace.
   *
   * Off by default: this backdrop sits behind text on several screens, and a
   * moving object under a paragraph is a thing to look away from. The hero
   * turns it on because there the pitch *is* the content.
   */
  live?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn('text-primary/25 absolute inset-0 size-full', className)}
    >
      {/*
       * The touchlines sit at y=26 and y=234, not at the 8 the rest of the
       * frame uses.
       *
       * `slice` scales this to cover a 16:9 box, and a 400×260 viewBox is taller
       * than that, so 17.5 units are cropped off the top and bottom. Lines drawn
       * at y=8 were never on screen — which is why a ball turning against them
       * looked like it turned against nothing. Everything vertical is inset far
       * enough to survive the crop.
       */}
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="8" y="26" width="384" height="208" rx="2" />
        <line x1="200" y1="26" x2="200" y2="234" />
        <circle cx="200" cy="130" r="46" />
        <circle cx="200" cy="130" r="3" fill="currentColor" stroke="none" />
        <rect x="8" y="64" width="62" height="132" />
        <rect x="330" y="64" width="62" height="132" />
        <rect x="8" y="100" width="22" height="60" />
        <rect x="370" y="100" width="22" height="60" />
        <path d="M70 92a46 46 0 0 1 0 76" />
        <path d="M330 92a46 46 0 0 0 0 76" />
      </g>

      {/*
       * The ball, and a halo that lands with it.
       *
       * Drawn after the lines so it passes over them rather than under. Both
       * share one animation and one timing, so the glow cannot drift out of
       * step with the ball it belongs to.
       *
       * Brighter than the pitch it moves across — the lines are `text-primary/25`
       * and this is full strength, which is what makes a 5px dot readable
       * against them at hero size without making the pitch itself louder.
       *
       * The global `prefers-reduced-motion` rule flattens the animation to
       * nothing, which parks the ball on the centre spot. That is the right
       * still frame: it is where the keyframes start and end.
       */}
      {live && (
        /*
         * The pitch, as a viewport of its own.
         *
         * A nested `<svg>` clips to its own bounds, so the ball *cannot* be
         * drawn outside the rectangle whatever the transforms do. The bounds
         * were arithmetically correct before and the ball still escaped, which
         * is the point: this stops depending on arithmetic that has to agree
         * with a `slice` crop, a container aspect ratio and two keyframe ranges
         * all at once. Get any of those wrong and the clip still holds.
         *
         * Its origin is the pitch's top-left corner, so everything inside is in
         * pitch coordinates: 0..384 across, 0..208 down. The bounce ranges are
         * that box inset by the ball's radius, which is the whole geometry now.
         */
        <svg x="8" y="26" width="384" height="208">
          {/* Two groups because one element cannot hold two independent
              `transform` animations — the outer carries the ball across, the
              inner up and down, and SVG composes them. That is why the bounce
              needs no collision code. */}
          <g className="hero-ball-x animate-bounce-x">
            <g className="hero-ball-y animate-bounce-y">
              <svg
                x="-10"
                y="-10"
                width="20"
                height="20"
                viewBox="0 0 64 64"
                className="[transform-origin:center] [transform-box:fill-box] motion-safe:animate-[spin_6s_linear_infinite]"
              >
                {/* Explicitly white and near-black rather than theme colours: a
                    football is white in both modes, and one that turned dark at
                    night would stop reading as a ball at all. */}
                <BallFaces
                  body="fill-white stroke-black/25"
                  panel="fill-[#14171f]"
                  seam="stroke-black/30"
                />
              </svg>
            </g>
          </g>
        </svg>
      )}
    </svg>
  );
}

/** A football. `spin` adds a slow rotation, disabled under reduced-motion. */
/**
 * The ball's faces, in a 64-unit square, with no viewport of its own.
 *
 * Extracted so the same geometry can be drawn standalone *and* dropped inside
 * another SVG — the hero pitch needs a ball in its own 400×260 space, and a
 * second copy of these paths is one that drifts the first time either is
 * touched.
 *
 * The two fills are parameters because the ball means different things in
 * different places. On a button it should belong to the theme; on a pitch it
 * should look like a football, which is white with dark panels whether or not
 * the reader is in dark mode.
 */
function BallFaces({ body, panel, seam }: { body: string; panel: string; seam: string }) {
  return (
    <>
      <circle cx="32" cy="32" r="30" className={body} strokeWidth="1.5" />
      <path d="M32 12l9 6.5-3.4 10.6h-11.2L23 18.5z" className={panel} />
      <path
        d="M32 12V4M41 18.5l7.6-2.5M23 18.5L15.4 16M37.6 29.1l6.6 9M26.4 29.1l-6.6 9"
        className={seam}
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M20 47l6-8.9h12l6 8.9-6 5.6H26z" className={panel} opacity="0.55" />
    </>
  );
}

export function FootballBall({ className, spin = false }: { className?: string; spin?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={cn(
        'shrink-0',
        spin && 'motion-safe:animate-[spin_18s_linear_infinite]',
        className,
      )}
    >
      {/* Theme-coloured: this one sits on buttons and surfaces, where a hard
          white circle would be the loudest thing on the control. */}
      <BallFaces
        body="fill-surface stroke-foreground/20"
        panel="fill-foreground/85"
        seam="stroke-foreground/25"
      />
    </svg>
  );
}

/** Boot striking a ball — used as a section accent. */
export function BootAndBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className={cn('shrink-0', className)}>
      <g className="fill-primary/85">
        <path d="M14 52c0-9 6-16 15-18l22-5c4-1 7 1 8 5l2 8c1 5-2 9-7 10l-30 6c-6 1-10-2-10-6z" />
        <rect x="12" y="58" width="52" height="6" rx="3" className="fill-primary" />
      </g>
      <circle
        cx="92"
        cy="44"
        r="17"
        className="fill-surface stroke-foreground/25"
        strokeWidth="1.5"
      />
      <path d="M92 31l6 4-2.2 6.6h-7.6L86 35z" className="fill-foreground/80" />
      <g className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M112 30h8M110 40h12M112 50h8" />
      </g>
    </svg>
  );
}

/** Trophy, for the "scouts are accountable" pillar. */
export function TrophyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('shrink-0', className)}>
      <path
        d="M20 10h24v14a12 12 0 0 1-24 0z"
        className="fill-accent/80 stroke-accent"
        strokeWidth="1.5"
      />
      <path d="M20 14h-6a6 6 0 0 0 6 8zM44 14h6a6 6 0 0 1-6 8z" className="fill-accent/50" />
      <rect x="28" y="36" width="8" height="10" className="fill-accent/70" />
      <rect x="20" y="46" width="24" height="6" rx="2" className="fill-accent" />
      <rect x="16" y="52" width="32" height="5" rx="2" className="fill-accent/70" />
    </svg>
  );
}
