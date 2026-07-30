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
export function PitchBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn('text-primary/25 absolute inset-0 size-full', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="8" y="8" width="384" height="244" rx="2" />
        <line x1="200" y1="8" x2="200" y2="252" />
        <circle cx="200" cy="130" r="46" />
        <circle cx="200" cy="130" r="3" fill="currentColor" stroke="none" />
        <rect x="8" y="62" width="62" height="136" />
        <rect x="330" y="62" width="62" height="136" />
        <rect x="8" y="100" width="22" height="60" />
        <rect x="370" y="100" width="22" height="60" />
        <path d="M70 92a46 46 0 0 1 0 76" />
        <path d="M330 92a46 46 0 0 0 0 76" />
      </g>
    </svg>
  );
}

/** A football. `spin` adds a slow rotation, disabled under reduced-motion. */
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
      <circle
        cx="32"
        cy="32"
        r="30"
        className="fill-surface stroke-foreground/20"
        strokeWidth="1.5"
      />
      <path d="M32 12l9 6.5-3.4 10.6h-11.2L23 18.5z" className="fill-foreground/85" />
      <path
        d="M32 12V4M41 18.5l7.6-2.5M23 18.5L15.4 16M37.6 29.1l6.6 9M26.4 29.1l-6.6 9"
        className="stroke-foreground/25"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M20 47l6-8.9h12l6 8.9-6 5.6H26z" className="fill-foreground/20" />
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
