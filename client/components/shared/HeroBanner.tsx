/**
 * The landing hero's photograph, shot once for each theme.
 *
 * ## Chosen in CSS, not in JavaScript
 *
 * A photograph is the one thing the theme tokens cannot restyle, so there are two
 * files and the stylesheet picks — `.hero-banner` in globals.css, driven by the
 * same `data-theme` and `prefers-color-scheme` pair as every colour in the app.
 * Choosing in JavaScript would paint the wrong one first and flash a full-width
 * image at anyone opening the site at night, which is exactly what the blocking
 * theme script exists to prevent for colours.
 *
 * A background rather than two `<Image>` layers: both had to be in the document
 * for CSS to choose between them, so the browser fetched both files to show one,
 * and the hidden one measured zero pixels wide — which is what Next's `sizes`
 * warning was reporting, accurately.
 *
 * ## The crop, and the scrim
 *
 * The source is 1774×443, a 4:1 strip. On a phone it is not stretched over the
 * whole hero: covering a 600px-tall box with that magnifies a sliver into blur,
 * and a scrim heavy enough to keep text readable on top then hides what little is
 * left. It holds the top ~58% near its own proportions and fades down into the
 * page, so the photograph is something you actually see before the copy begins.
 *
 * Text sits to its left on a wide screen and below it on a narrow one, so the
 * scrim runs horizontally above `lg` and vertically below. Without it the
 * headline lands on whatever the photograph happens to contain at that
 * breakpoint, which is not a contrast ratio anyone can promise.
 */
export function HeroBanner() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="hero-banner absolute inset-x-0 top-0 h-[58%] lg:inset-0 lg:h-full" />

      {/* Legibility floor for the copy, independent of what the photo shows. */}
      <div className="from-background/70 via-background/90 to-background lg:from-background lg:via-background/70 absolute inset-0 bg-gradient-to-b lg:bg-gradient-to-r lg:to-transparent" />
      {/* Hands the section back to the page colour at its bottom edge, so the
          banner reads as part of the hero rather than as a pasted-in rectangle. */}
      <div className="from-background absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent" />
    </div>
  );
}
