'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, Pause, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { FeedClip } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { cn, initials } from '@/lib/utils';

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
            className="size-full object-contain"
          />
        ) : clip?.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not an optimisable asset
          <img src={clip?.posterUrl} alt="" className="size-full object-contain" />
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
      </div>
    </section>
  );
}
