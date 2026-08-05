import type { Media } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';

/**
 * How one attribute's self-rating moved over time.
 *
 * Drawn as raw SVG rather than pulled in from a charting library: it is one
 * polyline over at most a handful of points, and shipping ~90 KB of charting code
 * to an entry-level Android phone (§14) to draw it would cost more than the whole
 * rest of the page.
 *
 * The y-axis is pinned to 0–100 rather than fitted to the data. An auto-fitted
 * axis makes 70 → 72 look like a leap, and a child reading their own progress is
 * the last person who should be shown a flattering scale.
 */
export function RatingHistoryChart({ history }: { history: Media[] }) {
  const points = history.filter((clip) => clip.rating != null);
  if (points.length === 0) return null;

  const width = 450;
  const height = 196;
  const padX = 8;
  const padY = 25;

  const x = (index: number) =>
    points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
  const y = (rating: number) => height - padY - (rating / 100) * (height - padY * 2);

  const line = points.map((clip, index) => `${x(index)},${y(clip.rating!)}`).join(' ');
  const first = points[0].rating!;
  const last = points[points.length - 1].rating!;
  const change = last - first;

  return (
    <div className="space-y-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={points
          .map((clip) => `${formatDate(clip.createdAt)}: ${clip.rating}`)
          .join('; ')}
      >
        {[0, 50, 100].map((tick) => (
          <line
            key={tick}
            x1={padX}
            x2={width - padX}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray={tick === 50 ? '3 3' : undefined}
          />
        ))}

        {points.length > 1 && (
          <polyline
            points={line}
            fill="none"
            className="stroke-prov-self"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((clip, index) => (
          <g key={clip.id}>
            <circle cx={x(index)} cy={y(clip.rating!)} r="4" className="fill-prov-self" />
            <text
              x={x(index)}
              y={y(clip.rating!) - 8}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-semibold"
            >
              {clip.rating}
            </text>
          </g>
        ))}
      </svg>

      <div className="text-muted flex items-center justify-between text-[11px]">
        <span>{formatDate(points[0].createdAt)}</span>
        {points.length > 1 && (
          <span className={change > 0 ? 'text-success' : change < 0 ? 'text-danger' : ''}>
            {change > 0 ? '+' : ''}
            {change}
          </span>
        )}
        <span>{formatDate(points[points.length - 1].createdAt)}</span>
      </div>
    </div>
  );
}
