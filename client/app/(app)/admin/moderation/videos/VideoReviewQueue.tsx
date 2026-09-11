'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, ShieldOff, Trash2, TriangleAlert, Video } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { Media, MediaCategory, PendingClip } from '@/lib/api/types';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS, CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RatingInput } from '@/components/player/RatingInput';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';
import { ageBand, formatDate, initials } from '@/lib/utils';

/**
 * The admin moderation feed: every clip that nobody has watched yet.
 *
 * ## Why the buttons are not symmetrical
 *
 * Verify has no confirmation and Block does, because they are not two options on
 * one axis. Verify is the normal outcome of reviewing an ordinary clip — a queue
 * that asked "are you sure" a hundred times a session would train the moderator
 * to dismiss the dialog, which is exactly the habit you do not want them to have
 * when a dialog finally matters. It is also the recoverable direction: an
 * approved clip can still be reported, flagged and taken down.
 *
 * Block ends the clip's life on the platform, so it asks once.
 *
 * Delete is a third thing again, and deliberately does not look like Block. It
 * destroys the row and the files, only a super admin can do it, and confirming
 * means typing the word — the extra friction is the point, because the mistake it
 * prevents cannot be undone by anybody at any later time.
 *
 * ## Nothing here filters
 *
 * The queue is whatever `/moderation/media/pending` returns. It cannot fetch
 * everything and hide the decided ones in React: an unverified clip is a minute
 * of unreviewed video of a child, and the network response is a place it must
 * never be.
 */
export function VideoReviewQueue({
  initial,
  page,
  pageSize,
  canDelete,
}: {
  initial: Page<PendingClip>;
  /** Which page the URL asked for — the server fetched `initial` for it. */
  page: number;
  pageSize: number;
  /** The viewer is acting as a super admin. The API refuses regardless. */
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [blocking, setBlocking] = React.useState<PendingClip | null>(null);
  const [deleting, setDeleting] = React.useState<PendingClip | null>(null);

  const { data } = useQuery({
    // The page is part of the key: a decision refetches *this* page, and moving
    // to another page is another query rather than a filter over this one.
    queryKey: ['pending-clips', page, pageSize],
    queryFn: () =>
      browserFetch<Page<PendingClip>>(
        `/moderation/media/pending?page=${page}&pageSize=${pageSize}`,
      ),
    initialData: initial,
  });

  /*
   * One mutation for all three decisions.
   *
   * They differ in method and in what the UI asks first, not in what happens
   * afterwards: the clip leaves this queue and the list is refetched from the
   * server. Refetched rather than spliced out locally — a second moderator may
   * have decided something else in the meantime, and the queue should show that
   * rather than a stale list minus one card.
   */
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'verify' | 'block' | 'delete' }) =>
      action === 'delete'
        ? browserFetch(`/moderation/media/${id}`, { method: 'DELETE' })
        : browserFetch(`/moderation/media/${id}/${action}`, { method: 'PATCH' }),
    onSuccess: () => {
      setError(null);
      setBlocking(null);
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['pending-clips'] });
    },
    // Includes the 409 raised when another moderator got there first, which names
    // what they decided — see ModerationService.decide.
    onError: (err: Error) => setError(err.message),
  });

  /*
   * What the moderator says about the clip before deciding on it: which
   * attribute the footage actually shows, and the number. Both are saved on
   * their own and the queue re-fetched, so Verify can read the row as it now
   * is — a clip cannot be verified without a rating (highlights excepted:
   * they carry none).
   */
  const refile = useMutation({
    mutationFn: ({ id, category }: { id: string; category: MediaCategory }) =>
      browserFetch<Media>(`/moderation/media/${id}/category`, {
        method: 'PATCH',
        body: { category },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['pending-clips'] });
    },
    onError: (err: Error) => setError(err.message),
  });
  const rate = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) =>
      browserFetch<Media>(`/moderation/media/${id}/rating`, {
        method: 'PATCH',
        body: { rating },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['pending-clips'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const clips = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {clips.length === 0 ? (
        <EmptyState
          icon={Video}
          title={t.admin.noPendingClips}
          description={t.admin.noPendingClipsHint}
        />
      ) : (
        clips.map((clip) => (
          <ReviewCard
            key={clip.id}
            clip={clip}
            busy={decide.isPending}
            saving={
              (refile.isPending && refile.variables?.id === clip.id) ||
              (rate.isPending && rate.variables?.id === clip.id)
            }
            canDelete={canDelete}
            onVerify={() => decide.mutate({ id: clip.id, action: 'verify' })}
            onBlock={() => setBlocking(clip)}
            onDelete={() => setDeleting(clip)}
            onRefile={(category) => refile.mutate({ id: clip.id, category })}
            onRate={(rating) => rate.mutate({ id: clip.id, rating })}
          />
        ))
      )}

      <Pagination page={page} pageSize={pageSize} total={total} />

      {/* Block: one deliberate confirmation, stating what blocking does. */}
      <Dialog open={Boolean(blocking)} onOpenChange={(next) => !next && setBlocking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="text-danger size-5" aria-hidden /> {t.admin.blockClipTitle}
            </DialogTitle>
            <DialogDescription>{t.admin.blockClipBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocking(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => blocking && decide.mutate({ id: blocking.id, action: 'block' })}
            >
              <ShieldOff aria-hidden /> {t.admin.blockClip}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete: a different shape of confirmation on purpose — see the note above. */}
      <DeleteClipDialog
        clip={deleting}
        busy={decide.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={(id) => decide.mutate({ id, action: 'delete' })}
      />
    </div>
  );
}

/**
 * One clip awaiting a decision: the video, who uploaded it, and the two buttons.
 *
 * The video is a real `<video>` with controls, unlike the feed's tiles — a
 * moderator has to be able to scrub through a minute of footage before ruling on
 * it, and a poster with a play button is not a review tool. There is one card
 * expanded at a time in practice because the queue is worked top-down, and
 * `preload="metadata"` keeps the ones below it from downloading until reached.
 */
function ReviewCard({
  clip,
  busy,
  saving,
  canDelete,
  onVerify,
  onBlock,
  onDelete,
  onRefile,
  onRate,
}: {
  clip: PendingClip;
  busy: boolean;
  saving: boolean;
  canDelete: boolean;
  onVerify: () => void;
  onBlock: () => void;
  onDelete: () => void;
  onRefile: (category: MediaCategory) => void;
  onRate: (rating: number) => void;
}) {
  const { t } = useI18n();
  const isHighlight = clip.category === 'MATCH_HIGHLIGHTS';
  // The slider starts on the clip's rating, or in the middle; saving is a press.
  const [draftRating, setDraftRating] = React.useState(clip.rating ?? 50);
  const ratingSaved = clip.rating != null && draftRating === clip.rating;
  // Verify waits for a rating. Highlights carry none, so they are verified as they are.
  const canVerify = isHighlight || clip.rating != null;
  const attribute = CATEGORY_ATTRIBUTE[clip.category];
  const label =
    clip.category === 'MATCH_HIGHLIGHTS'
      ? t.attributes.highlights
      : attribute
        ? t.attributes[attribute]
        : clip.category;

  const name = [clip.player.firstName, clip.player.lastName].filter(Boolean).join(' ');

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <header className="flex flex-wrap items-center gap-3">
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
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="text-muted block truncate text-xs">
                {[
                  clip.player.primaryPosition,
                  ageBand(clip.player.birthDate),
                  clip.player.region,
                  clip.player.district,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </Link>
          <Badge variant="primary">{label}</Badge>
          {clip.rating != null && <Badge variant="neutral">{clip.rating}</Badge>}
          {/* Still being optimised: what plays here is the original the player
              uploaded, and verifying publishes it as that. The optimised copy
              replaces it under the same key when the worker is done — no
              second review. */}
          {clip.status === 'PROCESSING' && (
            <Badge variant="info" title={t.admin.processingReviewHint}>
              <Clock aria-hidden /> {t.admin.statusLabels.PROCESSING}
            </Badge>
          )}
        </header>

        {clip.status === 'PROCESSING' && (
          <p className="text-muted text-xs">{t.admin.processingReviewHint}</p>
        )}
        {/* The worker gave up; the uploaded file is still under the key and is
            what plays here. Verifying publishes it as that; "Process again" on
            the status list re-runs the worker without touching the decision. */}
        {clip.status === 'FAILED' && (
          <p className="text-warning flex items-start gap-1.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {t.admin.statusLabels.FAILED}
              {clip.failureReason ? ` — ${clip.failureReason}` : ''}. {t.admin.failedReviewHint}
            </span>
          </p>
        )}

        {clip.url ? (
          <video
            src={clip.url}
            poster={clip.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-[70dvh] w-full rounded-lg bg-black"
          />
        ) : (
          /* The row is here but no URL could be signed — storage is unconfigured.
             Say so, rather than showing a player that never starts: a moderator
             must never be asked to rule on a video they could not watch. */
          <div className="bg-surface-3 text-muted grid aspect-video w-full place-items-center rounded-lg">
            <span className="flex flex-col items-center gap-1.5 px-4 text-center">
              <TriangleAlert className="size-5" aria-hidden />
              <span className="text-sm">{t.clips.noStorageOrigin}</span>
            </span>
          </div>
        )}

        {clip.title && <p className="text-sm font-medium">{clip.title}</p>}
        {clip.description && <p className="text-muted text-sm">{clip.description}</p>}

        <p className="text-muted text-xs">
          {t.admin.uploadedAt}: {formatDate(clip.createdAt)}
        </p>

        {/* The moderator's judgement, before the decision: which skill the
            footage shows, and the number. The player picked the attribute and
            can no longer rate; both are corrected here. */}
        <div className="border-border grid gap-4 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field
            label={t.admin.attributeLabel}
            htmlFor={`attr-${clip.id}`}
            hint={t.admin.attributeHint}
          >
            <Select
              id={`attr-${clip.id}`}
              value={clip.category}
              disabled={saving || busy}
              onChange={(event) => onRefile(event.target.value as MediaCategory)}
            >
              {ATTRIBUTE_KEYS.map((key) => (
                <option key={key} value={ATTRIBUTE_CATEGORY[key]}>
                  {t.attributes[key]}
                </option>
              ))}
              <option value="MATCH_HIGHLIGHTS">{t.attributes.highlights}</option>
            </Select>
          </Field>
          {isHighlight ? (
            <p className="text-muted self-center text-xs">{t.admin.highlightsNoRating}</p>
          ) : (
            <div className="space-y-2">
              <RatingInput
                id={`rating-${clip.id}`}
                category={clip.category}
                value={draftRating}
                onChange={setDraftRating}
                label={t.admin.moderationRating}
                disabled={saving || busy}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted text-xs">
                  {clip.rating == null
                    ? t.admin.verifyNeedsRating
                    : ratingSaved
                      ? t.admin.ratingSaved
                      : t.admin.ratingUnsaved}
                </span>
                <Button
                  size="sm"
                  variant={ratingSaved ? 'outline' : 'primary'}
                  loading={saving}
                  disabled={busy || ratingSaved}
                  onClick={() => onRate(draftRating)}
                >
                  <Check aria-hidden /> {t.clips.saveRating}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* No dialog. Verifying is the ordinary outcome and the queue has to be
              workable at speed — see the note on VideoReviewQueue. Disabled, not
              hidden, until the clip has a rating: the button says what is missing. */}
          <Button
            size="sm"
            disabled={busy || !canVerify}
            title={canVerify ? undefined : t.admin.verifyNeedsRating}
            onClick={onVerify}
          >
            <Check aria-hidden /> {t.admin.verifyClip}
          </Button>

          <Button size="sm" variant="danger" disabled={busy} onClick={onBlock}>
            <ShieldOff aria-hidden /> {t.admin.blockClip}
          </Button>

          {/* Set apart from the two moderation decisions, and only for a super
              admin. A plain admin is not shown a button the API would refuse. */}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger ml-auto"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 aria-hidden /> {t.admin.deleteClip}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The destructive confirmation, deliberately not shaped like Block's.
 *
 * Typing the word is friction chosen on purpose: this is the one action in the
 * queue that no later decision can undo, and a moderator who has pressed
 * "confirm" forty times today should not be able to erase a player's video with
 * the same reflex. The word comes from the dictionary, so it is the word the
 * reader actually sees rather than an English constant.
 */
function DeleteClipDialog({
  clip,
  busy,
  onCancel,
  onConfirm,
}: {
  clip: PendingClip | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = React.useState('');

  /*
   * Cleared whenever the dialog is pointed at a different clip, so a confirmed
   * word cannot carry over to the next video the moderator opens.
   *
   * Both sides of the comparison are normalised to `string | null`. Testing
   * `clip?.id` (undefined when the dialog is closed) against a stored value
   * coerced to `null` is never equal, so the reset ran on every render and React
   * stopped it as an infinite loop — the "Too many re-renders" this dialog threw
   * as soon as the queue mounted. Normalising once, above the comparison, is what
   * makes this the documented render-time reset rather than a loop.
   */
  const clipId = clip?.id ?? null;
  const [lastClipId, setLastClipId] = React.useState<string | null>(clipId);
  if (clipId !== lastClipId) {
    setLastClipId(clipId);
    setTyped('');
  }

  const word = t.admin.deleteClipWord;
  const confirmed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  return (
    <Dialog open={Boolean(clip)} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-danger flex items-center gap-2">
            <Trash2 className="size-5" aria-hidden /> {t.admin.deleteClipTitle}
          </DialogTitle>
          <DialogDescription>{t.admin.deleteClipBody}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Alert tone="danger">{t.admin.deleteClipBody}</Alert>
          <Field
            className="mt-3"
            label={t.admin.deleteClipConfirm.replace('{word}', word)}
            htmlFor="delete-clip-confirm"
            required
          >
            <Input
              id="delete-clip-confirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!confirmed}
            onClick={() => clip && onConfirm(clip.id)}
          >
            <Trash2 aria-hidden /> {t.admin.deleteClip}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
