'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, TriangleAlert, Video, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { CoachReview, Media } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { ClipTile } from '@/components/player/ClipTile';
import { ClipModal } from '@/components/player/ClipModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { ageBand, formatDate } from '@/lib/utils';

/**
 * A coach works through the players academies have sent them.
 *
 * ## A coach is never told who recommended the player
 *
 * No scout name, no scout note, nothing that hints at one. The judgement asked
 * of a coach is about the player — the clips, the numbers, the position — and
 * knowing a Legendary Scout put somebody forward is a thumb on the scale before
 * the first clip plays. It would also make the reputation system circular: a
 * scout's standing summarises how their picks were judged, so letting it colour
 * the judging is how a good record starts defending itself.
 *
 * ## The clips are the question; the answer is one button
 *
 * An online review asks a coach whether this player is worth a real look. That
 * is a yes or a no, and the evidence for it is the clips — which is why they
 * fill the card and the two buttons sit under them.
 *
 * There are no attribute sliders. Requiring eight numbers to say yes made the
 * cheap decision the expensive one, and a coach reading clips on a phone at the
 * side of a pitch is exactly the person that cost falls on.
 *
 * ## Why both answers confirm
 *
 * Neither can be taken back. An accept commits the academy to inviting somebody
 * to a real session; a reject ends the line for this academy and starts the
 * scout's cooldown. So each opens a short warning that says what follows, and
 * the coach confirms from there rather than from a press that could have been a
 * mis-tap.
 */
export function ReviewQueue({
  initialPending,
  initialDecided,
}: {
  initialPending: CoachReview[];
  initialDecided: CoachReview[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['my-reviews', 'PENDING'],
    queryFn: () => browserFetch<CoachReview[]>('/recommendations/reviews/mine?status=PENDING'),
    initialData: initialPending,
  });

  const decided = useQuery({
    queryKey: ['my-reviews', 'DECIDED'],
    queryFn: () => browserFetch<CoachReview[]>('/recommendations/reviews/mine?status=DECIDED'),
    initialData: initialDecided,
  });

  const decide = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      browserFetch(`/recommendations/reviews/${id}/decision`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
    },
    meta: { success: t.recommendations.reviewDecided },
  });

  return (
    <div className="space-y-6">
      {(pending.data ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t.recommendations.noReviews}
          description={t.recommendations.noReviewsHint}
        />
      ) : (
        (pending.data ?? []).map((review) => (
          <ReviewCard
            key={review?.id}
            review={review}
            pending={decide.isPending}
            onDecide={(body) => decide.mutate({ id: review?.id, body })}
          />
        ))
      )}

      {(decided.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.recommendations.reviewed}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ul className="divide-border divide-y">
              {(decided.data ?? []).map((review) => (
                <li key={review?.id} className="flex flex-wrap items-center gap-3 p-2">
                  <Link
                    href={`/players/${review?.player?.id ?? ''}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {review?.player?.firstName} {review?.player?.lastName}
                  </Link>
                  <span className="text-muted text-xs">
                    {review?.decidedAt && formatDate(review?.decidedAt)}
                  </span>
                  <Badge variant={review?.status === 'APPROVED' ? 'success' : 'neutral'}>
                    {review?.status === 'APPROVED'
                      ? t.recommendations.approved
                      : t.recommendations.rejected}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  pending,
  onDecide,
}: {
  review: CoachReview;
  pending: boolean;
  onDecide: (body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  // The player hangs off the review, not the recommendation — a review the
  // academy started itself has no recommendation, and the coach still has to see
  // whose profile they are reading.
  const player = review?.player;
  const [note, setNote] = React.useState('');
  const [openClipId, setOpenClipId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<'APPROVED' | 'REJECTED' | null>(null);

  // The clips are the evidence; without them the sliders are guesswork.
  const clips = useQuery({
    queryKey: ['player-clips', player?.id],
    // Paginated now; the review panel wants the newest page, which is what the
    // bars are drawn from anyway.
    queryFn: () =>
      browserFetch<Page<Media>>(`/media/player/${player?.id}`).then((page) => page.items),
    enabled: Boolean(player?.id),
  });

  const openClip = (clips?.data ?? []).find((clip) => clip?.id === openClipId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/players/${player?.id ?? ''}`}
              className="truncate text-base font-semibold hover:underline"
            >
              {player?.firstName} {player?.lastName}
            </Link>
            <p className="text-muted truncate text-xs">
              {[
                player?.primaryPosition,
                player?.birthDate && ageBand(player?.birthDate),
                player?.region,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Badge variant="neutral">{review?.academy?.name}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(clips?.data ?? []).length === 0 ? (
          <p className="text-muted flex items-center gap-1.5 text-sm">
            <Video className="size-4" aria-hidden /> {t.recommendations.noClips}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:grid-cols-4">
            {(clips?.data ?? []).map((clip) => (
              <li key={clip?.id}>
                <ClipTile clip={clip} onOpen={() => setOpenClipId(clip?.id)} />
              </li>
            ))}
          </ul>
        )}

        <Field label={t.recommendations.coachNote} htmlFor={`${review?.id}-note`}>
          <Textarea
            id={`${review?.id}-note`}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.placeholders.note}
          />
        </Field>

        {confirming ? (
          <Alert tone="warning">
            <span className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="space-y-2">
                <span className="block font-medium">
                  {confirming === 'APPROVED'
                    ? t.recommendations.confirmApproveTitle
                    : t.recommendations.confirmRejectTitle}
                </span>
                <span className="block text-sm">
                  {confirming === 'APPROVED'
                    ? t.recommendations.confirmApproveBody
                    : t.recommendations.confirmRejectBody}
                </span>
                <span className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    {t.common.cancel}
                  </Button>
                  <Button
                    size="sm"
                    loading={pending}
                    onClick={() => {
                      onDecide({ decision: confirming, note: note.trim() || undefined });
                      setConfirming(null);
                    }}
                  >
                    {confirming === 'APPROVED'
                      ? t.recommendations.approvePlayer
                      : t.recommendations.rejectPlayer}
                  </Button>
                </span>
              </span>
            </span>
          </Alert>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={() => setConfirming('REJECTED')}
            >
              <X aria-hidden /> {t.recommendations.rejectPlayer}
            </Button>
            <Button disabled={pending} onClick={() => setConfirming('APPROVED')}>
              <Check aria-hidden /> {t.recommendations.approvePlayer}
            </Button>
          </div>
        )}
      </CardContent>

      {openClip && (
        <ClipModal
          clip={openClip}
          canEdit={false}
          // This screen is only reachable by the coach the review was assigned
          // to; the server checks the coach profile again before writing.
          canRate
          open
          onOpenChange={(next) => !next && setOpenClipId(null)}
          onDeleted={() => setOpenClipId(null)}
          onUpdated={() => undefined}
        />
      )}
    </Card>
  );
}
