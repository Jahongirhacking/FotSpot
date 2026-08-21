'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Heart, Pause, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { FeedClip } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { cn, initials } from '@/lib/utils';
import { LoadingImage } from '@/components/ui/LoadingImage';

/**
 * How long a slide must actually play before it counts as watched.
 *
 * Slides auto-play as the feed scrolls, so counting on play would measure
 * scrolling rather than watching. Two seconds is the shortest span that separates
 * "stopped for this one" from "went past it".
 */
const VIEW_AFTER_SECONDS = 2;

/**
 * Clips this tab has already reported, for as long as the tab is open.
 *
 * A component ref alone was not enough. The feed is windowed, so a slide is
 * unmounted once it is far enough off screen and mounted again when you scroll
 * back — with a fresh ref each time, which meant scrolling up and down a feed of
 * ten clips sent a POST per pass. The server refuses the duplicate either way,
 * so the count was never wrong; the requests were simply spent proving it.
 *
 * Module scope rather than component state, because the point is to outlive the
 * component. It resets on reload, which is correct — the server's daily rule is
 * what makes a refresh not count twice, and this only stops the request being
 * made at all.
 */
const reportedThisSession = new Set<string>();

/**
 * The clip, full screen, in the short-video idiom the audience already knows.
 *
 * ## Scroll-snap, not a carousel
 *
 * One slide fills the viewport and `snap-mandatory` means a flick lands squarely
 * on the next clip — the gesture people arrive already knowing. It is native
 * scrolling, so it keeps the platform's own momentum and rubber-banding on every
 * device rather than approximating them in JavaScript.
 *
 * Chrome is stripped to what the format shows: who the player is, the likes, the
 * title and the description. Everything else on the page is behind the overlay,
 * one press from the close button away.
 *
 * Only the current slide and its neighbours hold a `<video>`; the rest are their
 * poster frame. A hundred-clip feed opened at slide one must not mount a hundred
 * decoders — this is the same rule as the stream behind it, and for the same
 * phone.
 *
 * The like is optimistic against the feed cache, because a heart that waits for a
 * round trip feels broken, and it is corrected by the refetch either way.
 */
export function ShortViewer({
  clips,
  startIndex,
  onClose,
  onNeedMore,
}: {
  clips: FeedClip[];
  startIndex: number;
  onClose: () => void;
  onNeedMore: () => void;
}) {
  const { t } = useI18n();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(startIndex);
  const [muted, setMuted] = React.useState(true);

  // Jump to the clip that was pressed, before the first paint the user sees.
  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = startIndex * scroller.clientHeight;
  }, [startIndex]);

  // The page behind must not scroll while a full-screen overlay is open —
  // otherwise closing it returns the reader somewhere they never went.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  React.useEffect(() => {
    if (index >= clips?.length - 2) onNeedMore();
  }, [index, clips?.length, onNeedMore]);

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || !scroller.clientHeight) return;
    const next = Math.round(scroller.scrollTop / scroller.clientHeight);
    setIndex((current) => (current === next ? current : next));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.cancel}
        className="absolute top-3 right-3 z-20 grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <X className="size-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => setMuted((was) => !was)}
        aria-label={muted ? t.feed.unmute : t.feed.mute}
        className="absolute top-3 left-3 z-20 grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </button>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {clips?.map((clip, position) => (
          <Slide
            key={clip?.id}
            clip={clip}
            active={position === index}
            mounted={Math.abs(position - index) <= 1}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function Slide({
  clip,
  active,
  mounted,
  muted,
}: {
  clip: FeedClip;
  active: boolean;
  mounted: boolean;
  muted: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [liked, setLiked] = React.useState(clip?.likedByMe);
  const [likes, setLikes] = React.useState(clip?.likes);
  const [views, setViews] = React.useState(clip?.views ?? 0);

  /*
   * Whether this slide has already been counted.
   *
   * A ref rather than state: changing it must not re-render, and it must survive
   * the re-renders that pausing, liking and muting cause. Keyed on the clip id so
   * a recycled component counts a genuinely different clip.
   */
  const countedId = React.useRef<string | null>(null);

  /**
   * Counts a view after two seconds of actual playback.
   *
   * Not on mount, and not on `play`. This is a feed whose slides auto-play as you
   * scroll, so both would count every clip you swipe past — the number would
   * measure scrolling rather than watching. Two seconds is the shortest span that
   * distinguishes "stopped to watch this" from "went by".
   *
   * The endpoint already refuses to count the same viewer twice in a day — a
   * unique index, not a cache — so these guards are about not spending requests,
   * never about the correctness of the total.
   */
  const markViewed = React.useCallback(() => {
    if (!clip?.id || countedId.current === clip?.id) return;
    countedId.current = clip?.id;

    // Already reported since this tab opened — including by an earlier mount of
    // this same slide. The optimistic number below is skipped too: it was added
    // the first time and the feed cache still carries it.
    if (reportedThisSession.has(clip?.id)) return;
    reportedThisSession.add(clip?.id);

    setViews((current) => current + 1);

    /*
     * The grid behind this viewer reads the same clip from the `feed` query, so
     * the cached page is corrected in place. Invalidating instead would refetch
     * every loaded page — on a scroll feed that is a lot of work, and it can move
     * the ground under the reader — and doing nothing would send them back to a
     * grid still showing the count they just changed.
     */
    queryClient.setQueryData(
      ['feed'],
      (cached: { pages?: { items?: { id: string; views: number }[] }[] } | undefined) =>
        cached && {
          ...cached,
          pages: cached.pages?.map((page) => ({
            ...page,
            items: page.items?.map((item) =>
              item.id === clip?.id ? { ...item, views: item.views + 1 } : item,
            ),
          })),
        },
    );

    void browserFetch(`/media/${clip?.id}/view`, { method: 'POST' }).catch(() => {
      // Put the number back and allow a later attempt: an unsent view is not
      // worth a visible error on a feed nobody is reading numbers on.
      countedId.current = null;
      reportedThisSession.delete(clip?.id);
      setViews((current) => Math.max(0, current - 1));
    });
  }, [clip?.id, queryClient]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !paused) void video.play().catch(() => undefined);
    else video.pause();
  }, [active, paused, mounted]);

  const toggleLike = useMutation({
    mutationFn: (next: boolean) =>
      browserFetch(`/media/${clip?.id}/like`, { method: next ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
    onError: () => {
      // Put the heart back where it was; the server said no.
      setLiked(clip?.likedByMe);
      setLikes(clip?.likes);
    },
  });

  function like() {
    const next = !liked;
    setLiked(next);
    setLikes((current) => current + (next ? 1 : -1));
    toggleLike.mutate(next);
  }

  return (
    <section className="relative h-dvh w-full snap-start snap-always">
      <button
        type="button"
        onClick={() => setPaused((was) => !was)}
        aria-label={paused ? t.clips.play : t.clips.pause}
        className="absolute inset-0 z-0"
      >
        {clip?.url && mounted ? (
          <video
            ref={videoRef}
            src={clip?.url}
            poster={clip?.posterUrl ?? undefined}
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= VIEW_AFTER_SECONDS) markViewed();
            }}
            className="size-full object-contain"
          />
        ) : clip?.posterUrl ? (
           
          <LoadingImage src={clip?.posterUrl} alt="" className="size-full object-contain" />
        ) : (
          <span className="grid size-full place-items-center text-white/70">
            <TriangleAlert className="size-6" aria-hidden />
          </span>
        )}
      </button>

      {paused && active && (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <Pause className="size-14 text-white/80 drop-shadow" aria-hidden />
        </span>
      )}

      {/* Legibility floor for the caption, independent of the frame behind it. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/5"
        style={{ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,.85), transparent)' }}
        aria-hidden
      />

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 p-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="min-w-0 flex-1 space-y-2 text-white">
          <Link href={`/players/${clip?.player.id}`} className="flex items-center gap-2">
            <Avatar
              src={clip?.player.avatarUrl}
              fallback={initials(clip?.player.firstName, clip?.player.lastName)}
              className="size-9 ring-2 ring-white/70"
            />
            <span className="truncate text-sm font-semibold">
              {clip?.player.firstName} {clip?.player.lastName}
            </span>
          </Link>

          {clip?.title && <p className="text-sm font-medium">{clip?.title}</p>}
          {clip?.description && <p className="text-sm text-white/80">{clip?.description}</p>}
        </div>

        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          aria-label={t.clips.likeOnce}
          className="flex shrink-0 flex-col items-center gap-1 text-white"
        >
          <span className="grid size-12 place-items-center rounded-full bg-white/15 backdrop-blur-sm">
            <Heart className={cn('size-6', liked && 'fill-danger text-danger')} aria-hidden />
          </span>
          <span className="text-xs font-medium tabular-nums">{likes}</span>
        </button>

        {/* Views, beside the heart. Not a button — it counts itself once the clip
            has actually played, so there is nothing here to press. */}
        <span
          className="flex shrink-0 flex-col items-center gap-1 text-white"
          aria-label={t.clips?.views}
        >
          <span className="grid size-12 place-items-center rounded-full bg-white/15 backdrop-blur-sm">
            <Eye className="size-6" aria-hidden />
          </span>
          <span className="text-xs font-medium tabular-nums">{views}</span>
        </span>
      </div>
    </section>
  );
}
