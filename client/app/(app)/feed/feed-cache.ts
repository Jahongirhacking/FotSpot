import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { FeedClip, FeedPage } from '@/lib/api/types';

/** The cache key every feed reader and writer agrees on. */
export const FEED_QUERY_KEY = ['feed'] as const;

/**
 * How long a feed order stands before the ranking may be recomputed.
 *
 * ## The order is a snapshot, not a live view
 *
 * `MediaService.feed` ranks by what the viewer has done — and a like is its
 * strongest negative signal, so a liked clip drops out of the order. That is
 * the right ranking for the *next* visit and the wrong thing to do to a feed
 * somebody is looking at now: refetching after a like pulled the card out from
 * under their finger and reshuffled everything below it.
 *
 * So the order a session was dealt is kept for this long. Nothing here runs a
 * timer; this is React Query's `staleTime`, which means the automatic refetches
 * — on window focus, on reconnect, on remount — are simply not triggered while
 * the snapshot is fresh. A new page load always starts from a server-rendered
 * first page, so a reload is a new session with a new ranking regardless.
 */
export const FEED_RANKING_TTL_MS = 60 * 60 * 1000;

type FeedCache = InfiniteData<FeedPage> | undefined;

/**
 * The cached feed with one clip changed, and nothing else.
 *
 * ## Why in place, and why pure
 *
 * Likes and views change a number on one card. The alternative — invalidating
 * the query — refetches every loaded page and lets the server re-rank, which is
 * exactly the reorder this file exists to prevent. Patching keeps pages, order
 * and every other item's identity untouched: the same objects come back for the
 * clips that did not change, so nothing downstream re-renders or remounts.
 *
 * Pure so it can be asserted without a QueryClient: the interesting property is
 * that the order it returns is the order it was given.
 */
export function patchFeedPages(
  cached: FeedCache,
  clipId: string,
  patch: (clip: FeedClip) => FeedClip,
): FeedCache {
  if (!cached) return cached;
  return {
    ...cached,
    pages: cached.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === clipId ? patch(item) : item)),
    })),
  };
}

/**
 * One page-fetch address: the page number plus the session the order belongs to.
 *
 * The snapshot (`seed`, `since`) comes from the first page and rides along on
 * every next one, so the server cuts each page from the same order. A cache
 * from before the snapshot existed carries neither, and the server then starts
 * a session per page — which the dedupe below still keeps honest.
 */
export interface FeedPageParam {
  page: number;
  seed?: string;
  since?: string;
}

/** The address of the page after `last`, or undefined at the end. */
export function nextFeedPageParam(last: FeedPage): FeedPageParam | undefined {
  if (last.page * last.pageSize >= last.total) return undefined;
  return { page: last.page + 1, seed: last.seed, since: last.since };
}

/**
 * The loaded pages as one list, each clip once.
 *
 * Offsets over a live order can hand the same clip back on two pages: the
 * snapshot above is what stops the order moving, and this is the belt to its
 * braces. First occurrence wins, so a clip keeps the position the reader saw
 * it in, and later pages simply lose the repeat.
 */
export function uniqueClips(pages: readonly FeedPage[] | undefined): FeedClip[] {
  const seen = new Set<string>();
  const out: FeedClip[] = [];
  for (const page of pages ?? []) {
    for (const clip of page.items) {
      if (seen.has(clip.id)) continue;
      seen.add(clip.id);
      out.push(clip);
    }
  }
  return out;
}

/** `patchFeedPages` applied to the live cache. */
export function patchFeedClip(
  queryClient: QueryClient,
  clipId: string,
  patch: (clip: FeedClip) => FeedClip,
) {
  queryClient.setQueryData<FeedCache>(FEED_QUERY_KEY, (cached) =>
    patchFeedPages(cached, clipId, patch),
  );
}
