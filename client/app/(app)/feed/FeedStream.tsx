'use client';

import * as React from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Eye, Heart, Play, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { FeedClip, FeedPage } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { useWindowedList } from '@/hooks/useWindowedList';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { ShortViewer } from './ShortViewer';
import { ageBand, cn, initials } from '@/lib/utils';

const PAGE_SIZE = 6;
/** Roughly one card at phone width; corrected by measurement as rows mount. */
const ROW_ESTIMATE = 560;

/**
 * The ranked feed.
 *
 * ## One video plays, and it is the one you are looking at
 *
 * Autoplay is muted — an unmuted video starting on its own is the single most
 * complained-about behaviour on the mobile web, and browsers block it anyway. The
 * playing clip is the row crossing the middle of the screen, so scrolling hands
 * play from one clip to the next and the one you left stops. Sound is a deliberate
 * press, and once pressed it stays on as you scroll.
 *
 * Only rows near the viewport are mounted at all (`useWindowedList`), and only the
 * centred row and its immediate neighbours get a `<video>`; everything else shows
 * its poster. Fifty simultaneous decoders is not a feed, it is a heater.
 *
 * ## Pagination
 *
 * `useInfiniteQuery` over `/media/feed?page=`, fetching the next page when the
 * window reaches the last few rows. The first page is server-rendered and handed
 * in, so the feed is never briefly empty.
 */
export function FeedStream({ initialPage }: { initialPage: FeedPage }) {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const [muted, setMuted] = React.useState(true);

  const query = useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browserFetch<FeedPage>(`/media/feed?page=${pageParam}&pageSize=${PAGE_SIZE}`),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    initialData: { pages: [initialPage], pageParams: [1] },
  });

  const clips = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const { containerRef, start, end, offsets, totalSize, measureRef, centerIndex } = useWindowedList(
    { count: clips.length, estimate: ROW_ESTIMATE },
  );

  // Fetch ahead of the reader rather than at the very end, so the next page is
  // usually already there by the time they reach it.
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  React.useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && end >= clips.length - 2) {
      void fetchNextPage();
    }
  }, [end, clips.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isError) {
    return <Alert tone="danger">{t.common.couldNotLoad}</Alert>;
  }

  if (clips.length === 0) {
    return <EmptyState icon={Play} title={t.feed.emptyTitle} description={t.feed.emptyBody} />;
  }

  const rows = [];
  for (let index = start; index < end; index++) {
    const clip = clips[index];
    if (!clip) continue;
    rows.push(
      <div
        key={clip.id}
        ref={measureRef(index)}
        className="absolute inset-x-0 pb-4"
        style={{ transform: `translateY(${offsets[index]}px)` }}
      >
        <FeedCard
          clip={clip}
          // Nothing plays behind the full-screen viewer: two soundtracks at once,
          // and a video decoding for a screen nobody can see.
          playing={openIndex === null && index === centerIndex}
          // The neighbours keep their element so a scroll into them starts
          // instantly instead of waiting on a fresh decode.
          mounted={Math.abs(index - centerIndex) <= 1}
          muted={muted}
          onToggleMute={() => setMuted((was) => !was)}
          onOpen={() => setOpenIndex(index)}
        />
      </div>,
    );
  }

  return (
    <>
      <div ref={containerRef} className="relative" style={{ height: totalSize }}>
        {rows}
      </div>

      {/* A card-shaped placeholder rather than a spinner: the next page is about
          to occupy exactly this space, so the page does not jump when it lands. */}
      {isFetchingNextPage && <Skeleton className="h-72 w-full rounded-2xl" />}

      {openIndex !== null && (
        <ShortViewer
          clips={clips}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onNeedMore={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
        />
      )}
    </>
  );
}

function FeedCard({
  clip,
  playing,
  mounted,
  muted,
  onToggleMute,
  onOpen,
}: {
  clip: FeedClip;
  playing: boolean;
  mounted: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const attribute = CATEGORY_ATTRIBUTE[clip.category];

  /*
   * Optimistic, and deliberately *not* invalidating the feed on success.
   *
   * A like now carries a large negative weight in the ranking (see
   * MediaService.feed), so refetching would pull the card the user just liked
   * out from under their finger and reshuffle everything below it. The heart
   * updates here; the new order is what they get on their next visit, which is
   * when "don't show me this again" is what they actually want.
   */
  const [liked, setLiked] = React.useState(clip.likedByMe);
  const [likes, setLikes] = React.useState(clip.likes);

  const like = useMutation({
    mutationFn: (next: boolean) =>
      browserFetch(`/media/${clip.id}/like`, { method: next ? 'POST' : 'DELETE' }),
    onError: () => {
      // Put the heart back; the server said no.
      setLiked(clip.likedByMe);
      setLikes(clip.likes);
    },
  });

  function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((current) => current + (next ? 1 : -1));
    like.mutate(next);
  }
  const label =
    clip.category === 'MATCH_HIGHLIGHTS'
      ? t.attributes.highlights
      : attribute
        ? t.attributes[attribute]
        : clip.category;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      // Rejected when the tab is backgrounded or the browser declines; there is
      // nothing useful to do about it, and it must not reach the console as an
      // unhandled rejection on every scroll.
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [playing, mounted]);

  return (
    <article className="bg-surface border-border overflow-hidden rounded-2xl border shadow-sm">
      <header className="flex items-center gap-3 p-3">
        <Link
          href={`/players/${clip.player.id}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <Avatar
            src={clip.player.avatarUrl}
            fallback={initials(clip.player.firstName, clip.player.lastName)}
            className="size-9"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {clip.player.firstName} {clip.player.lastName}
            </span>
            <span className="text-muted block truncate text-xs">
              {[clip.player.primaryPosition, ageBand(clip.player.birthDate), clip.player.region]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </Link>

        {clip.following && <Badge variant="neutral">{t.feed.following}</Badge>}
        <Badge variant="primary">{label}</Badge>
      </header>

      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t.feed.openClip}
          className="block w-full"
        >
          <span className="relative block aspect-[4/5] w-full overflow-hidden bg-black sm:aspect-video">
            {clip.url && mounted ? (
              <video
                ref={videoRef}
                src={clip.url}
                poster={clip.posterUrl ?? undefined}
                muted={muted}
                loop
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : clip.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not an optimisable asset
              <img src={clip.posterUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-muted grid size-full place-items-center">
                <TriangleAlert className="size-5" aria-hidden />
              </span>
            )}
          </span>
        </button>

        {/* Over the video, where the muted indicator belongs — and large enough
            to hit while scrolling one-handed. */}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? t.feed.unmute : t.feed.mute}
          className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          {muted ? (
            <VolumeX className="size-5" aria-hidden />
          ) : (
            <Volume2 className="size-5" aria-hidden />
          )}
        </button>

        {clip.rating != null && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-black/55 px-2 py-1 font-mono text-lg font-black text-white backdrop-blur-sm">
            {clip.rating}
          </span>
        )}
      </div>

      <footer className="space-y-1 p-3">
        <p className="text-muted flex items-center gap-3 text-xs">
          {/*
            A button, not a label. The heart was the only place in the product
            that showed a like without accepting one — a scout had to open the
            full-screen viewer to say what they already knew from the grid.
            `min-h-8` and the padding are there because this is a real hit target
            on a phone, not a 14px icon.
          */}
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            aria-label={t.clips.likeOnce}
            className={cn(
              '-mx-1 flex min-h-8 items-center gap-1 rounded-md px-1 transition-colors',
              'hover:text-danger focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
              liked && 'text-danger',
            )}
          >
            <Heart className={cn('size-3.5', liked && 'fill-current')} aria-hidden />
            {likes}
          </button>
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden />
            {clip.views}
          </span>
        </p>
        {clip.title && <p className="text-sm font-medium">{clip.title}</p>}
        {clip.description && <p className="text-muted line-clamp-2 text-sm">{clip.description}</p>}
      </footer>
    </article>
  );
}
