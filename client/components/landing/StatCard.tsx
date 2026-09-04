import type * as React from 'react';
import { ArrowUpRight } from 'lucide-react';

/**
 * One platform number, on a photograph.
 *
 * ## The photograph
 *
 * The same picture the hero uses in the dark theme — players, a coach with a
 * tablet, an academy building — cropped to a different region per card, so
 * three cards get three scenes from one file already shipped with the site.
 * The overlay is what makes the number legible on any of those crops: a solid
 * floor at the bottom where the type sits, thinning towards the top where the
 * picture is allowed to show.
 *
 * The number is the content and is sized like it; the label under it says what
 * was counted and is deliberately quieter. The icon sits in a pill at the top
 * as the card's mark — the same icon the tile had before, and nothing new to read.
 *
 * Dark in both themes: this is FotSpot's black with its green, not a surface
 * that should follow the page, and a light-theme photograph would need a
 * different overlay for every crop.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  focus,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  /** Which part of the photograph this card shows — a CSS background-position. */
  focus: string;
}) {
  return (
    <div className="group relative isolate min-h-44 overflow-hidden rounded-2xl bg-black text-white shadow-md ring-1 ring-white/10 transition-[transform,translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl sm:min-h-56">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-cover transition-transform duration-500 ease-out group-hover:scale-105"
        style={{ backgroundImage: "url('/bg-banner-dark.jpg')", backgroundPosition: focus }}
      />
      {/* Legibility floor: solid where the number is, open where the picture is. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
      />

      <div className="flex h-full min-h-44 flex-col justify-between p-5 sm:min-h-56">
        <div className="flex items-start justify-between">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/90 ring-1 ring-white/15 backdrop-blur"
          >
            <Icon className="size-4" />
          </span>
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full opacity-0 transition-[opacity,transform] duration-300 group-hover:opacity-100"
          >
            <ArrowUpRight className="size-4" />
          </span>
        </div>

        <div>
          <p className="text-5xl leading-none font-black tracking-tight tabular-nums sm:text-6xl">
            {value}
          </p>
          <p className="mt-2 text-sm font-medium tracking-wide text-white/80 uppercase">{label}</p>
        </div>
      </div>
    </div>
  );
}
