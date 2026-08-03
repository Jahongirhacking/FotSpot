'use client';

import * as React from 'react';

/**
 * Renders only the rows near the viewport, for a list that scrolls with the page.
 *
 * ## Why not keep it simple and render everything
 *
 * A feed row holds a video element. Fifty of them is fifty decoders, fifty poster
 * downloads and a layer tree a mid-range Android gives up on — this is the screen
 * most likely to be opened on exactly that phone. Mounting only what is on screen
 * is the difference between a feed that scrolls and one that stutters.
 *
 * ## Measured, not assumed
 *
 * Rows are not a fixed height: a clip with a two-line description is taller than
 * one with no caption. Each mounted row reports its real height through
 * `measureRef`, and everything below it shifts by the difference. Unmeasured rows
 * fall back to `estimate`, which only has to be in the right neighbourhood — it
 * decides how far the scrollbar lies before you get there, and nothing else.
 *
 * Rows are positioned absolutely inside a container of the summed height, so a row
 * changing size never moves the ones above it and the page scroll position stays
 * where the reader put it.
 *
 * The window follows the *page* scroll rather than an inner scroller: a feed
 * inside its own scroll box breaks the phone browser's hide-the-address-bar
 * gesture, which costs more screen than the virtualisation saves.
 */
export function useWindowedList({
  count,
  estimate,
  overscan = 2,
}: {
  count: number;
  /** Starting guess for a row's height, in px. */
  estimate: number;
  /** Rows to keep mounted beyond each edge, so scrolling meets ready content. */
  overscan?: number;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [heights, setHeights] = React.useState<number[]>([]);
  const [viewport, setViewport] = React.useState({ top: 0, height: 0 });

  const offsets = React.useMemo(() => {
    const result = new Array<number>(count + 1);
    result[0] = 0;
    for (let index = 0; index < count; index++) {
      result[index + 1] = result[index] + (heights[index] || estimate);
    }
    return result;
  }, [count, heights, estimate]);

  const totalSize = offsets[count] ?? 0;

  React.useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const container = containerRef.current;
      if (!container) return;
      // Distance the list has scrolled past the top of the viewport. Negative
      // while the list is still below the fold, which clamps to row 0.
      const top = -container.getBoundingClientRect().top;
      setViewport((previous) =>
        Math.abs(previous.top - top) < 1 && previous.height === window.innerHeight
          ? previous
          : { top, height: window.innerHeight },
      );
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const start = Math.max(0, findRow(offsets, viewport.top) - overscan);
  const end = Math.min(count, findRow(offsets, viewport.top + viewport.height) + 1 + overscan);

  /** Attach to each rendered row: reports its height as it changes. */
  const measureRef = React.useCallback(
    (index: number) => (node: HTMLElement | null) => {
      if (!node) return;
      const observer = new ResizeObserver(() => {
        const height = node.getBoundingClientRect().height;
        setHeights((current) => {
          if (Math.abs((current[index] ?? 0) - height) < 1) return current;
          const next = [...current];
          next[index] = height;
          return next;
        });
      });
      observer.observe(node);
      // Cleanup runs when React swaps the ref out — including when the row
      // scrolls out of the window and unmounts.
      return () => observer.disconnect();
    },
    [],
  );

  /**
   * The row crossing the middle of the screen — what the reader is looking at.
   *
   * Derived from the same offsets rather than a second IntersectionObserver:
   * the geometry is already known here, and one source of truth means the video
   * that plays is always the row the window says is centred.
   */
  const centerIndex = count === 0 ? -1 : findRow(offsets, viewport.top + viewport.height / 2);

  return { containerRef, start, end, offsets, totalSize, measureRef, centerIndex };
}

/** Index of the row containing `position`, by binary search over the prefix sums. */
function findRow(offsets: number[], position: number) {
  let low = 0;
  let high = offsets.length - 2;
  if (high < 0) return 0;

  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (offsets[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}
