'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Mail, Send, ShieldCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyHistoryRow, RankedRecommendation } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Select, Textarea } from '@/components/ui/Field';
import { ageBand, formatDate } from '@/lib/utils';

interface Coach {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

/**
 * The manager's half of the review flow.
 *
 * A manager does not judge football — they employ coaches for that (§1.9). So an
 * inbox row offers one action, "send for review", and the only decision left to
 * the manager afterwards is whether the academy wants the player a coach has
 * approved. That is the invitation, and it carries a note because "an academy
 * wants you" with nothing about what happens next is not something a
 * fourteen-year-old's family can act on.
 *
 * Rejected and invited players leave the queue for the history below: an inbox
 * you cannot empty stops being a queue.
 *
 * Pending state is tracked per row, not per mutation. One `isPending` shared by
 * the list meant pressing "send for review" on one player put every other row's
 * button into a spinner — the screen said it was doing five things when it was
 * doing one.
 */
export function ReviewFlow({
  academyId,
  initialItems,
  initialHistory,
}: {
  academyId: string;
  initialItems: RankedRecommendation[];
  initialHistory: AcademyHistoryRow[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ['inbox-ranked', academyId],
    queryFn: () =>
      browserFetch<{ items: RankedRecommendation[] }>(
        `/recommendations/academy/${academyId}/ranked`,
      ),
    initialData: { items: initialItems },
  });

  const history = useQuery({
    queryKey: ['inbox-history', academyId],
    queryFn: () =>
      browserFetch<AcademyHistoryRow[]>(`/recommendations/academy/${academyId}/history`),
    initialData: initialHistory,
  });

  // Endorsed coaches are who a review can go to; the server enforces the same.
  const coaches = useQuery({
    queryKey: ['endorsed-coaches', academyId],
    queryFn: () =>
      browserFetch<{ userId: string; user: Coach }[]>(
        `/academies/${academyId}/endorsements?role=COACH`,
      ),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inbox-ranked', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-history', academyId] });
  };

  const assign = useMutation({
    mutationFn: ({ id, coachUserId }: { id: string; coachUserId?: string }) =>
      browserFetch(`/recommendations/${id}/review`, {
        method: 'POST',
        body: coachUserId ? { coachUserId } : {},
      }),
    onSuccess: refresh,
  });

  const invite = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      browserFetch(`/recommendations/${id}/invite`, { method: 'POST', body: { note } }),
    onSuccess: refresh,
  });

  const items = inbox.data?.items ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="text-primary size-4" aria-hidden />
            {t.recommendations.fromEndorsedScouts}
          </CardTitle>
          <p className="text-muted text-sm">{t.recommendations.reviewFlowHint}</p>
        </CardHeader>

        <CardContent className="p-2">
          {items.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title={t.recommendations.inboxEmpty} />
          ) : (
            <ul className="divide-border divide-y">
              {items.map((item) => (
                <InboxRow
                  key={item.playerId}
                  item={item}
                  coaches={(coaches.data ?? []).map((row) => row.user ?? { id: row.userId })}
                  // Only the row actually being sent, not the whole list.
                  pending={
                    (assign.isPending && assign.variables?.id === item.recommendationIds[0]) ||
                    (invite.isPending && invite.variables?.id === item.recommendationIds[0])
                  }
                  onAssign={(coachUserId) =>
                    assign.mutate({ id: item.recommendationIds[0], coachUserId })
                  }
                  onInvite={(note) => invite.mutate({ id: item.recommendationIds[0], note })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.recommendations.history}</CardTitle>
          <p className="text-muted text-sm">{t.recommendations.historyHint}</p>
        </CardHeader>
        <CardContent className="p-2">
          {(history.data ?? []).length === 0 ? (
            <EmptyState icon={ClipboardCheck} title={t.recommendations.historyEmpty} />
          ) : (
            <ul className="divide-border divide-y">
              {(history.data ?? []).map((row) => (
                <li key={row.recommendationId} className="flex flex-wrap items-center gap-3 p-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/players/${row.player?.id ?? ''}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {row.player?.firstName} {row.player?.lastName}
                    </Link>
                    <p className="text-muted truncate text-xs">
                      {[
                        row.player?.primaryPosition,
                        row.player?.birthDate && ageBand(row.player.birthDate),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {row.review?.coach &&
                        ` · ${row.review.coach.firstName ?? ''} ${row.review.coach.lastName ?? ''}`.trimEnd()}
                      {' · '}
                      {formatDate(row.decidedAt)}
                    </p>
                  </div>
                  <Badge variant={row.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                    {row.status === 'ACCEPTED'
                      ? t.recommendations.invited
                      : t.recommendations.rejected}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InboxRow({
  item,
  coaches,
  pending,
  onAssign,
  onInvite,
}: {
  item: RankedRecommendation;
  coaches: Coach[];
  pending: boolean;
  onAssign: (coachUserId?: string) => void;
  onInvite: (note: string) => void;
}) {
  const { t, f } = useI18n();
  const [coachUserId, setCoachUserId] = React.useState('');
  const [note, setNote] = React.useState('');
  const review = item.review;

  return (
    <li className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/players/${item.playerId}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-sm font-medium">
            {item.player ? `${item.player.firstName} ${item.player.lastName}` : item.playerId}
          </span>
          <span className="text-muted block truncate text-xs">
            {[
              item.player?.primaryPosition,
              item.player && ageBand(item.player.birthDate),
              item.player?.region,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' · '}
            {f(t.recommendations.backedBy, { count: item.recommendationCount })}
          </span>
        </Link>

        {review ? (
          <Badge
            variant={
              review.status === 'APPROVED'
                ? 'success'
                : review.status === 'REJECTED'
                  ? 'neutral'
                  : 'warning'
            }
          >
            {review.status === 'APPROVED'
              ? t.recommendations.coachApproved
              : review.status === 'REJECTED'
                ? t.recommendations.coachRejected
                : t.recommendations.inReview}
          </Badge>
        ) : (
          <Badge variant="neutral">{t.recommendations.notReviewed}</Badge>
        )}
      </div>

      {review && (
        <p className="text-muted truncate text-xs">
          {[review.coach.firstName, review.coach.lastName].filter(Boolean).join(' ')}
          {review.note ? ` — ${review.note}` : ''}
        </p>
      )}

      {/* Not yet with a coach: pick one, or let the server take the one carrying
          the fewest open reviews. */}
      {/* One line, no field label: the placeholder option already says what the
          select is for, and a label per row turned the list into a form. */}
      {!review && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t.recommendations.sendToCoach}
            value={coachUserId}
            onChange={(event) => setCoachUserId(event.target.value)}
            className="min-w-40 flex-1"
          >
            <option value="">{t.recommendations.anyCoach}</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {[coach.firstName, coach.lastName].filter(Boolean).join(' ') ||
                  coach.username ||
                  coach.id.slice(0, 8)}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            loading={pending}
            onClick={() => onAssign(coachUserId || undefined)}
            className="min-h-11"
          >
            <Send aria-hidden /> {t.recommendations.sendForReview}
          </Button>
        </div>
      )}

      {/* Approved: the manager's own decision, and the note the player reads. */}
      {review?.status === 'APPROVED' && (
        <div className="space-y-2">
          <Textarea
            aria-label={t.recommendations.inviteNote}
            value={note}
            maxLength={1000}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.placeholders.inviteNote}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={pending}
              disabled={!note.trim()}
              onClick={() => onInvite(note.trim())}
            >
              <Mail aria-hidden /> {t.recommendations.sendInvite}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
