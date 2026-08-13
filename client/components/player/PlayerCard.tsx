import { PlayerPortrait } from '@/components/player/PlayerPortrait';
import type { PlayerProfile } from '@/lib/api/types';
import { CARD_THEME, positionGroup, starTier } from '@/lib/player-card';
import { ageBand, cn, humanizeEnum } from '@/lib/utils';
import Link from 'next/link';

/**
 * The player card — README §21, in the eFootball idiom the players themselves
 * asked for: a foil-backed collectable with the position code, the photo and a row
 * of stars.
 *
 * ## What sits where eFootball puts the rating
 *
 * eFootball's card leads with a big number — "105". This one leads with the **age
 * band**. That is not a cosmetic substitution: §21.5 forbids printing a composite
 * rating on a child's card, and a card that opened with a single number scoring a
 * fourteen-year-old would be the exact artefact the rule exists to prevent, however
 * good it looked.
 *
 * The age band earns the slot on its own merits. A youth football number without an
 * age beside it is meaningless (§21.1) — "scored 30 goals" says nothing until you
 * know whether it was under-12 or under-18 — so the one figure that must never be
 * missing from the card is the one given the most prominent position on it.
 *
 * The stars are evidence, not ability, and they arrive on the player: the server
 * computes them (`card-stars.util.ts`) so a list of twenty cards costs no extra
 * request. The card draws what it is given.
 *
 * A Server Component. Two sizes:
 * - `lg` — dashboards, profiles, statistics. The full foil.
 * - `sm` — search results and lists, where a hundred of them scroll past.
 */
export function PlayerCard({
  player,
  size = 'lg',
  href,
  selfLabel,
  className,
}: {
  player: PlayerProfile;
  size?: 'sm' | 'lg';
  /** Wraps the card in a link. Omit for the player's own card. */
  href?: string;
  /**
   * Marks the card as the viewer's own. Passed as text rather than a boolean
   * because this is a Server Component and the label is translated (§1.17).
   */
  selfLabel?: string;
  className?: string;
}) {
  const group = positionGroup(player?.primaryPosition);
  const theme = CARD_THEME[group];
  const stars = player?.stars ?? 0;
  const bandLabel = ageBand(player?.birthDate).replace('U-', 'U');
  const small = size === 'sm';

  const card = (
    <article
      className={cn(
        'group/card relative isolate overflow-hidden rounded-2xl text-white shadow-lg',
        'ring-1 ring-white/10 transition-transform',
        href && 'hover:-translate-y-0.5 hover:shadow-xl',
        'aspect-[3/4]',
        // A 3:4 card at full phone width is nearly 500px tall — the whole first
        // screen, before a single attribute. Capped and centred below `sm`, where
        // it sits in a 220px column anyway.
        !small && 'mx-auto w-full max-w-64 sm:max-w-none',
        className,
      )}
      style={{ backgroundImage: `linear-gradient(160deg, ${theme.from} 0%, ${theme.to} 68%)` }}
    >
      {/* Foil sheen. Two cheap gradients rather than an image asset (§14). */}
      <span
        className="pointer-events-none absolute inset-0 opacity-60 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 120% 60% at 80% -10%, rgba(255,255,255,.55), transparent 60%), radial-gradient(ellipse 90% 50% at 10% 110%, rgba(0,0,0,.5), transparent 60%)',
        }}
        aria-hidden
      />

      <PlayerPortrait player={player} small={small} />

      {/* Legibility floor for the name plate, independent of the photo behind it. */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
        style={{ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,.9), transparent)' }}
        aria-hidden
      />

      <div className={cn('absolute inset-0 flex flex-col', small ? 'p-2.5' : 'p-4')}>
        {/* Age band over position — the eFootball "105 / LWF" block. */}
        <div className="flex items-start justify-between gap-2">
          <div className="drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]">
            <p
              className={cn(
                'leading-none font-black tracking-tight tabular-nums',
                // "Senior" needs to fit the slot "U16" leaves room for.
                small ? 'text-lg' : bandLabel.length > 3 ? 'text-2xl' : 'text-4xl',
              )}
            >
              {bandLabel}
            </p>
            <p
              className={cn(
                'mt-0.5 leading-none font-bold tracking-widest',
                small ? 'text-[10px]' : 'text-lg',
              )}
              style={{ color: theme.ring }}
            >
              {player?.primaryPosition ?? '—'}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* On the card, not above it: the badge belongs to the artefact it
                marks, and floating it outside read as page furniture. */}
            {selfLabel && (
              <span
                className={cn(
                  'rounded-full bg-white/90 font-bold tracking-wide text-black uppercase',
                  small ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
                )}
              >
                {selfLabel}
              </span>
            )}
            {player?.secondaryPosition && !small && (
              <span className="rounded-md bg-black/35 px-1.5 py-0.5 font-mono text-[11px] font-semibold backdrop-blur-sm">
                {player?.secondaryPosition}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <h3
            className={cn(
              'truncate font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]',
              small ? 'text-xs' : 'text-lg',
            )}
          >
            {player?.firstName} {player?.lastName}
          </h3>

          {!small && (
            <p className="truncate text-xs text-white/70">
              {/* The handle first: it is what someone types to find this player
                  again, and the playing style is already a badge elsewhere. */}
              {player?.username
                ? `@${player?.username}`
                : player?.playingStyle
                  ? humanizeEnum(player?.playingStyle)
                  : (player?.region ?? '')}
            </p>
          )}

          <EvidenceStars filled={stars} tier={starTier(stars)} small={small} />
        </div>
      </div>
    </article>
  );

  return href ? (
    <Link href={href} className="focus-visible:ring-ring block rounded-2xl focus-visible:ring-2">
      {card}
    </Link>
  ) : (
    card
  );
}

const TIER_COLOR: Record<string, string> = {
  gold: '#fbbf24',
  silver: '#e2e8f0',
  bronze: '#d97706',
  unrated: 'rgba(255,255,255,.28)',
};

/** Five stars, filled by the rating evidence behind the card. */
function EvidenceStars({ filled, tier, small }: { filled: number; tier: string; small: boolean }) {
  const label = `${filled} of 5 stars`;
  return (
    <div
      className={cn('flex items-center gap-0.5', small ? 'mt-1' : 'mt-1.5')}
      role="img"
      aria-label={label}
      title={label}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          className={cn(small ? 'size-2.5' : 'size-3.5')}
          fill={index < filled ? TIER_COLOR[tier] : 'rgba(255,255,255,.22)'}
          aria-hidden
        >
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
        </svg>
      ))}
    </div>
  );
}
