import type { DominantFoot } from '@/lib/api/types';
import { CARD_THEME, POSITION_COORDS, positionGroup } from '@/lib/player-card';
import { cn, humanizeEnum } from '@/lib/utils';

/**
 * Where this player plays, drawn on a pitch.
 *
 * A position code is jargon: "AM" means nothing to the parent reading their child's
 * profile, and little more to a coach skimming twenty profiles. A dot on a pitch is
 * read in one glance and in any language, which matters in a trilingual app
 * (§1.17).
 *
 * The pitch is drawn vertically with the attacking goal at the top, matching how a
 * line-up is drawn everywhere else in football.
 */
export function PitchMap({
  primary,
  secondary,
  className,
}: {
  primary?: string | null;
  secondary?: string | null;
  className?: string;
}) {
  const theme = CARD_THEME[positionGroup(primary)];
  const primarySpot = primary ? POSITION_COORDS[primary] : undefined;
  const secondarySpot = secondary ? POSITION_COORDS[secondary] : undefined;

  return (
    <svg
      viewBox="0 0 100 130"
      className={cn('w-full', className)}
      role="img"
      aria-label={
        primary
          ? `Plays at ${primary}${secondary ? `, and at ${secondary}` : ''}`
          : 'No position set'
      }
    >
      {/* Turf. Two bands rather than a mown-stripe pattern — stripes cost fill rate
          on a low-end GPU and add nothing at this size. */}
      <rect x="0" y="0" width="100" height="130" rx="4" className="fill-surface-2" />

      <g className="stroke-border" strokeWidth="0.6" fill="none">
        <rect x="4" y="4" width="92" height="122" rx="2" />
        <line x1="4" y1="65" x2="96" y2="65" />
        <circle cx="50" cy="65" r="13" />
        {/* Own penalty area (bottom) and the attacked one (top). */}
        <rect x="26" y="4" width="48" height="18" />
        <rect x="26" y="108" width="48" height="18" />
        <rect x="38" y="4" width="24" height="7" />
        <rect x="38" y="119" width="24" height="7" />
      </g>

      {secondarySpot && (
        <Spot
          x={secondarySpot.x}
          y={secondarySpot.y}
          label={secondary!}
          color={theme.ring}
          variant="secondary"
        />
      )}
      {primarySpot && (
        <Spot
          x={primarySpot.x}
          y={primarySpot.y}
          label={primary!}
          color={theme.from}
          variant="primary"
        />
      )}
    </svg>
  );
}

/** `y` is given as "distance towards the goal being attacked", so it is flipped. */
function Spot({
  x,
  y,
  label,
  color,
  variant,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
  variant: 'primary' | 'secondary';
}) {
  const cy = 130 - (y / 100) * 122 - 4;
  const isPrimary = variant === 'primary';

  return (
    <g>
      {isPrimary && <circle cx={x} cy={cy} r="13" fill={color} opacity="0.18" />}
      <circle
        cx={x}
        cy={cy}
        r={isPrimary ? 9 : 7}
        fill={isPrimary ? color : 'transparent'}
        stroke={color}
        strokeWidth={isPrimary ? 0 : 1.4}
        strokeDasharray={isPrimary ? undefined : '2.5 1.8'}
      />
      <text
        x={x}
        y={cy + 2.2}
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill={isPrimary ? '#fff' : color}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Which foot the player uses, as two feet rather than the word "LEFT".
 *
 * `BOTH` lights both feet — two-footedness is a genuine selling point at youth
 * level, and a badge reading "Both foot" undersold it.
 */
export function DominantFootFigure({
  foot,
  className,
}: {
  foot?: DominantFoot | null;
  className?: string;
}) {
  const left = foot === 'LEFT' || foot === 'BOTH';
  const right = foot === 'RIGHT' || foot === 'BOTH';

  return (
    <div
      className={cn('flex items-end justify-center gap-3', className)}
      role="img"
      aria-label={foot ? `Dominant foot: ${humanizeEnum(foot)}` : 'Dominant foot not set'}
    >
      <Foot active={left} side="left" />
      <Foot active={right} side="right" />
    </div>
  );
}

function Foot({ active, side }: { active: boolean; side: 'left' | 'right' }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 40 74"
        className={cn(
          'h-14 transition-colors',
          side === 'left' && '-scale-x-100',
          active ? 'text-primary' : 'text-surface-3',
        )}
        fill="currentColor"
        aria-hidden
      >
        <path d="M20 2c9 0 16 8 16 20 0 8-3 13-3 21 0 6 3 10 3 16 0 8-7 13-16 13S4 67 4 59c0-6 3-10 3-16 0-8-3-13-3-21C4 10 11 2 20 2Z" />
      </svg>
      <span
        className={cn(
          'text-[10px] font-medium uppercase',
          active ? 'text-foreground' : 'text-muted',
        )}
      >
        {side}
      </span>
    </span>
  );
}
