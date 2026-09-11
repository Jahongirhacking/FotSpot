'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { useSession } from '@/components/layout/SessionProvider';
import { ClipModerationNote, useClipModerationCopy } from '@/components/player/ClipModerationBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { Media, MediaCategory, RatingAppeal } from '@/lib/api/types';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS, CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { cn, formatDate } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  Maximize,
  Minimize,
  Pause,
  Pencil,
  Play,
  Scale,
  Send,
  Trash2,
  TriangleAlert,
  Trophy,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface Engagement {
  views: number;
  likes: number;
  comments: number;
  likedByMe: boolean;
}

/**
 * The clip, full size, with everything you can do to it.
 *
 * ## No native controls
 *
 * `controls` is off and the only affordance is a scrubber, per the design of this
 * screen. It is presentation, not protection: the signed URL is right there in
 * the page, so hiding the browser's download button hides nothing. It just keeps
 * the lightbox to one job.
 *
 * Tapping the frame toggles play, which is what the missing controls would have
 * done and what people expect from a video in a lightbox anyway.
 */
export function ClipModal({
  clip,
  canEdit,
  canRate = false,
  open,
  onOpenChange,
  onDeleted,
  onUpdated,
}: {
  clip: Media;
  canEdit: boolean;
  /**
   * The viewer is a verified coach, so they may replace the rating on this clip.
   * Distinct from `canEdit`: the owner edits their own claim, a coach overrules
   * it, and the two are different acts by different people.
   */
  canRate?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
  onUpdated: (media: Media) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();

  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const engagement = useQuery({
    queryKey: ['media-engagement', clip?.id],
    queryFn: () => browserFetch<Engagement>(`/media/${clip?.id}/engagement`),
    enabled: open,
  });

  const toggleLike = useMutation({
    mutationFn: (liked: boolean) =>
      browserFetch(`/media/${clip?.id}/like`, { method: liked ? 'DELETE' : 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media-engagement', clip?.id] }),
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => browserFetch(`/media/${clip?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onOpenChange(false);
      onDeleted(clip?.id);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  // Engagement is meaningful only once a clip is public: an unreviewed or blocked
  // one is reachable by its owner alone, so there is nobody to like or watch it.
  const likeable = (clip?.moderationStatus ?? 'VERIFIED') === 'VERIFIED';
  const moderationHint = useClipModerationCopy(clip?.moderationStatus ?? 'VERIFIED').hint;

  const attribute = CATEGORY_ATTRIBUTE[clip?.category];
  const isHighlight = clip?.category === 'MATCH_HIGHLIGHTS';
  const label = isHighlight
    ? t.attributes.highlights
    : attribute
      ? t.attributes[attribute]
      : clip?.category;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <div className="space-y-3 p-4 pt-12 sm:pt-4">
          {error && <Alert tone="danger">{error}</Alert>}

          {clip?.url ? (
            <ClipPlayer src={clip?.url} />
          ) : (
            /* The row exists but storage is unconfigured, so no URL could be
               signed. Say so, rather than showing a player that never starts. */
            <div className="bg-surface-3 text-muted grid aspect-video w-full place-items-center rounded-lg">
              <span className="flex flex-col items-center gap-1.5 px-4 text-center">
                <TriangleAlert className="size-5" aria-hidden />
                <span className="text-sm">{t.clips.noStorageOrigin}</span>
              </span>
            </div>
          )}

          {/*
            Directly under the video, above everything else about the clip.
            "Waiting for verification" is the answer to the question the owner
            opened this dialog to ask, and it has to be readable before the
            rating, the title or the delete button. Nothing renders here for a
            verified clip, which is every clip anyone but the owner can open.
          */}
          <ClipModerationNote status={clip?.moderationStatus} />

          <div className="flex flex-wrap items-center gap-2">
            {isHighlight ? (
              <Badge variant="accent">
                <Trophy className="size-3" aria-hidden /> {label}
              </Badge>
            ) : (
              <>
                <Badge variant="primary">{label}</Badge>
                {clip?.rating != null && (
                  <span
                    className={cn(
                      'font-mono text-lg font-bold',
                      clip?.reportedBy && clip.reportedBy !== 'SELF'
                        ? 'text-prov-coach'
                        : 'text-prov-self',
                    )}
                    title={
                      clip?.reportedBy === 'ADMIN'
                        ? t.clips.ratedByAdmin
                        : clip?.reportedBy === 'COACH'
                          ? t.clips.ratedByCoach
                          : t.clips.ratedBySelf
                    }
                  >
                    {clip?.rating}
                  </span>
                )}
              </>
            )}
            <span className="text-muted ml-auto text-xs">
              {formatDate(clip?.recordedAt ?? clip?.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!isAuthenticated || !likeable || toggleLike.isPending}
              onClick={() => toggleLike.mutate(engagement.data?.likedByMe ?? false)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-colors',
                engagement.data?.likedByMe
                  ? 'text-danger bg-danger/10'
                  : 'text-muted hover:bg-surface-2',
                (!isAuthenticated || !likeable) && 'cursor-not-allowed opacity-60',
              )}
              // One like per account, not per role — the server keys it on user id
              // alone, so switching hats and pressing again changes nothing.
              //
              // Off entirely while a clip is unreviewed. The only person who can
              // open one is its owner, nobody else can reach it to like it, and
              // the API refuses — leaving the heart live would spend a request to
              // show them an error about their own video.
              title={
                !isAuthenticated
                  ? t.clips.signInToLike
                  : likeable
                    ? t.clips.likeOnce
                    : moderationHint
              }
            >
              <Heart
                className={cn('size-4', engagement.data?.likedByMe && 'fill-current')}
                aria-hidden
              />
              {engagement.data?.likes ?? 0}
            </button>

            {canEdit && (
              <div className="ml-auto flex flex-wrap justify-end gap-1">
                {clip?.rating != null && clip?.reportedBy && clip.reportedBy !== 'SELF' && (
                  <AppealButton clip={clip} />
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing((was) => !was)}>
                  <Pencil aria-hidden /> {t.common.edit}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t.clips.confirmDelete)) remove.mutate();
                  }}
                >
                  <Trash2 aria-hidden /> {t.common.delete}
                </Button>
              </div>
            )}
          </div>

          {canRate && clip?.category !== 'MATCH_HIGHLIGHTS' && (
            <CoachRating clip={clip} onRated={onUpdated} />
          )}

          {editing && canEdit ? (
            <EditClipForm
              clip={clip}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setEditing(false);
                onUpdated(updated);
                router.refresh();
              }}
              onError={setError}
            />
          ) : (
            (clip?.title || clip?.description) && (
              <div className="space-y-1">
                {clip?.title && <p className="font-medium">{clip?.title}</p>}
                {clip?.description && <p className="text-muted text-sm">{clip?.description}</p>}
              </div>
            )
          )}

          {canEdit && <p className="text-muted text-xs">{t.clips.privateNote}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Video with a scrubber, a full-screen button, and nothing else.
 *
 * `timeupdate` fires about four times a second, which is enough for a progress
 * bar and far cheaper than a rAF loop on a phone. While the user is dragging, the
 * bar follows the pointer rather than the video, so it does not fight them.
 *
 * ## Full screen
 *
 * The *frame* goes full screen, not the video element, so the same scrubber and
 * play button stay on screen instead of being swapped for the browser's. iOS
 * Safari has no element-level Fullscreen API, only the video's own
 * `webkitEnterFullscreen`, which shows the native player — used there as the
 * fallback, because a clip that cannot go full screen on the phone most players
 * hold is worse than one that briefly wears the wrong controls. Exiting is the
 * same button, or the browser's own Escape/back gesture; `fullscreenchange`
 * keeps the icon honest either way.
 */
function ClipPlayer({ src }: { src: string }) {
  const { t } = useI18n();
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [scrubbing, setScrubbing] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  React.useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    const frame = frameRef.current;
    const video = ref.current;
    if (!frame || !video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof frame.requestFullscreen === 'function') {
      void frame.requestFullscreen().catch(() => undefined);
      return;
    }
    // iOS Safari: only the video itself can go full screen, with native controls.
    const native = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    native.webkitEnterFullscreen?.();
  };

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative overflow-hidden rounded-lg bg-black',
        // Full screen: the frame is the whole display, so the video takes every
        // pixel above the bar instead of the lightbox's 60dvh ceiling.
        fullscreen && 'flex h-full w-full flex-col justify-center rounded-none',
      )}
    >
      <video
        ref={ref}
        src={src}
        playsInline
        autoPlay
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          if (!scrubbing) setTime(event.currentTarget.currentTime);
        }}
        className={cn(
          'w-full cursor-pointer',
          fullscreen ? 'min-h-0 flex-1 object-contain' : 'max-h-[60dvh]',
        )}
      />

      <div className="flex items-center gap-2 bg-black/70 px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          className="grid size-7 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
          aria-label={playing ? t.clips.pause : t.clips.play}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={time}
          disabled={!duration}
          onPointerDown={() => setScrubbing(true)}
          onPointerUp={() => setScrubbing(false)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setTime(next);
            if (ref.current) ref.current.currentTime = next;
          }}
          aria-label={t.clips.seek}
          className="accent-primary h-1 flex-1 cursor-pointer"
        />

        <span className="shrink-0 font-mono text-[11px] text-white/80 tabular-nums">
          {clock(time)} / {clock(duration)}
        </span>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="grid size-7 shrink-0 place-items-center rounded-full text-white"
          aria-label={fullscreen ? t.clips.exitFullscreen : t.clips.fullscreen}
          title={fullscreen ? t.clips.exitFullscreen : t.clips.fullscreen}
        >
          {fullscreen ? (
            <Minimize className="size-4" aria-hidden />
          ) : (
            <Maximize className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Title, description, rating — and the category.
 *
 * A shooting clip uploaded as "technique" used to be fixable only by deleting
 * it and uploading again. The chips re-file it; the rating slider follows the
 * chosen category, because an attribute clip carries a rating and a highlights
 * clip does not (the server holds the same rule — see UpdateMediaDto).
 */
function EditClipForm({
  clip,
  onCancel,
  onSaved,
  onError,
}: {
  clip: Media;
  onCancel: () => void;
  onSaved: (media: Media) => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = React.useState(clip?.title ?? '');
  const [description, setDescription] = React.useState(clip?.description ?? '');
  const [category, setCategory] = React.useState<MediaCategory>(clip?.category);
  const isHighlight = category === 'MATCH_HIGHLIGHTS';

  const save = useMutation({
    mutationFn: () =>
      browserFetch<Media>(`/media/${clip?.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          description: description.trim(),
          // Only when it changed: re-filing drops the rating, so an unchanged
          // category must stay exactly the edit it has always been.
          ...(category !== clip?.category ? { category } : {}),
        },
      }),
    onSuccess: onSaved,
    onError: (err: Error) => onError(err.message),
  });

  return (
    <form
      className="border-border space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label={t.clips.clipTitle} htmlFor="edit-title">
        <Input
          id="edit-title"
          placeholder={t.placeholders.clipTitle}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field label={t.clips.changeCategory} htmlFor="edit-category">
        <div id="edit-category" className="flex flex-wrap gap-1.5" role="group">
          {ATTRIBUTE_KEYS.map((key) => (
            <CategoryOption
              key={key}
              active={category === ATTRIBUTE_CATEGORY[key]}
              onClick={() => setCategory(ATTRIBUTE_CATEGORY[key])}
            >
              {t.attributes[key]}
            </CategoryOption>
          ))}
          <CategoryOption active={isHighlight} onClick={() => setCategory('MATCH_HIGHLIGHTS')}>
            {t.attributes.highlights}
          </CategoryOption>
        </div>
      </Field>

      <Field label={t.clips.description} htmlFor="edit-desc">
        <Textarea
          id="edit-desc"
          placeholder={t.placeholders.clipDescription}
          value={description}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      {!isHighlight && category !== clip?.category && (
        <p className="text-muted text-xs">{t.clips.refileDropsRating}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={save.isPending}>
          {t.common.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function CategoryOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50',
      )}
    >
      {children}
    </button>
  );
}

/**
 * A coach replaces the number on the clip they are watching.
 *
 * One rating per clip, not two side by side: a card that showed "player says 90,
 * coach says 60" leaves the reader to decide which is true, and the whole point
 * of a coach's judgement is that it settles that. The previous value is not lost
 * — the server keeps it in the clip's rating history.
 */
function CoachRating({ clip, onRated }: { clip: Media; onRated: (media: Media) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [rating, setRating] = React.useState(clip?.rating ?? 50);

  const save = useMutation({
    mutationFn: () =>
      browserFetch<Media>(`/media/${clip?.id}/rating`, { method: 'PATCH', body: { rating } }),
    onSuccess: (media) => {
      onRated(media);
      void queryClient.invalidateQueries({ queryKey: ['player-clips', clip?.playerId] });
    },
  });

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t.clips.coachRating}</span>
        <span className="font-mono text-lg font-bold tabular-nums">{rating}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={rating}
        onChange={(event) => setRating(Number(event.target.value))}
        aria-label={t.clips.coachRating}
        className="accent-primary h-9 w-full"
      />
      <p className="text-muted text-xs">
        {clip?.reportedBy === 'COACH'
          ? t.clips.ratedByCoach
          : clip?.reportedBy === 'ADMIN'
            ? t.clips.ratedByAdmin
            : t.clips.ratedBySelf}
      </p>
      <div className="flex justify-end">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          {t.clips.saveRating}
        </Button>
      </div>
    </div>
  );
}

/**
 * The player disputes the number a coach or a moderator put on their clip.
 *
 * One press opens a box for the reason; the appeal lands on
 * /admin/moderation/appealed-rating and the decision comes back as a
 * notification. While one is pending the button says so and does nothing —
 * the same question is not asked twice.
 */
function AppealButton({ clip }: { clip: Media }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const latest = useQuery({
    queryKey: ['clip-appeal', clip?.id],
    queryFn: () => browserFetch<RatingAppeal | null>(`/media/${clip?.id}/appeal`),
  });
  const pending = latest.data?.status === 'PENDING';

  const send = useMutation({
    mutationFn: () =>
      browserFetch<RatingAppeal>(`/media/${clip?.id}/appeal`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['clip-appeal', clip?.id] });
    },
    onError: (problem: Error) => setError(problem.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending || latest.isPending}
        title={pending ? t.clips.appealPending : t.clips.appealRating}
        onClick={() => setOpen(true)}
      >
        <Scale aria-hidden /> {pending ? t.clips.appealPending : t.clips.appealRating}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="text-primary size-5" aria-hidden /> {t.clips.appealTitle}
            </DialogTitle>
            <DialogDescription>{t.clips.appealHint}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t.clips.appealReason} htmlFor="appeal-reason">
              <Textarea
                id="appeal-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t.clips.appealPlaceholder}
                rows={4}
                maxLength={1000}
                required
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              loading={send.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => send.mutate()}
            >
              <Send aria-hidden /> {t.clips.appealSend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
