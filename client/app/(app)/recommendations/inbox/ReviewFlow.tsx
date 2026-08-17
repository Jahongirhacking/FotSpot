'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ClipboardCheck, Hourglass, Send, ShieldCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyHistoryRow, RankedRecommendation } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { ageBand, formatDate } from '@/lib/utils';
import {
  EMPTY_INBOX_FILTERS,
  filterInbox,
  InboxFilters,
  type InboxFilterState,
} from './InboxFilters';
import { InviteToPrivateTrialDialog } from '@/components/trials/InviteToPrivateTrialDialog';

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
  const [filters, setFilters] = React.useState<InboxFilterState>(EMPTY_INBOX_FILTERS);

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
    // Keyed on the player: a review is about who is being judged, and the
    // recommendation is only how they reached this inbox.
    mutationFn: ({ id, coachUserId }: { id: string; coachUserId?: string }) =>
      browserFetch(`/recommendations/players/${id}/review`, {
        method: 'POST',
        body: coachUserId ? { coachUserId } : {},
      }),
    onSuccess: refresh,
    meta: { success: t.recommendations.sentForReview },
  });

  const items = inbox.data?.items ?? [];
  const historyRows = history.data ?? [];

  // One bar over every list: a manager looking for a name does not know, and
  // should not have to know, which stage that player has reached.
  const shown = filterInbox(items, filters);
  const shownHistory = filterInbox(historyRows, filters);

  // The queue is two questions, not one. "Nobody has looked at this yet" is a
  // decision waiting on the manager; "a coach has it" and "a coach approved it"
  // are work already in motion. Mixed together, the second kind buries the
  // first — which is the only one the manager can act on today.
  const arrived = shown.filter((item) => !item?.review);
  const active = shown.filter((item) => item?.review);

  return (
    <div className="space-y-6">
      <InboxFilters rows={[...items, ...historyRows]} value={filters} onChange={setFilters} />

      <QueueCard
        icon={ShieldCheck}
        title={t.recommendations.fromEndorsedScouts}
        hint={t.recommendations.reviewFlowHint}
        rows={arrived}
        emptyTitle={items?.length === 0 ? t.recommendations.inboxEmpty : t.player.noMatches}
        emptyHint={items?.length === 0 ? t.admin.noReviewsHint : t.player.noMatchesHint}
        academyId={academyId}
        coaches={(coaches?.data ?? []).map((row) => row?.user ?? { id: row?.userId })}
        assign={assign}
      />

      <QueueCard
        icon={Hourglass}
        title={t.recommendations.activeSection}
        hint={t.recommendations.activeSectionHint}
        rows={active}
        emptyTitle={t.recommendations.activeEmpty}
        emptyHint={t.admin.noReviewsHint}
        academyId={academyId}
        coaches={(coaches?.data ?? []).map((row) => row?.user ?? { id: row?.userId })}
        assign={assign}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.recommendations.history}</CardTitle>
          <p className="text-muted text-sm">{t.recommendations.historyHint}</p>
        </CardHeader>
        <CardContent className="p-2">
          {shownHistory.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={historyRows.length === 0 ? t.recommendations.historyEmpty : t.player.noMatches}
              // Two different empties: nothing has happened yet, or a filter hid
              // it. Saying which is the difference between waiting and clearing
              // the search box.
              description={
                historyRows.length === 0 ? t.admin.noReviewsHint : t.player.noMatchesHint
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {shownHistory.map((row) => (
                <li key={row?.recommendationId} className="flex flex-wrap items-center gap-3 p-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/players/${row?.player?.id ?? ''}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {row?.player?.firstName} {row?.player?.lastName}
                    </Link>
                    <p className="text-muted truncate text-xs">
                      {[
                        row?.player?.primaryPosition,
                        row?.player?.birthDate && ageBand(row?.player.birthDate),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {row?.review?.coach &&
                        ` · ${row?.review.coach.firstName ?? ''} ${row?.review.coach.lastName ?? ''}`.trimEnd()}
                      {' · '}
                      {formatDate(row?.decidedAt)}
                    </p>
                  </div>
                  {/* Three outcomes, not two. "Invited" is what most rows here
                      are: the academy acted, and the trial will answer the
                      recommendation later. */}
                  <Badge
                    variant={
                      row?.invitation
                        ? 'primary'
                        : row?.status === 'ACCEPTED'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {row?.invitation
                      ? `${t.recommendations.invited}${row?.invitation.date ? ` · ${formatDate(row?.invitation.date)}` : ''}`
                      : row?.status === 'ACCEPTED'
                        ? t.recommendations.statusAccepted
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

/**
 * One stage of the queue.
 *
 * The rows are identical in both sections — a player who has come back approved
 * still shows what a coach said and who said it — so the card is the only thing
 * that differs, and it differs only in what it is called.
 */
function QueueCard({
  icon: Icon,
  title,
  hint,
  rows,
  emptyTitle,
  emptyHint,
  academyId,
  coaches,
  assign,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  rows: RankedRecommendation[];
  emptyTitle: string;
  /** Passed in because this component has no dictionary of its own. */
  emptyHint?: string;
  academyId: string;
  coaches: Coach[];
  assign: UseMutationResult<unknown, Error, { id: string; coachUserId?: string }, unknown>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary size-4" aria-hidden />
          {title}
          {rows?.length > 0 && <Badge variant="neutral">{rows?.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{hint}</p>
      </CardHeader>

      <CardContent className="p-2">
        {rows?.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={emptyTitle} description={emptyHint} />
        ) : (
          <ul className="divide-border divide-y">
            {rows?.map((item) => (
              <InboxRow
                key={item?.playerId}
                item={item}
                academyId={academyId}
                coaches={coaches}
                // Only the row actually being sent, not the whole list.
                pending={assign.isPending && assign.variables?.id === item?.playerId}
                onAssign={(coachUserId) => assign.mutate({ id: item?.playerId, coachUserId })}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InboxRow({
  item,
  academyId,
  coaches,
  pending,
  onAssign,
}: {
  item: RankedRecommendation;
  academyId: string;
  coaches: Coach[];
  pending: boolean;
  onAssign: (coachUserId?: string) => void;
}) {
  const { t, f } = useI18n();
  const [coachUserId, setCoachUserId] = React.useState('');
  const review = item?.review;

  return (
    <li className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/players/${item?.playerId}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-sm font-medium">
            {item?.player ? `${item?.player.firstName} ${item?.player.lastName}` : item?.playerId}
          </span>
          <span className="text-muted block truncate text-xs">
            {[
              item?.player?.primaryPosition,
              item?.player && ageBand(item?.player.birthDate),
              item?.player?.region,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' · '}
            {f(t.recommendations.backedBy, { count: item?.recommendationCount })}
          </span>
        </Link>

        {review ? (
          <Badge
            variant={
              review?.status === 'APPROVED'
                ? 'success'
                : review?.status === 'REJECTED'
                  ? 'neutral'
                  : 'warning'
            }
          >
            {review?.status === 'APPROVED'
              ? t.recommendations.coachApproved
              : review?.status === 'REJECTED'
                ? t.recommendations.coachRejected
                : t.recommendations.inReview}
          </Badge>
        ) : (
          <Badge variant="neutral">{t.recommendations.notReviewed}</Badge>
        )}
      </div>

      {review && (
        <p className="text-muted truncate text-xs">
          {[review?.coach.firstName, review?.coach.lastName].filter(Boolean).join(' ')}
          {review?.note ? ` — ${review?.note}` : ''}
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
            {coaches?.map((coach) => (
              <option key={coach?.id} value={coach?.id}>
                {[coach?.firstName, coach?.lastName].filter(Boolean).join(' ') ||
                  coach?.username ||
                  coach?.id.slice(0, 8)}
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

      {/*
       * Approved, and not yet invited: one button, and it opens the dialog.
       *
       * The form used to sit open inside the row — three fields deep in a queue
       * the manager is scanning. A row's job is to say where somebody stands and
       * offer the single next step; the decision behind that step belongs in a
       * window of its own.
       */}
      {review?.status === 'APPROVED' && (
        <div className="flex justify-end">
          <InviteToPrivateTrialDialog
            playerId={item?.playerId}
            playerName={
              item?.player ? `${item?.player.firstName} ${item?.player.lastName}` : item?.playerId
            }
            academyId={academyId}
          />
        </div>
      )}
    </li>
  );
}
