import type { DominantFoot } from '@/lib/api/types';
import { Dictionary } from '@/lib/i18n';
import { CARD_THEME, POSITION_COORDS, positionGroup } from '@/lib/player-card';
import { cn, humanizeEnum } from '@/lib/utils';

/**
 * The two coordinate boxes a pitch is drawn in.
 *
 * The same drawing either way — the markings scale with the box, so `large` is
 * exactly what this component has always rendered. What does *not* scale is the
 * ink: stroke widths, labels and position dots are absolute, so a smaller box
 * makes them proportionally bigger.
 *
 * That is the whole point of `small`, and it is not a smaller picture. An SVG
 * with `w-full` is drawn at whatever width its container gives it, so shrinking
 * the box alone would change nothing. What changes is the ratio between the pitch
 * and the ink on it: at the ~130px this is rendered at beside a player card, a
 * 0.6-wide line in the large box lands under one device pixel and greys out to
 * nothing. In the small box the same line is half again as thick and the position
 * labels are legible rather than suggested.
 */
const PITCH_SIZES = {
  small: { width: 77, height: 102 },
  large: { width: 100, height: 130 },
} as const;

export type PitchMode = keyof typeof PITCH_SIZES;

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
 *
 * `mode` picks the coordinate box — see `PITCH_SIZES` for why that is a legibility
 * control and not a size one.
 */
export function PitchMap({
  primary,
  secondary,
  mode = 'large',
  className,
}: {
  primary?: string | null;
  secondary?: string | null;
  mode?: PitchMode;
  className?: string;
}) {
  const theme = CARD_THEME[positionGroup(primary)];
  const primarySpot = primary ? POSITION_COORDS[primary] : undefined;
  const secondarySpot = secondary ? POSITION_COORDS[secondary] : undefined;

  const { width, height } = PITCH_SIZES[mode];
  /*
   * Every marking below is still written in the original 100×130 numbers and
   * scaled through these, rather than kept as a second hand-written table per
   * mode. Two tables would be two chances to move a penalty box in one and not
   * the other, and `large` stays pixel-identical because both factors are exactly
   * 1 there.
   */
  const sx = width / 100;
  const sy = height / 130;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
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
      <rect x="0" y="0" width={width} height={height} rx={4 * sx} className="fill-surface-2" />

      <g className="stroke-border" strokeWidth="0.6" fill="none">
        <rect x={4 * sx} y={4 * sy} width={92 * sx} height={122 * sy} rx={2 * sx} />
        <line x1={4 * sx} y1={65 * sy} x2={96 * sx} y2={65 * sy} />
        <circle cx={50 * sx} cy={65 * sy} r={13 * sx} />
        {/* Own penalty area (bottom) and the attacked one (top). */}
        <rect x={26 * sx} y={4 * sy} width={48 * sx} height={18 * sy} />
        <rect x={26 * sx} y={108 * sy} width={48 * sx} height={18 * sy} />
        <rect x={38 * sx} y={4 * sy} width={24 * sx} height={7 * sy} />
        <rect x={38 * sx} y={119 * sy} width={24 * sx} height={7 * sy} />
      </g>

      {secondarySpot && (
        <Spot
          x={secondarySpot.x}
          y={secondarySpot.y}
          sx={sx}
          sy={sy}
          label={secondary!}
          color={theme.ring}
          variant="secondary"
        />
      )}
      {primarySpot && (
        <Spot
          x={primarySpot.x}
          y={primarySpot.y}
          sx={sx}
          sy={sy}
          label={primary!}
          color={theme.from}
          variant="primary"
        />
      )}
    </svg>
  );
}

/**
 * `y` is given as "distance towards the goal being attacked", so it is flipped.
 *
 * The dot's own dimensions — radius, label size, dashes — are deliberately left
 * unscaled while its *placement* is scaled. A player's position must land on the
 * same patch of grass in both modes, but the marker announcing it is ink, and ink
 * is what the small box exists to keep readable.
 */
function Spot({
  x,
  y,
  sx,
  sy,
  label,
  color,
  variant,
}: {
  x: number;
  y: number;
  sx: number;
  sy: number;
  label: string;
  color: string;
  variant: 'primary' | 'secondary';
}) {
  const cx = x * sx;
  const cy = (130 - (y / 100) * 122 - 4) * sy;
  const isPrimary = variant === 'primary';

  return (
    <g>
      {isPrimary && <circle cx={cx} cy={cy} r="13" fill={color} opacity="0.18" />}
      <circle
        cx={cx}
        cy={cy}
        r={isPrimary ? 9 : 7}
        fill={isPrimary ? color : 'transparent'}
        stroke={color}
        strokeWidth={isPrimary ? 0 : 1.4}
        strokeDasharray={isPrimary ? undefined : '2.5 1.8'}
      />
      <text
        x={cx}
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
  t,
}: {
  foot?: DominantFoot | null;
  className?: string;
  t?: Dictionary;
}) {
  const left = foot === 'LEFT' || foot === 'BOTH';
  const right = foot === 'RIGHT' || foot === 'BOTH';

  return (
    <div
      className={cn('flex items-end justify-center gap-3', className)}
      role="img"
      aria-label={foot ? `Dominant foot: ${humanizeEnum(foot)}` : 'Dominant foot not set'}
    >
      <Foot active={left} side="left" t={t} />
      <Foot active={right} side="right" t={t} />
    </div>
  );
}

function Foot({ active, side, t }: { active: boolean; side: 'left' | 'right'; t?: Dictionary }) {
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
        {t ? t?.onboarding?.[side] : side}
      </span>
    </span>
  );
}
