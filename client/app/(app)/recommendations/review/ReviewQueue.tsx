'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, Video, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { CoachReview, Media } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { ClipTile } from '@/components/player/ClipTile';
import { ClipModal } from '@/components/player/ClipModal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { ageBand, formatDate, initials } from '@/lib/utils';

/** The eight the platform scores, in the order a coach reads them. */
const ATTRIBUTES = [
  'speed',
  'dribbling',
  'passing',
  'finishing',
  'physical',
  'vision',
  'leadership',
  'discipline',
] as const;

type Attribute = (typeof ATTRIBUTES)[number];
type Ratings = Record<Attribute, number>;

const DEFAULT_RATINGS = Object.fromEntries(ATTRIBUTES.map((key) => [key, 50])) as Ratings;

/**
 * A coach works through the players academies have sent them.
 *
 * ## The ratings are the point, not the verdict
 *
 * A player's own numbers are a claim; a coach's are evidence (§1.6), and this
 * screen is the only place the second kind gets written. So the clips come first
 * and the sliders sit under them — the coach is meant to watch, then score, then
 * decide, and the decision is the cheapest part of that.
 *
 * Approving requires every attribute; rejecting does not. A coach declining has
 * still watched the player and their numbers are worth having, but making them
 * fill in eight fields to say no is how "reject" quietly stops being used.
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
            key={review.id}
            review={review}
            pending={decide.isPending}
            onDecide={(body) => decide.mutate({ id: review.id, body })}
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
                <li key={review.id} className="flex flex-wrap items-center gap-3 p-2">
                  <Link
                    href={`/players/${review.recommendation.player.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {review.recommendation.player.firstName}{' '}
                    {review.recommendation.player.lastName}
                  </Link>
                  <span className="text-muted text-xs">
                    {review.decidedAt && formatDate(review.decidedAt)}
                  </span>
                  <Badge variant={review.status === 'APPROVED' ? 'success' : 'neutral'}>
                    {review.status === 'APPROVED'
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
  const player = review.recommendation.player;
  const [ratings, setRatings] = React.useState<Ratings>(DEFAULT_RATINGS);
  const [note, setNote] = React.useState('');
  const [openClipId, setOpenClipId] = React.useState<string | null>(null);

  // The clips are the evidence; without them the sliders are guesswork.
  const clips = useQuery({
    queryKey: ['player-clips', player.id],
    queryFn: () => browserFetch<Media[]>(`/media/player/${player.id}`),
  });

  const openClip = (clips.data ?? []).find((clip) => clip.id === openClipId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/players/${player.id}`}
              className="truncate text-base font-semibold hover:underline"
            >
              {player.firstName} {player.lastName}
            </Link>
            <p className="text-muted truncate text-xs">
              {[player.primaryPosition, ageBand(player.birthDate), player.region]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Badge variant="neutral">{review.academy.name}</Badge>
        </div>

        <p className="text-muted mt-1 flex items-center gap-1.5 text-xs">
          <Avatar
            src={review.recommendation.scout.avatarUrl}
            fallback={initials(
              review.recommendation.scout.firstName ?? '',
              review.recommendation.scout.lastName ?? '',
            )}
            className="size-5"
          />
          {review.recommendation.scout.firstName} {review.recommendation.scout.lastName}
          {review.recommendation.note && ` — ${review.recommendation.note}`}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {(clips.data ?? []).length === 0 ? (
          <p className="text-muted flex items-center gap-1.5 text-sm">
            <Video className="size-4" aria-hidden /> {t.recommendations.noClips}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:grid-cols-4">
            {(clips.data ?? []).map((clip) => (
              <li key={clip.id}>
                <ClipTile clip={clip} onOpen={() => setOpenClipId(clip.id)} />
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {ATTRIBUTES.map((attribute) => (
            <div key={attribute} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor={`${review.id}-${attribute}`} className="font-medium">
                  {t.attributes[attributeKey(attribute)]}
                </label>
                <span className="font-mono font-bold tabular-nums">{ratings[attribute]}</span>
              </div>
              <input
                id={`${review.id}-${attribute}`}
                type="range"
                min={0}
                max={100}
                value={ratings[attribute]}
                onChange={(event) =>
                  setRatings((current) => ({
                    ...current,
                    [attribute]: Number(event.target.value),
                  }))
                }
                className="accent-primary h-9 w-full"
              />
            </div>
          ))}
        </div>

        <Field label={t.recommendations.coachNote} htmlFor={`${review.id}-note`}>
          <Textarea
            id={`${review.id}-note`}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.placeholders.note}
          />
        </Field>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            className="text-danger"
            disabled={pending}
            onClick={() => onDecide({ decision: 'REJECTED', note: note.trim() || undefined })}
          >
            <X aria-hidden /> {t.recommendations.rejectPlayer}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onDecide({ decision: 'APPROVED', note: note.trim() || undefined, ...ratings })
            }
          >
            <Check aria-hidden /> {t.recommendations.approvePlayer}
          </Button>
        </div>
      </CardContent>

      {openClip && (
        <ClipModal
          clip={openClip}
          canEdit={false}
          open
          onOpenChange={(next) => !next && setOpenClipId(null)}
          onDeleted={() => setOpenClipId(null)}
          onUpdated={() => undefined}
        />
      )}
    </Card>
  );
}

/** The assessment columns and the attribute dictionary spell two of these differently. */
function attributeKey(attribute: Attribute) {
  const map = {
    speed: 'pace',
    dribbling: 'dribbling',
    passing: 'passing',
    finishing: 'finishing',
    physical: 'physical',
    vision: 'vision',
    leadership: 'leadership',
    discipline: 'discipline',
  } as const;
  return map[attribute];
}
