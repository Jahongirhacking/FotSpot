'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { useSession } from '@/components/layout/SessionProvider';
import { ClipModerationNote, useClipModerationCopy } from '@/components/player/ClipModerationBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { Media, MediaCategory } from '@/lib/api/types';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS, CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { cn, formatDate } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Pause, Pencil, Play, Trash2, TriangleAlert, Trophy } from 'lucide-react';
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
                  <span className="text-prov-self font-mono text-lg font-bold">{clip?.rating}</span>
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
              <div className="ml-auto flex gap-1">
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
 * Video with a scrubber and nothing else.
 *
 * `timeupdate` fires about four times a second, which is enough for a progress
 * bar and far cheaper than a rAF loop on a phone. While the user is dragging, the
 * bar follows the pointer rather than the video, so it does not fight them.
 */
function ClipPlayer({ src }: { src: string }) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [scrubbing, setScrubbing] = React.useState(false);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
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
        className="max-h-[60dvh] w-full cursor-pointer"
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
  const [rating, setRating] = React.useState(clip?.rating ?? 50);
  const [category, setCategory] = React.useState<MediaCategory>(clip?.category);
  const isHighlight = category === 'MATCH_HIGHLIGHTS';

  const save = useMutation({
    mutationFn: () =>
      browserFetch<Media>(`/media/${clip?.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          description: description.trim(),
          // Only when it changed: an unchanged category with an unchanged
          // rating must stay exactly the edit it has always been.
          ...(category !== clip?.category ? { category } : {}),
          ...(isHighlight ? {} : { rating: rating }),
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

      {!isHighlight && (
        <Field
          label={`${t.clips.yourRating}: ${rating}`}
          htmlFor="edit-rating"
          hint={t.clips.ratingHint}
        >
          <input
            id="edit-rating"
            type="range"
            min={0}
            max={100}
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            className="accent-primary w-full"
          />
        </Field>
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
        {clip?.reportedBy === 'COACH' ? t.clips.ratedByCoach : t.clips.ratedBySelf}
      </p>
      <div className="flex justify-end">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          {t.clips.saveRating}
        </Button>
      </div>
    </div>
  );
}
