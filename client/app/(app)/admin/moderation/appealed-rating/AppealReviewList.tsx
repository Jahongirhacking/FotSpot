'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Equal, MessageSquareQuote, Scale, TriangleAlert } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { AppealedClip, Media, MediaCategory, RatingAppeal } from '@/lib/api/types';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS, CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { RatingInput } from '@/components/player/RatingInput';
import { ageBand, formatDateTime, initials } from '@/lib/utils';

/**
 * The appeals, one card each: the footage, who the player is, the number
 * they dispute and what they wrote — then the two things a moderator can do:
 * keep the rating, or save a new one. Either answers the appeal and tells
 * the player; the note travels with the answer.
 */
export function AppealReviewList({
  initial,
  page,
  pageSize,
  status,
}: {
  initial: Page<AppealedClip>;
  page: number;
  pageSize: number;
  status: 'PENDING' | 'RESOLVED';
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['rating-appeals', status, page, pageSize],
    queryFn: () =>
      browserFetch<Page<AppealedClip>>(
        `/moderation/appeals?status=${status}&page=${page}&pageSize=${pageSize}`,
      ),
    initialData: initial,
  });

  const refile = useMutation({
    mutationFn: ({ id, category }: { id: string; category: MediaCategory }) =>
      browserFetch<Media>(`/moderation/media/${id}/category`, {
        method: 'PATCH',
        body: { category },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['rating-appeals'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const resolve = useMutation({
    mutationFn: ({ id, rating, note }: { id: string; rating?: number; note?: string }) =>
      browserFetch<RatingAppeal>(`/moderation/appeals/${id}`, {
        method: 'PATCH',
        body: { ...(rating !== undefined ? { rating } : {}), ...(note ? { note } : {}) },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['rating-appeals'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <nav className="flex gap-1.5" aria-label={t.admin.appealedRatings}>
        {(['PENDING', 'RESOLVED'] as const).map((value) => (
          <Link
            key={value}
            href={
              value === 'PENDING'
                ? '/admin/moderation/appealed-rating'
                : '/admin/moderation/appealed-rating?status=RESOLVED'
            }
            aria-current={status === value ? 'page' : undefined}
            className={
              status === value
                ? 'border-primary bg-primary text-primary-foreground inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium'
                : 'border-border hover:border-primary/50 inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium'
            }
          >
            {value === 'PENDING' ? t.admin.appealsPending : t.admin.appealsResolved}
          </Link>
        ))}
      </nav>

      {error && <Alert tone="danger">{error}</Alert>}

      {items.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={t.admin.noAppeals}
          description={status === 'PENDING' ? t.admin.noAppealsHint : undefined}
        />
      ) : (
        items.map((appeal) => (
          <AppealCard
            key={appeal.id}
            appeal={appeal}
            busy={
              (resolve.isPending && resolve.variables?.id === appeal.id) ||
              (refile.isPending && refile.variables?.id === appeal.clip.id)
            }
            onRefile={(category) => refile.mutate({ id: appeal.clip.id, category })}
            onResolve={(rating, note) => resolve.mutate({ id: appeal.id, rating, note })}
          />
        ))
      )}
    </div>
  );
}

function AppealCard({
  appeal,
  busy,
  onRefile,
  onResolve,
}: {
  appeal: AppealedClip;
  busy: boolean;
  onRefile: (category: MediaCategory) => void;
  onResolve: (rating: number | undefined, note: string | undefined) => void;
}) {
  const { t } = useI18n();
  const { clip } = appeal;
  const resolved = appeal.status === 'RESOLVED';
  const isHighlight = clip.category === 'MATCH_HIGHLIGHTS';
  const attribute = CATEGORY_ATTRIBUTE[clip.category];
  const label = isHighlight
    ? t.attributes.highlights
    : attribute
      ? t.attributes[attribute]
      : clip.category;
  const name = [clip.player.firstName, clip.player.lastName].filter(Boolean).join(' ');
  const [draftRating, setDraftRating] = React.useState(clip.rating ?? 50);
  const [note, setNote] = React.useState('');
  const changed = clip.rating == null || draftRating !== clip.rating;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Who, and what they were rated. */}
        <header className="flex flex-wrap items-center gap-3">
          <Link
            href={`/players/${clip.player.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              src={clip.player.avatarUrl}
              fallback={initials(clip.player.firstName, clip.player.lastName)}
              className="size-10"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="text-muted block truncate text-xs">
                {[clip.player.primaryPosition, ageBand(clip.player.birthDate), clip.player.region]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </Link>
          <Badge variant="primary">{label}</Badge>
          <span className="flex items-baseline gap-1">
            <span className="text-muted text-xs">{t.admin.currentRating}</span>
            <span className="font-mono text-xl font-bold tabular-nums">{clip.rating ?? '—'}</span>
          </span>
          <Badge variant={resolved ? 'success' : 'warning'}>
            {resolved ? t.admin.appealsResolved : t.admin.appealsPending}
          </Badge>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* The footage. */}
          <div className="space-y-2">
            {clip.url ? (
              <video
                src={clip.url}
                poster={clip.posterUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-[60dvh] w-full rounded-lg bg-black"
              />
            ) : (
              <div className="bg-surface-3 text-muted grid aspect-video w-full place-items-center rounded-lg">
                <span className="flex flex-col items-center gap-1.5 px-4 text-center">
                  <TriangleAlert className="size-5" aria-hidden />
                  <span className="text-sm">{t.clips.noStorageOrigin}</span>
                </span>
              </div>
            )}
            {clip.title && <p className="text-sm font-medium">{clip.title}</p>}
            <p className="text-muted text-xs">
              {t.admin.uploadedAt}: {formatDateTime(clip.createdAt)}
            </p>
          </div>

          {/* The player's words, then the decision. */}
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-muted mb-1 flex items-center gap-1.5 text-xs">
                <MessageSquareQuote className="size-3.5" aria-hidden /> {t.admin.appealReason} ·{' '}
                {formatDateTime(appeal.createdAt)}
                {appeal.ratingAtAppeal != null &&
                  ` · ${t.admin.ratingAtAppeal} ${appeal.ratingAtAppeal}`}
              </p>
              <p className="text-sm whitespace-pre-wrap">{appeal.reason}</p>
            </div>

            {resolved ? (
              <div className="border-border rounded-lg border p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {appeal.decisionRating != null &&
                  appeal.ratingAtAppeal != null &&
                  appeal.decisionRating !== appeal.ratingAtAppeal ? (
                    <>
                      <Check className="text-success size-4" aria-hidden />
                      {t.admin.decisionChanged} {appeal.ratingAtAppeal} → {appeal.decisionRating}
                    </>
                  ) : (
                    <>
                      <Equal className="text-muted size-4" aria-hidden /> {t.admin.decisionKept}{' '}
                      {appeal.decisionRating ?? '—'}
                    </>
                  )}
                </p>
                {appeal.decisionNote && (
                  <p className="text-muted mt-1 whitespace-pre-wrap">{appeal.decisionNote}</p>
                )}
                {appeal.resolvedAt && (
                  <p className="text-muted mt-1 text-xs">
                    {formatDateTime(appeal.resolvedAt)}
                    {appeal.resolvedBy &&
                      ` · ${[appeal.resolvedBy.firstName, appeal.resolvedBy.lastName].filter(Boolean).join(' ')}`}
                  </p>
                )}
              </div>
            ) : (
              <>
                <Field
                  label={t.admin.attributeLabel}
                  htmlFor={`appeal-attr-${appeal.id}`}
                  hint={t.admin.attributeHint}
                >
                  <Select
                    id={`appeal-attr-${appeal.id}`}
                    value={clip.category}
                    disabled={busy}
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
                  <p className="text-muted text-xs">{t.admin.highlightsNoRating}</p>
                ) : (
                  <RatingInput
                    id={`appeal-rating-${appeal.id}`}
                    category={clip.category}
                    value={draftRating}
                    onChange={setDraftRating}
                    label={t.admin.newRating}
                    disabled={busy}
                  />
                )}

                <Field
                  label={t.admin.decisionNote}
                  htmlFor={`appeal-note-${appeal.id}`}
                  hint={t.common.optional}
                >
                  <Textarea
                    id={`appeal-note-${appeal.id}`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                </Field>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onResolve(undefined, note.trim() || undefined)}
                  >
                    <Equal aria-hidden /> {t.admin.keepRating}
                  </Button>
                  {!isHighlight && (
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={!changed}
                      onClick={() => onResolve(draftRating, note.trim() || undefined)}
                    >
                      <Check aria-hidden /> {t.admin.saveNewRating}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
