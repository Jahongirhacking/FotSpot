import Image from 'next/image';

/**
 * The landing hero's photograph, shot once for each theme.
 *
 * ## Why both files are in the markup
 *
 * A photograph is the one thing the theme tokens cannot restyle, so there are two
 * of them and CSS picks — `.theme-light-only` / `.theme-dark-only` in globals.css,
 * driven by the same `data-theme` and `prefers-color-scheme` pair as every colour
 * in the app. Choosing in JavaScript would paint the wrong one first and flash a
 * full-width image at anyone opening the site at night, which is exactly what the
 * blocking theme script exists to prevent for colours.
 *
 * The cost is the second file's bytes. Only one is ever *rendered*, so the
 * hidden one is not decoded or laid out; `loading="eager"` is on the visible pair
 * because this is the largest paint above the fold and lazy-loading it would show
 * an empty band first.
 *
 * ## The scrim, and why it is not symmetric
 *
 * The source is 1774×443 — a 4:1 strip. Behind a hero it has to survive being
 * cropped to something nearer 3:2 on a phone, so it is `object-cover` with the
 * focus held right of centre, where the pitch is, rather than letterboxed.
 *
 * On a phone it is not stretched over the whole hero: covering a 600px-tall box
 * with a 4:1 strip magnifies a sliver of it into blur, and a scrim heavy enough
 * to keep text readable on top then hides what little is left. Instead it holds
 * the top ~58% near its own proportions and fades down into the page, so the
 * photograph is something you actually see before the copy begins.
 *
 * Text sits to its left on a wide screen and below it on a narrow one, so the
 * scrim runs horizontally above `lg` and vertically below. Without it the
 * headline lands on whatever the photograph happens to contain at that
 * breakpoint, which is not a contrast ratio anyone can promise.
 */
export function HeroBanner() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="theme-light-only absolute inset-x-0 top-0 h-[58%] lg:inset-0 lg:h-full">
        <Image
          src="/bg-banner-light.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_38%] lg:object-[65%_center]"
        />
      </div>

      <div className="theme-dark-only absolute inset-x-0 top-0 h-[58%] lg:inset-0 lg:h-full">
        <Image
          src="/bg-banner-dark.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_38%] lg:object-[65%_center]"
        />
      </div>

      {/* Legibility floor for the copy, independent of what the photo shows.
          Vertical below `lg`, where the text sits under the image; horizontal
          above it, where the text sits to its left. */}
      <div className="from-background/70 via-background/90 to-background lg:from-background lg:via-background/70 absolute inset-0 bg-gradient-to-b lg:bg-gradient-to-r lg:to-transparent" />
      {/* Hands the section back to the page colour at its bottom edge, so the
          banner reads as part of the hero rather than as a pasted-in rectangle. */}
      <div className="from-background absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent" />
    </div>
  );
}
